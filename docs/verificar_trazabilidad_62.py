"""Single known document on Neon; existing history plus rollback-only audit fixtures."""
import json
import os
import sys
from pathlib import Path
from io import BytesIO
from tempfile import TemporaryDirectory
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()
from django.db import connection, transaction
from django.test import override_settings
from rest_framework.test import APIClient
from openpyxl import load_workbook
from pypdf import PdfReader
from documentos.models import UsuarioDocumental, ArchivoDocumento, SolicitudRevision, HistorialEstadoVersion
from documentos.traceability_exports import event_values, HEADERS
from documentos.reports_views import build_report_data
from types import SimpleNamespace

document_id = '7954d65d-2eb8-4dc7-aef6-74ea7c8726fe'
marker = str(uuid4())
checks = []
def check(name, value):
    assert value, name
    checks.append(name)

admin = UsuarioDocumental.objects.get(correo='prueba.admin@test.local')
versions = list(ArchivoDocumento.objects.filter(documento_id=document_id).order_by('numero_mayor', 'numero_menor'))
reviews = list(SolicitudRevision.objects.filter(version_documento__documento_id=document_id).select_related('revisor', 'solicitada_por'))
changes = list(HistorialEstadoVersion.objects.filter(version_documento__documento_id=document_id))
params = {'scope': 'traceability', 'document_id': document_id}
fixture_ids = []
with TemporaryDirectory(prefix='req62-') as storage, override_settings(
    ALLOWED_HOSTS=['testserver'], SECURE_SSL_REDIRECT=False,
    STORAGES={'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage', 'OPTIONS': {'location': storage}}},
), transaction.atomic():
    client = APIClient()
    client.force_authenticate(user=admin)
    response = client.get('/api/reports/', params)
    check('GET historial existente HTTP 200', response.status_code == 200)
    baseline = response.json()
    check('Únicamente documento elegido', baseline['document']['id'] == document_id and
          {r['document_id'] for r in baseline['rows']} == {document_id})
    check('Dos versiones existentes, incluidas no vigentes', len(versions) == 2 and
          {v['id'] for v in baseline['versions']} == {str(v.id) for v in versions})
    check('Envíos y revisores conservados',
          {r['review_id'] for r in baseline['rows'] if r['source'] == 'review_sent'} == {str(r.id) for r in reviews}
          and all(r['reviewer'] for r in baseline['rows'] if r['source'] == 'review_sent'))
    check('Cambios históricos completos', len([r for r in baseline['rows'] if r['source'] == 'state']) == len(changes))
    check('Publicación existente relacionada', any(r['source'] == 'state' and r['state_to'] == 'PUBLICADO' for r in baseline['rows']))
    check('Resolución no inventa actor del cierre', all(r['actor'] is None for r in baseline['rows'] if r['source'] == 'review_resolution'))
    check('Creación no reutiliza estado actual como histórico', all(r['state_to'] is None for r in baseline['rows'] if r['source'] == 'version'))
    check('Sin restauraciones inferidas', not any(r['restored_from'] for r in baseline['rows']))
    check('Documento obligatorio HTTP 400', client.get('/api/reports/', {'scope': 'traceability'}).status_code == 400)
    check('Documento inexistente HTTP 404', client.get('/api/reports/', {**params, 'document_id': str(uuid4())}).status_code == 404)

    def audit(action, resource, resource_id, details, successful=True):
        with connection.cursor() as cursor:
            cursor.execute('''INSERT INTO gestion_documental.bitacora_auditoria
                (organizacion_id, usuario_id, accion_id, tipo_recurso_id, recurso_id, exitoso, detalles)
                SELECT %s,%s,a.id,tr.id,%s,%s,%s::jsonb
                FROM gestion_documental.acciones_auditoria a CROSS JOIN gestion_documental.tipos_recurso_auditoria tr
                WHERE a.codigo=%s AND tr.codigo=%s RETURNING id''',
                [admin.organizacion_id, admin.id, resource_id, successful,
                 json.dumps({'test_req62': marker, **details}), action, resource])
            row = cursor.fetchone()
            assert row, (action, resource)
            fixture_ids.append(row[0])
            return str(row[0])

    restored = audit('VERSION_RESTAURADA', 'VERSION', versions[1].id,
                     {'source_version_id': str(versions[0].id), 'comment': 'REQ62: evidencia controlada de restauración'})
    rejected = audit('DOCUMENTO_RECHAZADO', 'REVISION', reviews[0].id,
                     {'comment': 'REQ62: evidencia controlada de rechazo'})
    denied = audit('ACCESO_DENEGADO', 'DOCUMENTO', document_id,
                   {'reason': '=SUM(1,1)', 'path': '/api/documents/' + document_id + '/', 'method': 'GET'}, False)
    unrelated = audit('ACCESO_DENEGADO', 'DOCUMENTO', uuid4(), {'reason': 'AJENO'}, False)
    response = client.get('/api/reports/', params)
    data = response.json()
    rows = {r['source_id']: r for r in data['rows'] if r['source'] == 'audit'}
    check('Auditoría ajena excluida', unrelated not in rows)
    check('Restauración enlaza origen y destino', rows[restored]['version_id'] == str(versions[1].id)
          and rows[restored]['restored_from']['id'] == str(versions[0].id))
    check('Rechazo auditado enlaza solicitud/revisor/versión/actor', rows[rejected]['review_id'] == str(reviews[0].id)
          and rows[rejected]['reviewer']['id'] == str(reviews[0].revisor_id)
          and rows[rejected]['actor']['id'] == str(admin.id)
          and rows[rejected]['version_id'] == str(reviews[0].version_documento_id))
    check('Denegación relevante conserva successful false', rows[denied]['successful'] is False)
    check('Cronología ordenada y referencias únicas', [r['at'] for r in data['rows']] == sorted(r['at'] for r in data['rows'])
          and len({r['id'] for r in data['rows']}) == len(data['rows']))
    source_data = build_report_data(SimpleNamespace(user=admin), 'traceability', {'document_id': document_id})
    reports = []
    for fmt in ('XLSX', 'PDF'):
        generated = client.post('/api/reports/generate/', {'scope': 'traceability', 'format': fmt,
                                'filters': {'document_id': document_id}}, format='json')
        check('Generación ' + fmt + ' HTTP 201', generated.status_code == 201)
        report = generated.json()['report']
        reports.append(report)
        downloaded = client.get(report['download_url'])
        check('Descarga ' + fmt + ' HTTP 200', downloaded.status_code == 200)
        (ROOT / 'docs' / ('trazabilidad_62.' + fmt.lower())).write_bytes(downloaded.content)
        if fmt == 'XLSX':
            book = load_workbook(BytesIO(downloaded.content))
            actual = list(book['Cronología'].values)
            check('XLSX todas las filas y campos cotejados', actual[0] == tuple(HEADERS) and
                  [tuple('' if c is None else c for c in row) for row in actual[1:]] ==
                  [tuple(event_values(row)) for row in source_data['rows']])
            check('XLSX comentarios literales', all(c.data_type != 'f' for row in book['Cronología'] for c in row))
        else:
            pdf = PdfReader(BytesIO(downloaded.content))
            text = '\n'.join(page.extract_text() for page in pdf.pages)
            check('PDF contiene fuentes, revisión, publicación y restauración', all(value in text for value in
                  ['PRUEBA-001', '1.0', '2.0', 'Publicación', 'Restaurada desde: 1.0', str(reviews[0].id), 'Fallido', restored]))
            for row in source_data['rows']:
                check('PDF referencia ' + row['id'], row['source_id'] in text)
    client.force_authenticate(user=UsuarioDocumental.objects.get(correo='prueba.lector@test.local'))
    check('Lector consulta 403', client.get('/api/reports/', params).status_code == 403)
    check('Lector descarga 403', client.get(reports[0]['download_url']).status_code == 403)
    transaction.set_rollback(True)

result = {'document_id': document_id, 'baseline': baseline, 'data': data, 'fixture_marker': marker,
          'fixture_ids': fixture_ids, 'checks': checks, 'passed': len(checks),
          'environment': 'Backend local contra Neon. Documento existente; auditoría suplementaria controlada y reportes revertidos.'}
(ROOT / 'docs/resultado_trazabilidad_62.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'passed': len(checks), 'existing_records': len(baseline['rows']), 'exported_records': len(data['rows']),
                  'marker': marker, 'versions': [v['version'] for v in data['versions']]}))
