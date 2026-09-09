"""1.0 → 1.1 → 1.2 y bloqueo real por documento contra Neon."""
import os, sys, json, tempfile, struct, zlib, time, threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE','backend.settings')
import django
django.setup()
from django.db import transaction, connection, connections
from django.test import override_settings
from django.utils import timezone
from django.core.files.storage import FileSystemStorage
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIRequestFactory, force_authenticate
from documentos.models import UsuarioDocumental, Documento, AreaCatalogo, TipoDocumentoCatalogo, ArchivoDocumento, HistorialEstadoVersion
from documentos import document_views as views

def png(rgb):
    def chunk(kind,data):
        return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',1,1,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b'\x00'+bytes(rgb)))+chunk(b'IEND',b'')
contents=[png(color) for color in [(255,0,0),(0,255,0),(0,0,255)]]
editor=UsuarioDocumental.objects.get(correo='prueba.editor@test.local')
admin=UsuarioDocumental.objects.get(correo='prueba.admin@test.local')
def upload(content):
    return SimpleUploadedFile('secuencia.png',content,content_type='image/png')
def call(view,method,data,user=editor,doc=None):
    request=getattr(APIRequestFactory(),method)('/api/documents/',data,format='multipart' if method=='post' else 'json')
    force_authenticate(request,user=user)
    return view.as_view()(request,**({'document_id':doc} if doc else {}))
checks=[]
with override_settings(ALLOWED_HOSTS=['testserver']),tempfile.TemporaryDirectory() as folder:
    storage=FileSystemStorage(location=folder)
    with patch.object(views,'default_storage',storage):
        with transaction.atomic():
            start=timezone.now()
            response=call(views.DocumentListCreateView,'post',{'code':'REQ34-'+uuid4().hex[:12].upper(),'title':'Secuencia controlada','area_id':str(AreaCatalogo.objects.filter(organizacion_id=editor.organizacion_id,activa=True).first().id),'type_id':TipoDocumentoCatalogo.objects.filter(activo=True).first().id,'file':upload(contents[0])})
            assert response.status_code==201,response.data
            doc=response.data['document']['id']
            assert response.data['document']['files'][0]['version']=='1.0'
            saved=[ArchivoDocumento.objects.filter(documento_id=doc).values().get()]
            checks.append('Alta con archivo: 1.0')
            for index,(route,user) in enumerate([(views.DocumentVersionListView,admin),(views.DocumentFileListCreateView,editor)],1):
                response=call(route,'post',{'file':upload(contents[index]),'version_type':'minor','comment':f'Cambio menor {index}'},user,doc)
                assert response.status_code==201,response.data
                version=response.data.get('version') or response.data['file']
                assert version['version']==f'1.{index}' and version['author']['id']==str(user.id)
                saved.append(ArchivoDocumento.objects.filter(pk=version['id']).values().get())
                assert ArchivoDocumento.objects.filter(documento_id=doc,es_vigente=True).count()==1
                checks.append(f'Carga menor {index}: 1.{index}, una sola vigente')
            rows=list(ArchivoDocumento.objects.filter(documento_id=doc).order_by('orden_version').values())
            assert [row['orden_version'] for row in rows]==[1,2,3]
            assert [(row['numero_mayor'],row['numero_menor']) for row in rows]==[(1,0),(1,1),(1,2)]
            assert [row['es_vigente'] for row in rows]==[False,False,True]
            for index,row in enumerate(rows):
                expected={**saved[index],'es_vigente':index==2}
                assert row==expected
                assert row['creada_por_id']==[editor.id,admin.id,editor.id][index]
                assert start<=row['creada_en']<=timezone.now()
                with storage.open(row['clave_almacenamiento'],'rb') as stream:
                    assert stream.read()==contents[index]
                assert HistorialEstadoVersion.objects.filter(version_documento_id=row['id']).count()==1
            assert len({row['clave_almacenamiento'] for row in rows})==3
            assert len({row['sha256'] for row in rows})==3
            assert [row['creada_en'] for row in rows]==sorted(row['creada_en'] for row in rows)
            checks.append('1.0 y 1.1 conservan filas, autor, fecha, hash, archivo e historial; solo cambia vigencia')
            listing=call(views.DocumentVersionListView,'get',{},doc=doc)
            assert listing.status_code==200
            assert [v['version'] for v in listing.data['versions']]==['1.2','1.1','1.0']
            assert listing.data['current_version_id']==str(rows[-1]['id'])
            assert all(v['created_at'] and v['author']['id'] for v in listing.data['versions'])
            checks.append('Consulta posterior devuelve 1.2, 1.1 y 1.0 con autor/fecha y vigente correcta')
            with patch.object(storage,'save',side_effect=OSError('Fallo controlado')):
                assert call(views.DocumentVersionListView,'post',{'file':upload(contents[0])},doc=doc).status_code==400
            assert rows==list(ArchivoDocumento.objects.filter(documento_id=doc).order_by('orden_version').values())
            checks.append('Fallo de almacenamiento no consume número ni cambia vigente')
            transaction.set_rollback(True)

        # Ensayo de bloqueo entre conexiones, sin confirmar versiones ni modificar el documento existente.
        target=Documento.objects.filter(organizacion_id=editor.organizacion_id,codigo__startswith='REQ',eliminado_en__isnull=True,archivos__isnull=True).first()
        assert target,'Se necesita una ficha de ensayo REQ sin archivos para probar el primer bloqueo'
        baseline=Documento.objects.filter(pk=target.pk).values().get()
        ready=threading.Event()
        worker_pid=[]
        def worker():
            try:
                with transaction.atomic():
                    with connection.cursor() as cursor:
                        cursor.execute('SELECT pg_backend_pid()')
                        worker_pid.append(cursor.fetchone()[0])
                    ready.set()
                    response=call(views.DocumentVersionListView,'post',{'file':upload(contents[0]),'version_type':'minor'},user=admin,doc=target.id)
                    assert response.status_code==201,response.data
                    assert response.data['version']['version']=='1.0'
                    transaction.set_rollback(True)
                return True
            finally:
                connections.close_all()
        with ThreadPoolExecutor(max_workers=1) as pool:
            with transaction.atomic():
                Documento.objects.select_for_update().get(pk=target.pk)
                with connection.cursor() as cursor:
                    cursor.execute('SELECT pg_backend_pid()')
                    holder=cursor.fetchone()[0]
                future=pool.submit(worker)
                assert ready.wait(15)
                deadline=time.monotonic()+30
                blocked=False
                while time.monotonic()<deadline:
                    with connection.cursor() as cursor:
                        cursor.execute('SELECT pg_blocking_pids(%s)',[worker_pid[0]])
                        blocked=holder in cursor.fetchone()[0]
                    if blocked or future.done(): break
                    time.sleep(0.1)
                assert blocked,'La carga debe esperar al bloqueo de documento aun sin versiones'
            assert future.result(timeout=30)
        assert not ArchivoDocumento.objects.filter(documento_id=target.id).exists()
        assert Documento.objects.filter(pk=target.pk).values().get()==baseline
        checks.append('PostgreSQL confirma espera por bloqueo del documento sin versiones; carga continúa al liberarlo y se revierte')
result={'result':'PASS','sequence':['1.0','1.1','1.2'],'checks':checks,'rolled_back':True,'concurrency':'Bloqueo real entre dos conexiones; no se simulan dos cargas confirmadas simultáneas','storage':'FileSystemStorage temporal; bytes reales, sin probar S3'}
(ROOT/'docs/resultado_versiones_secuenciales.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False))
