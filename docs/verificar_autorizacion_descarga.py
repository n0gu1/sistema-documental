"""Permisos reales de Neon en transacción reversible; descarga de bytes locales reales."""
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
from documentos.models import UsuarioDocumental, Documento, AreaCatalogo, TipoDocumentoCatalogo, ArchivoDocumento, EstadoVersionCatalogo, ProveedorAlmacenamiento, PermisoDocumental
from documentos import document_views as general, reader_views as reader
from documentos.auth_utils import user_has_permission

factory=APIRequestFactory()
users=[UsuarioDocumental.objects.get(correo=f'prueba.{role}@test.local') for role in ('editor','lector')]
checks=[]
def call(view,user,doc,version=None):
    request=factory.get('/api/documents/')
    force_authenticate(request,user=user)
    args={'document_id':doc.id}
    if version is not None:
        args['file_id' if view==general.DocumentFileDownloadView else 'version_id']=version.id
    return view.as_view()(request,**args)
with override_settings(ALLOWED_HOSTS=['testserver']), transaction.atomic(), tempfile.TemporaryDirectory() as folder:
    storage=FileSystemStorage(location=folder)
    owner=users[0]
    docs=[]
    versions=[]
    content=b'Archivo autorizado requisito 25\n'
    permission=PermisoDocumental.objects.get(codigo='documentos.descargar',activo=True)
    for i in range(2):
        doc=Documento.objects.create(id=uuid4(),organizacion_id=owner.organizacion_id,area=AreaCatalogo.objects.filter(organizacion_id=owner.organizacion_id,activa=True).first(),tipo_documento=TipoDocumentoCatalogo.objects.filter(activo=True).first(),codigo='REQ25-'+uuid4().hex[:12].upper(),nombre='Ensayo descarga '+str(i),creado_por=owner,creado_en=timezone.now(),actualizado_en=timezone.now())
        key=uuid4().hex+'.txt'
        (Path(folder)/key).write_bytes(content)
        version=ArchivoDocumento.objects.create(id=uuid4(),documento=doc,estado_version=EstadoVersionCatalogo.objects.get(codigo='PUBLICADO'),proveedor_almacenamiento=ProveedorAlmacenamiento.objects.first(),numero_mayor=1,numero_menor=0,orden_version=1,es_vigente=True,nombre_archivo_original='prueba.txt',clave_almacenamiento=key,tipo_mime='text/plain',tamano_bytes=len(content),sha256=hashlib.sha256(content).hexdigest(),comentario_cambio='Fixture de autorización',creada_por=owner,creada_en=timezone.now())
        docs.append(doc);versions.append(version)
    routes=[general.DocumentFileDownloadView,general.DocumentVersionDownloadView,reader.ReaderVersionDownloadView]
    with patch.object(general,'default_storage',storage),patch.object(reader,'default_storage',storage),patch.object(storage,'open',wraps=storage.open) as opened:
        for enabled in (False,True):
            # El cambio solo existe dentro de esta transacción; otros clientes no lo ven.
            PermisoDocumental.objects.filter(pk=permission.pk).update(activo=enabled)
            for user in users:
                assert user_has_permission(user,'documentos.consultar')
                assert user_has_permission(user,'documentos.descargar')==enabled
                assert call(general.DocumentDetailView,user,docs[0]).status_code==200
                assert call(reader.ReaderDocumentDetailView,user,docs[0]).status_code==200
                for route in routes:
                    opened.reset_mock()
                    response=call(route,user,docs[0],versions[0])
                    assert response.status_code==(200 if enabled else 403),(route.__name__,response.status_code)
                    if enabled:
                        assert b''.join(response.streaming_content)==content
                        assert response['Content-Disposition'].startswith('attachment;')
                        # APIRequestFactory comparte la transacción: cerrar solo el archivo,
                        # sin emitir request_finished y cerrar la conexión bajo prueba.
                        response.file_to_stream.close()
                        assert opened.call_count==1
                    else:
                        opened.assert_not_called()
                    checks.append({'user':user.correo,'route':route.__name__,'download_permission':enabled,'consult':200,'download':response.status_code,'result':'PASS'})
        for user in users:
            for route in routes:
                opened.reset_mock()
                assert call(route,user,docs[0],versions[1]).status_code==404
                opened.assert_not_called()
                checks.append({'user':user.correo,'route':route.__name__,'test':'Versión de otro documento: 404 sin abrir almacenamiento','result':'PASS'})
        with connection.cursor() as cursor:
            cursor.execute("INSERT INTO gestion_documental.documentos_politicas_acl(documento_id,permiso_id,modo) VALUES (%s,%s,'DENEGAR')",[docs[0].id,permission.id])
        for user in users:
            assert call(general.DocumentDetailView,user,docs[0]).status_code==200
            for route in routes:
                opened.reset_mock()
                assert call(route,user,docs[0],versions[0]).status_code==403
                opened.assert_not_called()
                checks.append({'user':user.correo,'route':route.__name__,'test':'ACL deniega descarga, mantiene consulta: 403 sin abrir almacenamiento','result':'PASS'})
        ArchivoDocumento.objects.filter(pk=versions[1].id).update(estado_version=EstadoVersionCatalogo.objects.get(codigo='BORRADOR'))
        for route in routes:
            opened.reset_mock()
            assert call(route,users[1],docs[1],versions[1]).status_code==404
            opened.assert_not_called()
        checks.append({'test':'Lector no descarga versiones no publicadas por ninguna ruta','result':'PASS'})
    transaction.set_rollback(True)
result={'result':'PASS','checks':checks,'rolled_back':True,'storage':'FileSystemStorage temporal real; bytes verificados. No acredita conectividad S3.'}
(ROOT/'docs/resultado_autorizacion_descarga.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'result':'PASS','checks':len(checks),'rolled_back':True}))
