"""Inventario de códigos y pruebas de autorización sin crear/modificar documentos."""
import ast
import json
import os
import re
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / '.tmp-role-deps'), str(ROOT)]
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()
from django.db import transaction
from rest_framework.test import APIRequestFactory, force_authenticate
from documentos import document_views as views
from documentos.auth_utils import user_has_permission
from documentos.models import PermisoDocumental, RolPermisoDocumental, UsuarioDocumental

catalog = list(PermisoDocumental.objects.order_by('codigo').values('codigo', 'activo'))
catalog_codes = {p['codigo'] for p in catalog}
pattern = re.compile(r'^(documentos|versiones|usuarios|roles|revisiones|auditoria|respaldos|reportes)\.[a-z_]+$')
usages = {}
for file in (ROOT / 'documentos').rglob('*.py'):
    if 'migrations' in file.parts or file.name.startswith('test'):
        continue
    for node in ast.walk(ast.parse(file.read_text(encoding='utf-8-sig'))):
        if isinstance(node, ast.Constant) and isinstance(node.value, str) and pattern.fullmatch(node.value):
            usages.setdefault(node.value, []).append(f'{file.relative_to(ROOT).as_posix()}:{node.lineno}')
missing = sorted(set(usages) - catalog_codes)
assert not missing, missing

factory = APIRequestFactory()
editor = UsuarioDocumental.objects.get(correo='prueba.editor@test.local')
reader = UsuarioDocumental.objects.get(correo='prueba.lector@test.local')
results = []

def check(user, view, method, expected, name, **kwargs):
    request = getattr(factory, method)('/api/documents/', {}, format='json')
    force_authenticate(request, user=user)
    response = view.as_view()(request, **kwargs)
    assert response.status_code == expected, (name, response.status_code, response.data)
    if expected == 400:
        assert 'title' in response.data and 'code' in response.data, response.data
    if expected == 403:
        assert str(response.data['code']) == 'INSUFFICIENT_PERMISSIONS', response.data
    results.append({'test': name, 'status': expected, 'result': 'PASS'})

with transaction.atomic():
    assert user_has_permission(editor, 'documentos.crear')
    check(editor, views.DocumentListCreateView, 'post', 400,
          'Editor con documentos.crear llega a validación del formulario')
    # Revocación temporal solo de las concesiones del permiso crear al Editor.
    # La transacción revierte esta preparación y los eventos de denegación.
    RolPermisoDocumental.objects.filter(rol__codigo='EDITOR', rol__organizacion_id=editor.organizacion_id,
                                      permiso__codigo='documentos.crear').delete()
    assert not user_has_permission(editor, 'documentos.crear')
    check(editor, views.DocumentListCreateView, 'post', 403, 'Mismo Editor sin documentos.crear recibe 403')
    assert user_has_permission(reader, 'documentos.consultar')
    assert not user_has_permission(reader, 'documentos.modificar')
    check(reader, views.DocumentDetailView, 'patch', 403, 'Consultar no permite modificar', document_id=uuid.uuid4())
    for view, kwargs in [
        (views.DocumentArchiveView, {'document_id': uuid.uuid4()}),
        (views.DocumentUnarchiveView, {'document_id': uuid.uuid4()}),
        (views.DocumentVersionRestoreView, {'document_id': uuid.uuid4(), 'version_id': uuid.uuid4()}),
    ]:
        check(reader, view, 'post', 403, f'Lector no autorizado: {view.__name__}', **kwargs)
    check(reader, views.DocumentPermissionsView, 'put', 403, 'Consultar no permite gestionar permisos', document_id=uuid.uuid4())
    for view in (views.DocumentFileListCreateView, views.DocumentVersionListView):
        check(reader, view, 'post', 403, f'Consultar no permite crear versiones: {view.__name__}', document_id=uuid.uuid4())
    RolPermisoDocumental.objects.filter(rol__codigo='LECTOR', rol__organizacion_id=reader.organizacion_id,
                                      permiso__codigo='documentos.descargar').delete()
    assert user_has_permission(reader, 'documentos.consultar')
    assert not user_has_permission(reader, 'documentos.descargar')
    check(reader, views.DocumentFileDownloadView, 'get', 403, 'Consultar no permite descargar archivo', document_id=uuid.uuid4(), file_id=uuid.uuid4())
    check(reader, views.DocumentVersionDownloadView, 'get', 403, 'Consultar no permite descargar versión', document_id=uuid.uuid4(), version_id=uuid.uuid4())
    transaction.set_rollback(True)

assert user_has_permission(editor, 'documentos.crear'), 'La concesión temporal no se restauró'
result = {'catalog': catalog, 'backend_codes': dict(sorted(usages.items())),
          'missing_codes': missing, 'catalog_codes_not_referenced': sorted(catalog_codes-set(usages)),
          'tests': results, 'rolled_back': True}
(ROOT / 'docs' / 'resultado_contrato_permisos.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False, indent=2))
