import hashlib
import json
from contextlib import nullcontext
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4
from zipfile import ZipFile

from django.test import SimpleTestCase, override_settings

from . import backup_service as service


@override_settings(SECRET_KEY='backup-files-test', BACKUP_ENCRYPTION_KEY='')
class BackupDocumentFilesTests(SimpleTestCase):
    def setUp(self):
        self.organization = str(uuid4())
        self.contents = {'old.pdf': b'previous version', 'current.pdf': b'current version'}
        self.rows = [{
            'id': str(uuid4()), 'documento_id': 'document-1',
            'numero_mayor': index + 1, 'numero_menor': 0, 'es_vigente': index == 1,
            'clave_almacenamiento': name, 'nombre_archivo_original': name,
            'tamano_bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest(),
            'tipo_mime': 'application/pdf',
        } for index, (name, content) in enumerate(self.contents.items())]
        self.database = {'organization_id': self.organization,
                         'tables': [{'name': 'versiones_documento', 'rows': self.rows}]}
        self.storage = MagicMock()
        self.storage.exists.side_effect = lambda name: name in self.contents
        self.storage.open.side_effect = lambda name, mode: BytesIO(self.contents[name])

    def snapshot(self):
        buffer = BytesIO()
        with patch.object(service, 'default_storage', self.storage), ZipFile(buffer, 'w') as archive:
            files, missing = service.build_storage_snapshot(self.organization, archive, self.database)
        return files, missing, buffer.getvalue()

    def test_snapshot_includes_previous_and_current_with_physical_hashes(self):
        files, missing, payload = self.snapshot()
        self.assertFalse(missing)
        self.assertEqual({f['version'] for f in files}, {'1.0', '2.0'})
        with ZipFile(BytesIO(payload)) as archive:
            for item in files:
                content = archive.read(item['archive_path'])
                self.assertEqual(content, self.contents[item['storage_key']])
                self.assertEqual(len(content), item['size'])
                self.assertEqual(hashlib.sha256(content).hexdigest(), item['sha256'])

    def test_missing_version_keeps_expected_inventory_and_reason(self):
        del self.contents['old.pdf']
        files, missing, _ = self.snapshot()
        self.assertEqual(len(files), 1)
        self.assertEqual(len(missing), 1)
        self.assertEqual(missing[0]['version'], '1.0')
        self.assertEqual(missing[0]['sha256'], self.rows[0]['sha256'])
        self.assertEqual(missing[0]['reason'], 'object_not_found')

    def test_object_disappearing_after_exists_is_missing(self):
        self.storage.open.side_effect = FileNotFoundError
        files, missing, _ = self.snapshot()
        self.assertFalse(files)
        self.assertEqual(len(missing), 2)

    def test_access_failure_is_not_mislabeled_as_absent(self):
        self.storage.exists.side_effect = PermissionError
        with self.assertRaises(PermissionError):
            self.snapshot()

    def test_wrong_hash_or_size_cancels_creation(self):
        for modified, message in ((b'x', 'tamano'), (b'x' * len(self.contents['old.pdf']), 'comprobacion')):
            with self.subTest(message=message):
                self.contents['old.pdf'] = modified
                with self.assertRaisesMessage(service.BackupExecutionError, message):
                    self.snapshot()

    def test_physical_hash_recorded_even_when_source_metadata_absent(self):
        self.rows[0]['sha256'] = ''
        self.rows[0]['tamano_bytes'] = None
        files, _, _ = self.snapshot()
        self.assertEqual(files[0]['sha256'], hashlib.sha256(self.contents['old.pdf']).hexdigest())
        self.assertEqual(files[0]['size'], len(self.contents['old.pdf']))

    def test_wrong_tenant_or_missing_inventory_fails_closed(self):
        with self.assertRaises(service.BackupExecutionError):
            service.backup_file_inventory(str(uuid4()), self.database)
        with self.assertRaises(service.BackupExecutionError):
            service.backup_file_inventory(self.organization, {'organization_id': self.organization, 'tables': []})

    def test_missing_object_manifest_and_backup_record_are_not_successful(self):
        del self.contents['old.pdf']
        metadata = {'read_only': True, 'isolation_level': 'REPEATABLE READ'}
        self.database['snapshot'] = metadata
        schema = {'tables': [], 'constraints': []}
        with patch.object(service, 'default_storage', self.storage), \
            patch.object(service, 'database_snapshot_transaction', return_value=nullcontext(metadata)), \
            patch.object(service, '_build_database_snapshot', return_value=(self.database, 2, schema, [])):
            payload, stats = service.build_backup_archive(self.organization, include_files=True)
        with ZipFile(BytesIO(service.decrypt_archive(payload))) as archive:
            manifest = json.loads(archive.read('manifest.json'))
        self.assertFalse(manifest['complete'])
        self.assertFalse(manifest['document_files_complete'])
        self.assertEqual(stats['missing_files'], 1)
        backup = SimpleNamespace(id=uuid4(), save=MagicMock())
        config = SimpleNamespace(destino='filesystem', retencion_dias=30, incluir_archivos=True)
        with patch.object(service.Respaldo.objects, 'create', return_value=backup), \
            patch.object(service, 'build_backup_archive', return_value=(payload, stats)), \
            patch.object(service, 'default_storage') as target, \
            patch.object(service, 'purge_expired_backups') as purge, \
            patch.object(service.logger, 'exception'):
            target.save.return_value = 'controlled/partial.sdbk'
            with self.assertRaises(service.BackupExecutionError) as caught:
                service.create_backup(self.organization, config=config)
        self.assertEqual(backup.estado, 'fallido')
        self.assertIn('faltan 1', backup.error)
        self.assertIs(caught.exception.backup, backup)
        self.assertEqual(backup.sha256, hashlib.sha256(payload).hexdigest())
        self.assertEqual(backup.archivos, 1)
        purge.assert_not_called()

    def test_database_only_does_not_claim_document_file_coverage(self):
        metadata = {'read_only': True, 'isolation_level': 'REPEATABLE READ'}
        with patch.object(service, 'database_snapshot_transaction', return_value=nullcontext(metadata)), \
            patch.object(service, '_build_database_snapshot', return_value=(self.database, 2, {'tables': []}, [])), \
            patch.object(service, 'build_storage_snapshot') as files:
            payload, _ = service.build_backup_archive(self.organization, include_files=False)
        with ZipFile(BytesIO(service.decrypt_archive(payload))) as archive:
            manifest = json.loads(archive.read('manifest.json'))
        self.assertEqual(manifest['scope'], 'database_only')
        self.assertFalse(manifest['document_files_complete'])
        self.assertFalse(manifest['document_files_requested'])
        files.assert_not_called()
