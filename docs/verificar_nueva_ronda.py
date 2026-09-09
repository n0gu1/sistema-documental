"""UI real -> vistas Django reales -> Neon, con rollback y archivos temporales.

El puente HTTP es solo de prueba, en loopback y con autenticación DRF explícita.
No certifica login, middleware de sesión ni Render/S3. Iniciar Vite en 5173.
"""
import os, sys, json, tempfile, subprocess, time, struct, zlib
from pathlib import Path
from uuid import uuid4
from unittest.mock import patch
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlsplit
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE','backend.settings')
import django
django.setup()
from django.db import transaction
from django.urls import resolve
from django.test import override_settings
from django.core.files.storage import FileSystemStorage
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIRequestFactory, force_authenticate
from rest_framework.renderers import JSONRenderer
from documentos.models import UsuarioDocumental, AreaCatalogo, TipoDocumentoCatalogo, ArchivoDocumento, SolicitudRevision
from documentos import document_views as dv, workflow_views as w

editor = UsuarioDocumental.objects.get(correo='prueba.editor@test.local')
reviewer = UsuarioDocumental.objects.get(correo='prueba.revisor@test.local')
MOTIVE = 'REQ48: Corregir firma y enviar archivo nuevo.'
def call(view, user, data=None, **kwargs):
    request = APIRequestFactory().post('/api/',data or {},format='multipart' if data and 'file' in data else 'json')
    force_authenticate(request,user=user)
    return view.as_view()(request,**kwargs)
def png(color=b'\xff\x00\x00'):
    def chunk(kind, data):
        return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',1,1,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b'\x00'+color))+chunk(b'IEND',b'')

requests = []
class Bridge(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin','http://127.0.0.1:5173')
        self.send_header('Access-Control-Allow-Credentials','true')
        self.send_header('Access-Control-Allow-Headers','Content-Type, X-Test-Role, X-CSRFToken')
        super().end_headers()
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Methods','GET, POST, OPTIONS')
        self.end_headers()
    def do_GET(self): self.dispatch()
    def do_POST(self): self.dispatch()
    def dispatch(self):
        path = urlsplit(self.path).path
        role = self.headers.get('X-Test-Role')
        try:
            if path == '/api/auth/csrf/':
                status, content, mime = 200,b'{"csrf_token":"test"}','application/json'
            else:
                assert self.command == 'GET' or (self.command == 'POST' and (
                    path == f'/api/documents/{doc}/versions/' or
                    (path.startswith(f'/api/documents/{doc}/versions/') and path.endswith('/submit-review/')) or
                    (path.startswith('/api/reviews/') and path.endswith('/reject/'))))
                payload = self.rfile.read(int(self.headers.get('Content-Length','0')))
                req = APIRequestFactory().generic(self.command,self.path,payload,content_type=self.headers.get('Content-Type','application/json'))
                force_authenticate(req,user=reviewer if role == 'reviewer' else editor)
                match = resolve(path)
                response = match.func(req,**match.kwargs)
                status, mime = response.status_code, response.get('Content-Type','application/json')
                if getattr(response,'streaming',False):
                    content = b''.join(response.streaming_content)
                    response.file_to_stream.close()
                else:
                    content = JSONRenderer().render(response.data)
                    mime = 'application/json'
                requests.append({'role':role,'method':self.command,'path':path,'status':status})
            self.send_response(status)
            self.send_header('Content-Type',mime)
            self.send_header('Content-Length',str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            # Browser navigation can cancel a preview while the next view loads.
            pass
        except Exception as error:
            self.send_error(500,str(error))
            raise

with override_settings(ALLOWED_HOSTS=['testserver']), tempfile.TemporaryDirectory() as folder:
    with patch.object(dv,'default_storage',FileSystemStorage(location=folder)), patch.object(w,'notify_review_assignment'), patch.object(w,'notify_review_decision'), transaction.atomic():
        response = call(dv.DocumentListCreateView,editor,data={'code':'REQ48-'+uuid4().hex[:12].upper(),'title':'Corrección y nueva ronda','area_id':str(AreaCatalogo.objects.filter(organizacion_id=editor.organizacion_id,activa=True).first().id),'type_id':TipoDocumentoCatalogo.objects.filter(activo=True).first().id,'file':SimpleUploadedFile('revision.png',png(),content_type='image/png')})
        assert response.status_code == 201,response.data
        doc = response.data['document']['id']
        version = ArchivoDocumento.objects.get(documento_id=doc)
        corrected_path = Path(folder)/'corregida.png'
        corrected_path.write_bytes(png(b'\x00\x00\xff'))
        with HTTPServer(('127.0.0.1',0),Bridge) as server:
            server.timeout = .25
            env = dict(os.environ,REQ48_PORT=str(server.server_port),REQ48_DOCUMENT=doc,REQ48_REVIEWER=str(reviewer.id),REQ48_MOTIVE=MOTIVE,REQ48_FILE=str(corrected_path))
            process = subprocess.Popen(['node',str(ROOT/'docs/verificar_nueva_ronda_ui.cjs')],env=env)
            deadline = time.monotonic()+300
            try:
                while process.poll() is None and time.monotonic()<deadline:
                    server.handle_request()
                assert process.poll() == 0,'Falló o excedió tiempo la prueba UI'
            finally:
                if process.poll() is None: process.terminate(); process.wait(timeout=10)
        saved = SolicitudRevision.objects.select_related('estado_revision').get(version_documento=version)
        version.refresh_from_db()
        assert saved.comentario_resolucion == MOTIVE and saved.estado_revision.codigo == 'RECHAZADA'
        assert version.estado_version.codigo == 'RECHAZADO'
        assert saved.comentarios.filter(contenido=MOTIVE,autor=reviewer).exists()
        versions = list(ArchivoDocumento.objects.filter(documento_id=doc).order_by('orden_version'))
        assert len(versions) == 2 and versions[1].numero_menor == 1 and versions[1].estado_version.codigo == 'EN_REVISION'
        assert not versions[0].es_vigente and versions[1].es_vigente
        new = SolicitudRevision.objects.get(version_documento=versions[1])
        assert new.id != saved.id and new.revisor_id == saved.revisor_id and new.estado_revision.codigo == 'PENDIENTE'
        assert not new.comentario_resolucion and not new.resuelta_en
        assert new.comentarios.filter(contenido=MOTIVE).count() == 0
        assert versions[0].sha256 != versions[1].sha256
        for row,expected in zip(versions,[png(),png(b'\x00\x00\xff')]):
            with dv.default_storage.open(row.clave_almacenamiento,'rb') as stream: assert stream.read() == expected
        assert sum(r['method']=='POST' for r in requests) == 4
        # Repeat delivery must not add requests or change either historical row.
        retry = call(w.ReviewSubmitView,editor,document_id=doc,version_id=new.version_documento_id,data={'reviewer_ids':[str(reviewer.id)]})
        assert retry.status_code in (400,409)
        assert SolicitudRevision.objects.filter(version_documento__documento_id=doc).count() == 2
        # Exercise the UNIQUE guard on a previously assigned draft, then restore it.
        with transaction.atomic():
            ArchivoDocumento.objects.filter(pk=version.id).update(estado_version=w.get_catalog_state(w.EstadoVersionCatalogo,'BORRADOR'))
            duplicate = call(w.ReviewSubmitView,editor,document_id=doc,version_id=version.id,data={'reviewer_ids':[str(reviewer.id)]})
            assert duplicate.status_code == 409 and duplicate.data['code'] == 'REVIEW_VERSION_ALREADY_ASSIGNED', duplicate.data
            transaction.set_rollback(True)
        transaction.set_rollback(True)
result = {'result':'PASS','environment':'Navegador local, vistas reales, Neon, autenticación de prueba, rollback total','motive':MOTIVE,'document_rolled_back':doc,'old_review_id':str(saved.id),'new_review_id':str(new.id),'old_version_id':str(version.id),'new_version_id':str(new.version_documento_id),'checks':['1.0 enviada desde UI','Rechazo con motivo conservado','1.1 con archivo corregido y bytes distintos','Envío de 1.1 al mismo revisor sin violar UNIQUE','Bandeja del Revisor contiene nueva solicitud PENDIENTE 1.1','Reintentos no duplican solicitudes; pareja anterior devuelve 409'],'requests':requests}
(ROOT/'docs/resultado_nueva_ronda.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2))
