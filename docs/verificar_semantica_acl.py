"""Matriz ACL con SQL real y migración dentro de una transacción revertida."""
import importlib
import json
import os
import sys
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / '.tmp-ui-deps'), str(ROOT)]
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()
from django.db import connection, transaction
from rest_framework.test import APIRequestFactory, force_authenticate
from documentos.models import Documento, UsuarioDocumental, RolDocumental, PermisoDocumental
from documentos.document_views import DocumentPermissionsView
from documentos.reader_access import has_document_permission

factory = APIRequestFactory()
admin = UsuarioDocumental.objects.get(correo='prueba.admin@test.local')
user = UsuarioDocumental.objects.get(correo='prueba.editor@test.local')
role = RolDocumental.objects.get(organizacion_id=admin.organizacion_id, codigo='EDITOR', activo=True)
permission = PermisoDocumental.objects.get(codigo='documentos.consultar', activo=True)
results = []

with transaction.atomic():
    with connection.cursor() as cursor:
        cursor.execute("SELECT to_regclass('gestion_documental.documentos_politicas_acl')")
        if cursor.fetchone()[0] is None:
            cursor.execute(importlib.import_module('documentos.migrations.0020_politica_acl').Migration.operations[0].sql)
    document = Documento.objects.select_for_update().filter(organizacion_id=admin.organizacion_id, eliminado_en__isnull=True).exclude(creado_por_id=user.id).first()
    assert document is not None
    user.area_id = document.area_id
    # Preparación aislada: el estado original se restaura con el rollback.
    with connection.cursor() as cursor:
        cursor.execute('DELETE FROM gestion_documental.documentos_roles_permisos WHERE documento_id=%s', [document.id])
        cursor.execute('DELETE FROM gestion_documental.documentos_politicas_acl WHERE documento_id=%s', [document.id])

    def check(name, expected):
        obtained = has_document_permission(user, document.id, permission.codigo)
        assert obtained == expected, (name, expected, obtained)
        results.append({'case': name, 'expected': expected, 'obtained': obtained})

    def save(mode=None, grant=False):
        payload = {'assignments': [{'role_id': str(role.id), 'permission_ids': [str(permission.id)]}] if grant else []}
        if mode:
            payload['policies'] = [{'permission_id': str(permission.id), 'mode': mode}]
        request = factory.put('/api/documents/test/permissions/', payload, format='json')
        force_authenticate(request, user=admin)
        response = DocumentPermissionsView.as_view()(request, document_id=document.id)
        assert response.status_code == 200, response.data
        request = factory.get('/api/documents/test/permissions/')
        force_authenticate(request, user=admin)
        fetched = DocumentPermissionsView.as_view()(request, document_id=document.id)
        assert fetched.status_code == 200
        assert fetched.data == response.data

    check('Sin ACL, permiso global y misma area', True)
    save('PERMITIR', True)
    check('ACL PERMITIR con rol incluido', True)
    save('DENEGAR')
    check('ACL DENEGAR aunque tiene permiso global', False)
    save('PERMITIR', True)
    save()
    check('Eliminar concesiones sin pedir HEREDAR', False)
    save('HEREDAR')
    check('HEREDAR seleccionado expresamente', True)
    user.area_id = uuid4()
    check('HEREDAR, usuario de otra area', False)
    user.area_id = document.area_id
    check('HEREDAR, usuario del area permitida', True)
    user.area_id = uuid4()
    save('PERMITIR', True)
    check('Concesion explicita permite otra area (politica conservada)', True)
    save('DENEGAR')
    check('DENEGAR bloquea tambien otra area', False)
    assert has_document_permission(admin, document.id, permission.codigo)
    transaction.set_rollback(True)

result = {'status': 'PASS', 'matrix': results, 'administrator_exception_preserved': True, 'rolled_back': True}
(ROOT / 'docs/resultado_semantica_acl.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False))
