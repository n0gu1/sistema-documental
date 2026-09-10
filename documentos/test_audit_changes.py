from datetime import date
from unittest import TestCase
from uuid import uuid4
from .audit_changes import modification_changes, settings_snapshot


class AuditChangesTests(TestCase):
    def test_only_changed_field(self):
        self.assertEqual(modification_changes({'title':'A','code':'X'}, {'title':'B','code':'X'}),
                         [{'field':'title','before':'A','after':'B'}])

    def test_normalizes_persisted_types(self):
        pk=uuid4()
        self.assertEqual(modification_changes({'id':pk,'date':date(2026,9,9)},
                                             {'id':str(pk),'date':'2026-09-09'}), [])

    def test_null_and_false_are_not_lost(self):
        self.assertEqual(modification_changes({'active':True},{'active':False}),
                         [{'field':'active','before':True,'after':False}])
        self.assertEqual(modification_changes({'description':'A'},{}),
                         [{'field':'description','before':'A','after':None}])

    def test_sensitive_fields_never_emit_values(self):
        fields=['password','hash_contrasena','contraseña','smtp.password_token','accessToken',
                'client_secret','credentials','credenciales','api-key','private_key']
        self.assertEqual(modification_changes(dict.fromkeys(fields,'old'),dict.fromkeys(fields,'new')),[])

    def test_config_uses_positive_allowlist(self):
        values=settings_snapshot({'smtp':{'username':'private','password':'private','password_token':'private'},
                                  'integrations':{'webhook':{'url':'https://user:private@example.com'}}})
        self.assertNotIn('private',str(values))
