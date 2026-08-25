from contextlib import nullcontext
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

from django.test import SimpleTestCase, override_settings
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied
from rest_framework.test import APIClient, APIRequestFactory

from .authentication import CookieTokenAuthentication, hash_session_token
from .permissions import IsAuthenticatedAndPasswordCurrent
from .serializers import ChangePasswordSerializer, LoginSerializer


class SerializerTests(SimpleTestCase):
    def test_login_serializer_trims_identity_and_defaults_remember(self):
        serializer = LoginSerializer(data={'identity': '  juan.perez  ', 'password': 'secret'})

        self.assertTrue(serializer.is_valid())
        self.assertEqual(serializer.validated_data['identity'], 'juan.perez')
        self.assertFalse(serializer.validated_data['remember'])

    def test_change_password_rejects_mismatched_confirmation(self):
        serializer = ChangePasswordSerializer(
            data={
                'current_password': 'Actual123!',
                'new_password': 'NuevaSegura123!',
                'confirm_password': 'OtraSegura123!',
            },
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn('confirm_password', serializer.errors)

    def test_change_password_applies_django_validators(self):
        serializer = ChangePasswordSerializer(
            data={
                'current_password': 'Actual123!',
                'new_password': '12345678',
                'confirm_password': '12345678',
            },
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn('new_password', serializer.errors)

    def test_change_password_rejects_password_similar_to_username(self):
        request = SimpleNamespace(
            user=SimpleNamespace(
                is_authenticated=True,
                nombre_usuario='juan.perez',
                correo='juan@gmail.com',
                nombres='Juan',
                apellidos='Perez',
            ),
        )
        serializer = ChangePasswordSerializer(
            data={
                'current_password': 'Actual123!',
                'new_password': 'juan.perez2026!',
                'confirm_password': 'juan.perez2026!',
            },
            context={'request': request},
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn('new_password', serializer.errors)


class AuthenticationTests(SimpleTestCase):
    def test_session_token_is_stored_as_sha256(self):
        token_hash = hash_session_token('opaque-session-token')

        self.assertEqual(len(token_hash), 64)
        self.assertNotEqual(token_hash, 'opaque-session-token')

    def test_authentication_without_cookie_is_anonymous(self):
        request = APIRequestFactory().get('/api/auth/me/')

        self.assertIsNone(CookieTokenAuthentication().authenticate(request))

    def test_forced_password_change_blocks_other_protected_endpoints(self):
        request = APIRequestFactory().get('/api/documents/')
        request.user = SimpleNamespace(is_authenticated=True, debe_cambiar_contrasena=True)

        with self.assertRaises(PermissionDenied):
            IsAuthenticatedAndPasswordCurrent().has_permission(request, object())


@override_settings(
    AUTH_COOKIE_NAME='sd_session',
    AUTH_COOKIE_SECURE=False,
    AUTH_SESSION_HOURS=12,
    AUTH_REMEMBER_DAYS=30,
    AUTH_MAX_FAILED_ATTEMPTS=5,
    AUTH_LOCK_MINUTES=15,
)
class AuthApiTests(SimpleTestCase):
    def setUp(self):
        self.client = APIClient(enforce_csrf_checks=True)

    def csrf_token(self):
        response = self.client.get('/api/auth/csrf/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('csrftoken', response.cookies)
        return response.data['csrf_token']

    def test_login_requires_csrf(self):
        response = self.client.post(
            '/api/auth/login/',
            {'identity': 'juan.perez', 'password': 'incorrecta'},
            format='json',
        )

        self.assertEqual(response.status_code, 403)

    @patch('documentos.views.transaction.atomic', return_value=nullcontext())
    @patch('documentos.views.check_password', return_value=False)
    def test_login_returns_generic_error_for_unknown_user(self, check_password, atomic):
        token = self.csrf_token()
        query = MagicMock()
        query.filter.return_value.__getitem__.return_value = []

        with patch(
            'documentos.views.UsuarioDocumental.objects.select_for_update',
            return_value=query,
        ):
            response = self.client.post(
                '/api/auth/login/',
                {'identity': 'nadie@example.com', 'password': 'incorrecta'},
                format='json',
                HTTP_X_CSRFTOKEN=token,
            )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data['code'], 'INVALID_CREDENTIALS')
        check_password.assert_called_once()

    @patch('documentos.views.transaction.atomic', return_value=nullcontext())
    @patch('documentos.views.record_auth_event')
    @patch('documentos.views.serialize_user')
    @patch('documentos.views.check_password', return_value=True)
    def test_successful_login_sets_http_only_cookie(
        self,
        check_password,
        serialize_user,
        record_auth_event,
        atomic,
    ):
        token = self.csrf_token()
        user = SimpleNamespace(
            id=uuid4(),
            pk=uuid4(),
            organizacion_id=uuid4(),
            hash_contrasena='encoded',
            activo=True,
            bloqueado_hasta=None,
            intentos_fallidos=0,
            ultimo_acceso_en=None,
        )
        user.pk = user.id
        session = SimpleNamespace(id=uuid4(), expira_en=timezone.now() + timedelta(hours=12))
        serialize_user.return_value = {'id': str(user.id), 'username': 'juan.perez'}

        query = MagicMock()
        query.filter.return_value.__getitem__.return_value = [user]
        user_update = MagicMock()

        with (
            patch(
                'documentos.views.UsuarioDocumental.objects.select_for_update',
                return_value=query,
            ),
            patch('documentos.views.UsuarioDocumental.objects.filter', return_value=user_update),
            patch('documentos.views.SesionDocumental.objects.create', return_value=session),
        ):
            response = self.client.post(
                '/api/auth/login/',
                {
                    'identity': 'juan.perez',
                    'password': 'correcta',
                    'remember': True,
                },
                format='json',
                HTTP_X_CSRFTOKEN=token,
            )

        self.assertEqual(response.status_code, 200)
        self.assertIn('sd_session', response.cookies)
        self.assertTrue(response.cookies['sd_session']['httponly'])
        self.assertEqual(response.cookies['sd_session']['samesite'], 'Lax')
        self.assertEqual(response.cookies['sd_session']['max-age'], 30 * 24 * 60 * 60)
        record_auth_event.assert_called_once()
        check_password.assert_called_once_with('correcta', 'encoded')

    def test_health_endpoint_is_public(self):
        response = self.client.get('/api/health/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'running')

    @patch('documentos.views.transaction.atomic', return_value=nullcontext())
    @patch('documentos.views.record_auth_event')
    @patch('documentos.views.serialize_user')
    @patch('documentos.views.make_password', return_value='new-encoded-password')
    @patch('documentos.views.check_password', return_value=True)
    def test_password_change_rotates_current_session_token(
        self,
        check_password,
        make_password,
        serialize_user,
        record_auth_event,
        atomic,
    ):
        user = SimpleNamespace(
            id=uuid4(),
            pk=uuid4(),
            organizacion_id=uuid4(),
            nombre_usuario='juan.perez',
            correo='juan@gmail.com',
            nombres='Juan',
            apellidos='Perez',
            hash_contrasena='old-encoded-password',
            debe_cambiar_contrasena=True,
            is_authenticated=True,
            save=MagicMock(),
        )
        user.pk = user.id
        session = SimpleNamespace(
            id=uuid4(),
            pk=uuid4(),
            expira_en=timezone.now() + timedelta(hours=12),
        )
        session.pk = session.id
        serialize_user.return_value = {'id': str(user.id), 'must_change_password': False}
        session_query = MagicMock()
        self.client.force_authenticate(user=user, token=session)

        with (
            patch(
                'documentos.views.UsuarioDocumental.objects.select_for_update',
            ) as user_query,
            patch('documentos.views.SesionDocumental.objects.filter', return_value=session_query),
        ):
            user_query.return_value.get.return_value = user
            response = self.client.post(
                '/api/auth/change-password/',
                {
                    'current_password': 'Actual123!',
                    'new_password': 'StrongDifferent987!',
                    'confirm_password': 'StrongDifferent987!',
                },
                format='json',
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(user.hash_contrasena, 'new-encoded-password')
        self.assertFalse(user.debe_cambiar_contrasena)
        self.assertIn('sd_session', response.cookies)
        self.assertEqual(session_query.update.call_args.kwargs['hash_token'].__len__(), 64)
        check_password.assert_called_once_with('Actual123!', 'old-encoded-password')
        make_password.assert_called_once_with('StrongDifferent987!')
        record_auth_event.assert_called_once()
