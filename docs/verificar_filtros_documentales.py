"""Filtros individuales sobre fixtures Neon, con rollback al finalizar."""
import os, sys, json
from pathlib import Path
from datetime import date, datetime
from uuid import uuid4
from unittest.mock import patch
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()
from django.db import transaction
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate
from documentos.models import UsuarioDocumental, Documento, AreaCatalogo, TipoDocumentoCatalogo, ArchivoDocumento, EstadoVersionCatalogo, ProveedorAlmacenamiento
from documentos import document_views as general, reader_views as reader
from documentos.reader_access import published_document_queryset
from documentos.auth_utils import user_has_permission

factory = APIRequestFactory()
admin = UsuarioDocumental.objects.get(correo='prueba.admin@test.local')
lector = UsuarioDocumental.objects.get(correo='prueba.lector@test.local')
checks = []
def call(view, user, params):
    request = factory.get('/api/documents/', params)
    force_authenticate(request, user=user)
    return view.as_view()(request)
def ids(response):
    assert response.status_code == 200, response.data
    return {item['id'] for item in response.data['results']}
with override_settings(ALLOWED_HOSTS=['testserver']), transaction.atomic():
    areas = list(AreaCatalogo.objects.filter(organizacion_id=admin.organizacion_id, activa=True)[:2])
    types = list(TipoDocumentoCatalogo.objects.filter(activo=True)[:2])
    states = {s.codigo:s for s in EstadoVersionCatalogo.objects.all()}
    provider = ProveedorAlmacenamiento.objects.first()
    docs = []
    for index, (name, area, kind, document_date, state) in enumerate([
        ('Alfa',areas[0],types[0],date(2024,1,10),'PUBLICADO'),
        ('Beta',areas[1],types[1],date(2024,2,20),'PUBLICADO'),
        ('Gamma',areas[0],types[0],None,'BORRADOR'),
        ('Delta',areas[0],types[0],date(2024,3,30),None),
        ('Epsilon',areas[0],types[0],date(2024,4,1),'BORRADOR'),
    ]):
        doc = Documento.objects.create(id=uuid4(),organizacion_id=admin.organizacion_id,area=area,tipo_documento=kind,codigo='RF-'+uuid4().hex[:12].upper(),nombre=name,descripcion='Fixture filtro',fecha_documento=document_date,creado_por=admin,creado_en=timezone.now(),actualizado_en=timezone.make_aware(datetime(2025,index+1,15,12)))
        docs.append(doc)
        for order, code in enumerate((['PUBLICADO',state] if name=='Epsilon' else [state] if state else []),1):
            ArchivoDocumento.objects.create(id=uuid4(),documento=doc,estado_version=states[code],proveedor_almacenamiento=provider,numero_mayor=order,numero_menor=0,orden_version=order,es_vigente=not(name=='Epsilon' and order==1),nombre_archivo_original='fixture.txt',clave_almacenamiento='fixture-filtros-no-objeto-'+uuid4().hex,tipo_mime='text/plain',tamano_bytes=1,sha256='0'*64,comentario_cambio='Fixture de filtrado',creada_por=admin,creada_en=timezone.now())
    fixture_ids = [d.id for d in docs]
    all_ids = {str(d.id) for d in docs}
    original_queryset = general.document_queryset
    # Limitar el universo a fixtures sin añadir otro parámetro de búsqueda a las peticiones.
    with patch.object(general,'document_queryset',side_effect=lambda org, **kw:original_queryset(org,**kw).filter(id__in=fixture_ids)), patch.object(reader,'published_document_queryset',side_effect=lambda org:published_document_queryset(org).filter(id__in=fixture_ids)):
        routes = [(general.DocumentListCreateView,admin,'general administrador'),(general.DocumentListCreateView,lector,'general lector'),(reader.ReaderDocumentListView,lector,'lector dedicado')]
        for view,user,label in routes:
            is_reader = user==lector
            visible = {str(docs[i].id) for i in ([0,1,4] if is_reader else range(5))}
            assert ids(call(view,user,{})) == visible
            cases = [
                ('nombre',{'search':'ALFA'},{str(docs[0].id)}),
                ('nombre vacío',{'search':'Inexistente'},set()),
                ('tipo',{'type_id':types[1].id},{str(docs[1].id)}),
                ('tipo inexistente',{'type_id':2147483647},set()),
                ('área',{'area_id':str(areas[1].id)},{str(docs[1].id)}),
                ('área inexistente',{'area_id':str(uuid4())},set()),
                ('estado publicado',{'status_code':'PUBLICADO'},{str(docs[i].id) for i in ([0,1,4] if is_reader else [0,1])}),
                ('estado borrador',{'status_code':'BORRADOR'},set() if is_reader else {str(docs[i].id) for i in [2,4]}),
                ('estado inexistente',{'status_code':'INEXISTENTE'},set()),
                ('fecha documental desde',{'date_from':'2024-02-20'},{str(docs[i].id) for i in ([1,4] if is_reader else [1,3,4])}),
                ('fecha documental hasta',{'date_to':'2024-01-10'},{str(docs[0].id)}),
                ('fecha vacía',{'date_from':'2099-01-01'},set()),
                ('actualización desde',{'updated_from':'2025-02-15'},{str(docs[i].id) for i in ([1,4] if is_reader else [1,2,3,4])}),
                ('actualización hasta',{'updated_to':'2025-01-15'},{str(docs[0].id)}),
            ]
            for name,params,expected in cases:
                assert len(params)==1
                actual=ids(call(view,user,params))
                assert actual==expected,(label,name,actual,expected)
                checks.append({'route':label,'filter':name,'result':'PASS'})
            for params in ({'type_id':'abc'},{'area_id':'mal'},{'date_from':'2024-02-30'},{'updated_to':'incorrecta'},{'date_from':'2024-03-01','date_to':'2024-01-01'},{'updated_from':'2025-02-01','updated_to':'2025-01-01'}):
                assert call(view,user,params).status_code==400,params
            checks.append({'route':label,'filter':'Identificadores, fechas e intervalos inválidos: 400','result':'PASS'})
            with patch('documentos.management_views.user_has_permission',side_effect=lambda u,p:p!='documentos.buscar' and user_has_permission(u,p)):
                assert call(view,user,{}).status_code==200
                for params in ({'search':'Alfa'},{'type_id':types[0].id},{'area_id':str(areas[0].id)},{'status_code':'PUBLICADO'},{'date_from':'2024-01-01'},{'updated_from':'2025-01-01'}):
                    assert call(view,user,params).status_code==403
            checks.append({'route':label,'filter':'documentos.buscar requerido para cada filtro; consulta básica permitida','result':'PASS'})
        lector.area_id=areas[0].id
        for view in (general.DocumentListCreateView,reader.ReaderDocumentListView):
            assert ids(call(view,lector,{'area_id':str(areas[1].id)}))==set()
            assert str(docs[0].id) in ids(call(view,lector,{'area_id':str(areas[0].id)}))
        checks.append({'filter':'Área ajena no amplía acceso del lector en ninguna ruta','result':'PASS'})
    transaction.set_rollback(True)
result={'result':'PASS','checks':checks,'rolled_back':True,'note':'Cada filtro se prueba individualmente; solo las validaciones de intervalos envían sus dos límites. Versiones son fixtures SQL sin objetos de almacenamiento.'}
(ROOT/'docs/resultado_filtros_documentales.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'result':'PASS','checks':len(checks),'rolled_back':True}))
