"""Publicación explícita con PostgreSQL Neon; archivos temporales y rollback."""
import os, sys, json, tempfile, hashlib
from pathlib import Path
from uuid import uuid4
from unittest.mock import patch
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()
from django.db import transaction, connection
from django.test import override_settings
from django.core.files.storage import FileSystemStorage
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate
from documentos.models import UsuarioDocumental, Documento, AreaCatalogo, TipoDocumentoCatalogo, ArchivoDocumento, EstadoVersionCatalogo, ProveedorAlmacenamiento
from documentos import document_views as dv, reader_views as rv, workflow_views as w

users = {r: UsuarioDocumental.objects.get(correo=f'prueba.{r}@test.local') for r in ('admin','editor','lector')}
checks = []
def call(view, role='lector', method='get', **kwargs):
    req = getattr(APIRequestFactory(),method)('/api/', {}, format='json')
    force_authenticate(req,user=users[role])
    return view.as_view()(req,**kwargs)
def check(name, condition):
    assert condition, name
    checks.append(name)

with override_settings(ALLOWED_HOSTS=['testserver']), tempfile.TemporaryDirectory() as folder, transaction.atomic():
    owner=users['editor']
    doc=Documento.objects.create(id=uuid4(),organizacion_id=owner.organizacion_id,area=AreaCatalogo.objects.filter(organizacion_id=owner.organizacion_id,activa=True).first(),tipo_documento=TipoDocumentoCatalogo.objects.filter(activo=True).first(),codigo='PUB3149-'+uuid4().hex[:10],nombre='Prueba publicación 31/49',creado_por=owner,creado_en=timezone.now(),actualizado_en=timezone.now())
    versions=[]
    for minor in (0,1,2):
        content=f'Contenido exclusivo de versión 1.{minor}\n'.encode()
        key=f'v{minor}.txt'
        (Path(folder)/key).write_bytes(content)
        versions.append(ArchivoDocumento.objects.create(id=uuid4(),documento=doc,estado_version=EstadoVersionCatalogo.objects.get(codigo='APROBADO' if minor<2 else 'BORRADOR'),proveedor_almacenamiento=ProveedorAlmacenamiento.objects.first(),numero_mayor=1,numero_menor=minor,orden_version=minor+1,es_vigente=minor==2,nombre_archivo_original=key,clave_almacenamiento=key,tipo_mime='text/plain',tamano_bytes=len(content),sha256=hashlib.sha256(content).hexdigest(),creada_por=owner,creada_en=timezone.now()))
    storage=FileSystemStorage(location=folder)
    with patch.object(dv,'default_storage',storage),patch.object(rv,'default_storage',storage),patch.object(w,'notify_document_publication'):
        def listed():
            return [d['id'] for d in call(rv.ReaderDocumentListView).data['results']]
        check('Antes: no aparece en biblioteca',str(doc.id) not in listed())
        check('Antes: detalle 404',call(rv.ReaderDocumentDetailView,document_id=doc.id).status_code==404)
        for view in (rv.ReaderVersionDownloadView,dv.DocumentVersionDownloadView):
            check('Antes: descarga aprobada 404 '+view.__name__,call(view,document_id=doc.id,version_id=versions[1].id).status_code==404)
        check('Lector no publica',call(w.VersionPublishView,method='post',document_id=doc.id,version_id=versions[1].id).status_code==403)
        check('Borrador no publicable',call(w.VersionPublishView,'admin','post',document_id=doc.id,version_id=versions[2].id).status_code==400)
        response=call(w.VersionPublishView,'admin','post',document_id=doc.id,version_id=versions[1].id)
        check('Publicar aprobada 1.1',response.status_code==200 and response.data['version']['id']==str(versions[1].id))
        check('Después: visible',str(doc.id) in listed())
        detail=call(rv.ReaderDocumentDetailView,document_id=doc.id).data['document']
        check('Después: versión exacta 1.1',detail['published_version_id']==str(versions[1].id) and detail['version']['version']=='1.1')
        check('Fecha de publicación real',detail['version']['published_at']>versions[1].creada_en)
        for view in (rv.ReaderVersionDownloadView,dv.DocumentVersionDownloadView):
            response=call(view,document_id=doc.id,version_id=versions[1].id)
            check('Descarga 200 '+view.__name__,response.status_code==200)
            received=hashlib.sha256(b''.join(response.streaming_content)).hexdigest()
            response.file_to_stream.close()
            check('Bytes SHA256 1.1 '+view.__name__,received==versions[1].sha256)
            if view==rv.ReaderVersionDownloadView:
                check('Cabecera ID exacto',response['X-Document-Version-Id']==str(versions[1].id))
        check('Publicación repetida rechazada',call(w.VersionPublishView,'admin','post',document_id=doc.id,version_id=versions[1].id).status_code==400)
        check('Publicar aprobada anterior 1.0',call(w.VersionPublishView,'admin','post',document_id=doc.id,version_id=versions[0].id).status_code==200)
        check('Lector recibe publicación elegida 1.0',call(rv.ReaderDocumentDetailView,document_id=doc.id).data['document']['published_version_id']==str(versions[0].id))
        with connection.cursor() as cursor:
            cursor.execute("INSERT INTO gestion_documental.documentos_politicas_acl(documento_id,permiso_id,modo) SELECT %s,id,'DENEGAR' FROM gestion_documental.permisos WHERE codigo IN ('documentos.consultar','documentos.descargar')",[doc.id])
        check('Sin autorización: no aparece',str(doc.id) not in listed())
        for view in (rv.ReaderDocumentDetailView,dv.DocumentDetailView):
            check('Sin autorización: consulta bloqueada '+view.__name__,call(view,document_id=doc.id).status_code==404)
        with patch.object(storage,'open',wraps=storage.open) as opened:
            for view in (rv.ReaderVersionDownloadView,dv.DocumentVersionDownloadView):
                check('Sin autorización: descarga bloqueada '+view.__name__,call(view,document_id=doc.id,version_id=versions[1].id).status_code==403)
            opened.assert_not_called()
    transaction.set_rollback(True)
result={'result':'PASS','environment':'Backend local / Neon / almacenamiento temporal real / rollback','document_id':str(doc.id),'downloaded_version':{'id':str(versions[1].id),'number':'1.1','sha256':versions[1].sha256},'checks':checks}
(ROOT/'docs/resultado_publicacion_31_49.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=True,indent=2))
