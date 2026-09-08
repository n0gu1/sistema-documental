"""Prueba SQL real de PUT/GET ACL; revierte todos los cambios del ensayo."""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / '.tmp-ui-deps'), str(ROOT)]
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()
from django.db import connection, transaction
from rest_framework.test import APIRequestFactory, force_authenticate
from documentos.document_views import DocumentPermissionsView
from documentos.models import Documento, PermisoDocumental, RolDocumental, UsuarioDocumental

admin = UsuarioDocumental.objects.get(correo='prueba.admin@test.local', activo=True)
factory = APIRequestFactory()
result = {'scope': 'Backend local contra BD configurada; transaccion revertida'}

with connection.cursor() as cursor:
    cursor.execute(
        'SELECT column_name FROM information_schema.columns '
        'WHERE table_schema=%s AND table_name=%s ORDER BY ordinal_position',
        ['gestion_documental', 'documentos_roles_permisos'],
    )
    result['columns'] = [row[0] for row in cursor.fetchall()]
assert result['columns'] == ['documento_id', 'rol_id', 'permiso_id', 'concedido_por_id', 'concedido_en']

def call(method, document_id, payload=None):
    request = getattr(factory, method)('/api/documents/acl-test/permissions/', payload or {}, format='json')
    force_authenticate(request, user=admin)
    response = DocumentPermissionsView.as_view()(request, document_id=document_id)
    assert response.status_code == 200, (response.status_code, response.data)
    return response.data['assignments']

def read_rows(document_id):
    with connection.cursor() as cursor:
        cursor.execute(
            'SELECT rol_id, permiso_id, concedido_por_id, concedido_en '
            'FROM gestion_documental.documentos_roles_permisos '
            'WHERE documento_id=%s ORDER BY rol_id, permiso_id', [document_id],
        )
        return cursor.fetchall()

with transaction.atomic():
    document = Documento.objects.select_for_update().filter(
        organizacion_id=admin.organizacion_id, eliminado_en__isnull=True,
    ).first()
    assert document is not None, 'Se necesita un documento de prueba existente'
    original = read_rows(document.id)
    role = RolDocumental.objects.get(organizacion_id=admin.organizacion_id, codigo='EDITOR', activo=True)
    for label, code in [('create', 'documentos.consultar'), ('modify', 'documentos.descargar')]:
        permission = PermisoDocumental.objects.get(codigo=code, activo=True)
        expected = [{'role_id': str(role.id), 'permission_ids': [str(permission.id)]}]
        assert call('put', document.id, {'assignments': expected}) == expected
        assert call('get', document.id) == expected
        rows = read_rows(document.id)
        assert len(rows) == 1
        assert rows[0][:3] == (role.id, permission.id, admin.id)
        assert rows[0][3] is not None
        result[label] = {'put': 200, 'get': 200, 'permission': code, 'sql_row_verified': True}
    transaction.set_rollback(True)

assert read_rows(document.id) == original, 'No se restauraron las ACL originales'
result.update(status='PASS', sql_errors=0, rolled_back=True)
(ROOT / 'docs' / 'resultado_escritura_acl.json').write_text(
    json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8',
)
print(json.dumps(result, ensure_ascii=False))
