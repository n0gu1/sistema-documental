"""#49: estados independientes, publicación explícita y snapshots UI. Neon/rollback."""
import os, sys, json, tempfile, struct, zlib
from pathlib import Path
from uuid import uuid4
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE','backend.settings')
import django
django.setup()
from django.db import transaction
from django.test import override_settings
from django.core.files.storage import FileSystemStorage
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIRequestFactory, force_authenticate
from rest_framework.renderers import JSONRenderer
from documentos import document_views as dv, workflow_views as w, reader_views as rv
from documentos.models import UsuarioDocumental, AreaCatalogo, TipoDocumentoCatalogo, ArchivoDocumento
editor=UsuarioDocumental.objects.get(correo='prueba.editor@test.local')
reviewer=UsuarioDocumental.objects.get(correo='prueba.revisor@test.local')
reader=UsuarioDocumental.objects.get(correo='prueba.lector@test.local')
admin=UsuarioDocumental.objects.get(correo='prueba.admin@test.local')
def call(view,user=editor,method='get',data=None,**kwargs):
    req=getattr(APIRequestFactory(),method)('/api/',data or {},format='multipart' if data and 'file' in data else 'json')
    force_authenticate(req,user=user)
    return view.as_view()(req,**kwargs)
def png():
    def chunk(kind,data): return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',1,1,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b'\x00\xff\x00\x00'))+chunk(b'IEND',b'')
snapshots=[]
with override_settings(ALLOWED_HOSTS=['testserver']),tempfile.TemporaryDirectory() as folder:
  with patch.object(dv,'default_storage',FileSystemStorage(location=folder)),patch.object(w,'notify_review_assignment'),patch.object(w,'notify_review_decision'),patch.object(w,'notify_document_publication'),transaction.atomic():
    created=call(dv.DocumentListCreateView,method='post',data={'code':'REQ49-'+uuid4().hex[:10].upper(),'title':'Contrato de estados','area_id':str(AreaCatalogo.objects.filter(organizacion_id=editor.organizacion_id,activa=True).first().id),'type_id':TipoDocumentoCatalogo.objects.filter(activo=True).first().id,'file':SimpleUploadedFile('estados.png',png(),content_type='image/png')})
    assert created.status_code==201,created.data
    doc=created.data['document']['id']
    version=ArchivoDocumento.objects.get(documento_id=doc)
    review_id=None
    def snapshot(expected,published=False):
        detail=call(dv.DocumentDetailView,document_id=doc).data['document']
        assert detail['status_scope']=='current_version'
        assert detail['current_version_id']==str(version.id)
        assert detail['status']==detail['current_version_status']
        assert detail['status']['code']==expected
        assert detail['current_version']['is_current']
        assert detail['current_version']['is_published']==published
        assert bool(detail['publication']['published_version_ids'])==published
        review=call(w.ReviewDetailView,reviewer,review_id=review_id).data['review'] if review_id else None
        if review:
            assert review['status_scope']=='review_request' and review['review_status']==review['status']
            assert review['version']['id']==str(version.id) and review['version']['status']['code']==expected
            assert review['status']['code']==('PENDIENTE' if expected=='EN_REVISION' else 'APROBADA')
        reader_result=call(rv.ReaderDocumentDetailView,reader,document_id=doc)
        assert reader_result.status_code==(200 if published else 404),getattr(reader_result,'data',None)
        snapshots.append({'stage':expected,'document':detail,'review':review})
    snapshot('BORRADOR')
    response=call(w.ReviewSubmitView,method='post',document_id=doc,version_id=version.id,data={'reviewer_ids':[str(reviewer.id)]})
    assert response.status_code==201,response.data
    review_id=response.data['reviews'][0]['id']
    snapshot('EN_REVISION')
    approved=call(w.ReviewApproveView,reviewer,'post',review_id=review_id)
    assert approved.status_code==200 and not approved.data['review']['version']['is_published']
    snapshot('APROBADO')
    published=call(w.VersionPublishView,admin,'post',document_id=doc,version_id=version.id)
    assert published.status_code==200,published.data
    assert published.data['version']['status']['code']=='PUBLICADO' and published.data['version']['is_published']
    snapshot('PUBLICADO',True)
    uploaded=call(dv.DocumentVersionListView,method='post',document_id=doc,data={'file':SimpleUploadedFile('borrador.png',png(),content_type='image/png')})
    assert uploaded.status_code==201,uploaded.data
    detail=call(dv.DocumentDetailView,document_id=doc).data['document']
    review=call(w.ReviewDetailView,reviewer,review_id=review_id).data['review']
    assert detail['current_version_status']['code']=='BORRADOR' and detail['current_version_id']!=str(version.id)
    assert detail['publication']['published_version_ids']==[str(version.id)]
    assert review['review_status']['code']=='APROBADA' and review['version']['status']['code']=='PUBLICADO'
    assert not review['version']['is_current'] and review['version']['is_published']
    snapshots.append({'stage':'PUBLICADA_ANTERIOR_BORRADOR_VIGENTE','document':detail,'review':review})
    ArchivoDocumento.objects.filter(documento_id=doc).update(es_vigente=False)
    no_current=call(dv.DocumentDetailView,document_id=doc).data['document']
    assert no_current['current_version_id'] is None and no_current['current_version_status'] is None and no_current['status'] is None
    transaction.set_rollback(True)
result={'result':'PASS','environment':'Neon real, backend local, archivos temporales y rollback','document_rolled_back':doc,'review_rolled_back':review_id,'snapshots':snapshots,'checks':['BORRADOR→EN_REVISION→APROBADO→PUBLICADO explícito','Lector no accede hasta publicar','Solicitud APROBADA distinta de versión PUBLICADO','Publicada anterior no vigente y borrador vigente diferenciados','Sin vigente no se elige otra versión']}
(ROOT/'docs/resultado_contrato_estados.json').write_bytes(JSONRenderer().render(result))
print(json.dumps({'result':'PASS','document_rolled_back':doc,'review_rolled_back':review_id,'checks':result['checks']},ensure_ascii=True,indent=2))
