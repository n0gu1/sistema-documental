import hashlib
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework.authentication import BaseAuthentication, SessionAuthentication
from rest_framework.exceptions import AuthenticationFailed

from .models import SesionDocumental


def hash_session_token(token):
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


class CookieTokenAuthentication(BaseAuthentication):
    def authenticate(self, request):
        token = request.COOKIES.get(settings.AUTH_COOKIE_NAME)
        if not token:
            return None

        try:
            session = SesionDocumental.objects.select_related('usuario').get(
                hash_token=hash_session_token(token),
                revocada_en__isnull=True,
            )
        except SesionDocumental.DoesNotExist as error:
            raise AuthenticationFailed('La sesión no es válida.') from error

        now = timezone.now()
        if session.expira_en <= now:
            SesionDocumental.objects.filter(pk=session.pk, revocada_en__isnull=True).update(
                revocada_en=now,
                motivo_revocacion='Sesión expirada',
            )
            raise AuthenticationFailed('La sesión ha expirado.')

        if not session.usuario.activo:
            raise AuthenticationFailed('La cuenta no está activa.')

        SessionAuthentication().enforce_csrf(request)

        activity_cutoff = now - timedelta(minutes=5)
        if session.ultima_actividad_en < activity_cutoff:
            SesionDocumental.objects.filter(pk=session.pk).update(ultima_actividad_en=now)
            session.ultima_actividad_en = now

        return session.usuario, session

    def authenticate_header(self, request):
        return 'Session'
