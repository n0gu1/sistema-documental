import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.db import transaction
from django.db.models import Q
from django.middleware.csrf import get_token
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle
from rest_framework.views import APIView

from .auth_utils import get_client_ip, record_auth_event, serialize_user
from .authentication import hash_session_token
from .config_service import security_policy_for
from .models import SesionDocumental, UsuarioDocumental
from .serializers import ChangePasswordSerializer, LoginSerializer

DUMMY_PASSWORD_HASH = (
    'pbkdf2_sha256$1000000$7wTMS8ohL5mGFbXJDZVsFI$'
    'kQRMr259TilNSOJyXDMtx/1imMBqfinIuePngN+xjRI='
)


class LoginRateThrottle(AnonRateThrottle):
    scope = 'login'


class PasswordChangeRateThrottle(UserRateThrottle):
    scope = 'change_password'


def set_auth_cookie(response, token, remember):
    max_age = settings.AUTH_REMEMBER_DAYS * 24 * 60 * 60 if remember else None
    response.set_cookie(
        settings.AUTH_COOKIE_NAME,
        token,
        max_age=max_age,
        httponly=True,
        secure=settings.AUTH_COOKIE_SECURE,
        samesite='Lax',
        path='/',
    )


@method_decorator(ensure_csrf_cookie, name='dispatch')
class CsrfTokenView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({'csrf_token': get_token(request)})


@method_decorator(csrf_protect, name='dispatch')
class LoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        identity = serializer.validated_data['identity']
        password = serializer.validated_data['password']
        remember = serializer.validated_data['remember']
        now = timezone.now()
        user = None
        session = None
        raw_token = None
        outcome = 'invalid'

        with transaction.atomic():
            matches = list(
                UsuarioDocumental.objects.select_for_update()
                .filter(Q(nombre_usuario=identity) | Q(correo=identity))[:2]
            )

            if len(matches) != 1:
                check_password(password, DUMMY_PASSWORD_HASH)
            else:
                user = matches[0]
                security_policy = security_policy_for(user.organizacion_id)
                password_matches = check_password(password, user.hash_contrasena)

                if user.bloqueado_hasta and user.bloqueado_hasta > now:
                    outcome = 'locked'
                else:
                    if user.bloqueado_hasta:
                        user.intentos_fallidos = 0
                        user.bloqueado_hasta = None
                        UsuarioDocumental.objects.filter(pk=user.pk).update(
                            intentos_fallidos=0,
                            bloqueado_hasta=None,
                            actualizado_en=now,
                        )

                if outcome != 'locked' and (not user.activo or not password_matches):
                    if user.activo:
                        attempts = user.intentos_fallidos + 1
                        updates = {'intentos_fallidos': attempts, 'actualizado_en': now}
                        if attempts >= security_policy['max_failed_attempts']:
                            updates['bloqueado_hasta'] = now + timedelta(
                                minutes=security_policy.get('lock_minutes', settings.AUTH_LOCK_MINUTES),
                            )
                        UsuarioDocumental.objects.filter(pk=user.pk).update(**updates)
                elif outcome != 'locked':
                    raw_token = secrets.token_urlsafe(48)
                    duration = (
                        timedelta(days=settings.AUTH_REMEMBER_DAYS)
                        if remember
                        else timedelta(hours=security_policy['max_session_hours'])
                    )
                    session = SesionDocumental.objects.create(
                        usuario=user,
                        hash_token=hash_session_token(raw_token),
                        direccion_ip=get_client_ip(request),
                        agente_usuario=request.META.get('HTTP_USER_AGENT', ''),
                        expira_en=now + duration,
                    )
                    UsuarioDocumental.objects.filter(pk=user.pk).update(
                        intentos_fallidos=0,
                        bloqueado_hasta=None,
                        ultimo_acceso_en=now,
                        actualizado_en=now,
                    )
                    user.intentos_fallidos = 0
                    user.bloqueado_hasta = None
                    user.ultimo_acceso_en = now
                    outcome = 'success'

        if outcome == 'locked':
            record_auth_event(
                action_code='SESION_FALLIDA',
                resource_code='USUARIO',
                organization_id=user.organizacion_id,
                user_id=user.id,
                resource_id=user.id,
                request=request,
                successful=False,
                result='Cuenta bloqueada temporalmente',
            )
            return Response(
                {'code': 'INVALID_CREDENTIALS', 'detail': 'Correo, usuario o contraseña incorrectos.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if outcome != 'success':
            if user:
                record_auth_event(
                    action_code='SESION_FALLIDA',
                    resource_code='USUARIO',
                    organization_id=user.organizacion_id,
                    user_id=user.id,
                    resource_id=user.id,
                    request=request,
                    successful=False,
                    result='Credenciales inválidas',
                )
            return Response(
                {'code': 'INVALID_CREDENTIALS', 'detail': 'Correo, usuario o contraseña incorrectos.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        record_auth_event(
            action_code='SESION_INICIADA',
            resource_code='SESION',
            organization_id=user.organizacion_id,
            user_id=user.id,
            session_id=session.id,
            resource_id=session.id,
            request=request,
            successful=True,
            result='Inicio de sesión correcto',
            details={'remember': remember},
        )
        response = Response(
            {
                'user': serialize_user(user),
                'session': {'expires_at': session.expira_en},
            },
            status=status.HTTP_200_OK,
        )
        set_auth_cookie(response, raw_token, remember)
        return response


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({'user': serialize_user(request.user)})


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        now = timezone.now()
        session = request.auth
        SesionDocumental.objects.filter(pk=session.pk, revocada_en__isnull=True).update(
            revocada_en=now,
            motivo_revocacion='Cierre de sesión solicitado por el usuario',
        )
        record_auth_event(
            action_code='SESION_CERRADA',
            resource_code='SESION',
            organization_id=request.user.organizacion_id,
            user_id=request.user.id,
            session_id=session.id,
            resource_id=session.id,
            request=request,
            successful=True,
            result='Cierre de sesión correcto',
        )
        response = Response(status=status.HTTP_204_NO_CONTENT)
        response.delete_cookie(settings.AUTH_COOKIE_NAME, path='/', samesite='Lax')
        return response


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [PasswordChangeRateThrottle]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        invalid_current_password = False
        raw_token = None
        remember = False

        with transaction.atomic():
            user = UsuarioDocumental.objects.select_for_update().get(pk=request.user.pk)
            if not check_password(
                serializer.validated_data['current_password'],
                user.hash_contrasena,
            ):
                invalid_current_password = True
            else:
                now = timezone.now()
                user.hash_contrasena = make_password(serializer.validated_data['new_password'])
                user.debe_cambiar_contrasena = False
                user.actualizado_en = now
                user.save(
                    update_fields=['hash_contrasena', 'debe_cambiar_contrasena', 'actualizado_en'],
                )
                SesionDocumental.objects.filter(
                    usuario_id=user.id,
                    revocada_en__isnull=True,
                ).exclude(pk=request.auth.pk).update(
                    revocada_en=now,
                    motivo_revocacion='Contraseña modificada',
                )
                raw_token = secrets.token_urlsafe(48)
                remember = request.auth.expira_en - now > timedelta(days=1)
                SesionDocumental.objects.filter(pk=request.auth.pk).update(
                    hash_token=hash_session_token(raw_token),
                    ultima_actividad_en=now,
                )

        if invalid_current_password:
            record_auth_event(
                action_code='SESION_FALLIDA',
                resource_code='USUARIO',
                organization_id=user.organizacion_id,
                user_id=user.id,
                session_id=request.auth.id,
                resource_id=user.id,
                request=request,
                successful=False,
                result='Contraseña actual incorrecta',
            )
            return Response(
                {'current_password': ['La contraseña actual no es correcta.']},
                status=status.HTTP_400_BAD_REQUEST,
            )

        record_auth_event(
            action_code='USUARIO_MODIFICADO',
            resource_code='USUARIO',
            organization_id=user.organizacion_id,
            user_id=user.id,
            session_id=request.auth.id,
            resource_id=user.id,
            request=request,
            successful=True,
            result='Contraseña modificada',
        )
        response = Response({'user': serialize_user(user)})
        set_auth_cookie(response, raw_token, remember)
        return response


class HealthView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        return Response({'message': 'Sistema Documental', 'status': 'running'})
