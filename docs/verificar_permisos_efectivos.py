"""Verifica /me/ y autorización real; revierte toda preparación de datos."""
import json
import os
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / '.tmp-ui-deps'), str(ROOT)]
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()
from django.db import transaction
from rest_framework.test import APIRequestFactory, force_authenticate
from documentos.views import CurrentUserView
from documentos.document_views import DocumentFileDownloadView
from documentos.auth_utils import user_has_permission, get_user_permission_codes
from documentos.models import UsuarioDocumental, RolPermisoDocumental, PermisoDocumental

factory = APIRequestFactory()
reader = UsuarioDocumental.objects.get(correo='prueba.lector@test.local')
admin = UsuarioDocumental.objects.get(correo='prueba.admin@test.local')

def me(user):
    request = factory.get('/api/auth/me/')
    force_authenticate(request, user=user)
    response = CurrentUserView.as_view()(request)
    assert response.status_code == 200
    return response.data['user']

with transaction.atomic():
    allowed = me(reader)
    assert allowed['permissions'] == sorted(set(get_user_permission_codes(reader.id)))
    assert allowed['has_all_permissions'] is False
    assert 'documentos.descargar' in allowed['permissions']
    RolPermisoDocumental.objects.filter(rol__organizacion_id=reader.organizacion_id,
                                      rol__codigo='LECTOR', permiso__codigo='documentos.descargar').delete()
    denied = me(reader)
    assert denied['roles'] == allowed['roles']
    assert 'documentos.descargar' not in denied['permissions']
    request = factory.get('/api/documents/manual/download/')
    force_authenticate(request, user=reader)
    response = DocumentFileDownloadView.as_view()(request, document_id=uuid.uuid4(), file_id=uuid.uuid4())
    assert response.status_code == 403
    assert str(response.data['code']) == 'INSUFFICIENT_PERMISSIONS'
    # La excepción de Administrador no depende de las casillas del catálogo de su rol.
    RolPermisoDocumental.objects.filter(rol__organizacion_id=admin.organizacion_id,
                                      rol__codigo='ADMINISTRADOR').delete()
    administrator = me(admin)
    assert administrator['has_all_permissions'] is True
    assert administrator['permissions'] == list(PermisoDocumental.objects.filter(activo=True).order_by('codigo').values_list('codigo', flat=True))
    assert user_has_permission(admin, 'documentos.descargar') is True
    assert user_has_permission(admin, 'codigo.no_catalogado') is True
    transaction.set_rollback(True)

assert 'documentos.descargar' in me(reader)['permissions']
result = {'allowed': allowed, 'denied': denied, 'administrator': administrator,
          'editor': me(UsuarioDocumental.objects.get(correo='prueba.editor@test.local')),
          'reviewer': me(UsuarioDocumental.objects.get(correo='prueba.revisor@test.local')),
          'manual_request_status': response.status_code, 'rolled_back': True, 'status': 'PASS'}
(ROOT / 'docs' / 'resultado_permisos_efectivos.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print('PASS: /me/ incluye permisos efectivos; mismo rol refleja revocación; llamada manual 403; bypass de Administrador conservado; ensayo revertido.')
