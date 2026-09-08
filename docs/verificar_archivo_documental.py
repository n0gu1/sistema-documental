"""Baja lógica contra Neon; fixtures revertidos y archivo temporal real conservado."""
import os, sys, json, hashlib, tempfile
from pathlib import Path
from uuid import uuid4
from unittest.mock import patch
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()
from django.db import transaction, connection
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate
from documentos.models import UsuarioDocumental, Documento, AreaCatalogo, TipoDocumentoCatalogo, ArchivoDocumento, EstadoVersionCatalogo, ProveedorAlmacenamiento, HistorialEstadoVersion, MetadatoDocumento
from documentos.document_views import DocumentListCreateView, DocumentArchiveView, DocumentDetailView
factory = APIRequestFactory()
admin = UsuarioDocumental.objects.get(correo='prueba.admin@test.local')
def call(view, method, data, id=None, user=admin):
    request = getattr(factory, method)('/api/documents/', data, format='json')
    force_authenticate(request, user=user)
    return view.as_view()(request, **({'document_id': id} if id else {}))
checks = []
with transaction.atomic(), tempfile.TemporaryDirectory() as folder:
    created = call(DocumentListCreateView, 'post', {'code': 'REQ24-'+uuid4().hex[:12].upper(), 'title': 'Archivo con historia', 'area_id': str(AreaCatalogo.objects.filter(organizacion_id=admin.organizacion_id, activa=True).first().id), 'type_id': TipoDocumentoCatalogo.objects.filter(activo=True).first().id, 'metadata': {'observations': 'Conservar'}})
    assert created.status_code == 201, created.data
    id = created.data['document']['id']
    path = Path(folder) / 'historia.txt'
    path.write_bytes(b'Contenido historico requisito 24')
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    state = EstadoVersionCatalogo.objects.first()
    version = ArchivoDocumento.objects.create(id=uuid4(), documento_id=id, estado_version=state, proveedor_almacenamiento=ProveedorAlmacenamiento.objects.first(), numero_mayor=1, numero_menor=0, orden_version=1, es_vigente=True, nombre_archivo_original=path.name, clave_almacenamiento=str(path), tipo_mime='text/plain', tamano_bytes=path.stat().st_size, sha256=digest, comentario_cambio='Fixture de conservación, no carga S3', creada_por=admin, creada_en=timezone.now())
    HistorialEstadoVersion.objects.create(version_documento=version, estado_nuevo=state, cambiado_por=admin, comentario='Historia anterior', cambiado_en=timezone.now())
    before = list(ArchivoDocumento.objects.filter(documento_id=id).values())
    history = list(HistorialEstadoVersion.objects.filter(version_documento=version).values())
    metadata = list(MetadatoDocumento.objects.filter(documento_id=id).values())
    for role in ('lector','revisor'):
        denied = call(DocumentArchiveView, 'post', {'reason':'No permitido'}, id, UsuarioDocumental.objects.get(correo=f'prueba.{role}@test.local'))
        assert denied.status_code == 403, denied.data
    checks.append('Lector y Revisor sin documentos.eliminar: 403')
    assert call(DocumentArchiveView, 'post', {'reason': []}, id).status_code == 400
    assert Documento.objects.get(pk=id).eliminado_en is None
    with patch('documentos.document_views.record_document_event', side_effect=RuntimeError('fallo')):
        try: call(DocumentArchiveView, 'post', {'reason':'No persistir'}, id)
        except RuntimeError: pass
        else: raise AssertionError('Debió fallar')
    assert Documento.objects.get(pk=id).eliminado_en is None
    checks.append('Motivo inválido y fallo propagado no dejan baja parcial')
    response = call(DocumentArchiveView, 'post', {'reason':'Fin de vigencia de prueba'}, id)
    assert response.status_code == 200, response.data
    doc = Documento.objects.get(pk=id)
    assert doc.eliminado_en and doc.eliminado_por_id == admin.id and doc.motivo_eliminacion == 'Fin de vigencia de prueba'
    normal = call(DocumentListCreateView, 'get', {'search':doc.codigo})
    assert normal.status_code == 200 and normal.data['count'] == 0
    assert call(DocumentDetailView, 'get', {}, id).status_code == 404
    assert call(DocumentArchiveView, 'post', {'reason':'No sobrescribir'}, id).status_code == 404
    checks.append('Crear, archivar, ocultar del listado normal y conservar actor/fecha/motivo')
    assert before == list(ArchivoDocumento.objects.filter(documento_id=id).values())
    assert history == list(HistorialEstadoVersion.objects.filter(version_documento=version).values())
    assert metadata == list(MetadatoDocumento.objects.filter(documento_id=id).values())
    assert hashlib.sha256(path.read_bytes()).hexdigest() == digest
    checks.append('Fila documental, archivo, bytes, historial y metadatos conservados íntegros')
    with connection.cursor() as cursor:
        cursor.execute("SELECT b.detalles FROM gestion_documental.bitacora_auditoria b JOIN gestion_documental.acciones_auditoria a ON a.id=b.accion_id WHERE b.recurso_id=%s AND a.codigo='DOCUMENTO_ELIMINADO'", [id])
        rows = cursor.fetchall()
        assert len(rows) == 1 and 'Fin de vigencia de prueba' in str(rows[0])
    checks.append('Bitácora registra la baja lógica con el motivo guardado')
    transaction.set_rollback(True)
result = {'checks':checks,'result':'PASS','rolled_back':True,'storage':'Archivo temporal real; no se prueba S3'}
(ROOT/'docs/resultado_archivo_documental.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False))
