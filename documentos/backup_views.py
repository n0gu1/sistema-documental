from django.core.files.storage import default_storage
from django.db.models import Sum
from django.http import FileResponse, Http404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .backup_service import (
    BackupExecutionError,
    SUPPORTED_DESTINATIONS,
    SUPPORTED_FREQUENCIES,
    configured_destination,
    create_backup,
    destination_options,
    get_or_create_configuration,
    load_backup_archive,
    next_execution,
    verify_backup,
)
from .management_views import require_permission
from .models import ConfiguracionRespaldo, Respaldo
from .permissions import IsAuthenticatedAndPasswordCurrent


BACKUP_PERMISSION = 'usuarios.gestionar'


def serialize_backup(backup, request):
    return {
        'id': str(backup.id),
        'type': backup.tipo,
        'destination': backup.destino,
        'name': backup.nombre,
        'size_bytes': backup.tamano_bytes,
        'sha256': backup.sha256,
        'files': backup.archivos,
        'database_records': backup.registros_db,
        'encrypted': backup.cifrado,
        'status': backup.estado,
        'error': backup.error,
        'started_at': backup.iniciado_en,
        'finished_at': backup.finalizado_en,
        'retention_until': backup.retencion_hasta,
        'restored_at': backup.restaurado_en,
        'download_url': request.build_absolute_uri(f'/api/backups/{backup.id}/download/') if backup.estado == 'exitoso' else None,
        'restore_url': request.build_absolute_uri(f'/api/backups/{backup.id}/restore/'),
    }


def serialize_config(config):
    return {
        'active': config.activa,
        'frequency': config.frecuencia,
        'retention_days': config.retencion_dias,
        'destination': config.destino,
        'include_files': config.incluir_archivos,
        'encrypted': True,
        'next_run_at': config.proxima_ejecucion_en,
        'last_run_at': config.ultima_ejecucion_en,
        'last_test_at': config.ultima_prueba_en,
        'persisted': bool(config.pk),
    }


def serialize_alert(backup):
    return {
        'id': str(backup.id),
        'severity': 'error',
        'title': 'Respaldo fallido',
        'message': backup.error or 'El respaldo no pudo completarse.',
        'at': backup.finalizado_en or backup.iniciado_en,
        'backup_id': str(backup.id),
    }


def get_backup_or_404(request, backup_id):
    backup = Respaldo.objects.filter(pk=backup_id, organizacion_id=request.user.organizacion_id).first()
    if not backup:
        raise Http404
    return backup


class BackupListView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def get(self, request):
        require_permission(request, BACKUP_PERMISSION)
        organization_id = request.user.organizacion_id
        config = get_or_create_configuration(organization_id)
        backups = Respaldo.objects.filter(organizacion_id=organization_id).order_by('-iniciado_en')[:50]
        successful = Respaldo.objects.filter(organizacion_id=organization_id, estado='exitoso')
        failed = Respaldo.objects.filter(organizacion_id=organization_id, estado='fallido').order_by('-iniciado_en')[:10]
        latest = successful.order_by('-finalizado_en').first()
        return Response({
            'backups': [serialize_backup(item, request) for item in backups],
            'restore_points': [serialize_backup(item, request) for item in successful.order_by('-finalizado_en')[:10]],
            'alerts': [serialize_alert(item) for item in failed],
            'config': serialize_config(config),
            'destinations': destination_options(),
            'recovery_plan': {
                'name': 'Plan de Recuperacion v1.0',
                'rpo_hours': 24,
                'rto_hours': 8,
                'last_test_at': config.ultima_prueba_en,
                'last_test_status': 'exitoso' if config.ultima_prueba_en else 'pendiente',
            },
            'metrics': {
                'successful': successful.count(),
                'failed': Respaldo.objects.filter(organizacion_id=organization_id, estado='fallido').count(),
                'storage_bytes': successful.aggregate(total=Sum('tamano_bytes'))['total'] or 0,
                'next_run_at': config.proxima_ejecucion_en,
                'last_success_at': latest.finalizado_en if latest else None,
            },
        })

    def post(self, request):
        require_permission(request, BACKUP_PERMISSION)
        config = get_or_create_configuration(request.user.organizacion_id)
        try:
            backup, stats = create_backup(request.user.organizacion_id, request.user.id, 'manual', config)
        except BackupExecutionError as error:
            return Response(
                {'detail': str(error), 'backup': serialize_backup(error.backup, request) if error.backup else None},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        return Response({'backup': serialize_backup(backup, request), 'stats': stats}, status=status.HTTP_201_CREATED)


class BackupConfigurationView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def get(self, request):
        require_permission(request, BACKUP_PERMISSION)
        return Response({'config': serialize_config(get_or_create_configuration(request.user.organizacion_id)), 'destinations': destination_options()})

    def post(self, request):
        require_permission(request, BACKUP_PERMISSION)
        frequency = str(request.data.get('frequency', 'daily')).lower()
        destination = str(request.data.get('destination', configured_destination())).lower()
        if frequency not in SUPPORTED_FREQUENCIES:
            raise ValidationError({'frequency': 'La frecuencia debe ser daily, weekly o monthly.'})
        if destination not in SUPPORTED_DESTINATIONS or not any(item['code'] == destination for item in destination_options()):
            raise ValidationError({'destination': 'El destino no esta configurado en este entorno.'})
        try:
            retention_days = int(request.data.get('retention_days', 30))
        except (TypeError, ValueError) as error:
            raise ValidationError({'retention_days': 'La retencion debe ser un numero entero.'}) from error
        if not 1 <= retention_days <= 3650:
            raise ValidationError({'retention_days': 'La retencion debe estar entre 1 y 3650 dias.'})
        now = timezone.now()
        config, _ = ConfiguracionRespaldo.objects.get_or_create(
            organizacion_id=request.user.organizacion_id,
            defaults={
                'activa': True,
                'frecuencia': frequency,
                'retencion_dias': retention_days,
                'destino': destination,
                'incluir_archivos': bool(request.data.get('include_files', True)),
                'cifrar': True,
                'proxima_ejecucion_en': now,
                'actualizada_en': now,
            },
        )
        config.activa = bool(request.data.get('active', True))
        config.frecuencia = frequency
        config.retencion_dias = retention_days
        config.destino = destination
        config.incluir_archivos = bool(request.data.get('include_files', True))
        config.cifrar = True
        config.proxima_ejecucion_en = config.proxima_ejecucion_en or next_execution(frequency, now)
        config.actualizada_en = now
        config.save()
        return Response({'config': serialize_config(config)})


class BackupDownloadView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def get(self, request, backup_id):
        require_permission(request, BACKUP_PERMISSION)
        backup = get_backup_or_404(request, backup_id)
        if backup.estado != 'exitoso' or not backup.clave_almacenamiento:
            raise Http404
        handle = backup.clave_almacenamiento
        if not default_storage.exists(handle):
            raise Http404
        source = default_storage.open(handle, 'rb')
        response = FileResponse(source, content_type='application/octet-stream')
        response['Content-Disposition'] = f'attachment; filename="{backup.id}.sdbk"'
        return response


class BackupRestoreView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def post(self, request, backup_id):
        require_permission(request, BACKUP_PERMISSION)
        backup = get_backup_or_404(request, backup_id)
        if backup.estado != 'exitoso':
            raise ValidationError({'detail': 'Solo se pueden restaurar respaldos exitosos.'})
        mode = request.data.get('mode', 'verify')
        if mode not in {'verify', 'restore_files'}:
            raise ValidationError({'mode': 'El modo debe ser verify o restore_files.'})
        try:
            result = verify_backup(backup, restore_files=mode == 'restore_files')
        except BackupExecutionError as error:
            return Response({'valid': False, 'detail': str(error)}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        return Response({'backup': serialize_backup(backup, request), 'result': result})


class RecoveryTestView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def post(self, request):
        require_permission(request, BACKUP_PERMISSION)
        backup = Respaldo.objects.filter(organizacion_id=request.user.organizacion_id, estado='exitoso').order_by('-finalizado_en').first()
        if not backup:
            return Response({'valid': False, 'detail': 'No hay un punto de restauracion para probar.'}, status=status.HTTP_409_CONFLICT)
        try:
            result = verify_backup(backup)
        except BackupExecutionError as error:
            return Response({'valid': False, 'detail': str(error)}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        config = get_or_create_configuration(request.user.organizacion_id)
        if config.pk:
            config.ultima_prueba_en = timezone.now()
            config.actualizada_en = config.ultima_prueba_en
            config.save(update_fields=['ultima_prueba_en', 'actualizada_en'])
        return Response({'valid': True, 'backup_id': str(backup.id), 'result': result, 'tested_at': config.ultima_prueba_en})
