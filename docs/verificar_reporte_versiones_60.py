"""Reporte de versiones: datos existentes Neon, generación/descarga y rollback."""
import json
import os
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from io import BytesIO

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()
from django.db import transaction
from django.test import override_settings
from django.utils.dateparse import parse_datetime
from rest_framework.test import APIClient
from openpyxl import load_workbook
from documentos.models import UsuarioDocumental, ArchivoDocumento
from documentos.reports_views import cell_value

document_id = '7954d65d-2eb8-4dc7-aef6-74ea7c8726fe'
expected = list(ArchivoDocumento.objects.filter(documento_id=document_id).select_related(
    'documento', 'creada_por', 'estado_version').order_by('numero_mayor', 'numero_menor', 'id'))
assert len(expected) > 1
checks = []
def check(name, value):
    assert value, name
    checks.append(name)

with TemporaryDirectory(prefix='req60-') as storage, override_settings(
    ALLOWED_HOSTS=['testserver'], SECURE_SSL_REDIRECT=False,
    STORAGES={'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage', 'OPTIONS': {'location': storage}}},
), transaction.atomic():
    client = APIClient()
    client.force_authenticate(user=UsuarioDocumental.objects.get(correo='prueba.admin@test.local'))
    params = {'scope': 'versions', 'document_id': document_id}
    response = client.get('/api/reports/', params)
    check('GET versions HTTP 200', response.status_code == 200)
    data = response.json()
    rows = data['rows']
    check('Historial completo y orden numérico', [row['id'] for row in rows] == [str(v.id) for v in expected])
    check('Incluye versión no vigente', any(not row['is_current'] for row in rows))
    for row, version in zip(rows, expected):
        check('Campos cotejados con BD ' + row['version'],
              row['document_id'] == str(version.documento_id) and row['code'] == version.documento.codigo
              and row['title'] == version.documento.nombre
              and row['version'] == f'{version.numero_mayor}.{version.numero_menor}'
              and row['author_id'] == str(version.creada_por_id)
              and row['author'] == f'{version.creada_por.nombres} {version.creada_por.apellidos}'.strip()
              and parse_datetime(row['created_at']) == version.creada_en
              and row['status_code'] == version.estado_version.codigo
              and row['comment'] == (version.comentario_cambio or ''))
    check('Total cuenta versiones', data['summary']['total'] == len(expected))
    filtered = client.get('/api/reports/', {**params, 'status_code': expected[0].estado_version.codigo})
    check('Filtro por estado de cada versión', filtered.status_code == 200 and
          {r['id'] for r in filtered.json()['rows']} == {str(v.id) for v in expected if v.estado_version_id == expected[0].estado_version_id})
    filtered = client.get('/api/reports/', {**params, 'date_from': expected[1].creada_en.isoformat()})
    check('Filtro por fecha de creación de versión', filtered.status_code == 200 and
          [r['id'] for r in filtered.json()['rows']] == [str(v.id) for v in expected if v.creada_en >= expected[1].creada_en])
    check('UUID inválido HTTP 400', client.get('/api/reports/', {**params, 'document_id': 'invalid'}).status_code == 400)
    exports = []
    for fmt in ('XLSX', 'PDF'):
        generated = client.post('/api/reports/generate/', {'scope': 'versions', 'format': fmt,
                                'filters': {'document_id': document_id}}, format='json')
        check('Generación ' + fmt + ' HTTP 201', generated.status_code == 201)
        report = generated.json()['report']
        downloaded = client.get(report['download_url'])
        check('Descarga ' + fmt + ' HTTP 200', downloaded.status_code == 200)
        check('Instantánea ' + fmt + ' completa', report['rows'] == len(expected) and report['snapshot_size'] == len(downloaded.content))
        artifact = ROOT / 'docs' / ('reporte_versiones_60.' + fmt.lower())
        artifact.write_bytes(downloaded.content)
        exports.append({'format': fmt, 'generate_status': generated.status_code, 'download_status': downloaded.status_code})
        if fmt == 'XLSX':
            book = load_workbook(BytesIO(downloaded.content))
            values = list(book['Detalle'].values)
            check('XLSX columnas requeridas', values[0] == ('Código', 'Documento', 'Versión', 'Autor', 'Fecha de creación', 'Estado', 'Comentario / cambio'))
            for index, version in enumerate(expected, 1):
                check('XLSX fila ' + str(index), values[index] == (version.documento.codigo, version.documento.nombre,
                      f'{version.numero_mayor}.{version.numero_menor}', f'{version.creada_por.nombres} {version.creada_por.apellidos}'.strip(),
                      cell_value(version.creada_en), version.estado_version.nombre, version.comentario_cambio or None))
    client.force_authenticate(user=UsuarioDocumental.objects.get(correo='prueba.lector@test.local'))
    check('Lector sin permiso recibe 403', client.get('/api/reports/', params).status_code == 403)
    transaction.set_rollback(True)

result = {'environment': 'backend local contra Neon, sesiones forzadas; reportes y eventos revertidos',
          'document_id': document_id, 'document': expected[0].documento.codigo, 'rows': rows,
          'checks': checks, 'passed': len(checks), 'exports': exports}
(ROOT / 'docs/resultado_reporte_versiones_60.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'passed': len(checks), 'versions': [r['version'] for r in rows], 'exports': exports}))
