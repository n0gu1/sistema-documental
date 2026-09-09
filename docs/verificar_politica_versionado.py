"""Secuencia real contra Neon, archivos locales y rollback de fixtures."""
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
from documentos.models import UsuarioDocumental, AreaCatalogo, TipoDocumentoCatalogo, ArchivoDocumento
from documentos import document_views as views

def png(rgb):
    def chunk(kind,data):
        return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',1,1,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b'\x00'+bytes(rgb)))+chunk(b'IEND',b'')
first=png((255,0,0)); second=png((0,0,255))
factory=APIRequestFactory()
user=UsuarioDocumental.objects.get(correo='prueba.editor@test.local')
def call(view,method,data,doc=None,format='json'):
    request=getattr(factory,method)('/api/documents/',data,format=format)
    force_authenticate(request,user=user)
    return view.as_view()(request,**({'document_id':doc} if doc else {}))
def file(content):
    return SimpleUploadedFile('ensayo.png',content,content_type='image/png')
checks=[]
with override_settings(ALLOWED_HOSTS=['testserver']),transaction.atomic(),tempfile.TemporaryDirectory() as folder:
    storage=FileSystemStorage(location=folder)
    with patch.object(views,'default_storage',storage):
        payload={'code':'REQ33-'+uuid4().hex[:12].upper(),'title':'Inicial','area_id':str(AreaCatalogo.objects.filter(organizacion_id=user.organizacion_id,activa=True).first().id),'type_id':TipoDocumentoCatalogo.objects.filter(activo=True).first().id,'metadata':json.dumps({'observations':'Original'}),'file':file(first)}
        response=call(views.DocumentListCreateView,'post',payload,format='multipart')
        assert response.status_code==201,response.data
        doc=response.data['document']['id']
        assert response.data['version_policy']=='file_content' and response.data['version_created'] is True
        assert [v['version'] for v in response.data['document']['files']]==['1.0']
        baseline=list(ArchivoDocumento.objects.filter(documento_id=doc).values())
        checks.append('Crear con archivo: 1.0')
        response=call(views.DocumentDetailView,'patch',{'title':'Datos modificados','metadata':{'observations':'Cambio de ficha'}},doc)
        assert response.status_code==200,response.data
        assert response.data['version_created'] is False and response.data['version_policy']=='file_content'
        assert list(ArchivoDocumento.objects.filter(documento_id=doc).values())==baseline
        reload=call(views.DocumentDetailView,'get',{},doc).data['document']
        assert reload['title']=='Datos modificados' and reload['metadata']['observations']=='Cambio de ficha'
        assert [v['version'] for v in reload['files']]==['1.0']
        checks.append('PATCH y recarga: datos persistidos, versión 1.0 intacta')
        assert call(views.DocumentDetailView,'patch',{'file':file(second)},doc,format='multipart').status_code==400
        for route in (views.DocumentFileListCreateView,views.DocumentVersionListView):
            assert call(route,'post',{'file':file(second),'title':'No ignorar'},doc,format='multipart').status_code==400
            assert call(route,'post',{'comment':'Sin archivo'},doc,format='multipart').status_code==400
        assert list(ArchivoDocumento.objects.filter(documento_id=doc).values())==baseline
        checks.append('Operaciones ambiguas o sin archivo rechazadas sin crear versión')
        response=call(views.DocumentVersionListView,'post',{'file':file(second),'comment':'Contenido nuevo','version_type':'minor'},doc,format='multipart')
        assert response.status_code==201,response.data
        assert response.data['version_created'] is True and response.data['version']['version']=='1.1'
        versions=list(ArchivoDocumento.objects.filter(documento_id=doc).order_by('orden_version'))
        assert [(v.numero_mayor,v.numero_menor,v.es_vigente) for v in versions]==[(1,0,False),(1,1,True)]
        assert versions[0].id==baseline[0]['id']
        assert versions[0].sha256!=versions[1].sha256
        for version,expected in zip(versions,(first,second)):
            with storage.open(version.clave_almacenamiento,'rb') as stream:
                assert stream.read()==expected
        checks.append('Carga menor: 1.1; conserva 1.0 y bytes de ambas versiones')
        reload=call(views.DocumentDetailView,'get',{},doc).data['document']
        assert reload['title']=='Datos modificados' and reload['metadata']['observations']=='Cambio de ficha'
        assert [v['version'] for v in reload['files']]==['1.1','1.0']
        checks.append('Recarga final: ficha actual y versiones 1.1/1.0 coherentes')
        payload.pop('file');payload['code']='REQ33-'+uuid4().hex[:12].upper()
        response=call(views.DocumentListCreateView,'post',payload,format='multipart')
        assert response.status_code==201 and response.data['version_created'] is False and response.data['document']['files']==[]
        checks.append('Alta sin archivo: ficha sin versión, sin inventar 1.0')
    transaction.set_rollback(True)
result={'result':'PASS','sequence':['1.0','PATCH: 1.0','Carga menor: 1.1'],'checks':checks,'rolled_back':True,'storage':'FileSystemStorage temporal real; no prueba S3'}
(ROOT/'docs/resultado_politica_versionado.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False))
