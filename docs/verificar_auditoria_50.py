"""#50: SQL real, fallo inyectado de auditoría, transacciones y HTTP; rollback."""
import os, sys, json, logging
from pathlib import Path
from uuid import uuid4
from unittest.mock import patch
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE','backend.settings')
import django
django.setup()
from django.db import connection, transaction
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate
from documentos.auth_utils import record_auth_event
from documentos.middleware import AuditFailureMiddleware
from documentos.document_views import DocumentDetailView
from documentos.models import UsuarioDocumental, Documento, AreaCatalogo, TipoDocumentoCatalogo

checks=[]
records=[]
class Capture(logging.Handler):
    def emit(self, record):
        records.append(record)
handler=Capture()
logger=logging.getLogger('documentos.auth_utils')
logger.addHandler(handler)
owner=UsuarioDocumental.objects.get(correo='prueba.admin@test.local')
marker=uuid4()
request=APIRequestFactory().get('/api/')
args=dict(action_code='DOCUMENTO_CREADO',resource_code='DOCUMENTO',organization_id=owner.organizacion_id,user_id=owner.id,resource_id=marker,request=request,successful=True)
def check(name, value):
    assert value,name
    checks.append(name)
def count(event_id):
    with connection.cursor() as cursor:
        cursor.execute('SELECT count(*) FROM gestion_documental.bitacora_auditoria WHERE id=%s',[event_id])
        return cursor.fetchone()[0]
def fail_audit(execute, sql, params, many, context):
    if 'INSERT INTO gestion_documental.bitacora_auditoria' in sql:
        return execute('SELECT 1/0',None,many,context)
    return execute(sql,params,many,context)

try:
  with transaction.atomic():
    ok=record_auth_event(**args)
    check('Inserción real devuelve ID y pendiente de commit exterior',ok.inserted and ok.event_id and ok.pending_commit and count(ok.event_id)==1)
    missing=record_auth_event(**{**args,'action_code':'REQ50_NO_EXISTE'})
    check('Cero filas devuelve fallo explícito',not missing.inserted and missing.reason=='catalog_not_found' and missing.failure_id)
    check('Cero filas deja conexión utilizable',count(ok.event_id)==1)
    with connection.execute_wrapper(fail_audit):
        failed=record_auth_event(**args)
    check('Error SQL real devuelve fallo',not failed.inserted and failed.reason=='write_error')
    check('Savepoint recupera transacción tras error SQL',not connection.needs_rollback and count(ok.event_id)==1)
    with transaction.atomic():
        rolled=record_auth_event(**args)
        check('Inserción interior visible antes de rollback',count(rolled.event_id)==1)
        transaction.set_rollback(True)
    check('Evento se revierte junto a transacción del llamador',count(rolled.event_id)==0)
    # An actual critical endpoint must retain its business response and expose
    # the audit failure, even when the DRF request wraps the Django request.
    doc=Documento.objects.create(id=uuid4(),organizacion_id=owner.organizacion_id,area=AreaCatalogo.objects.filter(organizacion_id=owner.organizacion_id,activa=True).first(),tipo_documento=TipoDocumentoCatalogo.objects.filter(activo=True).first(),codigo='AUD50-'+uuid4().hex[:10],nombre='Ensayo auditoría 50',creado_por=owner,creado_en=timezone.now(),actualizado_en=timezone.now())
    req=APIRequestFactory().delete('/api/documents/'+str(doc.id)+'/',{},format='json')
    force_authenticate(req,user=owner)
    with connection.execute_wrapper(fail_audit):
        response=AuditFailureMiddleware(lambda raw: DocumentDetailView.as_view()(raw,document_id=doc.id))(req)
    doc.refresh_from_db()
    check('Archivado conserva resultado principal 204',response.status_code==204 and doc.eliminado_en is not None)
    check('HTTP comunica auditoría fallida',response['X-Audit-Status']=='failed' and response['X-Audit-Failure-Count']=='1')
    check('Referencia HTTP corresponde a evidencia técnica',any(r.audit_failure['failure_id']==response['X-Audit-Failure-Id'] for r in records))
    check('Log SQL tiene código 22012',any(r.audit_failure['sqlstate']=='22012' for r in records))
    clean=AuditFailureMiddleware(lambda req:HttpResponse(status=204))(APIRequestFactory().get('/'))
    check('Respuesta sana sin advertencia falsa','X-Audit-Status' not in clean)
    # Multiple failures on one request retain exact count with bounded headers.
    multiple=AuditFailureMiddleware(lambda raw:HttpResponse(status=403))(request)
    check('Conserva 403 y comunica ambos fallos',multiple.status_code==403 and multiple['X-Audit-Failure-Count']=='2')
    transaction.set_rollback(True)
  check('Rollback final elimina evento de ensayo',count(ok.event_id)==0)
  # Failure outside an enclosing transaction must be caught at our atomic exit.
  with connection.execute_wrapper(fail_audit):
    standalone=record_auth_event(**args)
  check('Error sin transacción exterior aislado',not standalone.inserted and not connection.in_atomic_block and not connection.needs_rollback)
  check('Evidencia técnica fuera de la BD sobrevive rollback',len(records)==4 and all(r.levelno==logging.CRITICAL for r in records))
finally:
  logger.removeHandler(handler)
result={'result':'PASS','environment':'Backend local / PostgreSQL Neon / rollback','policy':'best_effort_observable_savepoint','checks':checks,'resource_id':str(marker),'document_id':str(doc.id),'rolled_back_event_id':ok.event_id,'failures':[r.audit_failure for r in records]}
(ROOT/'docs/resultado_auditoria_50.json').write_text(json.dumps(result,default=str,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,default=str,ensure_ascii=True,indent=2))
