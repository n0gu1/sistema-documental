"""Real permission/CSRF responses and audit SQL on Neon; temporary sessions roll back."""
import os
import sys
import json
import secrets
from pathlib import Path
from datetime import timedelta

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()
from django.conf import settings
from django.db import connection, transaction
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient, APIRequestFactory, force_authenticate
from rest_framework.views import APIView
from rest_framework.response import Response
from documentos.permissions import HasDocumentalPermission
from documentos.middleware import AuditFailureMiddleware
from documentos.models import UsuarioDocumental, SesionDocumental
from documentos.authentication import hash_session_token

checks = []
def check(name, condition):
    assert condition, name
    checks.append(name)

def events():
    with connection.cursor() as cursor:
        cursor.execute("""SELECT ba.id, ba.usuario_id, ba.ocurrido_en, ba.exitoso, ba.detalles
            FROM gestion_documental.bitacora_auditoria ba
            JOIN gestion_documental.acciones_auditoria a ON a.id=ba.accion_id
            WHERE a.codigo='ACCESO_DENEGADO' ORDER BY ba.id""")
        return {row[0]: (*row[:4], json.loads(row[4]) if isinstance(row[4], str) else row[4])
                for row in cursor.fetchall()}

reader = UsuarioDocumental.objects.get(correo='prueba.lector@test.local')
with override_settings(ALLOWED_HOSTS=['testserver'], SECURE_SSL_REDIRECT=False):
    with transaction.atomic():
        token = secrets.token_urlsafe(32)
        session = SesionDocumental.objects.create(usuario=reader, hash_token=hash_session_token(token),
            expira_en=timezone.now() + timedelta(hours=1))
        client = APIClient(enforce_csrf_checks=True)
        client.cookies[settings.AUTH_COOKIE_NAME] = token

        class ProtectedView(APIView):
            permission_classes = [HasDocumentalPermission]
            permission_code = 'usuarios.crear'
            def get(self, request):
                return Response({'unexpected': True})

        before = events()
        request = APIRequestFactory().get('/api/test-permission/')
        force_authenticate(request, user=reader)
        response = AuditFailureMiddleware(ProtectedView.as_view())(request)
        added = [row for key, row in events().items() if key not in before]
        check('403 común HasDocumentalPermission sin registro específico',
              response.status_code == 403 and len(added) == 1
              and added[0][1] == reader.id and added[0][2] is not None
              and added[0][3] is False
              and added[0][4] == {'path': '/api/test-permission/', 'method': 'GET',
                                 'reason': 'INSUFFICIENT_PERMISSIONS'})

        def denied(name, method, path, status, reason=None):
            before = events()
            response = getattr(client, method)(path)
            added = [row for key, row in events().items() if key not in before]
            check(name + ': HTTP', response.status_code == status)
            check(name + ': exactamente un evento', len(added) == 1)
            row = added[0]
            check(name + ': actor/fecha/false/ruta/método/motivo',
                  row[1] == reader.id and row[2] is not None and row[3] is False
                  and row[4]['path'] == path.split('?')[0]
                  and row[4]['method'] == method.upper() and bool(row[4]['reason']))
            if reason:
                check(name + ': motivo esperado', row[4]['reason'] == reason)
            return row[0]

        denied('403 explícito sin duplicados', 'get', '/api/audit/?sensitive=excluded', 403, 'AUDIT_ACCESS_REQUIRED')
        denied('403 CSRF con sesión identificada', 'post', '/api/auth/logout/', 403)
        SesionDocumental.objects.filter(pk=session.pk).update(expira_en=timezone.now()-timedelta(seconds=1))
        denied('401 sesión expirada identificable', 'get', '/api/auth/me/', 401)
        denied('401 sesión revocada identificable', 'get', '/api/auth/me/', 401)
        for label, cookie in [('sin cookie', None), ('token desconocido', secrets.token_urlsafe(32))]:
            client.cookies.clear()
            if cookie:
                client.cookies[settings.AUTH_COOKIE_NAME] = cookie
            before = events()
            response = client.get('/api/auth/me/')
            check('401 anónimo ' + label, response.status_code == 401 and events() == before)
        transaction.set_rollback(True)

    # One genuine denial remains committed for independent MCP verification.
    client = APIClient()
    client.force_authenticate(user=reader)
    before = events()
    response = client.get('/api/audit/')
    added = [row for key, row in events().items() if key not in before]
    check('403 por permisos persistido', response.status_code == 403 and len(added) == 1)
    event_id = added[0][0]

result = {'checks': checks, 'passed': len(checks), 'persisted_event_id': event_id,
          'environment': 'backend local contra Neon; sin despliegue'}
(ROOT / 'docs/resultado_denegaciones_56_57.json').write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False))
