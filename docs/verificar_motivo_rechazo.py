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
MOTIVE = 'RECHAZO-47-48-NEON: Falta la firma del responsable.\nCorregir la fecha del anexo 7.'
def call(view, user, data=None, **kwargs):
    request = APIRequestFactory().post('/api/',data or {},format='multipart' if data and 'file' in data else 'json')
    force_authenticate(request,user=user)
    return view.as_view()(request,**kwargs)
def png():
    def chunk(kind, data):
        return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',1,1,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b'\x00\xff\x00\x00'))+chunk(b'IEND',b'')

requests = []
class Bridge(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def do_GET(self): self.dispatch()
    def do_POST(self): self.dispatch()
    def dispatch(self):
        path = urlsplit(self.path).path
        role = self.headers.get('X-Test-Role')
        try:
            if path == '/api/auth/csrf/':
                status, content, mime = 200,b'{"csrf_token":"test"}','application/json'
            else:
                # Restrict writes to the single requested rejection.
                assert self.command == 'GET' or (self.command == 'POST' and path == f'/api/reviews/{review_id}/reject/')
                payload = json.loads(self.rfile.read(int(self.headers.get('Content-Length','0'))) or b'{}')
                req = getattr(APIRequestFactory(),self.command.lower())(self.path,payload,format='json')
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
        except Exception as error:
            self.send_error(500,str(error))
            raise

with override_settings(ALLOWED_HOSTS=['testserver']), tempfile.TemporaryDirectory() as folder:
    with patch.object(dv,'default_storage',FileSystemStorage(location=folder)), patch.object(w,'notify_review_assignment'), patch.object(w,'notify_review_decision'), transaction.atomic():
        docs = []
        for name in ['Rechazo reconocible','Sin rechazos']:
            response = call(dv.DocumentListCreateView,editor,data={'code':'REQ47-'+uuid4().hex[:12].upper(),'title':name,'area_id':str(AreaCatalogo.objects.filter(organizacion_id=editor.organizacion_id,activa=True).first().id),'type_id':TipoDocumentoCatalogo.objects.filter(activo=True).first().id,'file':SimpleUploadedFile('revision.png',png(),content_type='image/png')})
            assert response.status_code == 201,response.data
            docs.append(response.data['document']['id'])
        version = ArchivoDocumento.objects.get(documento_id=docs[0])
        response = call(w.ReviewSubmitView,editor,document_id=docs[0],version_id=version.id,data={'reviewer_ids':[str(reviewer.id)]})
        assert response.status_code == 201,response.data
        review_id = response.data['reviews'][0]['id']
        with HTTPServer(('127.0.0.1',0),Bridge) as server:
            server.timeout = .25
            env = dict(os.environ,REQ47_PORT=str(server.server_port),REQ47_DOCUMENT=docs[0],REQ47_OTHER=docs[1],REQ47_REVIEW=review_id,REQ47_MOTIVE=MOTIVE)
            process = subprocess.Popen(['node',str(ROOT/'docs/verificar_motivo_rechazo_ui.cjs')],env=env)
            deadline = time.monotonic()+180
            try:
                while process.poll() is None and time.monotonic()<deadline:
                    server.handle_request()
                assert process.poll() == 0,'Falló o excedió tiempo la prueba UI'
            finally:
                if process.poll() is None: process.terminate(); process.wait(timeout=10)
        saved = SolicitudRevision.objects.select_related('estado_revision').get(pk=review_id)
        version.refresh_from_db()
        assert saved.comentario_resolucion == MOTIVE and saved.estado_revision.codigo == 'RECHAZADA'
        assert version.estado_version.codigo == 'RECHAZADO'
        assert saved.comentarios.filter(contenido=MOTIVE,autor=reviewer).exists()
        assert sum(r['method']=='POST' for r in requests) == 1
        transaction.set_rollback(True)
result = {'result':'PASS','environment':'Navegador local, vistas reales, Neon, autenticación de prueba, rollback total','motive':MOTIVE,'documents_rolled_back':docs,'review_rolled_back':review_id,'requests':requests}
(ROOT/'docs/resultado_motivo_rechazo.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2))
