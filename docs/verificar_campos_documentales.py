"""Prueba de persistencia y validación contra Neon; revierte todos los datos de ensayo."""
import json
import os
import sys
from copy import copy
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()
from django.db import transaction
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate
from documentos.document_views import DocumentListCreateView, DocumentDetailView, document_code_conflict
from documentos.models import UsuarioDocumental, Documento, MetadatoDocumento, AreaCatalogo, TipoDocumentoCatalogo

editor = UsuarioDocumental.objects.get(correo='prueba.editor@test.local')
factory = APIRequestFactory()
results = []

def call(view, method, payload, expected, label, **kwargs):
    request = getattr(factory, method)('/api/documents/', payload, format='json')
    force_authenticate(request, user=editor)
    response = view.as_view()(request, **kwargs)
    assert response.status_code == expected, (label, response.status_code, response.data)
    results.append({'test': label, 'status': response.status_code, 'result': 'PASS'})
    return response.data

with transaction.atomic():
    payload = {
        'code': 'REQ2021-' + uuid4().hex[:12].upper(), 'title': 'Prueba campos documentales',
        'area_id': str(AreaCatalogo.objects.filter(organizacion_id=editor.organizacion_id, activa=True).first().id),
        'type_id': TipoDocumentoCatalogo.objects.filter(activo=True).first().id,
        'date': '2026-09-07',
        'metadata': {'classification': 'Interno', 'observations': 'Observación inicial', 'scope': 'Preservar'},
    }
    created = call(DocumentListCreateView, 'post', payload, 201, 'Alta con fecha y metadatos')['document']
    doc_id = created['id']
    document = Documento.objects.get(pk=doc_id)
    assert document.fecha_documento.isoformat() == payload['date']
    assert dict(MetadatoDocumento.objects.filter(documento_id=doc_id).values_list('clave', 'valor')) == payload['metadata']
    assert document.archivos.count() == 0
    updated_metadata = {**payload['metadata'], 'classification': 'Confidencial', 'observations': 'Observación actualizada'}
    call(DocumentDetailView, 'patch', {'date': '2026-08-31', 'metadata': updated_metadata}, 200, 'Modificar campos', document_id=doc_id)
    detail = call(DocumentDetailView, 'get', {}, 200, 'Consultar campos persistidos', document_id=doc_id)['document']
    assert str(detail['date']) == '2026-08-31' and detail['metadata'] == updated_metadata
    document.refresh_from_db()
    previous_updated_at = document.actualizado_en
    call(DocumentDetailView, 'patch', {'metadata': updated_metadata}, 200, 'Actualizar solo metadatos', document_id=doc_id)
    document.refresh_from_db()
    assert document.actualizado_en > previous_updated_at
    for invalid, label in [
        ({'date': '2026-02-30'}, 'Fecha imposible'),
        ({'metadata': {'observations': ['invalido']}}, 'Observaciones no textuales'),
        ({'metadata': {'classification': True}}, 'Clasificación no textual'),
        ({'metadata': {'classification': 'x' * 101}}, 'Clasificación demasiado larga'),
        ({'metadata': {'observations': 'x' * 5001}}, 'Observaciones demasiado largas'),
        ({'metadata': {'scope': {'nested': 'invalid'}}}, 'Metadatos inválidos no guardan fecha parcialmente'),
    ]:
        call(DocumentDetailView, 'patch', {'date': '2026-01-01', **invalid}, 400, label, document_id=doc_id)
        document.refresh_from_db()
        assert document.fecha_documento.isoformat() == '2026-08-31'
        assert dict(document.metadatos.values_list('clave', 'valor')) == updated_metadata
    call(DocumentDetailView, 'patch', {'code': payload['code']}, 200, 'Mantener código propio', document_id=doc_id)
    call(DocumentDetailView, 'patch', {'date': None, 'metadata': {'classification': '', 'observations': '', 'scope': 'Preservar'}}, 200, 'Vaciar campos opcionales', document_id=doc_id)
    document.refresh_from_db()
    assert document.fecha_documento is None
    assert dict(document.metadatos.values_list('clave', 'valor')) == {'classification': '', 'observations': '', 'scope': 'Preservar'}
    document.eliminado_en = timezone.now()
    document.eliminado_por = editor
    document.motivo_eliminacion = 'Ensayo temporal UNIQUE'
    document.save(update_fields=['eliminado_en', 'eliminado_por', 'motivo_eliminacion'])
    call(DocumentListCreateView, 'post', payload, 409, 'Código archivado no reutilizable en alta')
    @document_code_conflict
    def insert_duplicate_without_prevalidation():
        duplicate = copy(document)
        duplicate.pk = uuid4()
        duplicate.save(force_insert=True)
    conflict = insert_duplicate_without_prevalidation()
    assert conflict.status_code == 409 and conflict.data['code'] == 'DOCUMENT_ALREADY_EXISTS'
    assert Documento.objects.filter(codigo=payload['code'], organizacion_id=editor.organizacion_id).count() == 1
    results.append({'test': 'UNIQUE real sin prevalidación devuelve 409 y revierte escritura', 'status': 409, 'result': 'PASS'})
    other_payload = {**payload, 'code': payload['code'] + '-B'}
    other = call(DocumentListCreateView, 'post', other_payload, 201, 'Documento alternativo')['document']
    call(DocumentDetailView, 'patch', {'code': payload['code']}, 409, 'Código archivado no reutilizable en edición', document_id=other['id'])
    transaction.set_rollback(True)

assert not Documento.objects.filter(pk=doc_id).exists()
output = {'tests': results, 'rolled_back': True, 'versions_created': 0}
(ROOT / 'docs/resultado_campos_documentales.json').write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(output, ensure_ascii=False))
