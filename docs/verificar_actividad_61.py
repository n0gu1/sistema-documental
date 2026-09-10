"""Datos controlados en Neon, aislados mediante rollback, sin alterar el workflow."""
import os
import sys
import json
from pathlib import Path
from datetime import datetime, timezone as tz
from uuid import uuid4
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()
from django.db import connection, transaction
from django.test import override_settings
from rest_framework.test import APIClient
from documentos.models import UsuarioDocumental, ArchivoDocumento, SolicitudRevision, EstadoRevisionCatalogo, EstadoVersionCatalogo
from documentos.reader_access import filter_accessible_documents
from documentos.reports_views import report_headers, report_row_values, build_report_data
from types import SimpleNamespace

checks = []
def check(name, value):
    assert value, name
    checks.append(name)

reviewer = UsuarioDocumental.objects.get(correo='prueba.revisor@test.local')
admin = UsuarioDocumental.objects.get(correo='prueba.admin@test.local')
versions = ArchivoDocumento.objects.filter(documento__organizacion_id=reviewer.organizacion_id).select_related('documento')
version = next(v for v in versions if filter_accessible_documents(reviewer, [v.documento], 'revisiones.consultar'))
marker = str(uuid4())
event_ids = []
with override_settings(ALLOWED_HOSTS=['testserver'], SECURE_SSL_REDIRECT=False), transaction.atomic():
    def event(action, day, *, actor=reviewer, successful=True, resource='VERSION'):
        with connection.cursor() as cursor:
            cursor.execute('''INSERT INTO gestion_documental.bitacora_auditoria
                (organizacion_id, usuario_id, accion_id, tipo_recurso_id, recurso_id, exitoso, detalles, ocurrido_en)
                SELECT %s,%s,a.id,tr.id,%s,%s,%s::jsonb,%s
                FROM gestion_documental.acciones_auditoria a CROSS JOIN gestion_documental.tipos_recurso_auditoria tr
                WHERE a.codigo=%s AND tr.codigo=%s RETURNING id''',
                [reviewer.organizacion_id, actor.id, version.id, successful, json.dumps({'test_req61': marker}),
                 datetime(2026, 9, day, 15, tzinfo=tz.utc), action, resource])
            row = cursor.fetchone()
            assert row, action
            event_ids.append(row[0])
            return str(row[0])

    expected = {event('DOCUMENTO_APROBADO', 3), event('DOCUMENTO_APROBADO', 8),
                event('DOCUMENTO_RECHAZADO', 8), event('REVISION_DEVUELTA', 9)}
    event('REVISION_SOLICITADA', 9)
    event('DOCUMENTO_APROBADO', 9, successful=False)
    event('DOCUMENTO_APROBADO', 9, actor=admin)
    event('DOCUMENTO_APROBADO', 9, resource='DOCUMENTO')
    event('DOCUMENTO_APROBADO', 2)
    client = APIClient()
    client.force_authenticate(user=reviewer)
    params = {'scope': 'reviewer', 'date_from': '2026-09-03', 'date_to': '2026-09-09'}
    response = client.get('/api/reports/', params)
    check('GET actividad HTTP 200', response.status_code == 200)
    data = response.json()
    check('Solo cuatro decisiones propias exitosas en rango', {r['id'] for r in data['rows']} == expected)
    summary = data['summary']
    check('Total 4 = 2 aprobaciones + 1 rechazo + 1 devolución',
          summary['total'] == summary['completed'] == 4 and summary['approved'] == 2 and summary['rejected'] == 1 and summary['returned'] == 1)
    check('No publica métricas ficticias de vencimiento o publicación', not {'overdue', 'published', 'in_review'} & summary.keys())
    check('Actor y fecha del evento en cada fila', all(r['actor_id'] == str(reviewer.id) and r['activity_at'] == r['created_at'] for r in data['rows']))
    daily = {}
    for row in data['rows']:
        daily[row['activity_date']] = daily.get(row['activity_date'], 0) + 1
    check('Fechas de actividad 03:1, 08:2, 09:1', daily == {'2026-09-03': 1, '2026-09-08': 2, '2026-09-09': 1})
    filtered = client.get('/api/reports/', {**params, 'status_code': 'RECHAZADA'}).json()
    check('Filtro de acción devuelve un rechazo', len(filtered['rows']) == 1 and filtered['summary']['rejected'] == 1)
    filtered = client.get('/api/reports/', {**params, 'date_from': '2026-09-08', 'date_to': '2026-09-08'}).json()
    check('Filtro de fecha usa el día de ejecución', len(filtered['rows']) == 2)

    # A received request and an automatic closure are not actions by its reviewer.
    review, _ = SolicitudRevision.objects.get_or_create(version_documento=version, revisor=reviewer,
        defaults={'id': uuid4(), 'solicitada_por': admin, 'estado_revision': EstadoRevisionCatalogo.objects.get(codigo='PENDIENTE'),
                  'solicitada_en': datetime(2026, 9, 9, 12, tzinfo=tz.utc)})
    SolicitudRevision.objects.filter(pk=review.pk).update(
        estado_revision=EstadoRevisionCatalogo.objects.get(codigo='RECHAZADA'),
        resuelta_en=datetime(2026, 9, 9, 15, tzinfo=tz.utc), comentario_resolucion='Cerrada por decision de la revision')
    after = client.get('/api/reports/', params).json()
    check('Solicitud recibida/cierre automático no incrementan actividad', after['rows'] == data['rows'])
    report = build_report_data(SimpleNamespace(user=reviewer), 'reviewer', params)
    check('Exportación describe acción, actor y fecha de actividad', report_headers('reviewer')[-3:] == ['Acción', 'Revisor que actuó', 'Fecha de actividad']
          and report_row_values(report['rows'][0], 'reviewer')[-2] == report['rows'][0]['actor'])
    # Also prove that a real successful decision produces the event consumed by
    # this report; suppress notifications, not permissions or persistence.
    before = {r['id'] for r in client.get('/api/reports/', {'scope': 'reviewer'}).json()['rows']}
    SolicitudRevision.objects.filter(pk=review.pk).update(
        estado_revision=EstadoRevisionCatalogo.objects.get(codigo='PENDIENTE'), resuelta_en=None)
    ArchivoDocumento.objects.filter(pk=version.pk).update(estado_version=EstadoVersionCatalogo.objects.get(codigo='EN_REVISION'))
    with patch('documentos.workflow_views.notify_review_decision'):
        decision = client.post(f'/api/reviews/{review.pk}/approve/', {}, format='json')
    check('Aprobación real HTTP 200', decision.status_code == 200)
    after = client.get('/api/reports/', {'scope': 'reviewer'}).json()['rows']
    new = [r for r in after if r['id'] not in before]
    check('Aprobación real produce una acción atribuida y fechada', len(new) == 1 and
          new[0]['action_code'] == 'DOCUMENTO_APROBADO' and new[0]['actor_id'] == str(reviewer.id) and bool(new[0]['activity_at']))
    duplicate = client.post(f'/api/reviews/{review.pk}/approve/', {}, format='json')
    check('Repetir decisión HTTP 409 sin nueva actividad', duplicate.status_code == 409 and
          client.get('/api/reports/', {'scope': 'reviewer'}).json()['rows'] == after)
    transaction.set_rollback(True)

result = {'definition': 'Eventos exitosos propios: DOCUMENTO_APROBADO, DOCUMENTO_RECHAZADO, REVISION_DEVUELTA',
          'fixture_marker': marker, 'fixture_event_ids': event_ids, 'data': data, 'checks': checks,
          'passed': len(checks), 'environment': 'Backend local contra Neon; datos controlados, todos revertidos'}
(ROOT / 'docs/resultado_actividad_61.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'passed': len(checks), 'summary': summary, 'daily': daily, 'marker': marker}))
