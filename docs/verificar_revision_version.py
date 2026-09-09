"""Requisito 45: solicitud no vigente, bytes exactos y decisión; Neon con rollback."""
import os, sys, json, tempfile, struct, zlib
from pathlib import Path
from uuid import uuid4
from unittest.mock import patch
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()
from django.db import transaction
from django.test import override_settings
from django.core.files.storage import FileSystemStorage
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIRequestFactory, force_authenticate
from documentos.models import UsuarioDocumental, AreaCatalogo, TipoDocumentoCatalogo, ArchivoDocumento
from documentos import document_views as views, workflow_views as workflow

def png(color):
    def chunk(kind, data):
        return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', 1, 1, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(b'\x00' + bytes(color))) + chunk(b'IEND', b'')

editor = UsuarioDocumental.objects.get(correo='prueba.editor@test.local')
reviewer = UsuarioDocumental.objects.get(correo='prueba.revisor@test.local')
def call(view, user, method='post', data=None, **kwargs):
    request = getattr(APIRequestFactory(), method)('/api/', data or {}, format='multipart' if data and 'file' in data else 'json')
    force_authenticate(request, user=user)
    return view.as_view()(request, **kwargs)

checks = []
with override_settings(ALLOWED_HOSTS=['testserver']), tempfile.TemporaryDirectory() as folder:
    with patch.object(views, 'default_storage', FileSystemStorage(location=folder)), transaction.atomic():
        contents = [png((255,0,0)), png((0,0,255))]
        response = call(views.DocumentListCreateView, editor, data={'code':'REQ45-' + uuid4().hex[:12].upper(), 'title':'Revisión de versión no vigente', 'area_id':str(AreaCatalogo.objects.filter(organizacion_id=editor.organizacion_id, activa=True).first().id), 'type_id':TipoDocumentoCatalogo.objects.filter(activo=True).first().id, 'file':SimpleUploadedFile('solicitada.png', contents[0], content_type='image/png')})
        assert response.status_code == 201, response.data
        doc = response.data['document']['id']
        old = str(ArchivoDocumento.objects.get(documento_id=doc).id)
        response = call(views.DocumentVersionListView, editor, document_id=doc, data={'file':SimpleUploadedFile('vigente.png', contents[1], content_type='image/png'), 'version_type':'minor'})
        assert response.status_code == 201, response.data
        current = response.data['version']['id']
        response = call(workflow.ReviewSubmitView, editor, document_id=doc, version_id=old, data={'reviewer_ids':[str(reviewer.id)], 'checklist':[]})
        assert response.status_code == 201, response.data
        review = response.data['reviews'][0]
        assert review['document']['version_id'] == old
        detail = call(views.DocumentDetailView, reviewer, 'get', document_id=doc)
        assert detail.status_code == 200, detail.data
        files = detail.data['document']['files']
        assert next(f for f in files if f['is_current'])['id'] == current != old
        checks.append('Solicitud creada por Editor para 1.0 no vigente; búsqueda global devuelve 1.1')
        for view in [views.DocumentFilePreviewView, views.DocumentFileDownloadView]:
            response = call(view, reviewer, 'get', document_id=doc, file_id=old)
            assert response.status_code == 200, getattr(response, 'data', '')
            assert b''.join(response.streaming_content) == contents[0] != contents[1]
            # Close only the stream: response.close() emits request_finished and
            # closes the connection holding this test's outer rollback transaction.
            response.file_to_stream.close()
        checks.append('Preview y descarga por Revisor contienen exactamente los bytes de 1.0')
        response = call(workflow.ReviewApproveView, reviewer, review_id=review['id'])
        assert response.status_code == 200, response.data
        assert response.data['review']['document']['version_id'] == old
        assert ArchivoDocumento.objects.get(pk=old).estado_version.codigo == 'APROBADO'
        assert ArchivoDocumento.objects.get(pk=current).estado_version.codigo == 'BORRADOR'
        assert ArchivoDocumento.objects.get(pk=current).es_vigente
        checks.append('Decisión aprueba solo 1.0; 1.1 conserva BORRADOR y vigencia')
        transaction.set_rollback(True)
result = {'environment':'Backend local contra Neon, archivos temporales, rollback total', 'document_id_rolled_back':doc, 'review_id_rolled_back':review['id'], 'requested_version_id':old, 'global_current_version_id':current, 'checks':checks}
(ROOT / 'docs/resultado_revision_version.json').write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding='utf-8')
print(json.dumps(result, indent=2, ensure_ascii=False))
