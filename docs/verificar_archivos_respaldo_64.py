"""Read only B2/Neon; add document objects to a derivative of the NEW #63 snapshot.

Never restores, modifies the original copy or creates/changes business records.
"""
import hashlib
import json
import os
import sys
from contextlib import nullcontext
from io import BytesIO
from pathlib import Path
from unittest.mock import patch
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from django.test import override_settings
from documentos import backup_service as service

source_evidence = json.loads((ROOT / 'docs/resultado_respaldo_nuevo_63.json').read_text(encoding='utf-8'))
source_path = Path(source_evidence['physical_path'])
source_payload = source_path.read_bytes()
assert hashlib.sha256(source_payload).hexdigest() == source_evidence['sha256']
key = (ROOT / 'media/req63-controlado/.encryption-key').read_text(encoding='ascii').strip()
checks = []
def check(name, condition):
    assert condition, name
    checks.append(name)

endpoint = os.environ['BACKBLAZE_ENDPOINT_URL'].rstrip('/')
client = boto3.client('s3', endpoint_url=endpoint,
    aws_access_key_id=os.environ['BACKBLAZE_APPLICATION_KEY_ID'],
    aws_secret_access_key=os.environ['BACKBLAZE_APPLICATION_KEY'],
    config=Config(signature_version='s3v4', retries={'max_attempts': 2}, connect_timeout=15, read_timeout=30))
bucket = os.environ['BACKBLAZE_BUCKET_NAME']

class ReadOnlyObjectStorage:
    def __init__(self):
        self.cache = {}
        self.locations = {}
    def exists(self, storage_key):
        # Current application defaults to documentos/; older stored keys may
        # already be relative to the bucket root. Only these exact keys are read.
        for object_key in dict.fromkeys(['documentos/' + storage_key, storage_key]):
            try:
                response = client.get_object(Bucket=bucket, Key=object_key)
                try:
                    self.cache[storage_key] = response['Body'].read()
                finally:
                    response['Body'].close()
                self.locations[storage_key] = object_key
                return True
            except ClientError as error:
                code = str(error.response['Error']['Code'])
                if code not in ('404', 'NoSuchKey', 'NotFound'):
                    raise RuntimeError('No se pudo leer storage; código ' + code) from None
        return False
    def open(self, storage_key, mode='rb'):
        assert mode == 'rb'
        return BytesIO(self.cache[storage_key])

with override_settings(BACKUP_ENCRYPTION_KEY=key), \
    patch.object(service, 'restore_backup', side_effect=AssertionError('Restauración prohibida')), \
    patch.object(service, 'restore_database_snapshot', side_effect=AssertionError('Restauración prohibida')):
    with ZipFile(BytesIO(service.decrypt_archive(source_payload))) as source:
        original_manifest = json.loads(source.read('manifest.json'))
        database_bytes = source.read('database.json')
        database = json.loads(database_bytes)
        schema = json.loads(source.read('schema.json'))
        sequences = json.loads(source.read('sequences.json'))
        organization = original_manifest['organization_id']
        expected = service.backup_file_inventory(organization, database)
        original_names = set(source.namelist())
        omitted = [item for item in expected if item['archive_path'] not in original_names]
        check('Snapshot anterior contiene las tres versiones esperadas', len(expected) == 3)
        check('Se detectan los tres binarios excluidos en la copia BD anterior', len(omitted) == 3 and not original_manifest['files'])
        check('Incluye inventario de versión anterior no vigente', any(item['is_current'] is False for item in expected))
    storage = ReadOnlyObjectStorage()
    # Keep the EXACT database/schema/sequences of #63, without querying a new snapshot.
    with patch.object(service, 'default_storage', storage), \
        patch.object(service, 'database_snapshot_transaction', return_value=nullcontext(original_manifest['database']['snapshot'])), \
        patch.object(service, '_build_database_snapshot', return_value=(database, original_manifest['database_records'], schema, sequences)):
        payload, stats = service.build_backup_archive(organization, include_files=True)
        # Simulate one absent required object in the read adapter only. No
        # source object is deleted or modified, and the DB remains untouched.
        absent_key = expected[0]['storage_key']
        with patch.object(storage, 'exists', side_effect=lambda name: name in storage.cache and name != absent_key):
            partial_payload, partial_stats = service.build_backup_archive(organization, include_files=True)
    target_dir = ROOT / 'media/req64-controlado'
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / (source_evidence['backup_id'] + '-archivos.sdbk')
    target_path.write_bytes(payload)
    partial_path = target_dir / (source_evidence['backup_id'] + '-faltante-simulado.sdbk')
    partial_path.write_bytes(partial_payload)
    with ZipFile(BytesIO(service.decrypt_archive(partial_payload))) as partial_archive:
        partial_manifest = json.loads(partial_archive.read('manifest.json'))
        check('Faltante simulado detectado sin borrar el objeto real',
              len(partial_manifest['missing_files']) == 1 and partial_manifest['missing_files'][0]['storage_key'] == absent_key)
        check('Manifiesto parcial no se marca completo', not partial_manifest['complete'] and not partial_manifest['document_files_complete'] and not partial_stats['complete'])
    with ZipFile(BytesIO(service.decrypt_archive(target_path.read_bytes()))) as archive:
        manifest = json.loads(archive.read('manifest.json'))
        check('ZIP derivado íntegro', archive.testzip() is None)
        check('Mismo contenido exacto de database.json del paso 63', archive.read('database.json') == database_bytes)
        expected_ids = {item['id'] for item in expected}
        included_ids = {item['id'] for item in manifest['files']}
        missing_ids = {item['id'] for item in manifest['missing_files']}
        check('Inventario cubre todas las versiones sin omisiones', included_ids | missing_ids == expected_ids and not included_ids & missing_ids)
        check('Completitud refleja faltantes reales', manifest['complete'] == (not missing_ids) == stats['complete'])
        check('Alcance documental explícito', manifest['scope'] == 'database_and_document_files' and manifest['document_files_requested'])
        for item in manifest['files']:
            content = archive.read(item['archive_path'])
            check('Tamaño ' + item['id'], len(content) == item['size'])
            check('SHA256 ' + item['id'], hashlib.sha256(content).hexdigest() == item['sha256'])
            check('Bytes de storage iguales a copia ' + item['id'], content == storage.cache[item['storage_key']])
        check('No hay binarios fuera del inventario', {n for n in archive.namelist() if n.startswith('files/')} == {i['archive_path'] for i in manifest['files']})
    check('Copia fuente sin alteración', hashlib.sha256(source_path.read_bytes()).hexdigest() == source_evidence['sha256'])

evidence = {
    'source_backup_id': source_evidence['backup_id'], 'source_sha256': source_evidence['sha256'],
    'original_document_files_complete': False, 'original_missing_document_objects': omitted,
    'source_original_manifest_complete_was_database_only': original_manifest['complete'],
    'derivative_path': str(target_path), 'size_bytes': len(payload),
    'sha256': hashlib.sha256(payload).hexdigest(), 'manifest': manifest,
    'storage_object_locations': storage.locations, 'expected_files': len(expected),
    'included_files': len(manifest['files']), 'missing_files': len(manifest['missing_files']),
    'complete': manifest['complete'], 'checks': checks, 'passed': len(checks),
    'simulated_missing': {'path': str(partial_path), 'sha256': hashlib.sha256(partial_payload).hexdigest(),
                          'complete': partial_manifest['complete'], 'missing_files': partial_manifest['missing_files']},
    'restore_executed': False, 'database_writes': False,
    'scope': 'Copia derivada local del snapshot #63, lecturas exactas de B2; excluye binarios de reportes generados.'
}
(ROOT / 'docs/resultado_archivos_respaldo_64.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({name: evidence[name] for name in ('source_backup_id', 'expected_files', 'included_files', 'missing_files', 'complete', 'size_bytes', 'sha256', 'passed', 'restore_executed')}, ensure_ascii=False))
