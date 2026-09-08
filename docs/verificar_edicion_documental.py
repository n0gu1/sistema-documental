"""Requisito 23: edición normal contra Neon, fallos inyectados y rollback total."""
import json
import os
import sys
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import transaction
from rest_framework.test import APIRequestFactory, force_authenticate
from documentos.auth_utils import user_has_permission
from documentos.document_serializers import DocumentUpdateSerializer
from documentos.document_views import DocumentListCreateView, DocumentDetailView
from documentos.models import UsuarioDocumental, Documento, MetadatoDocumento, AreaCatalogo, TipoDocumentoCatalogo

factory = APIRequestFactory()
editor = UsuarioDocumental.objects.get(correo='prueba.editor@test.local')
tests = []

def call(view, method, data, user=editor, document_id=None, format='json'):
    request = getattr(factory, method)('/api/documents/', data, format=format)
    force_authenticate(request, user=user)
    return view.as_view()(request, **({'document_id': document_id} if document_id else {}))

def passed(label):
    tests.append({'test': label, 'result': 'PASS'})

def snapshot(document_id):
    return {
        'document': Documento.objects.filter(pk=document_id).values().get(),
        'metadata': list(MetadatoDocumento.objects.filter(documento_id=document_id).order_by('clave').values()),
    }

with transaction.atomic():
    assert user_has_permission(editor, 'documentos.modificar')
    assert not user_has_permission(editor, 'documentos.gestionar')
    passed('Editor dispone de documentos.modificar sin documentos.gestionar')
    assert set(DocumentUpdateSerializer().fields) == {'code', 'title', 'description', 'date', 'area_id', 'type_id', 'metadata'}
    passed('Lista exacta de siete campos documentales admitidos')
    areas = list(AreaCatalogo.objects.filter(organizacion_id=editor.organizacion_id, activa=True))
    types = list(TipoDocumentoCatalogo.objects.filter(activo=True))
    assert len(areas) >= 2 and len(types) >= 2
    data = {'code': 'REQ23-' + uuid4().hex[:12].upper(), 'title': 'Original requisito 23',
            'area_id': str(areas[0].id), 'type_id': types[0].id,
            'metadata': {'classification': 'Interno', 'observations': 'Original', 'extra': 'Conservar'}}
    created = call(DocumentListCreateView, 'post', data)
    assert created.status_code == 201, created.data
    document_id = created.data['document']['id']
    update = {'code': data['code'] + '-EDIT', 'title': 'Título modificado', 'description': 'Descripción modificada',
              'date': '2026-09-08', 'area_id': str(areas[1].id), 'type_id': types[1].id,
              'metadata': {'classification': 'Confidencial', 'observations': 'Observaciones modificadas', 'extra': 'Conservar'}}
    response = call(DocumentDetailView, 'patch', update, document_id=document_id)
    assert response.status_code == 200, response.data
    reloaded = call(DocumentDetailView, 'get', {}, document_id=document_id).data['document']
    assert all(reloaded[key] == update[key] for key in ('code', 'title', 'description', 'metadata'))
    assert str(reloaded['date']) == update['date']
    assert reloaded['area']['id'] == update['area_id'] and reloaded['type']['id'] == update['type_id']
    assert not reloaded['files']
    passed('Modificar siete campos y recargar conserva datos y metadatos')
    baseline = snapshot(document_id)
    for field in ('id', 'organization_id', 'organizacion_id', 'creado_por', 'created_at', 'updated_at', 'status', 'archived_at', 'permissions', 'file_comment', 'version_type', 'file', 'unknown'):
        invalid = call(DocumentDetailView, 'patch', {'title': 'No guardar', field: 'no autorizado'}, document_id=document_id)
        assert invalid.status_code == 400 and field in invalid.data, (field, invalid.data)
        assert snapshot(document_id) == baseline
    passed('Campos protegidos, desconocidos y de archivo/versión se rechazan sin cambios')
    for invalid in ({'title': '<b></b>'}, {'date': '2026-02-30'}, {'metadata': {'classification': []}},
                    {'metadata': {'nested': {'a': 1}}}, {'area_id': str(uuid4())}, {'type_id': 32767}):
        response = call(DocumentDetailView, 'patch', {'description': 'No guardar parcialmente', **invalid}, document_id=document_id)
        assert response.status_code == 400, response.data
        assert snapshot(document_id) == baseline
    passed('Validación de texto, fecha, metadatos y referencias sin éxito parcial')
    for role in ('lector', 'revisor'):
        user = UsuarioDocumental.objects.get(correo=f'prueba.{role}@test.local')
        denied = call(DocumentDetailView, 'patch', {'title': 'No autorizado'}, user=user, document_id=document_id)
        assert denied.status_code == 403, denied.data
        assert snapshot(document_id) == baseline
        passed(f'{role}: edición denegada con 403')
    with patch('documentos.document_views.has_document_permission', return_value=False):
        denied = call(DocumentDetailView, 'patch', {'title': 'Sin acceso al documento'}, document_id=document_id)
        assert denied.status_code == 404
    with patch('documentos.document_views.has_area_permission', return_value=False):
        denied = call(DocumentDetailView, 'patch', {'title': 'Área no autorizada', 'area_id': str(areas[0].id)}, document_id=document_id)
        assert denied.status_code == 403
    assert snapshot(document_id) == baseline
    passed('Se respetan autorización documental y autorización del área destino')
    calls = []
    original_update = MetadatoDocumento.objects.update_or_create
    def fail_during_metadata(*args, **kwargs):
        result = original_update(*args, **kwargs)
        calls.append(kwargs['clave'])
        raise RuntimeError('Fallo inyectado después de persistir el primer metadato')
    with patch.object(MetadatoDocumento.objects, 'update_or_create', side_effect=fail_during_metadata):
        try:
            call(DocumentDetailView, 'patch', {'title': 'Cambio a revertir', 'metadata': {'classification': 'Parcial'}}, document_id=document_id)
        except RuntimeError as error:
            assert 'Fallo inyectado' in str(error)
        else:
            raise AssertionError('No debe responder éxito ante un fallo de persistencia')
    assert calls and snapshot(document_id) == baseline
    passed('Fallo tras escritura y borrado de metadatos revierte documento y metadatos completos')
    with patch('documentos.document_views.record_document_event', side_effect=RuntimeError('Fallo final inyectado')):
        try:
            call(DocumentDetailView, 'patch', {'title': 'Revertir al final', 'metadata': {'classification': 'Parcial'}}, document_id=document_id)
        except RuntimeError:
            pass
        else:
            raise AssertionError('No debe responder éxito ante un fallo final')
    assert snapshot(document_id) == baseline
    passed('Fallo propagado al final revierte también las escrituras anteriores')
    with patch('documentos.document_views.save_document_file') as save_file:
        rejected = call(DocumentDetailView, 'patch', {'title': 'No guardar archivo', 'file': SimpleUploadedFile('test.txt', b'test')}, document_id=document_id, format='multipart')
        assert rejected.status_code == 400 and not save_file.called
    assert snapshot(document_id) == baseline
    passed('PATCH multipart con archivo devuelve 400 sin tocar almacenamiento')
    response = call(DocumentDetailView, 'patch', {'description': 'Solo descripción'}, document_id=document_id)
    assert response.status_code == 200
    assert response.data['document']['metadata'] == update['metadata']
    passed('Omitir metadata conserva las claves existentes')
    response = call(DocumentDetailView, 'patch', {'date': None, 'metadata': {}}, document_id=document_id)
    assert response.status_code == 200 and response.data['document']['date'] is None and response.data['document']['metadata'] == {}
    passed('Vaciar fecha y metadata respeta el contrato existente')
    assert Documento.objects.get(pk=document_id).archivos.count() == 0
    transaction.set_rollback(True)

assert not Documento.objects.filter(pk=document_id).exists()
output = {'tests': tests, 'result': 'PASS', 'rolled_back': True, 'versions_created': 0}
(ROOT / 'docs/resultado_edicion_documental.json').write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(output, ensure_ascii=False))
