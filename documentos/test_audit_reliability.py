from contextlib import nullcontext
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import patch
from uuid import uuid4

from .auth_utils import record_auth_event


class AuditReliabilityTests(TestCase):
    def setUp(self):
        self.connection_patch = patch('documentos.auth_utils.connection')
        self.connection = self.connection_patch.start()
        self.addCleanup(self.connection_patch.stop)
        self.connection.in_atomic_block = False
        self.cursor = self.connection.cursor.return_value.__enter__.return_value
        self.cursor.rowcount = 1
        self.cursor.fetchone.return_value = (42,)
        self.atomic_patch = patch('documentos.auth_utils.transaction.atomic', side_effect=lambda: nullcontext())
        self.atomic = self.atomic_patch.start()
        self.addCleanup(self.atomic_patch.stop)
        self.request = SimpleNamespace(META={})
        self.args = dict(action_code='DOCUMENTO_CREADO', resource_code='DOCUMENTO',
                         organization_id=uuid4(), request=self.request, successful=True)

    def test_success_returns_id_without_failure(self):
        result = record_auth_event(**self.args)
        self.assertTrue(result.inserted)
        self.assertEqual(result.event_id, 42)
        self.assertFalse(result.pending_commit)
        self.assertFalse(hasattr(self.request, '_audit_failures'))

    def test_outer_transaction_not_reported_as_committed(self):
        self.connection.in_atomic_block = True
        self.assertTrue(record_auth_event(**self.args).pending_commit)

    def test_invalid_row_counts_are_reported_as_failures(self):
        for count in (0, 2):
            with self.subTest(count=count), patch('documentos.auth_utils.logger.critical') as log:
                self.cursor.rowcount = count
                result = record_auth_event(**self.args)
                self.assertFalse(result.inserted)
                self.assertEqual(result.reason, 'catalog_not_found' if count == 0 else 'unexpected_row_count')
                log.assert_called_once()
                self.assertIn(result.failure_id, self.request._audit_failures)

    def test_commit_failure_is_not_returned_as_success(self):
        class FailedCommit:
            def __enter__(self):
                return self
            def __exit__(self, *args):
                raise RuntimeError('commit failed')
        self.atomic.side_effect = lambda: FailedCommit()
        with self.assertLogs('documentos.auth_utils', level='CRITICAL'):
            result = record_auth_event(**self.args)
        self.assertFalse(result.inserted)
        self.assertIsNone(result.event_id)

    def test_unavailable_database_without_request_is_observable(self):
        self.connection.cursor.side_effect = RuntimeError('connection failed')
        with self.assertLogs('documentos.auth_utils', level='CRITICAL'):
            result = record_auth_event(**{**self.args, 'request': None})
        self.assertFalse(result.inserted)
        self.assertIsNotNone(result.failure_id)

    def test_logs_do_not_expose_payload_or_sql_exception_message(self):
        self.cursor.execute.side_effect = RuntimeError('secret-token-in-query')
        with self.assertLogs('documentos.auth_utils', level='CRITICAL') as logs:
            result = record_auth_event(**self.args, details={'password': 'secret-password'})
        text = '\n'.join(logs.output)
        self.assertIn(result.failure_id, text)
        self.assertNotIn('secret-token', text)
        self.assertNotIn('secret-password', text)

    def test_serialization_failure_is_reported(self):
        circular = {}
        circular['cycle'] = circular
        with self.assertLogs('documentos.auth_utils', level='CRITICAL'):
            result = record_auth_event(**self.args, details=circular)
        self.assertFalse(result.inserted)
        self.cursor.execute.assert_not_called()
