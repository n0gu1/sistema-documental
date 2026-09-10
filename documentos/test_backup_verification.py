import copy
import hashlib
import json
from contextlib import ExitStack
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from zipfile import ZipFile

from django.test import SimpleTestCase, override_settings

from . import backup_service as service


@override_settings(BACKUP_ENCRYPTION_KEY='', SECRET_KEY='verify-only-test')
class BackupVerificationTests(SimpleTestCase):
    def setUp(self):
        self.org = 'organization-1'
        self.content = b'original version content'
        self.rows = {
            'organizaciones': [{'id': self.org}],
            'areas': [{'id': 'area-1', 'organizacion_id': self.org}],
            'usuarios': [{'id': 'user-1', 'organizacion_id': self.org, 'area_id': None}],
            'documentos': [{'id': 'doc-1', 'organizacion_id': self.org}],
            'versiones_documento': [{
                'id': 'version-1', 'documento_id': 'doc-1', 'numero_mayor': 1, 'numero_menor': 0,
                'es_vigente': True, 'clave_almacenamiento': 'document/file.txt',
                'nombre_archivo_original': 'file.txt', 'tamano_bytes': len(self.content),
                'sha256': hashlib.sha256(self.content).hexdigest(), 'tipo_mime': 'text/plain',
            }],
        }
        self.database = {'schema': service.BACKUP_SCHEMA, 'organization_id': self.org, 'sequences': [],
            'tables': [{'name': name, 'columns': list(rows[0]), 'rows': rows} for name, rows in self.rows.items()]}
        constraints = [{'table_name': name, 'constraint_type': 'PRIMARY KEY', 'constraint_columns': ['id']} for name in self.rows]
        self.composite_fk = {'table_name': 'usuarios', 'constraint_type': 'FOREIGN KEY',
            'constraint_columns': ['area_id', 'organizacion_id'], 'foreign_table_name': 'areas',
            'foreign_columns': ['id', 'organizacion_id'], 'definition': 'FOREIGN KEY (area_id, organizacion_id) REFERENCES areas(id, organizacion_id)'}
        constraints += [self.composite_fk, {'table_name': 'versiones_documento', 'constraint_type': 'FOREIGN KEY',
            'constraint_columns': ['documento_id'], 'foreign_table_name': 'documentos', 'foreign_columns': ['id']}]
        self.schema = {'name': service.BACKUP_SCHEMA, 'constraints': constraints,
            'tables': [{'name': name, 'columns': [{'column_name': col, 'is_nullable': 'YES' if col == 'area_id' else 'NO'} for col in rows[0]]} for name, rows in self.rows.items()]}
        self.inventory = service.backup_file_inventory(self.org, self.database)
        self.manifest = {'format': service.BACKUP_FORMAT, 'organization_id': self.org,
            'database_records': 5, 'database': {'schema': service.BACKUP_SCHEMA, 'tables': 5, 'sequences': 0},
            'complete': True, 'scope': 'database_and_document_files', 'document_files_requested': True,
            'document_files_complete': True, 'files': self.inventory, 'missing_files': []}

    def payload(self, modify=None):
        entries = {
            'manifest.json': json.dumps(self.manifest), 'database.json': json.dumps(self.database),
            'schema.json': json.dumps(self.schema), 'sequences.json': '[]',
            'reconstruction.json': json.dumps({'organization_id': self.org}), 'RECONSTRUCCION.md': 'Not executed',
            self.inventory[0]['archive_path']: self.content,
        }
        if modify:
            modify(entries)
        buffer = BytesIO()
        with ZipFile(buffer, 'w') as archive:
            for name, value in entries.items():
                archive.writestr(name, value)
        return service.encrypt_archive(buffer.getvalue())

    def verify(self, payload=None, expected_hash=None):
        payload = payload if payload is not None else self.payload()
        backup = SimpleNamespace(sha256=expected_hash or hashlib.sha256(payload).hexdigest(),
            organizacion_id=self.org, clave_almacenamiento='new.sdbk', restaurado_en=None,
            save=MagicMock(side_effect=AssertionError('No backup writes')))
        with ExitStack() as stack:
            storage = stack.enter_context(patch.object(service, 'default_storage'))
            storage.open.return_value = BytesIO(payload)
            storage.save.side_effect = AssertionError('No storage writes')
            storage.delete.side_effect = AssertionError('No deletes')
            for name in ('restore_storage_snapshot', 'restore_database_snapshot', '_restore_database_snapshot_in_transaction', 'database_restore_transaction'):
                stack.enter_context(patch.object(service, name, side_effect=AssertionError('No restore')))
            result = service.verify_backup(backup)
        backup.save.assert_not_called()
        self.assertIsNone(backup.restaurado_en)
        return result

    def test_valid_backup_and_match_simple_nullable_fk_verify_without_writes(self):
        result = self.verify()
        self.assertTrue(result['valid'] and result['complete'] and result['document_files_complete'])
        self.assertEqual(result['files_verified'], 1)
        self.assertEqual(result['database_records'], 5)
        self.assertEqual(result['mode'], 'verify')
        self.assertEqual(result['files_restored'], 0)

    def test_match_full_rejects_partially_null_fk(self):
        self.composite_fk['definition'] += ' MATCH FULL'
        with self.assertRaisesMessage(service.BackupExecutionError, 'clave foranea incompleta'):
            self.verify()

    def test_match_simple_checks_non_null_fk(self):
        self.rows['usuarios'][0]['area_id'] = 'absent-area'
        with self.assertRaisesMessage(service.BackupExecutionError, 'fila ausente'):
            self.verify()

    def test_physical_hash_format_zip_and_json_errors_are_validation_errors(self):
        payloads = [b'bad header', service.encrypt_archive(b'bad zip'),
                    self.payload(lambda e: e.update({'manifest.json': '{'})),
                    self.payload(lambda e: e.update({'database.json': '[]'}))]
        for payload in payloads:
            with self.subTest(payload_size=len(payload)), self.assertRaises(service.BackupExecutionError):
                self.verify(payload)
        with self.assertRaises(service.BackupExecutionError):
            self.verify(expected_hash='0' * 64)

    def test_unknown_format_does_not_bypass_database_validation(self):
        self.manifest['format'] = 'unknown'
        with self.assertRaisesMessage(service.BackupExecutionError, 'formato'):
            self.verify()

    def test_missing_archive_is_validation_error(self):
        backup = SimpleNamespace(sha256='a' * 64, clave_almacenamiento='missing')
        with patch.object(service, 'default_storage') as storage:
            storage.open.side_effect = FileNotFoundError
            with self.assertRaises(service.BackupExecutionError):
                service.verify_backup(backup)

    def test_missing_inventory_cannot_claim_complete(self):
        self.manifest['files'] = []
        payload = self.payload(lambda e: e.pop(self.inventory[0]['archive_path']))
        with self.assertRaisesMessage(service.BackupExecutionError, 'Faltan versiones'):
            self.verify(payload)

    def test_partial_backup_is_not_valid_success(self):
        self.manifest.update(files=[], missing_files=self.inventory, complete=False, document_files_complete=False)
        payload = self.payload(lambda e: e.pop(self.inventory[0]['archive_path']))
        with self.assertRaisesMessage(service.BackupExecutionError, 'incompleto'):
            self.verify(payload)

    def test_file_hash_size_and_version_metadata_are_checked(self):
        for content in (b'x', b'x' * len(self.content)):
            with self.subTest(size=len(content)), self.assertRaises(service.BackupExecutionError):
                self.verify(self.payload(lambda e: e.update({self.inventory[0]['archive_path']: content})))
        self.inventory[0]['version'] = '99.0'
        with self.assertRaisesMessage(service.BackupExecutionError, 'numero de version'):
            self.verify()

    def test_database_columns_tenant_pk_and_counts_are_checked(self):
        original = copy.deepcopy(self.database)
        changes = [lambda: self.database['tables'][2]['rows'][0].pop('area_id'),
                   lambda: self.database['tables'][2]['rows'][0].update(organizacion_id='another-org'),
                   lambda: self.database['tables'][2]['rows'][0].update(id=None),
                   lambda: self.manifest.update(database_records=999)]
        for index, change in enumerate(changes):
            self.database = copy.deepcopy(original)
            change()
            with self.subTest(case=index), self.assertRaises(service.BackupExecutionError):
                self.verify()

    def test_explicit_database_only_does_not_claim_document_coverage(self):
        self.manifest.update(scope='database_only', document_files_requested=False, document_files_complete=False, files=[])
        result = self.verify(self.payload(lambda e: e.pop(self.inventory[0]['archive_path'])))
        self.assertTrue(result['valid'])
        self.assertFalse(result['document_files_complete'])
        self.assertEqual(result['files_verified'], 0)
