import hashlib
import json
from contextlib import nullcontext
from datetime import datetime, timedelta
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4
from zipfile import ZipFile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection as django_connection
from django.test import SimpleTestCase, override_settings
from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied, ValidationError
from rest_framework.test import APIClient, APIRequestFactory

from .authentication import CookieTokenAuthentication, hash_session_token
from .audit_views import audit_query_parts, fetch_security_alerts, require_audit_access
from .auth_utils import record_access_denied, record_auth_event, user_has_permission
from .backup_service import (
    BACKUP_FORMAT,
    BACKUP_SCHEMA,
    BackupExecutionError,
    build_backup_archive,
    build_storage_snapshot,
    database_snapshot_transaction,
    decrypt_archive,
    encrypt_archive,
    load_backup_archive,
    restore_backup,
    restore_database_snapshot,
    restore_storage_snapshot,
    table_scope_clause,
    validate_database_snapshot,
    verify_backup,
)
from .config_service import decrypt_secret, encrypt_secret, validate_section
from .management_views import (
    PermissionDetailView,
    PermissionListView,
    UserDetailView,
    UserDeviceRevokeView,
    UserListCreateView,
    build_device_inventory,
    device_fingerprint,
    serialize_dashboard_document,
)
from .management.commands.generar_reportes_programados import Command as GenerateScheduledReportsCommand
from .document_serializers import DocumentCreateSerializer, DocumentFileSerializer, VersionRestoreSerializer
from .document_views import (
    DocumentFileDownloadView,
    DocumentDetailView,
    DocumentExportView,
    DocumentPermissionsView,
    DocumentUnarchiveView,
    DocumentVersionRestoreView,
    compare_versions,
    ensure_document_directly_editable,
    ensure_area_authorized,
    next_version_numbers,
    save_document_file,
    save_metadata,
    serialize_audit_timeline_event,
    unarchive_document,
    validate_metadata,
)
from .file_validation import validate_uploaded_file
from .models import ConfiguracionSistema, Documento, Organizacion, SesionDocumental, document_file_upload_to
from .permissions import HasDocumentalPermission, IsAuthenticatedAndPasswordCurrent
from .reader_access import has_area_permission, has_document_permission
from .reader_views import ReaderAccessSerializer
from .reports_views import (
    ReportDownloadView,
    ReportGenerateView,
    ReportScheduleDetailView,
    ReportScheduleListView,
    build_pdf,
    build_xlsx,
    report_history,
    summarize_report,
)
from .notifications import create_notification
from .security_utils import sanitize_text
from .serializers import ChangePasswordSerializer, DocumentPermissionsSerializer, LoginSerializer, UserCreateSerializer
from .workflow_views import (
    ChecklistSerializer,
    ReviewCandidateListView,
    ReviewCommentSerializer,
    ReviewDocumentListView,
    SubmitReviewSerializer,
    VERSION_TRANSITIONS,
    ensure_checklist_editable,
    require_review_observation,
    reviewer_has_document_access,
    transition_version,
    validate_reviewer_ids,
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


class UserCreationTests(SimpleTestCase):
    @patch('documentos.management_views.AreaCatalogo.objects.filter')
    @patch('documentos.management_views.require_permission')
    def test_create_rejects_area_from_another_organization(self, require_permission, area_filter):
        organization_id = uuid4()
        area_id = uuid4()
        area_filter.return_value.exists.return_value = False
        request = SimpleNamespace(
            user=SimpleNamespace(id=uuid4(), organizacion_id=organization_id),
            data={
                'username': 'nuevo.usuario',
                'email': 'nuevo@example.com',
                'first_name': 'Nuevo',
                'last_name': 'Usuario',
                'organization_id': str(organization_id),
                'area_id': str(area_id),
                'temporary_password': 'TemporalSegura123!',
            },
        )

        response = UserListCreateView().post(request)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'INVALID_AREA')
        area_filter.assert_called_once_with(
            pk=area_id,
            organizacion_id=organization_id,
            activa=True,
        )

    @patch('documentos.management_views.RolDocumental.objects.filter')
    @patch('documentos.management_views.require_permission')
    def test_create_rejects_role_from_another_organization(self, require_permission, role_filter):
        organization_id = uuid4()
        valid_role_id = uuid4()
        foreign_role_id = uuid4()
        request = SimpleNamespace(
            user=SimpleNamespace(id=uuid4(), organizacion_id=organization_id),
            data={
                'username': 'nuevo.usuario',
                'email': 'nuevo@example.com',
                'first_name': 'Nuevo',
                'last_name': 'Usuario',
                'organization_id': str(organization_id),
                'temporary_password': 'TemporalSegura123!',
                'role_ids': [str(valid_role_id), str(foreign_role_id)],
            },
        )
        role_filter.return_value.values_list.return_value = [valid_role_id]

        response = UserListCreateView().post(request)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'INVALID_ROLE')
        role_filter.assert_called_once_with(
            id__in=[valid_role_id, foreign_role_id],
            organizacion_id=organization_id,
            activo=True,
        )

    @patch('documentos.management_views.AreaCatalogo.objects.filter')
    @patch('documentos.management_views.get_user_for_organization')
    @patch('documentos.management_views.require_permission')
    def test_update_rejects_area_from_another_organization(self, require_permission, get_user, area_filter):
        organization_id = uuid4()
        user_id = uuid4()
        area_id = uuid4()
        area_filter.return_value.exists.return_value = False
        get_user.return_value = SimpleNamespace(
            id=user_id,
            pk=user_id,
            organizacion_id=organization_id,
        )
        request = SimpleNamespace(
            user=SimpleNamespace(id=uuid4(), organizacion_id=organization_id),
            data={'area_id': str(area_id)},
        )

        response = UserDetailView().patch(request, user_id)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'INVALID_AREA')
        area_filter.assert_called_once_with(
            pk=area_id,
            organizacion_id=organization_id,
            activa=True,
        )


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


class DocumentAreaPermissionTests(SimpleTestCase):
    @patch('documentos.reader_access.get_user_roles', return_value=[{'code': 'EDITOR'}])
    def test_user_can_use_only_assigned_area(self, get_user_roles):
        area_id = uuid4()
        user = SimpleNamespace(id=uuid4(), area_id=area_id)

        self.assertTrue(has_area_permission(user, area_id))
        self.assertFalse(has_area_permission(user, uuid4()))
        self.assertEqual(get_user_roles.call_count, 2)

    @patch('documentos.reader_access.get_user_roles', return_value=[{'code': 'ADMINISTRADOR'}])
    def test_administrator_can_use_any_area(self, get_user_roles):
        user = SimpleNamespace(id=uuid4(), area_id=uuid4())

        self.assertTrue(has_area_permission(user, uuid4()))
        get_user_roles.assert_called_once_with(user.id)

    @patch('documentos.document_views.has_area_permission', return_value=False)
    def test_unauthorized_area_is_rejected(self, has_area_permission_mock):
        user = SimpleNamespace(id=uuid4())
        area_id = uuid4()

        with self.assertRaises(PermissionDenied) as context:
            ensure_area_authorized(user, area_id)

        self.assertEqual(context.exception.detail['code'], 'AREA_NOT_AUTHORIZED')
        has_area_permission_mock.assert_called_once_with(user, area_id)


class DocumentExportTests(SimpleTestCase):
    @patch('documentos.document_views.is_reader_user', return_value=False)
    @patch('documentos.document_views.record_auth_event')
    @patch('documentos.document_views.current_version')
    @patch('documentos.document_views.filter_accessible_documents')
    @patch('documentos.document_views.apply_document_filters')
    @patch('documentos.document_views.document_queryset')
    @patch('documentos.document_views.require_permission')
    def test_export_applies_access_filter_and_records_audit(
        self,
        require_permission,
        document_queryset,
        apply_filters,
        filter_accessible,
        current_version,
        record_event,
        is_reader_user,
    ):
        organization_id = uuid4()
        user_id = uuid4()
        document = SimpleNamespace(
            id=uuid4(),
            organizacion_id=organization_id,
            codigo='POL-001',
            nombre='Politica de calidad',
            tipo_documento=SimpleNamespace(nombre='Politica'),
            area=SimpleNamespace(nombre='Calidad'),
            creado_por=SimpleNamespace(nombres='Ana', apellidos='Perez'),
            actualizado_en=timezone.now(),
        )
        version = SimpleNamespace(estado_version=SimpleNamespace(nombre='Publicado'))
        queryset = MagicMock()
        document_queryset.return_value = queryset
        apply_filters.return_value = queryset
        filter_accessible.return_value = [document]
        current_version.return_value = version
        request = APIRequestFactory().get('/api/documents/export/?area_id=area-1')
        request.user = SimpleNamespace(id=user_id, organizacion_id=organization_id)
        request.auth = SimpleNamespace(id=uuid4())
        request.query_params = request.GET

        response = DocumentExportView().get(request)

        self.assertEqual(response.status_code, 200)
        self.assertIn('POL-001', response.content.decode())
        require_permission.assert_called_once_with(request, 'documentos.consultar')
        apply_filters.assert_called_once_with(queryset, request.query_params)
        filter_accessible.assert_called_once_with(request.user, queryset, 'documentos.consultar')
        record_event.assert_called_once()
        self.assertEqual(record_event.call_args.kwargs['action_code'], 'DOCUMENTO_EXPORTADO')
        self.assertEqual(record_event.call_args.kwargs['details']['document_count'], 1)


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


class ReportHistoryTests(SimpleTestCase):
    def setUp(self):
        self.organization_id = uuid4()
        self.user = SimpleNamespace(id=uuid4(), organizacion_id=self.organization_id)
        self.report_id = uuid4()
        self.filters = {'status_code': 'PUBLICADO'}
        self.report = SimpleNamespace(
            id=self.report_id,
            nombre='Reporte executive - 2026-08-28 12:00',
            alcance='executive',
            formato='PDF',
            filtros=self.filters,
            filas=1,
            clave_almacenamiento='reportes/organizacion/reporte.pdf',
            tamano_bytes=16,
            sha256=hashlib.sha256(b'inmutable-report').hexdigest(),
            creado_en=timezone.now(),
        )

    @patch('documentos.reports_views.ReporteGenerado.objects.filter')
    def test_personal_history_is_limited_to_the_generating_user(self, filter_reports):
        report_history(SimpleNamespace(user=self.user), 'editor')

        filter_reports.assert_called_once_with(
            organizacion_id=self.organization_id,
            alcance='editor',
            generado_por_id=self.user.id,
        )

    @patch('documentos.reports_views.record_report_event')
    @patch('documentos.reports_views.ReporteGenerado.objects.create')
    @patch('documentos.reports_views.build_report_data')
    @patch('documentos.reports_views.build_report_content')
    @patch('documentos.reports_views.default_storage')
    @patch('documentos.reports_views.require_report_access')
    def test_generation_persists_immutable_snapshot_and_metadata(
        self,
        require_access,
        storage,
        build_content,
        build_data,
        create_report,
        record_event,
    ):
        content = b'inmutable-report'
        storage.save.return_value = 'reportes/organizacion/reporte-generado.pdf'
        build_content.return_value = content
        build_data.return_value = {'rows': [{'id': str(uuid4())}]}
        create_report.return_value = self.report
        request = SimpleNamespace(
            data={'scope': 'executive', 'format': 'PDF', 'filters': self.filters},
            user=self.user,
            auth=SimpleNamespace(id=uuid4()),
        )

        response = ReportGenerateView().post(request)

        self.assertEqual(response.status_code, 201)
        created = create_report.call_args.kwargs
        self.assertEqual(created['organizacion_id'], self.organization_id)
        self.assertEqual(created['generado_por_id'], self.user.id)
        self.assertEqual(created['filtros'], self.filters)
        self.assertEqual(created['filas'], 1)
        self.assertEqual(created['clave_almacenamiento'], storage.save.return_value)
        self.assertEqual(created['tamano_bytes'], len(content))
        self.assertEqual(created['sha256'], hashlib.sha256(content).hexdigest())
        self.assertNotIn('contenido', created)
        self.assertEqual(response.data['report']['id'], str(self.report_id))
        storage.save.assert_called_once()
        require_access.assert_called_once_with(request, 'executive', generate=True)
        record_event.assert_called_once()

    @patch('documentos.reports_views.record_report_event')
    @patch('documentos.reports_views.report_binary_response')
    @patch('documentos.reports_views.build_report_data')
    @patch('documentos.reports_views.require_report_access')
    @patch('documentos.reports_views.default_storage')
    @patch('documentos.reports_views.ReporteGenerado.objects.filter')
    def test_download_uses_persisted_snapshot(
        self,
        filter_reports,
        storage,
        require_access,
        build_data,
        binary_response,
        record_event,
    ):
        filter_reports.return_value.first.return_value = self.report
        snapshot = b'inmutable-report'
        storage.open.return_value = BytesIO(snapshot)
        download_response = object()
        binary_response.return_value = download_response
        request = APIRequestFactory().get(f'/api/reports/{self.report_id}/download/')
        request.user = self.user
        request.auth = SimpleNamespace(id=uuid4())

        response = ReportDownloadView().get(request, self.report_id)

        self.assertIs(response, download_response)
        storage.open.assert_called_once_with(self.report.clave_almacenamiento, 'rb')
        binary_response.assert_called_once_with(snapshot, 'PDF')
        build_data.assert_not_called()
        require_access.assert_called_once_with(request, 'executive')
        record_event.assert_called_once()

    @patch('documentos.reports_views.ReporteGenerado.objects.filter')
    def test_personal_report_cannot_be_downloaded_by_another_user(self, filter_reports):
        self.report.alcance = 'editor'
        self.report.generado_por_id = uuid4()
        filter_reports.return_value.first.return_value = self.report
        request = APIRequestFactory().get(f'/api/reports/{self.report_id}/download/')
        request.user = self.user
        request.auth = SimpleNamespace(id=uuid4())

        response = ReportDownloadView().get(request, self.report_id)

        self.assertEqual(response.status_code, 404)

    @patch('documentos.reports_views.record_report_event')
    @patch('documentos.reports_views.report_binary_response')
    @patch('documentos.reports_views.require_report_access')
    @patch('documentos.reports_views.default_storage')
    @patch('documentos.reports_views.ReporteGenerado.objects.filter')
    def test_download_rejects_a_modified_snapshot(
        self,
        filter_reports,
        storage,
        require_access,
        binary_response,
        record_event,
    ):
        self.report.tamano_bytes = None
        filter_reports.return_value.first.return_value = self.report
        storage.open.return_value = BytesIO(b'contenido alterado')
        request = APIRequestFactory().get(f'/api/reports/{self.report_id}/download/')
        request.user = self.user
        request.auth = SimpleNamespace(id=uuid4())

        response = ReportDownloadView().get(request, self.report_id)

        self.assertEqual(response.status_code, 410)
        binary_response.assert_not_called()
        require_access.assert_called_once_with(request, 'executive')
        record_event.assert_not_called()

    @patch('documentos.reports_views.record_report_event')
    @patch('documentos.reports_views.report_response')
    @patch('documentos.reports_views.build_report_data')
    @patch('documentos.reports_views.require_report_access')
    @patch('documentos.reports_views.ReporteGenerado.objects.filter')
    def test_legacy_metadata_only_report_is_recalculated(
        self,
        filter_reports,
        require_access,
        build_data,
        report_response,
        record_event,
    ):
        self.report.clave_almacenamiento = None
        filter_reports.return_value.first.return_value = self.report
        current_data = {'scope': 'executive', 'filters': self.filters, 'rows': [{'id': str(uuid4())}]}
        download_response = object()
        build_data.return_value = current_data
        report_response.return_value = download_response
        request = APIRequestFactory().get(f'/api/reports/{self.report_id}/download/')
        request.user = self.user
        request.auth = SimpleNamespace(id=uuid4())

        response = ReportDownloadView().get(request, self.report_id)

        self.assertIs(response, download_response)
        build_data.assert_called_once_with(request, 'executive', self.filters)
        report_response.assert_called_once_with(current_data, 'PDF')
        require_access.assert_called_once_with(request, 'executive')
        record_event.assert_called_once()


class ScheduledReportTests(SimpleTestCase):
    def test_scheduled_report_persists_snapshot_and_advances_schedule(self):
        now = timezone.now()
        initial_next_run = now - timedelta(hours=1)
        schedule = SimpleNamespace(
            organizacion_id=uuid4(),
            creado_por_id=uuid4(),
            alcance='executive',
            formato='XLSX',
            nombre='Reporte ejecutivo diario',
            filtros={'area_id': str(uuid4())},
            frecuencia='daily',
            proxima_ejecucion_en=initial_next_run,
            save=MagicMock(),
        )
        user = SimpleNamespace(id=schedule.creado_por_id)
        report_data = {'rows': [{}, {}]}

        with (
            patch('documentos.management.commands.generar_reportes_programados.timezone.now', return_value=now),
            patch('documentos.management.commands.generar_reportes_programados.ProgramacionReporte.objects.filter', return_value=[schedule]),
            patch('documentos.management.commands.generar_reportes_programados.UsuarioDocumental.objects.get', return_value=user),
            patch('documentos.management.commands.generar_reportes_programados.build_report_data', return_value=report_data) as build_data,
            patch('documentos.management.commands.generar_reportes_programados.persist_report_snapshot') as persist_snapshot,
        ):
            GenerateScheduledReportsCommand().handle()

        persist_snapshot.assert_called_once_with(
            organization_id=schedule.organizacion_id,
            generated_by_id=schedule.creado_por_id,
            scope=schedule.alcance,
            report_format=schedule.formato,
            name=schedule.nombre,
            filters=schedule.filtros,
            data=report_data,
        )
        self.assertEqual(schedule.proxima_ejecucion_en, initial_next_run + timedelta(days=1))
        schedule.save.assert_called_once_with(update_fields=['proxima_ejecucion_en', 'actualizada_en'])
        self.assertEqual(build_data.call_args.args[1:], ('executive', schedule.filtros))
        self.assertEqual(build_data.call_args.args[0].user, user)


class ReportScheduleAuthorizationTests(SimpleTestCase):
    def setUp(self):
        self.organization_id = uuid4()
        self.user = SimpleNamespace(id=uuid4(), organizacion_id=self.organization_id)
        self.schedule = SimpleNamespace(
            id=uuid4(),
            organizacion_id=self.organization_id,
            creado_por_id=self.user.id,
            nombre='Reporte ejecutivo',
            alcance='executive',
            formato='PDF',
            frecuencia='monthly',
            filtros={},
            proxima_ejecucion_en=timezone.now(),
            activa=True,
            save=MagicMock(),
        )

    def request(self, data=None, scope='executive'):
        return SimpleNamespace(
            user=self.user,
            auth=SimpleNamespace(id=uuid4()),
            data=data or {},
            query_params={'scope': scope},
        )

    def test_creator_list_is_limited_to_own_schedules(self):
        with (
            patch('documentos.reports_views.require_report_access'),
            patch('documentos.reports_views.get_user_roles', return_value=[]),
            patch('documentos.reports_views.ProgramacionReporte.objects.filter', return_value=[]) as filter_schedules,
            patch('documentos.reports_views.record_report_event'),
        ):
            response = ReportScheduleListView().get(self.request(scope='editor'))

        self.assertEqual(response.status_code, 200)
        filter_schedules.assert_called_once_with(
            organizacion_id=self.organization_id,
            alcance='editor',
            activa=True,
            creado_por_id=self.user.id,
        )

    def test_administrator_can_list_all_organization_schedules(self):
        with (
            patch('documentos.reports_views.require_report_access'),
            patch('documentos.reports_views.get_user_roles', return_value=[{'code': 'ADMINISTRADOR'}]),
            patch('documentos.reports_views.ProgramacionReporte.objects.filter', return_value=[]) as filter_schedules,
            patch('documentos.reports_views.record_report_event'),
        ):
            response = ReportScheduleListView().get(self.request())

        self.assertEqual(response.status_code, 200)
        filter_schedules.assert_called_once_with(
            organizacion_id=self.organization_id,
            alcance='executive',
            activa=True,
        )

    def test_creator_can_modify_own_schedule(self):
        with (
            patch('documentos.reports_views.require_report_access'),
            patch('documentos.reports_views.get_user_roles', return_value=[]),
            patch('documentos.reports_views.ProgramacionReporte.objects.filter', return_value=MagicMock(first=MagicMock(return_value=self.schedule))),
            patch('documentos.reports_views.record_report_event'),
        ):
            response = ReportScheduleDetailView().patch(self.request({'active': False}), self.schedule.id)

        self.assertEqual(response.status_code, 200)
        self.assertFalse(self.schedule.activa)
        self.schedule.save.assert_called_once_with(update_fields=['activa', 'proxima_ejecucion_en', 'actualizada_en'])

    def test_non_creator_cannot_modify_or_cancel_schedule(self):
        self.schedule.creado_por_id = uuid4()
        filter_result = MagicMock(first=MagicMock(return_value=self.schedule))
        with (
            patch('documentos.reports_views.get_user_roles', return_value=[]),
            patch('documentos.reports_views.ProgramacionReporte.objects.filter', return_value=filter_result),
            patch('documentos.reports_views.require_report_access') as require_access,
            patch('documentos.reports_views.record_report_event') as record_event,
        ):
            patch_response = ReportScheduleDetailView().patch(self.request({'active': False}), self.schedule.id)
            delete_response = ReportScheduleDetailView().delete(self.request(), self.schedule.id)

        self.assertEqual(patch_response.status_code, 404)
        self.assertEqual(delete_response.status_code, 404)
        self.assertTrue(self.schedule.activa)
        self.schedule.save.assert_not_called()
        require_access.assert_not_called()
        record_event.assert_not_called()

    def test_administrator_can_modify_another_users_schedule(self):
        self.schedule.creado_por_id = uuid4()
        filter_result = MagicMock(first=MagicMock(return_value=self.schedule))
        with (
            patch('documentos.reports_views.get_user_roles', return_value=[{'code': 'ADMINISTRADOR'}]),
            patch('documentos.reports_views.ProgramacionReporte.objects.filter', return_value=filter_result),
            patch('documentos.reports_views.require_report_access'),
            patch('documentos.reports_views.record_report_event'),
        ):
            response = ReportScheduleDetailView().patch(self.request({'active': False}), self.schedule.id)

        self.assertEqual(response.status_code, 200)
        self.assertFalse(self.schedule.activa)
        self.schedule.save.assert_called_once_with(update_fields=['activa', 'proxima_ejecucion_en', 'actualizada_en'])


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


class BackupSnapshotTests(SimpleTestCase):
    def setUp(self):
        self.organization_id = uuid4()

    def test_relational_table_scope_follows_document_organization(self):
        clause, params = table_scope_clause(
            'documentos_metadatos',
            {
                'documentos_metadatos': {'id', 'documento_id'},
                'documentos': {'id', 'organizacion_id'},
            },
            self.organization_id,
        )

        self.assertIn('EXISTS', clause)
        self.assertIn('documentos', clause)
        self.assertEqual(params, [self.organization_id])

    def test_unknown_table_fails_closed(self):
        with self.assertRaisesMessage(BackupExecutionError, 'No existe una regla de aislamiento'):
            table_scope_clause('tabla_no_registrada', {'tabla_no_registrada': {'id'}}, self.organization_id)

    def test_relational_scope_requires_all_non_null_relations(self):
        clause, params = table_scope_clause(
            'documentos_favoritos',
            {
                'documentos_favoritos': {'documento_id', 'usuario_id'},
                'documentos': {'id', 'organizacion_id'},
                'usuarios': {'id', 'organizacion_id'},
            },
            self.organization_id,
        )

        self.assertIn(' AND ', clause)
        self.assertIn('IS NULL', clause)
        self.assertEqual(params, [self.organization_id, self.organization_id])

    def test_postgres_snapshot_uses_repeatable_read_transaction(self):
        cursor = MagicMock()
        cursor.__enter__.return_value = cursor
        connection = SimpleNamespace(vendor='postgresql', cursor=MagicMock(return_value=cursor))
        with (
            patch('documentos.backup_service.connection', connection),
            patch('documentos.backup_service.transaction.atomic', return_value=nullcontext()),
        ):
            with database_snapshot_transaction() as metadata:
                self.assertEqual(metadata['isolation_level'], 'REPEATABLE READ')
                self.assertTrue(metadata['read_only'])

        cursor.execute.assert_called_once_with('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')

    @override_settings(SECRET_KEY='backup-snapshot-secret')
    def test_backup_archive_contains_reconstruction_artifacts(self):
        database = {
            'schema': 'gestion_documental',
            'organization_id': str(self.organization_id),
            'snapshot': {'isolation_level': 'REPEATABLE READ', 'read_only': True},
            'table_load_order': ['organizaciones'],
            'sequences': [{'sequence_name': 'example_id_seq', 'last_value': 4}],
            'tables': [{'name': 'organizaciones', 'columns': ['id'], 'rows': [{'id': str(self.organization_id)}]}],
        }
        schema = {'name': 'gestion_documental', 'tables': [{'name': 'organizaciones'}], 'constraints': []}
        metadata = {'isolation_level': 'REPEATABLE READ', 'read_only': True}
        with (
            patch('documentos.backup_service.database_snapshot_transaction', return_value=nullcontext(metadata)),
            patch('documentos.backup_service._build_database_snapshot', return_value=(database, 1, schema, database['sequences'])),
            patch('documentos.backup_service.build_storage_snapshot', return_value=([], [])),
        ):
            payload, stats = build_backup_archive(self.organization_id)

        with ZipFile(BytesIO(decrypt_archive(payload))) as archive:
            names = set(archive.namelist())
            manifest = json.loads(archive.read('manifest.json'))
            reconstruction = json.loads(archive.read('reconstruction.json'))

        self.assertTrue({'database.json', 'schema.json', 'sequences.json', 'reconstruction.json', 'RECONSTRUCCION.md'}.issubset(names))
        self.assertEqual(manifest['format'], BACKUP_FORMAT)
        self.assertEqual(manifest['database_records'], 1)
        self.assertEqual(reconstruction['organization_id'], str(self.organization_id))
        self.assertEqual(stats['schema_tables'], 1)
        self.assertEqual(stats['sequences'], 1)

    def test_storage_snapshot_rejects_changed_file_content(self):
        item = SimpleNamespace(
            id=uuid4(),
            documento_id=uuid4(),
            clave_almacenamiento='documentos/file.pdf',
            nombre_archivo_original='file.pdf',
            tamano_bytes=4,
            sha256=hashlib.sha256(b'good').hexdigest(),
            tipo_mime='application/pdf',
        )
        queryset = MagicMock()
        queryset.only.return_value = queryset
        queryset.iterator.return_value = [item]
        with (
            patch('documentos.backup_service.ArchivoDocumento.objects.filter', return_value=queryset),
            patch('documentos.backup_service.default_storage.exists', return_value=True),
            patch('documentos.backup_service.default_storage.open', return_value=BytesIO(b'bad!')),
            ZipFile(BytesIO(), 'w') as archive,
        ):
            with self.assertRaisesMessage(BackupExecutionError, 'suma de comprobacion'):
                build_storage_snapshot(self.organization_id, archive)

    @override_settings(SECRET_KEY='backup-snapshot-secret')
    def test_v2_archive_requires_reconstruction_artifacts(self):
        archive_buffer = BytesIO()
        with ZipFile(archive_buffer, 'w') as archive:
            archive.writestr(
                'manifest.json',
                json.dumps({'format': BACKUP_FORMAT, 'organization_id': str(self.organization_id)}),
            )
        payload = encrypt_archive(archive_buffer.getvalue())
        backup = SimpleNamespace(
            clave_almacenamiento='respaldos/test.sdbk',
            sha256=hashlib.sha256(payload).hexdigest(),
        )
        with patch('documentos.backup_service.default_storage.open', return_value=BytesIO(payload)):
            with self.assertRaisesMessage(BackupExecutionError, 'artefactos de reconstruccion'):
                load_backup_archive(backup)

    def test_verification_does_not_mark_backup_as_restored(self):
        archive = MagicMock()
        archive.read.return_value = json.dumps({'tables': []}).encode('utf-8')
        archive.close.return_value = None
        manifest = {
            'format': 'sistema-documental-backup-v1',
            'organization_id': str(self.organization_id),
            'database_records': 0,
            'files': [],
            'missing_files': [],
            'complete': True,
        }
        backup = SimpleNamespace(restaurado_en=None, save=MagicMock())
        with patch('documentos.backup_service.load_backup_archive', return_value=(archive, manifest)):
            result = verify_backup(backup)

        self.assertTrue(result['valid'])
        self.assertIsNone(backup.restaurado_en)
        backup.save.assert_not_called()

    def test_restore_files_replaces_corrupt_existing_content(self):
        content = b'restored-content'
        archive = MagicMock()
        archive.read.return_value = content
        manifest = {
            'format': 'sistema-documental-backup-v1',
            'files': [{
                'archive_path': 'files/file-id/file.pdf',
                'storage_key': 'documentos/file.pdf',
                'name': 'file.pdf',
                'size': len(content),
                'sha256': hashlib.sha256(content).hexdigest(),
            }],
        }
        with (
            patch('documentos.backup_service.default_storage.exists', return_value=True),
            patch('documentos.backup_service.default_storage.open', return_value=BytesIO(b'corrupt-content')),
            patch('documentos.backup_service.default_storage.delete') as delete,
            patch('documentos.backup_service.default_storage.save', return_value='documentos/file.pdf') as save,
        ):
            result = restore_storage_snapshot(archive, manifest)

        self.assertEqual(result['files_replaced'], 1)
        self.assertEqual(result['files_restored'], 0)
        delete.assert_called_once_with('documentos/file.pdf')
        save.assert_called_once()

    def test_restore_rejects_relational_rows_with_another_organization(self):
        other_organization_id = uuid4()
        schema = {
            'name': BACKUP_SCHEMA,
            'tables': [
                {
                    'name': 'organizaciones',
                    'columns': [{'column_name': 'id'}],
                },
                {
                    'name': 'usuarios',
                    'columns': [{'column_name': 'id'}, {'column_name': 'organizacion_id'}],
                },
                {
                    'name': 'documentos',
                    'columns': [{'column_name': 'id'}, {'column_name': 'organizacion_id'}],
                },
                {
                    'name': 'documentos_favoritos',
                    'columns': [
                        {'column_name': 'id'},
                        {'column_name': 'documento_id'},
                        {'column_name': 'usuario_id'},
                    ],
                },
            ],
            'constraints': [
                {'table_name': table_name, 'constraint_type': 'PRIMARY KEY', 'constraint_columns': ['id']}
                for table_name in ('organizaciones', 'usuarios', 'documentos', 'documentos_favoritos')
            ] + [
                {
                    'table_name': 'documentos_favoritos',
                    'constraint_type': 'FOREIGN KEY',
                    'constraint_columns': ['documento_id'],
                    'foreign_table_name': 'documentos',
                    'foreign_columns': ['id'],
                },
                {
                    'table_name': 'documentos_favoritos',
                    'constraint_type': 'FOREIGN KEY',
                    'constraint_columns': ['usuario_id'],
                    'foreign_table_name': 'usuarios',
                    'foreign_columns': ['id'],
                },
            ],
        }
        database = {
            'schema': BACKUP_SCHEMA,
            'organization_id': str(self.organization_id),
            'tables': [
                {'name': 'organizaciones', 'columns': ['id'], 'rows': [{'id': str(self.organization_id)}]},
                {'name': 'usuarios', 'columns': ['id', 'organizacion_id'], 'rows': [{
                    'id': str(uuid4()),
                    'organizacion_id': str(other_organization_id),
                }]},
                {'name': 'documentos', 'columns': ['id', 'organizacion_id'], 'rows': []},
                {'name': 'documentos_favoritos', 'columns': ['id', 'documento_id', 'usuario_id'], 'rows': []},
            ],
        }

        with self.assertRaisesMessage(BackupExecutionError, 'otra organizacion'):
            validate_database_snapshot(database, schema, self.organization_id)

    def test_restore_database_upserts_rows_in_transaction(self):
        database = {
            'schema': BACKUP_SCHEMA,
            'organization_id': str(self.organization_id),
            'tables': [{
                'name': 'organizaciones',
                'columns': ['id', 'nombre'],
                'rows': [{'id': str(self.organization_id), 'nombre': 'Restaurada'}],
            }],
        }
        schema = {
            'name': BACKUP_SCHEMA,
            'tables': [{
                'name': 'organizaciones',
                'columns': [
                    {'column_name': 'id', 'data_type': 'uuid'},
                    {'column_name': 'nombre', 'data_type': 'text'},
                ],
            }],
            'constraints': [{
                'table_name': 'organizaciones',
                'constraint_type': 'PRIMARY KEY',
                'constraint_columns': ['id'],
            }],
        }
        cursor = MagicMock()
        cursor.__enter__.return_value = cursor
        fake_connection = SimpleNamespace(vendor='sqlite', ops=django_connection.ops, cursor=MagicMock(return_value=cursor))
        with (
            patch('documentos.backup_service.database_table_names', return_value=['organizaciones']),
            patch('documentos.backup_service.database_schema_snapshot', return_value=(schema, {'organizaciones': {'id', 'nombre'}})),
            patch('documentos.backup_service.connection', fake_connection),
            patch('documentos.backup_service.transaction.atomic', return_value=nullcontext()),
        ):
            result = restore_database_snapshot(database, schema, [], self.organization_id)

        self.assertEqual(result['database_strategy'], 'upsert')
        self.assertEqual(result['database_rows_restored'], 1)
        self.assertIn('ON CONFLICT', cursor.execute.call_args.args[0])

    def test_restore_backup_restores_database_and_files(self):
        archive = MagicMock()
        archive.close.return_value = None
        manifest = {
            'format': BACKUP_FORMAT,
            'organization_id': str(self.organization_id),
            'database_records': 2,
            'files': [],
            'missing_files': [],
            'complete': True,
        }
        backup = SimpleNamespace(restaurado_en=None, save=MagicMock())
        database_stats = {
            'database_strategy': 'upsert',
            'database_tables_restored': 2,
            'database_rows_restored': 2,
            'database_tables_skipped': [],
            'sequences_advanced': 1,
        }
        file_stats = {
            'files_verified': 0,
            'files_restored': 0,
            'files_replaced': 1,
            'files_skipped': 0,
        }
        with (
            patch('documentos.backup_service.load_backup_archive', return_value=(archive, manifest)),
            patch('documentos.backup_service._read_v2_artifacts', return_value=({}, {}, [], {})),
            patch('documentos.backup_service.validate_database_snapshot'),
            patch('documentos.backup_service.database_restore_transaction', return_value=nullcontext()),
            patch('documentos.backup_service._restore_database_snapshot_in_transaction', return_value=database_stats),
            patch('documentos.backup_service.restore_storage_snapshot', return_value=file_stats),
        ):
            result = restore_backup(backup)

        self.assertEqual(result['mode'], 'restore')
        self.assertEqual(result['database_rows_restored'], 2)
        self.assertEqual(result['files_replaced'], 1)
        backup.save.assert_called_once_with(update_fields=['restaurado_en'])


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


class TimelineTests(SimpleTestCase):
    def test_serializes_documental_audit_event_with_version_and_comment(self):
        version_id = uuid4()
        event = serialize_audit_timeline_event({
            'id': 17,
            'event_at': timezone.now(),
            'user_id': uuid4(),
            'username': 'ana.revisor',
            'user_name': 'Ana Revisora',
            'action_code': 'REVISION_DEVUELTA',
            'action': 'Revision devuelta',
            'resource_code': 'ARCHIVO',
            'resource_id': version_id,
            'successful': True,
            'result': 'Operacion documental correcta',
            'details': {'comment': 'Falta actualizar el anexo.'},
            'version_id': version_id,
            'numero_mayor': 2,
            'numero_menor': 1,
            'is_current': False,
            'status_id': 3,
            'status_code': 'BORRADOR',
            'status_name': 'Borrador',
        })

        self.assertEqual(event['type'], 'review_returned')
        self.assertEqual(event['version'], '2.1')
        self.assertEqual(event['comment'], 'Falta actualizar el anexo.')
        self.assertEqual(event['action']['code'], 'REVISION_DEVUELTA')

    def test_serializes_restoration_event_without_version(self):
        event = serialize_audit_timeline_event({
            'id': 18,
            'event_at': timezone.now(),
            'user_id': uuid4(),
            'username': 'admin',
            'user_name': 'Administrador',
            'action_code': 'DOCUMENTO_RESTAURADO',
            'action': 'Documento restaurado',
            'resource_code': 'DOCUMENTO',
            'resource_id': uuid4(),
            'successful': True,
            'result': 'Operacion documental correcta',
            'details': {'reason': 'Reincorporacion solicitada'},
            'version_id': None,
            'numero_mayor': None,
            'numero_menor': None,
            'is_current': None,
            'status_id': None,
            'status_code': None,
            'status_name': None,
        })

        self.assertEqual(event['type'], 'document_restored')
        self.assertIsNone(event['version'])
        self.assertEqual(event['comment'], 'Reincorporacion solicitada')


class VersionRestoreTests(SimpleTestCase):
    def test_restore_serializer_sanitizes_comment(self):
        serializer = VersionRestoreSerializer(data={'comment': '<p>Volver a la version aprobada.</p>'})

        self.assertTrue(serializer.is_valid())
        self.assertEqual(serializer.validated_data['comment'], 'Volver a la version aprobada.')

    def test_version_numbers_increment_minor_by_default(self):
        latest = SimpleNamespace(numero_mayor=1, numero_menor=2)

        self.assertEqual(next_version_numbers(None), (1, 0))
        self.assertEqual(next_version_numbers(latest), (1, 3))

    def test_version_numbers_increment_major_and_reset_minor(self):
        latest = SimpleNamespace(numero_mayor=1, numero_menor=2)

        self.assertEqual(next_version_numbers(latest, 'major'), (2, 0))

    def test_version_restore_serializer_rejects_unknown_version_type(self):
        serializer = VersionRestoreSerializer(data={'version_type': 'patch'})

        self.assertFalse(serializer.is_valid())
        self.assertIn('version_type', serializer.errors)

    def test_upload_from_approved_version_creates_a_new_draft(self):
        document = SimpleNamespace(
            id=uuid4(),
            organizacion_id=uuid4(),
            archivos=MagicMock(),
        )
        document.archivos.select_for_update.return_value.order_by.return_value.first.return_value = SimpleNamespace(
            numero_mayor=1,
            numero_menor=0,
            orden_version=2,
            estado_version=SimpleNamespace(codigo='APROBADO'),
        )
        draft_state = SimpleNamespace(id=10, codigo='BORRADOR')
        provider = SimpleNamespace(id=20)
        created_version = SimpleNamespace(id=uuid4())
        uploaded_file = SimpleNamespace()

        with patch('documentos.document_views.validate_uploaded_file', return_value={
            'name': 'nuevo.pdf',
            'mime_type': 'application/pdf',
            'size': 10,
            'sha256': 'a' * 64,
        }), patch('documentos.document_views.ProveedorAlmacenamiento.objects.filter') as providers, patch(
            'documentos.document_views.EstadoVersionCatalogo.objects.filter',
        ) as states, patch('documentos.document_views.default_storage') as storage, patch(
            'documentos.document_views.ArchivoDocumento.objects.create',
            return_value=created_version,
        ) as create_version, patch('documentos.document_views.HistorialEstadoVersion.objects.create'), patch(
            'documentos.document_views.transaction.atomic',
        ):
            providers.return_value.order_by.return_value.first.return_value = provider
            states.return_value.first.return_value = draft_state
            storage.save.return_value = 'documentos/nuevo.pdf'

            result = save_document_file(document, uploaded_file, SimpleNamespace(id=uuid4()))

        self.assertIs(result, created_version)
        self.assertIs(create_version.call_args.kwargs['estado_version'], draft_state)
        self.assertTrue(create_version.call_args.kwargs['es_vigente'])

    def test_metadata_save_is_blocked_for_approved_version(self):
        document = SimpleNamespace(id=uuid4())
        version = SimpleNamespace(estado_version=SimpleNamespace(codigo='APROBADO'))

        with patch('documentos.document_views.current_version', return_value=version):
            with self.assertRaises(ValidationError) as error:
                save_metadata(document, {'clasificacion': 'interna'})

        self.assertEqual(error.exception.detail['code'], 'DOCUMENT_VERSION_LOCKED')

    @patch('documentos.document_views.transaction.atomic')
    @patch('documentos.document_views.record_document_event')
    @patch('documentos.document_views.serialize_version')
    @patch('documentos.document_views.HistorialEstadoVersion.objects.create')
    @patch('documentos.document_views.ArchivoDocumento.objects.create')
    @patch('documentos.document_views.EstadoVersionCatalogo.objects.get')
    @patch('documentos.document_views.default_storage')
    @patch('documentos.document_views.open_stored_file')
    @patch('documentos.document_views.get_document_version_or_404')
    @patch('documentos.document_views.require_permission')
    def test_restore_creates_new_version_and_preserves_source(
        self,
        require_permission,
        get_version,
        open_file,
        storage,
        get_state,
        create_version,
        create_history,
        serialize_version_mock,
        record_event,
        atomic_mock,
    ):
        document_id = uuid4()
        source_id = uuid4()
        document = SimpleNamespace(id=document_id, organizacion_id=uuid4(), archivos=MagicMock())
        source_state = SimpleNamespace(id=1, codigo='PUBLICADO', nombre='Publicado')
        draft_state = SimpleNamespace(id=2, codigo='BORRADOR', nombre='Borrador')
        provider = SimpleNamespace(id=uuid4())
        source = SimpleNamespace(
            id=source_id,
            es_vigente=False,
            numero_mayor=1,
            numero_menor=1,
            orden_version=2,
            nombre_archivo_original='politica.pdf',
            proveedor_almacenamiento=provider,
            tipo_mime='application/pdf',
            tamano_bytes=25,
            sha256='a' * 64,
            estado_version=source_state,
        )
        latest = SimpleNamespace(id=uuid4(), numero_mayor=1, numero_menor=2, orden_version=3)
        restored = SimpleNamespace(
            id=uuid4(),
            estado_version=draft_state,
            numero_mayor=1,
            numero_menor=3,
            orden_version=4,
        )
        document.archivos.select_for_update.return_value.order_by.return_value.first.return_value = latest
        get_version.return_value = (document, source)
        open_file.return_value = BytesIO(b'%PDF-1.7 restored')
        storage.save.return_value = 'org/doc/restored.pdf'
        get_state.return_value = draft_state
        create_version.return_value = restored
        serialize_version_mock.side_effect = [{'id': 'restored'}, {'id': 'source'}]
        atomic_mock.return_value.__enter__.return_value = None
        request = APIRequestFactory().post('/api/documents/restore/', {'comment': 'Version aprobada'}, format='json')
        request.data = {'comment': 'Version aprobada'}
        request.user = SimpleNamespace(id=uuid4())
        request.auth = None

        response = DocumentVersionRestoreView().post(request, document_id, source_id)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['version'], {'id': 'restored'})
        self.assertEqual(response.data['restored_from'], {'id': 'source'})
        document.archivos.filter.assert_called_once_with(es_vigente=True)
        document.archivos.filter.return_value.update.assert_called_once_with(es_vigente=False)
        create_version.assert_called_once()
        created = create_version.call_args.kwargs
        self.assertEqual(created['documento'], document)
        self.assertEqual(created['proveedor_almacenamiento'], provider)
        self.assertEqual(created['numero_mayor'], 1)
        self.assertEqual(created['numero_menor'], 3)
        self.assertEqual(created['orden_version'], 4)
        self.assertEqual(created['sha256'], source.sha256)
        self.assertEqual(created['comentario_cambio'], 'Version aprobada')
        create_history.assert_called_once()
        record_event.assert_called_once()
        self.assertEqual(record_event.call_args.args[2], 'VERSION_RESTAURADA')
        self.assertEqual(record_event.call_args.kwargs['resource_id'], restored.id)
        self.assertEqual(record_event.call_args.kwargs['details']['source_version_id'], str(source.id))

    @patch('documentos.document_views.get_document_version_or_404')
    @patch('documentos.document_views.require_permission')
    def test_restore_rejects_current_version(self, require_permission, get_version):
        source = SimpleNamespace(es_vigente=True)
        get_version.return_value = (SimpleNamespace(), source)
        request = APIRequestFactory().post('/api/documents/restore/', {}, format='json')
        request.data = {}
        request.user = SimpleNamespace(id=uuid4())

        response = DocumentVersionRestoreView().post(request, uuid4(), uuid4())

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data['code'], 'VERSION_ALREADY_CURRENT')


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

    @patch('documentos.workflow_views.require_permission')
    @patch('documentos.workflow_views.get_user_roles')
    @patch('documentos.workflow_views.UsuarioDocumental.objects.filter')
    def test_review_candidates_include_only_active_review_roles(self, user_filter, get_roles, require_permission):
        organization_id = uuid4()
        reviewer = SimpleNamespace(
            id=uuid4(),
            nombre_usuario='revisor.activo',
            nombres='Revisor',
            apellidos='Activo',
        )
        editor = SimpleNamespace(
            id=uuid4(),
            nombre_usuario='editor.activo',
            nombres='Editor',
            apellidos='Activo',
        )
        query = MagicMock()
        query.order_by.return_value = [reviewer, editor]
        user_filter.return_value = query
        get_roles.side_effect = [[{'code': 'REVISOR'}], [{'code': 'EDITOR'}]]
        request = SimpleNamespace(user=SimpleNamespace(organizacion_id=organization_id))

        response = ReviewCandidateListView().get(request)

        self.assertEqual(response.data['reviewers'], [{
            'id': str(reviewer.id),
            'username': reviewer.nombre_usuario,
            'name': 'Revisor Activo',
        }])
        user_filter.assert_called_once_with(organizacion_id=organization_id, activo=True)
        require_permission.assert_called_once_with(request, 'revisiones.enviar')

    @patch('documentos.workflow_views.serialize_review', return_value={'id': 'review-1'})
    @patch('documentos.workflow_views.is_admin', return_value=False)
    @patch('documentos.workflow_views.get_document_or_404')
    @patch('documentos.workflow_views.require_permission')
    @patch('documentos.workflow_views.SolicitudRevision.objects')
    def test_document_reviews_return_only_reviews_requested_by_editor(self, review_objects, require_permission, get_document, is_admin_mock, serialize_review):
        organization_id = uuid4()
        editor = SimpleNamespace(id=uuid4(), organizacion_id=organization_id)
        document = SimpleNamespace(id=uuid4())
        review = SimpleNamespace(id=uuid4())
        query = MagicMock()
        query.filter.return_value = query
        ordered_query = MagicMock()
        ordered_query.count.return_value = 1
        ordered_query.__iter__.return_value = iter([review])
        query.prefetch_related.return_value.order_by.return_value = ordered_query
        review_objects.select_related.return_value.filter.return_value = query
        get_document.return_value = document
        request = SimpleNamespace(user=editor)
        document_id = uuid4()

        response = ReviewDocumentListView().get(request, document_id)

        self.assertEqual(response.data, {'count': 1, 'reviews': [{'id': 'review-1'}]})
        get_document.assert_called_once_with(request, document_id)
        query.filter.assert_called_once_with(solicitada_por=editor)
        require_permission.assert_called_once_with(request, 'revisiones.enviar')
        is_admin_mock.assert_called_once_with(editor)
        serialize_review.assert_called_once_with(review)

    @patch('documentos.workflow_views.record_access_denied')
    def test_checklist_requires_assigned_reviewer(self, record_access_denied_mock):
        reviewer = SimpleNamespace(id=uuid4())
        review = SimpleNamespace(
            revisor_id=uuid4(),
            estado_revision=SimpleNamespace(codigo='PENDIENTE'),
        )

        with self.assertRaises(PermissionDenied) as context:
            ensure_checklist_editable(SimpleNamespace(user=reviewer), review)

        self.assertEqual(context.exception.detail['code'], 'REVIEWER_NOT_ASSIGNED')
        record_access_denied_mock.assert_called_once()

    def test_checklist_is_locked_after_review_resolution(self):
        reviewer = SimpleNamespace(id=uuid4())
        review = SimpleNamespace(
            revisor_id=reviewer.id,
            estado_revision=SimpleNamespace(codigo='APROBADA'),
        )

        with self.assertRaises(ValidationError) as context:
            ensure_checklist_editable(SimpleNamespace(user=reviewer), review)

        self.assertEqual(context.exception.detail['code'], 'REVIEW_ALREADY_RESOLVED')

    def test_return_and_reject_require_an_observation(self):
        for action in ('return', 'reject'):
            with self.subTest(action=action):
                with self.assertRaises(ValidationError) as context:
                    require_review_observation(action, '')

                self.assertIn('comment', context.exception.detail)

    def test_approval_does_not_require_an_observation(self):
        self.assertIsNone(require_review_observation('approve', ''))

    @patch('documentos.workflow_views.has_document_permission', return_value=True)
    @patch('documentos.workflow_views.has_area_permission', return_value=False)
    def test_reviewer_can_access_document_through_explicit_permission(self, has_area, has_document):
        reviewer = SimpleNamespace(id=uuid4(), nombre_usuario='revisor.documento')
        document = SimpleNamespace(id=uuid4(), area_id=uuid4())

        self.assertTrue(reviewer_has_document_access(reviewer, document))
        has_area.assert_called_once_with(reviewer, document.area_id)
        has_document.assert_called_once_with(reviewer, document.id, 'revisiones.consultar')

    @patch('documentos.workflow_views.has_document_permission', return_value=False)
    @patch('documentos.workflow_views.has_area_permission', return_value=False)
    def test_reviewer_without_area_or_document_access_is_rejected(self, has_area, has_document):
        reviewer_id = uuid4()
        reviewer = SimpleNamespace(id=reviewer_id, nombre_usuario='revisor.aislado')
        document = SimpleNamespace(id=uuid4(), area_id=uuid4())
        with patch('documentos.workflow_views.UsuarioDocumental.objects.filter', return_value=[reviewer]), patch(
            'documentos.workflow_views.get_user_roles',
            return_value=[{'code': 'REVISOR'}],
        ):
            with self.assertRaises(ValidationError) as context:
                validate_reviewer_ids([reviewer_id], uuid4(), document)

        self.assertIn('no tiene acceso', str(context.exception.detail['reviewer_ids']))
        self.assertEqual(has_document.call_count, 2)

    @patch('documentos.workflow_views.has_document_permission', return_value=False)
    @patch('documentos.workflow_views.has_area_permission', return_value=True)
    def test_reviewer_with_area_access_is_accepted(self, has_area, has_document):
        reviewer_id = uuid4()
        reviewer = SimpleNamespace(id=reviewer_id, nombre_usuario='revisor.area')
        document = SimpleNamespace(id=uuid4(), area_id=uuid4())
        with patch('documentos.workflow_views.UsuarioDocumental.objects.filter', return_value=[reviewer]), patch(
            'documentos.workflow_views.get_user_roles',
            return_value=[{'code': 'REVISOR'}],
        ):
            result = validate_reviewer_ids([reviewer_id], uuid4(), document)

        self.assertEqual(result, [reviewer])
        has_document.assert_not_called()

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
    @patch('documentos.authentication.record_auth_event')
    @patch('documentos.authentication.security_policy_for', return_value={'inactivity_minutes': 30})
    @patch('documentos.authentication.timezone.now')
    @patch('documentos.authentication.SesionDocumental.objects')
    def test_authentication_revokes_inactive_session(
        self,
        session_manager,
        now_mock,
        security_policy,
        record_event,
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
        record_event.assert_called_once()
        self.assertEqual(record_event.call_args.kwargs['action_code'], 'SESION_INVALIDA')
        self.assertFalse(record_event.call_args.kwargs['successful'])

    @patch('documentos.authentication.record_auth_event')
    @patch('documentos.authentication.SesionDocumental.objects')
    def test_authentication_records_revoked_session(self, session_manager, record_event):
        user = SimpleNamespace(id=uuid4(), organizacion_id=uuid4(), activo=True)
        session = SimpleNamespace(
            id=uuid4(),
            pk=uuid4(),
            usuario=user,
            motivo_revocacion='Cierre de sesion',
        )
        session.pk = session.id
        session_manager.select_related.return_value.get.side_effect = [
            SesionDocumental.DoesNotExist,
            session,
        ]
        request = APIRequestFactory().get('/api/auth/me/')
        request.COOKIES['sd_session'] = 'revoked-session-token'

        with self.assertRaises(AuthenticationFailed):
            CookieTokenAuthentication().authenticate(request)

        record_event.assert_called_once()
        self.assertEqual(record_event.call_args.kwargs['action_code'], 'SESION_INVALIDA')
        self.assertEqual(record_event.call_args.kwargs['result'], 'Sesión revocada')

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


class DocumentEditingTests(SimpleTestCase):
    def test_direct_edit_is_blocked_for_review_approved_and_published_versions(self):
        document = SimpleNamespace(id=uuid4())
        for state_code in ('EN_REVISION', 'APROBADO', 'PUBLICADO'):
            with self.subTest(state_code=state_code):
                version = SimpleNamespace(estado_version=SimpleNamespace(codigo=state_code))
                with patch('documentos.document_views.current_version', return_value=version):
                    with self.assertRaises(ValidationError) as error:
                        ensure_document_directly_editable(document)

                self.assertEqual(error.exception.detail['code'], 'DOCUMENT_VERSION_LOCKED')

    def test_direct_edit_is_allowed_without_a_locked_current_version(self):
        document = SimpleNamespace(id=uuid4())
        with patch('documentos.document_views.current_version', return_value=None):
            self.assertIsNone(ensure_document_directly_editable(document))


class DocumentLifecycleTests(SimpleTestCase):
    @patch('documentos.document_views.record_document_event')
    @patch('documentos.document_views.get_document_or_404')
    @patch('documentos.document_views.require_permission')
    @patch('documentos.document_views.timezone.now')
    def test_delete_archives_document_without_destroying_history(
        self,
        now_mock,
        require_permission,
        get_document,
        record_event,
    ):
        document_id = uuid4()
        archived_at = timezone.now()
        document = SimpleNamespace(
            id=document_id,
            eliminado_en=None,
            eliminado_por_id=None,
            motivo_eliminacion=None,
            actualizado_en=None,
            save=MagicMock(),
        )
        administrator = SimpleNamespace(id=uuid4())
        request = SimpleNamespace(user=administrator, data={'reason': 'Retiro controlado'})
        now_mock.return_value = archived_at
        get_document.return_value = document

        response = DocumentDetailView().delete(request, document_id)

        self.assertEqual(response.status_code, 204)
        self.assertEqual(document.eliminado_en, archived_at)
        self.assertEqual(document.eliminado_por_id, administrator.id)
        self.assertEqual(document.motivo_eliminacion, 'Retiro controlado')
        document.save.assert_called_once_with(
            update_fields=['eliminado_en', 'eliminado_por', 'motivo_eliminacion', 'actualizado_en'],
        )
        record_event.assert_called_once_with(
            request,
            document,
            'DOCUMENTO_ARCHIVADO',
            details={'reason': 'Retiro controlado'},
        )

    @patch('documentos.document_views.serialize_document', return_value={'id': 'documento-restaurado'})
    @patch('documentos.document_views.record_document_event')
    @patch('documentos.document_views.get_document_or_404')
    @patch('documentos.document_views.require_permission')
    @patch('documentos.document_views.timezone.now')
    def test_unarchive_restores_document_and_keeps_versions(
        self,
        now_mock,
        require_permission,
        get_document,
        record_event,
        serialize_document,
    ):
        document_id = uuid4()
        restored_at = timezone.now()
        document = SimpleNamespace(
            id=document_id,
            eliminado_en=restored_at - timedelta(days=1),
            eliminado_por_id=uuid4(),
            motivo_eliminacion='Retiro controlado',
            actualizado_en=None,
            save=MagicMock(),
        )
        request = SimpleNamespace(user=SimpleNamespace(id=uuid4()), data={})
        now_mock.return_value = restored_at
        get_document.return_value = document

        response = DocumentUnarchiveView().post(request, document_id)

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(document.eliminado_en)
        self.assertIsNone(document.eliminado_por_id)
        self.assertIsNone(document.motivo_eliminacion)
        document.save.assert_called_once_with(
            update_fields=['eliminado_en', 'eliminado_por', 'motivo_eliminacion', 'actualizado_en'],
        )
        get_document.assert_called_once_with(request, document_id, include_archived=True)
        record_event.assert_called_once_with(request, document, 'DOCUMENTO_RESTAURADO')
        serialize_document.assert_called_once_with(document, request)

    def test_unarchive_document_clears_only_logical_deletion_fields(self):
        document = SimpleNamespace(
            eliminado_en=timezone.now(),
            eliminado_por_id=uuid4(),
            motivo_eliminacion='Archivado',
            actualizado_en=None,
            save=MagicMock(),
        )

        unarchive_document(document)

        self.assertIsNone(document.eliminado_en)
        self.assertIsNone(document.eliminado_por_id)
        self.assertIsNone(document.motivo_eliminacion)
        document.save.assert_called_once()


class DocumentPermissionsTests(SimpleTestCase):
    def test_document_permissions_serializer_accepts_role_assignments(self):
        role_id = uuid4()
        permission_id = uuid4()
        serializer = DocumentPermissionsSerializer(data={
            'assignments': [{'role_id': str(role_id), 'permission_ids': [str(permission_id)]}],
        })

        self.assertTrue(serializer.is_valid())
        self.assertEqual(serializer.validated_data['assignments'][0]['role_id'], role_id)

    def test_document_permissions_serializer_rejects_invalid_permission_id(self):
        serializer = DocumentPermissionsSerializer(data={
            'assignments': [{'role_id': str(uuid4()), 'permission_ids': ['not-a-uuid']}],
        })

        self.assertFalse(serializer.is_valid())
        self.assertIn('assignments', serializer.errors)

    @patch('documentos.document_views.document_permissions_payload', return_value={'assignments': []})
    @patch('documentos.document_views.record_document_event')
    @patch('documentos.document_views.validate_document_permission_assignments')
    @patch('documentos.document_views.require_permission')
    @patch('documentos.document_views.connection')
    @patch('documentos.document_views.transaction.atomic', return_value=nullcontext())
    def test_put_replaces_document_permissions_in_one_transaction(
        self,
        atomic_mock,
        connection_mock,
        require_permission_mock,
        validate_mock,
        record_event_mock,
        payload_mock,
    ):
        document_id = uuid4()
        user_id = uuid4()
        role_id = uuid4()
        permission_id = uuid4()
        document = SimpleNamespace(id=document_id, organizacion_id=uuid4())
        request = SimpleNamespace(
            data={'assignments': [{'role_id': str(role_id), 'permission_ids': [str(permission_id)]}]},
            user=SimpleNamespace(id=user_id),
        )
        cursor = connection_mock.cursor.return_value.__enter__.return_value

        with patch.object(DocumentPermissionsView, 'get_document', return_value=document):
            response = DocumentPermissionsView().put(request, document_id)

        self.assertEqual(response.status_code, 200)
        require_permission_mock.assert_called_once_with(request, 'documentos.gestionar')
        validate_mock.assert_called_once()
        cursor.execute.assert_called_once_with(
            'DELETE FROM gestion_documental.documentos_roles_permisos WHERE documento_id = %s',
            [document_id],
        )
        cursor.executemany.assert_called_once()
        self.assertEqual(cursor.executemany.call_args.args[1], [(document_id, role_id, permission_id, user_id)])
        atomic_mock.assert_called_once()
        record_event_mock.assert_called_once()
        payload_mock.assert_called_once_with(document)


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

    @patch('documentos.reader_access.get_user_roles', return_value=[{'code': 'EDITOR', 'name': 'Editor'}])
    @patch('documentos.reader_access.user_has_permission', return_value=True)
    @patch('documentos.reader_access.connection')
    def test_document_acl_overrides_global_permission_when_document_is_restricted(self, cursor, user_has_permission_mock, roles_mock):
        cursor.cursor.return_value.__enter__.return_value.fetchone.return_value = (True, False)
        user = SimpleNamespace(id=uuid4())

        self.assertFalse(has_document_permission(user, uuid4(), 'documentos.consultar'))
        user_has_permission_mock.assert_called_once_with(user, 'documentos.consultar')
        roles_mock.assert_called_once_with(user.id)

    @patch('documentos.reader_access.get_user_roles', return_value=[{'code': 'ADMINISTRADOR', 'name': 'Administrador'}])
    @patch('documentos.reader_access.user_has_permission', return_value=True)
    @patch('documentos.reader_access.connection')
    def test_administrator_bypasses_explicit_document_acl_denial(self, cursor, user_has_permission_mock, roles_mock):
        cursor.cursor.return_value.__enter__.return_value.fetchone.return_value = (True, False)
        user = SimpleNamespace(id=uuid4())

        self.assertTrue(has_document_permission(user, uuid4(), 'documentos.consultar'))
        roles_mock.assert_called_once_with(user.id)

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
    @patch('documentos.auth_utils.record_auth_event')
    def test_access_denied_records_reason_without_request_metadata(self, record_event):
        request = SimpleNamespace(user=SimpleNamespace(id=uuid4(), organizacion_id=uuid4()))

        record_access_denied(request, 'INSUFFICIENT_PERMISSIONS', resource_code='REPORTE')

        record_event.assert_called_once()
        self.assertEqual(record_event.call_args.kwargs['action_code'], 'ACCESO_DENEGADO')
        self.assertEqual(record_event.call_args.kwargs['resource_code'], 'REPORTE')
        self.assertFalse(record_event.call_args.kwargs['successful'])

    @patch('documentos.audit_views.record_access_denied')
    @patch('documentos.audit_views.get_user_roles', return_value=[{'code': 'EDITOR', 'name': 'Editor'}])
    def test_editor_can_request_only_own_audit_events(self, get_user_roles, record_access_denied_mock):
        user_id = uuid4()
        request = SimpleNamespace(user=SimpleNamespace(id=user_id), query_params={'user_id': str(user_id)})

        require_audit_access(request, allow_own_events=True)

        request.query_params = {'user_id': str(uuid4())}
        with self.assertRaises(PermissionDenied):
            require_audit_access(request, allow_own_events=True)
        record_access_denied_mock.assert_called_once()

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

    @patch('documentos.audit_views.audit_timestamp_column', return_value='creado_en')
    @patch('documentos.audit_views.connection')
    def test_security_alerts_expose_repeated_denials(self, connection_mock, timestamp_column):
        organization_id = uuid4()
        user_id = uuid4()
        cursor = connection_mock.cursor.return_value.__enter__.return_value
        cursor.fetchall.return_value = [(
            'ACCESO_DENEGADO',
            'DOCUMENTO',
            '192.0.2.20',
            user_id,
            'editor.demo',
            4,
            timezone.now(),
        )]

        alerts = fetch_security_alerts(organization_id)

        self.assertEqual(len(alerts), 1)
        self.assertEqual(alerts[0]['action_code'], 'ACCESO_DENEGADO')
        self.assertEqual(alerts[0]['event_count'], 4)
        self.assertEqual(alerts[0]['title'], 'Accesos no autorizados')
        self.assertEqual(alerts[0]['severity'], 'alto')

    @patch('documentos.audit_views.audit_timestamp_column', return_value='creado_en')
    @patch('documentos.audit_views.connection')
    def test_security_alerts_expose_a_single_invalid_session(self, connection_mock, timestamp_column):
        cursor = connection_mock.cursor.return_value.__enter__.return_value
        cursor.fetchall.return_value = [(
            'SESION_INVALIDA',
            'SESION',
            '192.0.2.21',
            uuid4(),
            'usuario.demo',
            1,
            timezone.now(),
        )]

        alerts = fetch_security_alerts(uuid4())

        self.assertEqual(len(alerts), 1)
        self.assertEqual(alerts[0]['title'], 'Uso de sesiones invalidas')
        self.assertEqual(alerts[0]['event_count'], 1)

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
