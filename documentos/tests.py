from contextlib import nullcontext
from datetime import datetime, timedelta
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4
from zipfile import ZipFile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, override_settings
from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied, ValidationError
from rest_framework.test import APIClient, APIRequestFactory

from .authentication import CookieTokenAuthentication, hash_session_token
from .audit_views import audit_query_parts, require_audit_access
from .auth_utils import record_auth_event, user_has_permission
from .backup_service import BackupExecutionError, decrypt_archive, encrypt_archive
from .config_service import decrypt_secret, encrypt_secret, validate_section
from .management_views import (
    PermissionDetailView,
    PermissionListView,
    UserDetailView,
    UserDeviceRevokeView,
    build_device_inventory,
    device_fingerprint,
    serialize_dashboard_document,
)
from .document_serializers import DocumentCreateSerializer, DocumentFileSerializer
from .document_views import DocumentFileDownloadView, compare_versions, validate_metadata
from .file_validation import validate_uploaded_file
from .models import ConfiguracionSistema, Documento, Organizacion, document_file_upload_to
from .permissions import HasDocumentalPermission, IsAuthenticatedAndPasswordCurrent
from .reader_access import has_document_permission
from .reader_views import ReaderAccessSerializer
from .reports_views import build_pdf, build_xlsx, summarize_report
from .notifications import create_notification
from .security_utils import sanitize_text
from .serializers import ChangePasswordSerializer, LoginSerializer, UserCreateSerializer
from .workflow_views import (
    ChecklistSerializer,
    ReviewCommentSerializer,
    SubmitReviewSerializer,
    VERSION_TRANSITIONS,
    transition_version,
)


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

    def test_user_creation_rejects_weak_temporary_password(self):
        serializer = UserCreateSerializer(
            data={
                'username': 'nuevo.usuario',
                'email': 'nuevo@example.com',
                'first_name': 'Nuevo',
                'last_name': 'Usuario',
                'organization_id': str(uuid4()),
                'temporary_password': '12345678',
            },
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn('temporary_password', serializer.errors)

    def test_document_serializer_accepts_scalar_metadata(self):
        serializer = DocumentCreateSerializer(data={
            'code': 'POL-001',
            'title': 'Politica de calidad',
            'area_id': str(uuid4()),
            'type_id': 1,
            'metadata': {'owner': 'Calidad', 'year': 2026},
        })

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data['metadata']['year'], 2026)

    def test_metadata_validation_rejects_nested_values(self):
        serializer = DocumentCreateSerializer(data={
            'code': 'POL-004',
            'title': 'Politica de calidad',
            'area_id': str(uuid4()),
            'type_id': 1,
            'metadata': {'owner': {'name': 'Calidad'}},
        })

        self.assertTrue(serializer.is_valid(), serializer.errors)
        with self.assertRaises(ValidationError):
            validate_metadata(serializer.validated_data['metadata'])

    def test_document_serializer_rejects_non_numeric_type_id(self):
        serializer = DocumentCreateSerializer(data={
            'code': 'POL-002',
            'title': 'Politica de seguridad',
            'area_id': str(uuid4()),
            'type_id': 'tipo-invalido',
        })

        self.assertFalse(serializer.is_valid())
        self.assertIn('type_id', serializer.errors)

    def test_document_file_serializer_requires_file_but_accepts_comment(self):
        serializer = DocumentFileSerializer(data={
            'comment': 'Correccion de procedimiento',
        })

        self.assertFalse(serializer.is_valid())
        self.assertIn('file', serializer.errors)

    def test_document_serializer_sanitizes_markup_from_text_fields(self):
        serializer = DocumentCreateSerializer(data={
            'code': 'POL-003',
            'title': ' <script>alert(1)</script> Politica ',
            'description': '<b>Descripcion</b> segura',
            'area_id': str(uuid4()),
            'type_id': 1,
        })

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data['title'], 'alert(1) Politica')
        self.assertEqual(serializer.validated_data['description'], 'Descripcion segura')

    def test_workflow_serializers_sanitize_user_text(self):
        comment = ReviewCommentSerializer(data={'content': '<img src=x>Observacion', 'type': 'OBSERVACION'})
        checklist = ChecklistSerializer(data={'title': '<b>Verificar</b>'})

        self.assertTrue(comment.is_valid(), comment.errors)
        self.assertTrue(checklist.is_valid(), checklist.errors)
        self.assertEqual(comment.validated_data['content'], 'Observacion')
        self.assertEqual(checklist.validated_data['title'], 'Verificar')


class UserDeletionTests(SimpleTestCase):
    @patch('documentos.management_views.serialize_management_user', return_value={'id': 'usuario-inactivo', 'active': False})
    @patch('documentos.management_views.record_management_event')
    @patch('documentos.management_views.timezone.now')
    @patch('documentos.management_views.SesionDocumental.objects.filter')
    @patch('documentos.management_views.UsuarioDocumental.objects.filter')
    @patch('documentos.management_views.get_user_for_organization')
    @patch('documentos.management_views.require_permission')
    @patch('documentos.management_views.transaction.atomic', return_value=nullcontext())
    def test_delete_marks_user_inactive_and_revokes_sessions(
        self,
        atomic,
        require_permission,
        get_user,
        user_filter,
        session_filter,
        now,
        record_event,
        serialize_user,
    ):
        user_id = uuid4()
        organization_id = uuid4()
        administrator_id = uuid4()
        disabled_at = timezone.now()
        user = SimpleNamespace(
            id=user_id,
            pk=user_id,
            organizacion_id=organization_id,
            activo=True,
            deshabilitado_en=None,
        )
        request = SimpleNamespace(
            user=SimpleNamespace(id=administrator_id, organizacion_id=organization_id),
            auth=SimpleNamespace(id=uuid4()),
        )
        get_user.return_value = user
        now.return_value = disabled_at

        response = UserDetailView().delete(request, user_id)

        self.assertEqual(response.status_code, 200)
        self.assertFalse(user.activo)
        self.assertEqual(user.deshabilitado_en, disabled_at)
        user_filter.assert_called_once_with(pk=user_id, activo=True)
        user_filter.return_value.update.assert_called_once_with(
            activo=False,
            deshabilitado_en=disabled_at,
            actualizado_en=disabled_at,
        )
        session_filter.assert_called_once_with(usuario_id=user_id, revocada_en__isnull=True)
        session_filter.return_value.update.assert_called_once_with(
            revocada_en=disabled_at,
            motivo_revocacion='Cuenta dada de baja logicamente por un administrador',
        )
        record_event.assert_called_once_with(
            request,
            user,
            'USUARIO_MODIFICADO',
            'Usuario dado de baja logicamente',
        )
        serialize_user.assert_called_once_with(user)

    @patch('documentos.management_views.get_user_for_organization')
    @patch('documentos.management_views.require_permission')
    def test_delete_rejects_current_administrator(self, require_permission, get_user):
        user_id = uuid4()
        organization_id = uuid4()
        user = SimpleNamespace(id=user_id, pk=user_id, organizacion_id=organization_id)
        request = SimpleNamespace(user=SimpleNamespace(id=user_id, organizacion_id=organization_id))
        get_user.return_value = user

        response = UserDetailView().delete(request, user_id)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'USER_SELF_DEACTIVATION_NOT_ALLOWED')


class DeviceInventoryTests(SimpleTestCase):
    def test_inventory_groups_sessions_by_user_agent_and_ip(self):
        now = timezone.now()
        user_agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit Chrome/120.0'
        rows = [
            {
                'id': uuid4(),
                'direccion_ip': '192.0.2.10',
                'agente_usuario': user_agent,
                'iniciada_en': now - timedelta(days=2),
                'ultima_actividad_en': now - timedelta(hours=1),
                'expira_en': now + timedelta(hours=2),
                'revocada_en': None,
                'motivo_revocacion': None,
            },
            {
                'id': uuid4(),
                'direccion_ip': '192.0.2.10',
                'agente_usuario': user_agent,
                'iniciada_en': now - timedelta(days=4),
                'ultima_actividad_en': now - timedelta(days=3),
                'expira_en': now - timedelta(days=2),
                'revocada_en': now - timedelta(days=3),
                'motivo_revocacion': 'Cierre de sesion',
            },
        ]

        sessions, devices = build_device_inventory(rows, now=now)

        self.assertEqual(len(sessions), 2)
        self.assertEqual(len(devices), 1)
        self.assertEqual(devices[0]['id'], device_fingerprint(user_agent, '192.0.2.10'))
        self.assertEqual(devices[0]['session_count'], 2)
        self.assertEqual(devices[0]['active_session_count'], 1)
        self.assertEqual(devices[0]['name'], 'Chrome en Windows')
        self.assertTrue(sessions[0]['active'])
        self.assertFalse(sessions[1]['active'])

    @patch('documentos.management_views.record_management_event')
    @patch('documentos.management_views.timezone.now')
    @patch('documentos.management_views.SesionDocumental.objects.filter')
    @patch('documentos.management_views.get_user_for_organization')
    @patch('documentos.management_views.require_permission')
    def test_device_revoke_revokes_all_sessions_for_fingerprint(
        self,
        require_permission,
        get_user,
        session_filter,
        now,
        record_event,
    ):
        user_id = uuid4()
        organization_id = uuid4()
        administrator_id = uuid4()
        session_id = uuid4()
        user_agent = 'Mozilla/5.0 (X11; Linux x86_64) Firefox/120.0'
        ip_address = '192.0.2.20'
        user = SimpleNamespace(id=user_id, pk=user_id, organizacion_id=organization_id)
        request = SimpleNamespace(
            user=SimpleNamespace(id=administrator_id, organizacion_id=organization_id),
            auth=SimpleNamespace(id=uuid4()),
        )
        session_query = MagicMock()
        session_query.values.return_value = [{
            'id': session_id,
            'direccion_ip': ip_address,
            'agente_usuario': user_agent,
        }]
        session_query.update.return_value = 1
        session_filter.return_value = session_query
        get_user.return_value = user
        revoked_at = timezone.now()
        now.return_value = revoked_at
        device_id = device_fingerprint(user_agent, ip_address)

        response = UserDeviceRevokeView().post(request, user_id, device_id)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['revoked_sessions'], 1)
        self.assertEqual(session_filter.call_count, 2)
        session_query.update.assert_called_once_with(
            revocada_en=revoked_at,
            motivo_revocacion='Dispositivo revocado desde administracion',
        )
        record_event.assert_called_once_with(request, user, 'SESION_REVOCADA', 'Dispositivo revocado')


class PermissionManagementTests(SimpleTestCase):
    @patch('documentos.management_views.record_management_event')
    @patch('documentos.management_views.PermisoDocumental.objects.create')
    @patch('documentos.management_views.PermisoDocumental.objects.filter')
    @patch('documentos.management_views.require_permission')
    def test_create_permission_persists_active_catalog_entry(
        self,
        require_permission,
        permission_filter,
        create_permission,
        record_event,
    ):
        organization_id = uuid4()
        administrator = SimpleNamespace(id=uuid4(), organizacion_id=organization_id)
        request = SimpleNamespace(
            user=administrator,
            auth=SimpleNamespace(id=uuid4()),
            data={
                'code': 'documentos.revisar',
                'name': 'Revisar documentos',
                'module': 'documentos',
                'description': 'Permite revisar documentos.',
            },
        )
        permission = SimpleNamespace(
            id=uuid4(),
            codigo='documentos.revisar',
            nombre='Revisar documentos',
            modulo='documentos',
            descripcion='Permite revisar documentos.',
            activo=True,
        )
        permission_filter.return_value.exists.return_value = False
        create_permission.return_value = permission

        response = PermissionListView().post(request)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['permission']['codigo'], 'documentos.revisar')
        self.assertTrue(response.data['permission']['activo'])
        permission_filter.assert_called_once_with(codigo__iexact='documentos.revisar')
        create_permission.assert_called_once()
        created_data = create_permission.call_args.kwargs
        self.assertIsInstance(created_data['id'], type(permission.id))
        self.assertEqual(created_data['codigo'], 'documentos.revisar')
        self.assertEqual(created_data['nombre'], 'Revisar documentos')
        self.assertEqual(created_data['modulo'], 'documentos')
        self.assertEqual(created_data['descripcion'], 'Permite revisar documentos.')
        self.assertTrue(created_data['activo'])
        record_event.assert_called_once()

    @patch('documentos.management_views.record_management_event')
    @patch('documentos.management_views.PermisoDocumental.objects.filter')
    @patch('documentos.management_views.require_permission')
    def test_update_permission_changes_metadata_and_status(
        self,
        require_permission,
        permission_filter,
        record_event,
    ):
        permission_id = uuid4()
        permission = SimpleNamespace(
            id=permission_id,
            pk=permission_id,
            codigo='documentos.revisar',
            nombre='Revisar documentos',
            modulo='documentos',
            descripcion='Descripción anterior',
            activo=True,
        )
        permission_filter.return_value.first.return_value = permission
        request = SimpleNamespace(
            user=SimpleNamespace(id=uuid4(), organizacion_id=uuid4()),
            auth=SimpleNamespace(id=uuid4()),
            data={
                'name': 'Revisar documentos publicados',
                'module': 'revision',
                'description': 'Descripción actualizada',
                'active': False,
            },
        )

        response = PermissionDetailView().patch(request, permission_id)

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['permission']['activo'])
        self.assertEqual(response.data['permission']['nombre'], 'Revisar documentos publicados')
        permission_filter.return_value.update.assert_called_once_with(
            nombre='Revisar documentos publicados',
            modulo='revision',
            descripcion='Descripción actualizada',
            activo=False,
        )
        record_event.assert_called_once()


class ReportFormatTests(SimpleTestCase):
    def setUp(self):
        self.rows = [{
            'code': 'POL-001',
            'title': 'Politica de calidad',
            'area': 'Calidad',
            'type': 'Politica',
            'responsible': 'Juan Perez',
            'status_code': 'PUBLICADO',
            'status': 'Publicado',
            'version': '1.0',
            'updated_at': timezone.now(),
        }]

    def test_summary_groups_report_rows(self):
        summary = summarize_report(self.rows, 'executive')

        self.assertEqual(summary['total'], 1)
        self.assertEqual(summary['published'], 1)
        self.assertEqual(summary['by_area'], [{'name': 'Calidad', 'count': 1}])

    def test_xlsx_contains_summary_and_detail_sheets(self):
        data = {'scope': 'executive', 'summary': summarize_report(self.rows, 'executive'), 'rows': self.rows}

        workbook = __import__('openpyxl').load_workbook(BytesIO(build_xlsx(data)))

        self.assertEqual(workbook.sheetnames, ['Resumen', 'Detalle'])
        self.assertEqual(workbook['Detalle']['A2'].value, 'POL-001')

    def test_pdf_has_valid_signature(self):
        data = {'scope': 'executive', 'summary': summarize_report(self.rows, 'executive'), 'rows': self.rows}

        self.assertTrue(build_pdf(data).startswith(b'%PDF-'))


class BackupSecurityTests(SimpleTestCase):
    @override_settings(SECRET_KEY='backup-test-secret')
    def test_backup_archive_is_encrypted_and_round_trips(self):
        payload = encrypt_archive(b'datos documentales')

        self.assertTrue(payload.startswith(b'SDBK1'))
        self.assertNotIn(b'datos documentales', payload)
        self.assertEqual(decrypt_archive(payload), b'datos documentales')

    @override_settings(SECRET_KEY='backup-test-secret')
    def test_backup_archive_rejects_tampering(self):
        payload = bytearray(encrypt_archive(b'datos documentales'))
        payload[-1] ^= 1

        with self.assertRaises(BackupExecutionError):
            decrypt_archive(bytes(payload))


class SettingsSecurityTests(SimpleTestCase):
    @override_settings(SECRET_KEY='settings-test-secret')
    def test_smtp_secret_is_encrypted_and_round_trips(self):
        token = encrypt_secret('smtp-password')

        self.assertNotIn('smtp-password', token)
        self.assertEqual(decrypt_secret(token), 'smtp-password')

    def test_settings_validate_upload_limits_and_https_webhook(self):
        uploads = validate_section('uploads', {
            'max_file_mb': 20,
            'max_request_mb': 100,
            'extensions': 'PDF, DOCX',
        })
        integrations = validate_section('integrations', {
            'webhook': {'enabled': True, 'url': 'https://example.com/events'},
        })

        self.assertEqual(uploads['extensions'], ['.docx', '.pdf'])
        self.assertTrue(integrations['webhook']['enabled'])


class VersioningTests(SimpleTestCase):
    def test_compare_versions_reports_content_and_metadata_changes(self):
        state = SimpleNamespace(id=1, codigo='BORRADOR', nombre='Borrador')
        author = SimpleNamespace(
            nombre_usuario='juan.perez',
            nombres='Juan',
            apellidos='Perez',
        )
        first = SimpleNamespace(
            id=uuid4(),
            documento_id=uuid4(),
            nombre_archivo_original='politica.pdf',
            tipo_mime='application/pdf',
            tamano_bytes=10,
            sha256='a' * 64,
            comentario_cambio='Carga inicial',
            estado_version_id=1,
            estado_version=state,
            creada_por_id=uuid4(),
            creada_por=author,
            creada_en=timezone.now(),
            numero_mayor=1,
            numero_menor=0,
            es_vigente=False,
        )
        second = SimpleNamespace(
            **{
                **first.__dict__,
                'id': uuid4(),
                'tamano_bytes': 20,
                'sha256': 'b' * 64,
                'comentario_cambio': 'Correccion de procedimiento',
                'numero_mayor': 2,
                'es_vigente': True,
            },
        )
        request = APIRequestFactory().get('/api/documents/')

        result = compare_versions(first, second, request)

        self.assertFalse(result['same_content'])
        self.assertEqual(
            {item['field'] for item in result['changed_fields']},
            {'size', 'sha256', 'comment'},
        )


class WorkflowTests(SimpleTestCase):
    def test_version_transitions_allow_review_and_publication_only_in_order(self):
        self.assertEqual(VERSION_TRANSITIONS['BORRADOR'], {'EN_REVISION'})
        self.assertEqual(VERSION_TRANSITIONS['EN_REVISION'], {'APROBADO', 'BORRADOR', 'RECHAZADO'})
        self.assertEqual(VERSION_TRANSITIONS['APROBADO'], {'PUBLICADO'})
        self.assertEqual(VERSION_TRANSITIONS['PUBLICADO'], set())

    def test_submit_review_serializer_rejects_duplicate_reviewers(self):
        reviewer_id = uuid4()
        serializer = SubmitReviewSerializer(data={
            'reviewer_ids': [str(reviewer_id), str(reviewer_id)],
            'checklist': ['Verificar vigencia'],
        })

        self.assertFalse(serializer.is_valid())
        self.assertIn('reviewer_ids', serializer.errors)

    @patch('documentos.workflow_views.HistorialEstadoVersion.objects.create')
    @patch('documentos.workflow_views.get_catalog_state')
    def test_transition_records_history_before_updating_version(self, get_catalog_state, create_history):
        current_state = SimpleNamespace(codigo='BORRADOR', id=1)
        target_state = SimpleNamespace(codigo='EN_REVISION', id=2)
        version = SimpleNamespace(
            estado_version=current_state,
            save=MagicMock(),
        )
        get_catalog_state.return_value = target_state
        user = SimpleNamespace(id=uuid4())

        transition_version(version, 'EN_REVISION', user, 'Enviar a revision')

        create_history.assert_called_once()
        self.assertIs(version.estado_version, target_state)
        version.save.assert_called_once_with(update_fields=['estado_version'])


@override_settings(ALLOWED_UPLOAD_EXTENSIONS=['.pdf', '.png'], MAX_UPLOAD_SIZE_MB=1)
class DocumentFileValidationTests(SimpleTestCase):
    def test_pdf_file_is_accepted_and_hashed(self):
        uploaded_file = SimpleUploadedFile(
            'politica.pdf',
            b'%PDF-1.7\ncontenido de prueba',
            content_type='application/pdf',
        )

        result = validate_uploaded_file(uploaded_file)

        self.assertEqual(result['name'], 'politica.pdf')
        self.assertEqual(result['mime_type'], 'application/pdf')
        self.assertEqual(len(result['sha256']), 64)

    def test_file_with_disallowed_extension_is_rejected(self):
        uploaded_file = SimpleUploadedFile('archivo.exe', b'MZ', content_type='application/octet-stream')

        with self.assertRaises(ValidationError):
            validate_uploaded_file(uploaded_file)

    def test_file_with_wrong_mime_or_content_is_rejected(self):
        uploaded_file = SimpleUploadedFile('archivo.pdf', b'no es pdf', content_type='application/pdf')

        with self.assertRaises(ValidationError):
            validate_uploaded_file(uploaded_file)

    def test_file_over_limit_is_rejected(self):
        uploaded_file = SimpleUploadedFile(
            'grande.pdf',
            b'%PDF-1.7' + b'x' * (1024 * 1024),
            content_type='application/pdf',
        )

        with self.assertRaises(ValidationError):
            validate_uploaded_file(uploaded_file)

    def test_ooxml_file_with_macro_is_rejected(self):
        content = BytesIO()
        with ZipFile(content, 'w') as archive:
            archive.writestr('[Content_Types].xml', '<Types/>')
            archive.writestr('word/vbaProject.bin', b'macro')
        uploaded_file = SimpleUploadedFile(
            'archivo.docx',
            content.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        )

        with self.assertRaises(ValidationError):
            validate_uploaded_file(uploaded_file)

    def test_ooxml_file_with_traversal_path_is_rejected(self):
        content = BytesIO()
        with ZipFile(content, 'w') as archive:
            archive.writestr('../payload.txt', b'contenido')
        uploaded_file = SimpleUploadedFile(
            'archivo.docx',
            content.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        )

        with self.assertRaises(ValidationError):
            validate_uploaded_file(uploaded_file)

    @patch('documentos.document_views.is_reader_user', return_value=False)
    @patch('documentos.document_views.record_document_event')
    @patch('documentos.document_views.open_stored_file', return_value=BytesIO(b'%PDF-1.7 contenido'))
    @patch('documentos.document_views.get_document_file_or_404')
    @patch('documentos.document_views.require_permission')
    def test_document_file_download_returns_attachment_and_records_access(
        self,
        require_permission,
        get_document_file,
        open_file,
        record_event,
        is_reader,
    ):
        document_id = uuid4()
        file_id = uuid4()
        document = SimpleNamespace(id=document_id)
        document_file = SimpleNamespace(
            id=file_id,
            documento_id=document_id,
            tipo_mime='application/pdf',
            nombre_archivo_original='manual".pdf',
            clave_almacenamiento='documentos/manual.pdf',
        )
        get_document_file.return_value = (document, document_file)
        request = APIRequestFactory().get(f'/api/documents/{document_id}/files/{file_id}/download/')
        request.user = SimpleNamespace(id=uuid4(), organizacion_id=uuid4())
        request.auth = None

        response = DocumentFileDownloadView().get(request, document_id, file_id)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/pdf')
        self.assertEqual(response['Content-Disposition'], 'attachment; filename="manual.pdf"')
        require_permission.assert_called_once()
        open_file.assert_called_once_with(document_file)
        record_event.assert_called_once()
        is_reader.assert_called_once_with(request.user)


class ModelContractTests(SimpleTestCase):
    def test_document_models_have_safe_display_values_and_storage_path(self):
        organization_id = uuid4()
        document_id = uuid4()
        document = Documento(id=document_id, organizacion_id=organization_id, codigo='POL-001', nombre='Politica')
        organization = Organizacion(codigo='ORG', nombre='Organizacion')
        system_config = ConfiguracionSistema(organizacion_id=organization_id)

        self.assertEqual(str(document), 'POL-001 - Politica')
        self.assertEqual(str(organization), 'Organizacion')
        self.assertEqual(system_config.general, {})
        upload_path = document_file_upload_to(
            SimpleNamespace(documento_id=document_id, documento=document),
            'carpeta/archivo.PDF',
        )
        self.assertTrue(upload_path.startswith(f'{organization_id}/{document_id}/'))
        self.assertTrue(upload_path.endswith('.pdf'))
        self.assertNotIn('carpeta', upload_path)

    def test_sanitize_text_removes_markup_and_control_characters(self):
        self.assertEqual(sanitize_text('<p>Texto</p>\x00\x01 seguro'), 'Texto seguro')


class AuthenticationTests(SimpleTestCase):
    def test_session_token_is_stored_as_sha256(self):
        token_hash = hash_session_token('opaque-session-token')

        self.assertEqual(len(token_hash), 64)
        self.assertNotEqual(token_hash, 'opaque-session-token')

    def test_authentication_without_cookie_is_anonymous(self):
        request = APIRequestFactory().get('/api/auth/me/')

        self.assertIsNone(CookieTokenAuthentication().authenticate(request))

    @patch('documentos.authentication.SessionAuthentication.enforce_csrf')
    @patch('documentos.authentication.security_policy_for', return_value={'inactivity_minutes': 30})
    @patch('documentos.authentication.timezone.now')
    @patch('documentos.authentication.SesionDocumental.objects')
    def test_authentication_updates_last_activity_for_active_session(
        self,
        session_manager,
        now_mock,
        security_policy,
        enforce_csrf,
    ):
        now = timezone.make_aware(datetime(2026, 8, 27, 12, 0, 0))
        now_mock.return_value = now
        user = SimpleNamespace(
            id=uuid4(),
            organizacion_id=uuid4(),
            activo=True,
        )
        session = SimpleNamespace(
            id=uuid4(),
            expira_en=now + timedelta(hours=1),
            ultima_actividad_en=now - timedelta(minutes=5),
            usuario=user,
        )
        session.pk = session.id
        session_manager.select_related.return_value.get.return_value = session
        request = APIRequestFactory().get('/api/auth/me/')
        request.COOKIES['sd_session'] = 'opaque-session-token'

        result = CookieTokenAuthentication().authenticate(request)

        self.assertEqual(result, (user, session))
        self.assertEqual(session.ultima_actividad_en, now)
        session_manager.filter.assert_called_once_with(pk=session.id, revocada_en__isnull=True)
        session_manager.filter.return_value.update.assert_called_once_with(ultima_actividad_en=now)
        security_policy.assert_called_once_with(user.organizacion_id)
        enforce_csrf.assert_called_once_with(request)

    @patch('documentos.authentication.SessionAuthentication.enforce_csrf')
    @patch('documentos.authentication.security_policy_for', return_value={'inactivity_minutes': 30})
    @patch('documentos.authentication.timezone.now')
    @patch('documentos.authentication.SesionDocumental.objects')
    def test_authentication_revokes_inactive_session(
        self,
        session_manager,
        now_mock,
        security_policy,
        enforce_csrf,
    ):
        now = timezone.make_aware(datetime(2026, 8, 27, 12, 0, 0))
        now_mock.return_value = now
        user = SimpleNamespace(
            id=uuid4(),
            organizacion_id=uuid4(),
            activo=True,
        )
        session = SimpleNamespace(
            id=uuid4(),
            expira_en=now + timedelta(hours=1),
            ultima_actividad_en=now - timedelta(minutes=31),
            usuario=user,
        )
        session.pk = session.id
        session_manager.select_related.return_value.get.return_value = session
        request = APIRequestFactory().get('/api/auth/me/')
        request.COOKIES['sd_session'] = 'opaque-session-token'

        with self.assertRaises(AuthenticationFailed):
            CookieTokenAuthentication().authenticate(request)

        session_manager.filter.assert_called_once_with(pk=session.id, revocada_en__isnull=True)
        session_manager.filter.return_value.update.assert_called_once_with(
            revocada_en=now,
            motivo_revocacion='Sesion expirada por inactividad',
        )
        enforce_csrf.assert_called_once_with(request)

    def test_forced_password_change_blocks_other_protected_endpoints(self):
        request = APIRequestFactory().get('/api/documents/')
        request.user = SimpleNamespace(is_authenticated=True, debe_cambiar_contrasena=True)

        with self.assertRaises(PermissionDenied):
            IsAuthenticatedAndPasswordCurrent().has_permission(request, object())

    @patch('documentos.auth_utils.get_user_permission_codes', return_value=['USUARIOS_VER'])
    @patch('documentos.auth_utils.get_user_roles', return_value=[])
    def test_documental_permission_comes_from_active_role_assignments(self, get_roles, get_permissions):
        user = SimpleNamespace(id=uuid4())

        self.assertTrue(user_has_permission(user, 'USUARIOS_VER'))
        self.assertFalse(user_has_permission(user, 'ROLES_ADMINISTRAR'))


class PermissionTests(SimpleTestCase):
    @patch('documentos.permissions.user_has_permission', return_value=False)
    def test_permission_class_rejects_user_without_permission(self, has_permission):
        request = SimpleNamespace(
            user=SimpleNamespace(is_authenticated=True, debe_cambiar_contrasena=False, id=uuid4()),
        )
        view = SimpleNamespace(permission_code='documentos.gestionar')

        with self.assertRaises(PermissionDenied):
            HasDocumentalPermission().has_permission(request, view)
        has_permission.assert_called_once_with(request.user, 'documentos.gestionar')

    @patch('documentos.permissions.user_has_permission', return_value=True)
    def test_permission_class_accepts_user_with_permission(self, has_permission):
        request = SimpleNamespace(
            user=SimpleNamespace(is_authenticated=True, debe_cambiar_contrasena=False, id=uuid4()),
        )
        view = SimpleNamespace(permission_code='documentos.gestionar')

        self.assertTrue(HasDocumentalPermission().has_permission(request, view))
        has_permission.assert_called_once_with(request.user, 'documentos.gestionar')


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

    @patch('documentos.views.connection')
    def test_health_endpoint_is_public_and_checks_database(self, connection_mock):
        connection_mock.cursor.return_value.__enter__.return_value.fetchone.return_value = (1,)
        response = self.client.get('/api/health/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'running')
        self.assertEqual(response.data['checks']['database'], 'ok')

    @patch('documentos.views.logger.critical')
    @patch('documentos.views.connection')
    def test_health_endpoint_reports_database_failure(self, connection_mock, critical):
        connection_mock.cursor.return_value.__enter__.side_effect = RuntimeError('database unavailable')

        response = self.client.get('/api/health/')

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data['status'], 'degraded')
        critical.assert_called_once()

    def test_protected_endpoints_require_authentication(self):
        paths = [
            '/api/settings/',
            '/api/backups/',
            '/api/documents/',
            '/api/documents/export/',
            '/api/reviews/inbox/',
            '/api/reader/documents/',
            '/api/notifications/',
            '/api/audit/',
            '/api/reports/',
        ]

        for path in paths:
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 401)

    def test_documents_require_authentication(self):
        response = self.client.get('/api/documents/')

        self.assertEqual(response.status_code, 401)

    def test_user_administration_requires_authentication(self):
        response = self.client.get('/api/admin/users/')

        self.assertEqual(response.status_code, 401)

    def test_notifications_require_authentication(self):
        response = self.client.get('/api/notifications/')

        self.assertEqual(response.status_code, 401)

    def test_audit_requires_authentication(self):
        response = self.client.get('/api/audit/')

        self.assertEqual(response.status_code, 401)

    def test_reports_require_authentication(self):
        response = self.client.get('/api/reports/')

        self.assertEqual(response.status_code, 401)

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


class ReaderAccessTests(SimpleTestCase):
    def test_reader_access_serializer_accepts_reading_progress(self):
        serializer = ReaderAccessSerializer(
            data={
                'version_id': str(uuid4()),
                'duration_seconds': 90,
                'last_page': 4,
            },
        )

        self.assertTrue(serializer.is_valid())
        self.assertEqual(serializer.validated_data['duration_seconds'], 90)

    def test_reader_access_serializer_rejects_negative_progress(self):
        serializer = ReaderAccessSerializer(data={'duration_seconds': -1})

        self.assertFalse(serializer.is_valid())
        self.assertIn('duration_seconds', serializer.errors)

    @patch('documentos.reader_access.user_has_permission', return_value=True)
    @patch('documentos.reader_access.connection')
    def test_document_acl_overrides_global_permission_when_document_is_restricted(self, cursor, user_has_permission_mock):
        cursor.cursor.return_value.__enter__.return_value.fetchone.return_value = (True, False)
        user = SimpleNamespace(id=uuid4())

        self.assertFalse(has_document_permission(user, uuid4(), 'documentos.consultar'))
        user_has_permission_mock.assert_called_once_with(user, 'documentos.consultar')

    @patch('documentos.reader_access.user_has_permission', return_value=True)
    @patch('documentos.reader_access.connection')
    def test_global_permission_applies_when_document_has_no_acl(self, cursor, user_has_permission_mock):
        cursor.cursor.return_value.__enter__.return_value.fetchone.return_value = (False, False)
        user = SimpleNamespace(id=uuid4())

        self.assertTrue(has_document_permission(user, uuid4(), 'documentos.consultar'))
        user_has_permission_mock.assert_called_once_with(user, 'documentos.consultar')

    @patch('documentos.reader_access.get_user_roles', return_value=[{'code': 'EDITOR', 'name': 'Editor'}])
    @patch('documentos.reader_access.user_has_permission', return_value=True)
    @patch('documentos.reader_access.connection')
    @patch('documentos.reader_access.Documento.objects')
    def test_area_scope_blocks_global_permission_outside_assigned_area(self, documents, cursor, user_has_permission_mock, roles_mock):
        cursor.cursor.return_value.__enter__.return_value.fetchone.return_value = (False, False)
        documents.filter.return_value.only.return_value.first.return_value = SimpleNamespace(
            area_id=uuid4(),
            creado_por_id=uuid4(),
        )
        user = SimpleNamespace(id=uuid4(), area_id=uuid4())

        self.assertFalse(has_document_permission(user, uuid4(), 'documentos.consultar'))
        roles_mock.assert_called_once_with(user.id)


class NotificationTests(SimpleTestCase):
    @override_settings(NOTIFICATIONS_EMAIL_ENABLED=True, DEFAULT_FROM_EMAIL='no-reply@example.com')
    @patch('documentos.notifications.send_mail')
    @patch('documentos.notifications.Notificacion.objects.create')
    def test_create_notification_persists_and_sends_email(self, create, send_mail):
        notification = MagicMock()
        create.return_value = notification
        user = SimpleNamespace(correo='lector@example.com')

        result = create_notification(
            user=user,
            notification_type='REVISION_ASIGNADA',
            title='Nueva revision asignada',
            message='Revisa el documento DOC-001.',
        )

        self.assertIs(result, notification)
        create.assert_called_once_with(
            usuario=user,
            tipo='REVISION_ASIGNADA',
            titulo='Nueva revision asignada',
            mensaje='Revisa el documento DOC-001.',
            documento=None,
            version_documento=None,
            solicitud_revision=None,
        )
        send_mail.assert_called_once_with(
            'Nueva revision asignada',
            'Revisa el documento DOC-001.',
            'no-reply@example.com',
            ['lector@example.com'],
            fail_silently=False,
        )
        notification.save.assert_called_once_with(update_fields=['correo_enviado_en'])


class AuditTests(SimpleTestCase):
    @patch('documentos.audit_views.get_user_roles', return_value=[{'code': 'EDITOR', 'name': 'Editor'}])
    def test_editor_can_request_only_own_audit_events(self, get_user_roles):
        user_id = uuid4()
        request = SimpleNamespace(user=SimpleNamespace(id=user_id), query_params={'user_id': str(user_id)})

        require_audit_access(request, allow_own_events=True)

        request.query_params = {'user_id': str(uuid4())}
        with self.assertRaises(PermissionDenied):
            require_audit_access(request, allow_own_events=True)

    def test_audit_query_builds_parameterized_filters(self):
        where, values = audit_query_parts({
            'organization_id': uuid4(),
            'action': 'sesion_fallida',
            'module': 'usuario',
            'result': 'false',
            'ip': '127.0.0.1',
            'search': 'contraseña',
            'critical': 'true',
        })

        self.assertIn('a.codigo = %s', where)
        self.assertIn('tr.codigo = %s', where)
        self.assertIn('ba.exitoso = %s', where)
        self.assertIn('NOT ba.exitoso', where)
        self.assertEqual(values[1:4], ['SESION_FALLIDA', 'USUARIO', False])

    @patch('documentos.auth_utils.logger.critical')
    @patch('documentos.auth_utils.connection')
    def test_audit_failures_are_reported_as_critical(self, connection, critical):
        connection.cursor.return_value.__enter__.side_effect = RuntimeError('database unavailable')
        request = SimpleNamespace(META={'REMOTE_ADDR': '127.0.0.1', 'HTTP_USER_AGENT': 'test'})

        record_auth_event(
            action_code='SESION_INICIADA',
            resource_code='SESION',
            organization_id=uuid4(),
            request=request,
            successful=True,
        )

        critical.assert_called_once()


class DashboardTests(SimpleTestCase):
    def test_dashboard_document_serializer_exposes_current_version(self):
        document = SimpleNamespace(
            id=uuid4(),
            codigo='DOC-001',
            nombre='Politica de seguridad',
            tipo_documento=SimpleNamespace(nombre='Politica'),
            area=SimpleNamespace(nombre='Administracion'),
            creado_por=SimpleNamespace(nombres='Juan', apellidos='Perez'),
            actualizado_en=timezone.now(),
            dashboard_versions=[SimpleNamespace(
                estado_version=SimpleNamespace(nombre='Publicado'),
                numero_mayor=2,
                numero_menor=1,
            )],
        )

        result = serialize_dashboard_document(document)

        self.assertEqual(result['code'], 'DOC-001')
        self.assertEqual(result['status'], 'Publicado')
        self.assertEqual(result['version'], '2.1')
        self.assertEqual(result['responsible'], 'Juan Perez')
