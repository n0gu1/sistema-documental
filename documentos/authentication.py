import hashlib
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework.authentication import BaseAuthentication, SessionAuthentication
from rest_framework.exceptions import AuthenticationFailed

from .auth_utils import record_auth_event
from .config_service import security_policy_for
from .models import SesionDocumental


def hash_session_token(token):
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


def record_invalid_session(request, session, reason):
    record_auth_event(
        action_code='SESION_INVALIDA',
        resource_code='SESION',
        organization_id=session.usuario.organizacion_id,
        user_id=session.usuario.id,
        session_id=session.id,
        resource_id=session.id,
        request=request,
        successful=False,
        result=reason,
        details={'revocation_reason': getattr(session, 'motivo_revocacion', None)} if getattr(session, 'motivo_revocacion', None) else None,
    )


class CookieTokenAuthentication(BaseAuthentication):
    def authenticate(self, request):
        token = request.COOKIES.get(settings.AUTH_COOKIE_NAME)
        if not token:
            return None

        token_hash = hash_session_token(token)
        try:
            session = SesionDocumental.objects.select_related('usuario').get(
                hash_token=token_hash,
                revocada_en__isnull=True,
            )
        except SesionDocumental.DoesNotExist as error:
            try:
                session = SesionDocumental.objects.select_related('usuario').get(hash_token=token_hash)
            except SesionDocumental.DoesNotExist:
                raise AuthenticationFailed('La sesión no es válida.') from error
            record_invalid_session(request, session, 'Sesión revocada')
            raise AuthenticationFailed('La sesión no es válida.') from error

        now = timezone.now()
        if session.expira_en <= now:
            SesionDocumental.objects.filter(pk=session.pk, revocada_en__isnull=True).update(
                revocada_en=now,
                motivo_revocacion='Sesión expirada',
            )
            session.motivo_revocacion = 'Sesión expirada'
            record_invalid_session(request, session, 'Sesión expirada')
            raise AuthenticationFailed('La sesión ha expirado.')

        if not session.usuario.activo:
            SesionDocumental.objects.filter(pk=session.pk, revocada_en__isnull=True).update(
                revocada_en=now,
                motivo_revocacion='Cuenta inactiva',
            )
            session.motivo_revocacion = 'Cuenta inactiva'
            record_invalid_session(request, session, 'Cuenta inactiva')
            raise AuthenticationFailed('La cuenta no está activa.')

        SessionAuthentication().enforce_csrf(request)

        activity_cutoff = now - timedelta(minutes=security_policy_for(session.usuario.organizacion_id)['inactivity_minutes'])
        if session.ultima_actividad_en < activity_cutoff:
            SesionDocumental.objects.filter(pk=session.pk, revocada_en__isnull=True).update(
                revocada_en=now,
                motivo_revocacion='Sesion expirada por inactividad',
            )
            session.motivo_revocacion = 'Sesion expirada por inactividad'
            record_invalid_session(request, session, 'Sesión expirada por inactividad')
            raise AuthenticationFailed('La sesion ha expirado por inactividad.')

        SesionDocumental.objects.filter(pk=session.pk, revocada_en__isnull=True).update(
            ultima_actividad_en=now,
        )
        session.ultima_actividad_en = now

        return session.usuario, session

    def authenticate_header(self, request):
        return 'Session'
