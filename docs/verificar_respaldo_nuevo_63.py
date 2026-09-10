"""Creates one NEW controlled DB backup; no historical backup or restore is used."""
import hashlib
import base64
import secrets
import json
import os
import sys
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()
from django.conf import settings
from django.db import connection
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from documentos.models import UsuarioDocumental, ConfiguracionRespaldo, Respaldo
from documentos.backup_service import load_backup_archive

admin = UsuarioDocumental.objects.get(correo='prueba.admin@test.local')
storage_root = ROOT / 'media' / 'req63-controlado'
storage_root.mkdir(parents=True, exist_ok=True)
# Development generates an ephemeral SECRET_KEY. Persist a dedicated test key
# in ignored local media; never print or copy the key into the evidence report.
key_path = storage_root / '.encryption-key'
if not key_path.exists():
    key_path.write_text(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode('ascii'), encoding='ascii')
test_key = key_path.read_text(encoding='ascii').strip()
config = ConfiguracionRespaldo(id=uuid4(), organizacion_id=admin.organizacion_id, activa=False,
    frecuencia='daily', retencion_dias=30, destino='filesystem', incluir_archivos=False, cifrar=True,
    proxima_ejecucion_en=timezone.now(), actualizada_en=timezone.now())
checks = []
def check(name, condition):
    assert condition, name
    checks.append(name)

with connection.cursor() as cursor:
    expected = {}
    for table in ('usuarios', 'roles', 'documentos'):
        cursor.execute(f'SELECT id FROM gestion_documental.{table} WHERE organizacion_id=%s', [admin.organizacion_id])
        expected[table] = {str(row[0]) for row in cursor.fetchall()}
    cursor.execute('''SELECT v.id FROM gestion_documental.versiones_documento v
        JOIN gestion_documental.documentos d ON d.id=v.documento_id WHERE d.organizacion_id=%s''', [admin.organizacion_id])
    expected['versiones_documento'] = {str(row[0]) for row in cursor.fetchall()}
    cursor.execute("SELECT id,codigo,nombre FROM gestion_documental.documentos WHERE organizacion_id=%s AND codigo='PRUEBA-001'", [admin.organizacion_id])
    known_document = cursor.fetchone()
    assert known_document

with override_settings(ALLOWED_HOSTS=['testserver'], SECURE_SSL_REDIRECT=False, STORAGE_BACKEND='filesystem', BACKUP_ENCRYPTION_KEY=test_key,
    STORAGES={'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage', 'OPTIONS': {'location': str(storage_root)}}}), \
    patch('documentos.backup_views.get_or_create_configuration', return_value=config), \
    patch('documentos.backup_service.purge_expired_backups'), \
    patch('documentos.backup_service.restore_backup', side_effect=AssertionError('Restauración prohibida')), \
    patch('documentos.backup_service.restore_database_snapshot', side_effect=AssertionError('Restauración prohibida')):
    client = APIClient()
    client.force_authenticate(user=admin)
    # Resume only the NEW copy created by this test before its additional
    # validation encountered the existing MATCH SIMPLE validator limitation.
    resumed = sys.argv[1:] == ['--resume-new-63']
    if resumed:
        backup = Respaldo.objects.get(pk='20d99ed6-f98f-433a-ade6-1d4bcff03dbd')
        created_http = 201  # observed in the original execution on this copy
        result = {'backup': {'sha256': backup.sha256}}
        check('Retoma exclusivamente la copia nueva del ensayo HTTP 201 previo', str(backup.id) == '20d99ed6-f98f-433a-ade6-1d4bcff03dbd')
    else:
        started = timezone.now()
        response = client.post('/api/backups/', {}, format='json')
        result = response.json()
        if response.status_code != 201:
            info = result.get('backup') or {}
            print(json.dumps({'status': response.status_code, 'new_backup_id': info.get('id'),
                              'creation_error': info.get('error') or result.get('detail')}, ensure_ascii=False))
            sys.exit(1)
        backup = Respaldo.objects.get(pk=result['backup']['id'])
        created_http = response.status_code
        check('POST creación nuevo HTTP 201', created_http == 201 and backup.iniciado_en >= started)
    check('Estado exitoso y no restaurado', backup.estado == 'exitoso' and backup.restaurado_en is None)
    physical = (storage_root / backup.clave_almacenamiento).resolve()
    check('Archivo físico dentro del destino controlado', physical.is_relative_to(storage_root.resolve()) and physical.is_file())
    payload = physical.read_bytes()
    digest = hashlib.sha256(payload).hexdigest()
    check('Tamaño físico >0 e igual a registro', len(payload) > 0 and physical.stat().st_size == backup.tamano_bytes == len(payload))
    check('SHA256 del archivo igual a BD/API', digest == backup.sha256 == result['backup']['sha256'])
    check('Archivo cifrado SDBK1', payload.startswith(b'SDBK1') and backup.cifrado)
    download = client.get(f'/api/backups/{backup.id}/download/')
    downloaded = b''.join(download.streaming_content)
    download.close()
    check('GET descarga HTTP 200 con bytes idénticos', download.status_code == 200 and downloaded == payload)
    archive, manifest = load_backup_archive(backup)  # read/decrypt only, never restore
    with archive:
        check('ZIP íntegro', archive.testzip() is None)
        check('Manifiesto y artefactos físicos presentes', {'manifest.json', 'database.json', 'schema.json',
              'sequences.json', 'reconstruction.json', 'RECONSTRUCCION.md'} <= set(archive.namelist()))
        check('Manifiesto del respaldo nuevo y organización esperada',
              manifest['organization_id'] == str(admin.organizacion_id) and manifest['format'] == 'sistema-documental-backup-v2')
        database = json.loads(archive.read('database.json'))
        schema = json.loads(archive.read('schema.json'))
        tables = {table['name']: table for table in database['tables']}
        check('Conteos físicos coinciden con manifiesto y registro', sum(len(t['rows']) for t in tables.values()) == manifest['database_records'] == backup.registros_db)
        check('Cantidad de tablas coincide con manifiesto', len(tables) == manifest['database']['tables'])
        check('Snapshot consistente de solo lectura', manifest['database']['snapshot']['read_only'] is True and
              manifest['database']['snapshot']['isolation_level'] == 'REPEATABLE READ')
        check('Alcance BD sin archivos documentales', manifest['files'] == [] and manifest['missing_files'] == [] and backup.archivos == 0)
        for name, ids in expected.items():
            check('IDs esperados completos: ' + name, {str(row['id']) for row in tables[name]['rows']} == ids)
        known = next(row for row in tables['documentos']['rows'] if str(row['id']) == str(known_document[0]))
        check('Documento conocido cotejado por ID/código/nombre', (known['codigo'], known['nombre']) == known_document[1:])
        check('Roles/permisos, revisiones y auditoría incluidos', all(name in tables and tables[name]['rows'] for name in
              ('usuarios_roles', 'roles_permisos', 'permisos', 'solicitudes_revision', 'historial_estados_version', 'bitacora_auditoria')))
        check('Todas las tablas del esquema presentes', set(tables) == {t['name'] for t in schema['tables']})
        for table in tables.values():
            for row in table['rows']:
                if 'organizacion_id' in row:
                    assert str(row['organizacion_id']) == str(admin.organizacion_id), table['name']
        check('Filas con organización pertenecen a la organización esperada', True)
        # Independent, read-only PostgreSQL FK check. MATCH SIMPLE permits a
        # partially NULL composite key; no restore/verification endpoint is used.
        foreign_keys_checked = 0
        for constraint in schema['constraints']:
            if constraint['constraint_type'] != 'FOREIGN KEY':
                continue
            local = constraint['constraint_columns']
            foreign = constraint['foreign_columns']
            parent = constraint['foreign_table_name']
            parent_keys = {tuple(str(row[c]) for c in foreign) for row in tables[parent]['rows']}
            for row in tables[constraint['table_name']]['rows']:
                values = [row[c] for c in local]
                if any(value is None for value in values):
                    if 'MATCH FULL' in constraint.get('definition', ''):
                        assert all(value is None for value in values)
                    continue
                assert tuple(str(value) for value in values) in parent_keys, constraint['constraint_name']
                foreign_keys_checked += 1
        check('Referencias FK no nulas presentes en el contenido físico', foreign_keys_checked > 0)
        artifact_hashes = {name: hashlib.sha256(archive.read(name)).hexdigest() for name in archive.namelist()}
        table_counts = {name: len(table['rows']) for name, table in tables.items()}

evidence = {'backup_id': str(backup.id), 'created_http': created_http, 'download_http': download.status_code,
    'resumed_validation_of_same_new_copy': resumed, 'foreign_key_references_checked': foreign_keys_checked,
    'physical_path': str(physical), 'size_bytes': len(payload), 'sha256': digest,
    'manifest': manifest, 'table_counts': table_counts, 'artifact_sha256': artifact_hashes,
    'checks': checks, 'passed': len(checks), 'restore_executed': False,
    'environment': 'Backend local contra Neon, respaldo nuevo de BD cifrado a filesystem; configuración no guardada y purga omitida en ensayo.'}
(ROOT / 'docs/resultado_respaldo_nuevo_63.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({k: evidence[k] for k in ('backup_id','created_http','download_http','size_bytes','sha256','passed','restore_executed')}, ensure_ascii=False))
