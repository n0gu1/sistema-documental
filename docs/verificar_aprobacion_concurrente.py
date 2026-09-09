"""#46: real commits and competing connections, ONLY on an isolated Neon branch.

Set REQ46_DATABASE_URL to the disposable branch connection string before running.
No production URL fallback. Files are temporary; notifications are suppressed.
"""
import os, sys, json, tempfile, threading, time, struct, zlib
from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack
from pathlib import Path
from uuid import uuid4
from unittest.mock import patch
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ['DATABASE_URL'] = os.environ['REQ46_DATABASE_URL']
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()
from django.db import connection, connections, transaction
from django.test import override_settings
from django.core.files.storage import FileSystemStorage
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIRequestFactory, force_authenticate
from documentos.models import (UsuarioDocumental, AreaCatalogo, TipoDocumentoCatalogo,
    ArchivoDocumento, SolicitudRevision, ElementoChecklistRevision, HistorialEstadoVersion)
from documentos import document_views as dv, workflow_views as w

editor = UsuarioDocumental.objects.get(correo='prueba.editor@test.local')
reviewer = UsuarioDocumental.objects.get(correo='prueba.revisor@test.local')
admin = UsuarioDocumental.objects.get(correo='prueba.admin@test.local')
checks, fixtures = [], []

def call(view, user=reviewer, method='post', data=None, **kwargs):
    request = getattr(APIRequestFactory(), method)('/api/', data or {}, format='multipart' if data and 'file' in data else 'json')
    force_authenticate(request, user=user)
    return view.as_view()(request, **kwargs)

def png():
    def chunk(kind, data):
        return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', 1, 1, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(b'\x00\xff\x00\x00')) + chunk(b'IEND', b'')

def fixture(count=2, checklist=None, submit=True):
    response = call(dv.DocumentListCreateView, editor, data={
        'code':'REQ46-' + uuid4().hex[:12].upper(), 'title':'Prueba aislada concurrencia',
        'area_id':str(AreaCatalogo.objects.filter(organizacion_id=editor.organizacion_id, activa=True).first().id),
        'type_id':TipoDocumentoCatalogo.objects.filter(activo=True).first().id,
        'file':SimpleUploadedFile('prueba.png', png(), content_type='image/png'),
    })
    assert response.status_code == 201, response.data
    doc = response.data['document']['id']
    version = ArchivoDocumento.objects.get(documento_id=doc)
    fixtures.append({'document_id':doc, 'version_id':str(version.id)})
    if not submit: return version, []
    response = call(w.ReviewSubmitView, editor, document_id=doc, version_id=version.id,
        data={'reviewer_ids':[str(u.id) for u in [reviewer, admin][:count]], 'checklist':checklist or []})
    assert response.status_code == 201, response.data
    ids = [r['id'] for r in response.data['reviews']]
    return version, ids

def states(version):
    version.refresh_from_db()
    return version.estado_version.codigo, dict(SolicitudRevision.objects.filter(version_documento=version).values_list('id','estado_revision__codigo'))

def race(first, second):
    """Hold the first real version lock until PostgreSQL proves the peer waits."""
    acquired, release = threading.Event(), threading.Event()
    start = threading.Barrier(2)
    mutex = threading.Lock()
    pids = []
    original = w.get_locked_review
    def locked(*args, **kwargs):
        result = original(*args, **kwargs)
        with mutex:
            holder = not acquired.is_set()
            if holder: acquired.set()
        if holder: assert release.wait(40), 'Timeout liberando bloqueo'
        return result
    def worker(fn):
        try:
            # Keep backend PID stable even through Neon's transaction pooler.
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute("SET LOCAL lock_timeout = '35s'")
                    cursor.execute('SELECT pg_backend_pid()')
                    with mutex: pids.append(cursor.fetchone()[0])
                start.wait(timeout=15)
                return fn()
        finally:
            connections.close_all()
    with patch.object(w, 'get_locked_review', locked), ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(worker, fn) for fn in [first, second]]
        try:
            assert acquired.wait(25), 'No se adquirió bloqueo'
            deadline = time.monotonic() + 20
            blocked = False
            while time.monotonic() < deadline:
                with connection.cursor() as cursor:
                    cursor.execute('SELECT pid, pg_blocking_pids(pid) FROM pg_stat_activity WHERE pid = ANY(%s)', [pids])
                    blocked = any(set(blockers) & set(pids) for _, blockers in cursor.fetchall())
                if blocked: break
                time.sleep(.1)
            assert blocked, 'PostgreSQL no confirmó contención real entre decisiones'
        finally:
            release.set()
        return [f.result(timeout=40) for f in futures]

with tempfile.TemporaryDirectory() as folder, ExitStack() as stack:
    stack.enter_context(override_settings(ALLOWED_HOSTS=['testserver']))
    stack.enter_context(patch.object(dv, 'default_storage', FileSystemStorage(location=folder)))
    for name in ['notify_review_assignment','notify_review_decision']:
        stack.enter_context(patch.object(w, name))

    version, ids = fixture()
    r = call(w.ReviewApproveView, review_id=ids[0])
    assert r.status_code == 200 and r.data['approval']['pending_count'] == 1 and not r.data['approval']['version_approved'], r.data
    code, rows = states(version)
    assert code == 'EN_REVISION' and sorted(rows.values()) == ['APROBADA','PENDIENTE']
    r = call(w.ReviewApproveView, admin, review_id=ids[1])
    assert r.status_code == 200 and r.data['approval']['version_approved'] and r.data['approval']['pending_count'] == 0
    assert states(version)[0] == 'APROBADO' and len(states(version)[1]) == 2
    checks.append('Aprobación individual conserva otra pendiente; última aprobación completa la versión')

    version, ids = fixture()
    results = race(lambda:call(w.ReviewApproveView, review_id=ids[0]), lambda:call(w.ReviewApproveView, admin, review_id=ids[1]))
    assert [r.status_code for r in results] == [200,200], [r.data for r in results]
    assert sorted(r.data['approval']['pending_count'] for r in results) == [0,1]
    assert states(version)[0] == 'APROBADO' and list(states(version)[1].values()) == ['APROBADA','APROBADA']
    assert HistorialEstadoVersion.objects.filter(version_documento=version, estado_nuevo__codigo='APROBADO').count() == 1
    checks.append('Dos aprobaciones concurrentes: espera PostgreSQL comprobada, consenso final y una transición')

    for competing in [w.ReviewApproveView, w.ReviewRejectView, w.ReviewReturnView]:
        version, ids = fixture(count=1)
        results = race(lambda:call(w.ReviewApproveView, review_id=ids[0]), lambda:call(competing, review_id=ids[0], data={'comment':'Decisión concurrente'}))
        assert sorted(r.status_code for r in results) == [200,409], [r.data for r in results]
        assert next(r for r in results if r.status_code == 409).data['code'] == 'REVIEW_NOT_PENDING'
        code, rows = states(version)
        assert len(rows) == 1 and code in ['APROBADO','RECHAZADO','BORRADOR']
        assert HistorialEstadoVersion.objects.filter(version_documento=version).count() == 3
        checks.append(f'Misma solicitud: approve frente a {competing.action}, solo una decisión y segunda 409; bloqueo real')

    version, ids = fixture()
    results = race(lambda:call(w.ReviewApproveView, review_id=ids[0]), lambda:call(w.ReviewRejectView, admin, review_id=ids[1], data={'comment':'Rechazo concurrente'}))
    assert all(r.status_code in [200,409] for r in results)
    code, rows = states(version)
    assert code == 'RECHAZADO' and len(rows) == 2 and 'PENDIENTE' not in rows.values()
    assert HistorialEstadoVersion.objects.filter(version_documento=version, estado_nuevo__codigo='APROBADO').count() == 0
    checks.append('Solicitudes distintas approve/reject: nunca aprobación total; filas conservadas con cierre explícito por rechazo')

    version, ids = fixture(count=1, checklist=['Requisito obligatorio'])
    before = list(SolicitudRevision.objects.filter(version_documento=version).values())
    r = call(w.ReviewApproveView, review_id=ids[0])
    assert r.status_code == 400 and r.data['code'] == 'CHECKLIST_INCOMPLETE'
    assert before == list(SolicitudRevision.objects.filter(version_documento=version).values())
    item = ElementoChecklistRevision.objects.get(solicitud_id=ids[0])
    r = call(w.ReviewChecklistUpdateView, method='patch', item_id=item.id, data={'completed':True})
    assert r.status_code == 200, r.data
    results = race(lambda:call(w.ReviewApproveView, review_id=ids[0]), lambda:call(w.ReviewChecklistUpdateView, method='patch', item_id=item.id, data={'completed':False}))
    item.refresh_from_db()
    code, rows = states(version)
    assert sorted(r.status_code for r in results) == [200,400], [r.data for r in results]
    assert (code == 'APROBADO' and item.completada) or (code == 'EN_REVISION' and not item.completada)
    checks.append('Checklist incompleto no escribe; edición concurrente no invalida una aprobación confirmada')

    version, ids = fixture(count=1)
    before = list(SolicitudRevision.objects.filter(version_documento=version).values())
    with patch.object(w, 'transition_version', side_effect=RuntimeError('Fallo controlado')):
        try: call(w.ReviewApproveView, review_id=ids[0])
        except RuntimeError: pass
        else: raise AssertionError('Se esperaba fallo')
    assert before == list(SolicitudRevision.objects.filter(version_documento=version).values())
    assert states(version)[0] == 'EN_REVISION'
    checks.append('Fallo durante transición revierte la decisión y conserva pendiente')

result = {'result':'PASS', 'environment':'Rama Neon aislada; conexiones reales y commits; sin correo ni S3', 'checks':checks, 'fixtures':fixtures}
(ROOT/'docs/resultado_aprobacion_concurrente.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2))
