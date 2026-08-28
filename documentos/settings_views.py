from django.conf import settings
from django.core.mail import EmailMessage
from django.core.validators import validate_email
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .auth_utils import record_auth_event
from .config_service import get_system_config, merge_defaults, serialize_system_config, smtp_connection_for, update_system_config
from .management_views import require_permission
from .permissions import IsAuthenticatedAndPasswordCurrent


READ_PERMISSION = 'usuarios.consultar'
WRITE_PERMISSION = 'usuarios.gestionar'


def record_config_event(request, action_code, config, details=None, successful=True, result=None):
    record_auth_event(
        action_code=action_code,
        resource_code='CONFIGURACION',
        organization_id=request.user.organizacion_id,
        user_id=request.user.id,
        session_id=getattr(request.auth, 'id', None),
        resource_id=config.id,
        request=request,
        successful=successful,
        result=result or ('Configuracion procesada correctamente' if successful else 'Configuracion procesada con error'),
        details=details,
    )


def serialize_changes(config):
    if not config.actualizado_en:
        return []
    return [{
        'at': config.actualizado_en,
        'user': 'Configuracion de la organizacion',
        'section': 'Sistema',
        'description': 'Configuracion persistida y validada',
    }]


class SystemSettingsView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def get(self, request):
        require_permission(request, READ_PERMISSION)
        config = get_system_config(request.user.organizacion_id)
        values = serialize_system_config(config)
        response = Response({'settings': values, 'changes': serialize_changes(config)})
        record_config_event(request, 'CONFIGURACION_CONSULTADA', config)
        return response

    def post(self, request):
        require_permission(request, WRITE_PERMISSION)
        if not request.data:
            raise ValidationError({'detail': 'Debe enviar al menos una seccion de configuracion.'})
        allowed = {'general', 'security', 'smtp', 'uploads', 'appearance', 'notifications', 'integrations'}
        sections = {key: value for key, value in request.data.items() if key in allowed}
        if not sections:
            raise ValidationError({'detail': 'La configuracion no contiene secciones validas.'})
        try:
            config = update_system_config(request.user.organizacion_id, sections)
        except (TypeError, ValueError, DjangoValidationError) as error:
            raise ValidationError({'detail': str(error)}) from error
        record_config_event(request, 'CONFIGURACION_MODIFICADA', config, details={'sections': sorted(sections)})
        return Response({'settings': serialize_system_config(config), 'changes': serialize_changes(config)})


class SmtpTestView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def post(self, request):
        require_permission(request, WRITE_PERMISSION)
        config = get_system_config(request.user.organizacion_id)
        smtp = merge_defaults(config)['smtp']
        if not smtp['host']:
            record_config_event(request, 'CONFIGURACION_PROBADA', config, details={'provider': 'smtp', 'valid': False}, successful=False, result='SMTP sin servidor configurado')
            return Response({'valid': False, 'detail': 'Configure el servidor SMTP antes de probarlo.'}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        recipient = str(request.data.get('recipient', '')).strip()
        if recipient:
            try:
                validate_email(recipient)
            except DjangoValidationError as error:
                raise ValidationError({'recipient': 'El correo de prueba no es valido.'}) from error
        if not recipient or request.data.get('dry_run', True):
            record_config_event(request, 'CONFIGURACION_PROBADA', config, details={'provider': 'smtp', 'mode': 'validate', 'valid': True})
            return Response({'valid': True, 'mode': 'validate', 'host': smtp['host'], 'port': smtp['port'], 'security': smtp['security']})
        connection = smtp_connection_for(request.user.organizacion_id, fail_silently=False)
        if not connection:
            record_config_event(request, 'CONFIGURACION_PROBADA', config, details={'provider': 'smtp', 'mode': 'send', 'valid': False}, successful=False, result='SMTP sin credenciales configuradas')
            return Response({'valid': False, 'detail': 'El SMTP no tiene credenciales configuradas.'}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        message = EmailMessage(
            subject='Prueba de configuracion SMTP',
            body='La configuracion SMTP del Sistema Documental fue validada.',
            from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'notificaciones@sistema-documental.local'),
            to=[recipient],
            connection=connection,
        )
        try:
            sent = message.send(fail_silently=False)
        except Exception as error:
            record_config_event(request, 'CONFIGURACION_PROBADA', config, details={'provider': 'smtp', 'mode': 'send', 'valid': False}, successful=False, result=str(error))
            return Response({'valid': False, 'detail': f'No fue posible enviar el correo de prueba: {error}'}, status=status.HTTP_502_BAD_GATEWAY)
        record_config_event(request, 'CONFIGURACION_PROBADA', config, details={'provider': 'smtp', 'mode': 'send', 'valid': sent == 1})
        return Response({'valid': sent == 1, 'mode': 'send', 'recipient': recipient})


class IntegrationTestView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def post(self, request, provider):
        require_permission(request, WRITE_PERMISSION)
        config = get_system_config(request.user.organizacion_id)
        integrations = merge_defaults(config)['integraciones']
        if provider not in integrations:
            raise ValidationError({'provider': 'La integracion no existe.'})
        item = integrations[provider]
        if provider == 'storage_s3':
            valid = item['enabled']
            detail = 'El almacenamiento S3/B2 esta configurado.' if valid else 'El almacenamiento S3/B2 no esta configurado.'
        elif provider == 'smtp':
            valid = item['enabled']
            detail = 'El SMTP esta configurado.' if valid else 'El SMTP no esta configurado.'
        elif provider == 'webhook':
            valid = bool(item.get('enabled') and item.get('url'))
            detail = 'El webhook HTTPS esta listo para utilizarse.' if valid else 'Configure una URL HTTPS para el webhook.'
        else:
            valid = bool(item.get('enabled') and item.get('client_id'))
            detail = 'La integracion tiene credenciales basicas configuradas.' if valid else 'La integracion aun no esta configurada.'
        record_config_event(request, 'CONFIGURACION_PROBADA', config, details={'provider': provider, 'valid': valid})
        return Response({'provider': provider, 'valid': valid, 'status': 'configured' if valid else 'not_configured', 'detail': detail, 'tested_at': timezone.now()})
