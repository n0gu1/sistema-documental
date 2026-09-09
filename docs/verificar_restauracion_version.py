"""Restauración real contra Neon, archivos locales y transacción revertida."""
import os, sys, json, tempfile, hashlib, struct, zlib
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
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIRequestFactory, force_authenticate
from documentos.models import UsuarioDocumental, AreaCatalogo, TipoDocumentoCatalogo, ArchivoDocumento, HistorialEstadoVersion
from documentos import document_views as views

def png(color):
    def chunk(kind, data):
        return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', 1, 1, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(b'\x00' + bytes(color))) + chunk(b'IEND', b'')

user = UsuarioDocumental.objects.get(correo='prueba.admin@test.local')
def call(view, method='post', data=None, **kwargs):
    request = getattr(APIRequestFactory(), method)('/api/documents/', data or {}, format='multipart' if data and 'file' in data else 'json')
    force_authenticate(request, user=user)
    return view.as_view()(request, **kwargs)

checks = []
with override_settings(ALLOWED_HOSTS=['testserver']), tempfile.TemporaryDirectory() as folder:
    storage = FileSystemStorage(location=folder)
    with patch.object(views, 'default_storage', storage), transaction.atomic():
        contents = [png(rgb) for rgb in [(255,0,0), (0,255,0), (0,0,255), (125,125,0)]]
        data = {'code': 'REQ39-' + uuid4().hex[:12].upper(), 'title': 'Restauración aislada', 'area_id': str(AreaCatalogo.objects.filter(organizacion_id=user.organizacion_id, activa=True).first().id), 'type_id': TipoDocumentoCatalogo.objects.filter(activo=True).first().id, 'file': SimpleUploadedFile('original.png', contents[0], content_type='image/png')}
        response = call(views.DocumentListCreateView, data=data)
        assert response.status_code == 201, response.data
        doc = response.data['document']['id']
        for i in range(1, 4):
            response = call(views.DocumentVersionListView, data={'file': SimpleUploadedFile('original.png', contents[i], content_type='image/png'), 'version_type': 'minor'}, document_id=doc)
            assert response.status_code == 201 and response.data['version']['version'] == f'1.{i}', response.data
        before = list(ArchivoDocumento.objects.filter(documento_id=doc).order_by('orden_version').values())
        source = before[2]
        response = call(views.DocumentVersionRestoreView, document_id=doc, version_id=source['id'], data={'version_type': 'minor'})
        assert response.status_code == 201, response.data
        restored = response.data['version']
        assert restored['version'] == '1.4' and restored['status']['code'] == 'BORRADOR'
        assert restored['id'] != str(source['id']) and restored['author']['id'] == str(user.id)
        checks.append('Restaurar 1.2 desde 1.3 crea fila nueva 1.4 BORRADOR, con autor y fecha')
        after = list(ArchivoDocumento.objects.filter(documento_id=doc).order_by('orden_version').values())
        assert after[:-1] == [{**row, 'es_vigente': False} for row in before]
        assert sum(row['es_vigente'] for row in after) == 1 and after[-1]['es_vigente']
        for row, content in zip(after, [*contents, contents[2]]):
            with storage.open(row['clave_almacenamiento'], 'rb') as stream:
                actual = stream.read()
            assert actual == content and hashlib.sha256(actual).hexdigest() == row['sha256']
        assert after[-1]['clave_almacenamiento'] != source['clave_almacenamiento']
        checks.append('1.0, 1.1, 1.2 y 1.3 conservadas; bytes/hash de 1.4 idénticos a 1.2; solo 1.4 vigente')
        assert HistorialEstadoVersion.objects.filter(version_documento_id=restored['id']).count() == 1
        with connection.cursor() as cursor:
            cursor.execute("SELECT ba.detalles FROM gestion_documental.bitacora_auditoria ba JOIN gestion_documental.acciones_auditoria a ON a.id=ba.accion_id JOIN gestion_documental.tipos_recurso_auditoria tr ON tr.id=ba.tipo_recurso_id WHERE a.codigo='VERSION_RESTAURADA' AND tr.codigo='VERSION' AND ba.recurso_id=%s AND ba.usuario_id=%s", [restored['id'], str(user.id)])
            events = cursor.fetchall()
        assert len(events) == 1, events
        details = json.loads(events[0][0]) if isinstance(events[0][0], str) else events[0][0]
        assert details['source_version_id'] == str(source['id']) and details['new_version'] == '1.4'
        timeline = call(views.DocumentVersionTimelineView, 'get', document_id=doc)
        assert timeline.status_code == 200 and any(event['type'] == 'version_restored' for event in timeline.data['events']), timeline.data
        checks.append('Evento VERSION_RESTAURADA persistido en bitácora y visible en timeline, con origen y nueva versión')
        listing = call(views.DocumentVersionListView, 'get', document_id=doc)
        assert listing.data['current_version_id'] == restored['id']
        assert [v['version'] for v in listing.data['versions']] == ['1.4','1.3','1.2','1.1','1.0']
        checks.append('Recarga confirma 1.4 vigente y todas las versiones anteriores')
        with storage.open(source['clave_almacenamiento'], 'wb') as stream:
            stream.write(b'contenido corrupto controlado')
        failed = call(views.DocumentVersionRestoreView, document_id=doc, version_id=source['id'])
        assert failed.status_code == 400, failed.data
        assert after == list(ArchivoDocumento.objects.filter(documento_id=doc).order_by('orden_version').values())
        assert len(list(Path(folder).rglob('*.png'))) == 5
        checks.append('Contenido corrupto rechazado sin nueva fila, sin cambiar vigente y sin copia huérfana')
        transaction.set_rollback(True)
result = {'document_id_rolled_back': doc, 'environment': 'Neon real, almacenamiento local temporal, rollback total', 'checks': checks}
(ROOT / 'docs/resultado_restauracion_version.json').write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding='utf-8')
print(json.dumps(result, indent=2, ensure_ascii=False))
