import hashlib
import secrets
import uuid
from datetime import timedelta

from django.contrib.auth.hashers import make_password
from django.db import transaction
from django.db.models import Prefetch
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .auth_utils import get_client_ip, record_auth_event, serialize_user, user_has_permission
from .permissions import IsAuthenticatedAndPasswordCurrent
from .models import (
    PermisoDocumental,
    RolDocumental,
    RolPermisoDocumental,
    SesionDocumental,
    UsuarioDocumental,
    UsuarioRolDocumental,
    ArchivoDocumento,
    DetalleSolicitudRevision,
    Documento,
    SolicitudRevision,
)
from .serializers import (
    PermissionAssignmentSerializer,
    RoleAssignmentSerializer,
    RoleCreateSerializer,
    RoleUpdateSerializer,
    UserLockSerializer,
    UserCreateSerializer,
    UserStatusSerializer,
    UserUpdateSerializer,
    PermissionCreateSerializer,
    PermissionUpdateSerializer,
)


def require_permission(request, permission_code):
    if not user_has_permission(request.user, permission_code):
        raise PermissionDenied(
            {
                'code': 'INSUFFICIENT_PERMISSIONS',
                'detail': 'No tiene permisos para realizar esta operacion.',
            },
        )


def serialize_management_user(user, area_name=None):
    return {
        **serialize_user(user),
        'organization_id': str(user.organizacion_id),
        'area_id': str(user.area_id) if user.area_id else None,
        'area_name': area_name,
        'active': user.activo,
        'failed_attempts': user.intentos_fallidos,
        'locked_until': user.bloqueado_hasta,
        'last_access_at': user.ultimo_acceso_en,
        'created_at': user.creado_en,
        'updated_at': user.actualizado_en,
        'disabled_at': user.deshabilitado_en,
    }


def device_fingerprint(user_agent, ip_address):
    value = f'{user_agent or ""}|{ip_address or ""}'
    return hashlib.sha256(value.encode('utf-8')).hexdigest()[:16]


def describe_device(user_agent):
    value = (user_agent or '').lower()
    if 'mobile' in value or 'android' in value or 'iphone' in value or 'ipad' in value:
        device_type = 'Movil'
    else:
        device_type = 'Escritorio'

    if 'windows' in value:
        operating_system = 'Windows'
    elif 'mac os' in value or 'macintosh' in value:
        operating_system = 'macOS'
    elif 'android' in value:
        operating_system = 'Android'
    elif 'iphone' in value or 'ipad' in value or 'ios' in value:
        operating_system = 'iOS'
    elif 'linux' in value:
        operating_system = 'Linux'
    else:
        operating_system = 'Desconocido'

    if 'edg/' in value:
        browser = 'Edge'
    elif 'firefox/' in value:
        browser = 'Firefox'
    elif 'chrome/' in value or 'crios/' in value:
        browser = 'Chrome'
    elif 'safari/' in value:
        browser = 'Safari'
    else:
        browser = 'Desconocido'

    return {
        'device_type': device_type,
        'operating_system': operating_system,
        'browser': browser,
        'name': f'{browser} en {operating_system}',
    }


def build_device_inventory(session_rows, now=None):
    now = now or timezone.now()
    devices = {}
    serialized_sessions = []
    for session in session_rows:
        user_agent = session.get('agente_usuario') or ''
        ip_address = session.get('direccion_ip')
        device_id = device_fingerprint(user_agent, ip_address)
        device = describe_device(user_agent)
        is_active = bool(
            not session.get('revocada_en')
            and session.get('expira_en')
            and session['expira_en'] > now
        )
        serialized_sessions.append({
            'id': str(session['id']),
            'device_id': device_id,
            'device_name': device['name'],
            'device_type': device['device_type'],
            'browser': device['browser'],
            'operating_system': device['operating_system'],
            'ip_address': ip_address,
            'user_agent': user_agent,
            'started_at': session['iniciada_en'],
            'last_activity_at': session['ultima_actividad_en'],
            'expires_at': session['expira_en'],
            'revoked_at': session['revocada_en'],
            'revocation_reason': session['motivo_revocacion'],
            'active': is_active,
        })

        current = devices.setdefault(device_id, {
            'id': device_id,
            **device,
            'ip_address': ip_address,
            'user_agent': user_agent,
            'first_seen_at': session['iniciada_en'],
            'last_activity_at': session['ultima_actividad_en'],
            'session_count': 0,
            'active_session_count': 0,
        })
        current['session_count'] += 1
        current['active_session_count'] += int(is_active)
        if session['iniciada_en'] and session['iniciada_en'] < current['first_seen_at']:
            current['first_seen_at'] = session['iniciada_en']
        if session['ultima_actividad_en'] and (
            not current['last_activity_at'] or session['ultima_actividad_en'] > current['last_activity_at']
        ):
            current['last_activity_at'] = session['ultima_actividad_en']
        current['active'] = current['active_session_count'] > 0

    return serialized_sessions, sorted(
        devices.values(),
        key=lambda item: item['last_activity_at'] or now,
        reverse=True,
    )


def get_user_for_organization(user_id, organization_id):
    try:
        return UsuarioDocumental.objects.get(pk=user_id, organizacion_id=organization_id)
    except UsuarioDocumental.DoesNotExist:
        return None


def serialize_dashboard_document(document):
    version = next(iter(getattr(document, 'dashboard_versions', [])), None)
    return {
        'id': str(document.id),
        'code': document.codigo,
        'title': document.nombre,
        'type': document.tipo_documento.nombre,
        'area': document.area.nombre,
        'responsible': f'{document.creado_por.nombres} {document.creado_por.apellidos}'.strip(),
        'status': version.estado_version.nombre if version else 'Sin versión',
        'version': f'{version.numero_mayor}.{version.numero_menor}' if version else None,
        'updated_at': document.actualizado_en,
    }


class AdminDashboardView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def get(self, request):
        require_permission(request, 'usuarios.consultar')
        organization_id = request.user.organizacion_id
        now = timezone.now()
        documents = Documento.objects.filter(
            organizacion_id=organization_id,
            eliminado_en__isnull=True,
        )
        dashboard_documents = documents.select_related(
            'area', 'tipo_documento', 'creado_por',
        ).prefetch_related(Prefetch(
            'archivos',
            queryset=ArchivoDocumento.objects.select_related('estado_version').order_by('-es_vigente', '-orden_version'),
            to_attr='dashboard_versions',
        )).order_by('-actualizado_en', 'codigo')

        status_codes = ('BORRADOR', 'EN_REVISION', 'APROBADO', 'PUBLICADO', 'ARCHIVADO')
        status_counts = {
            code: documents.filter(
                archivos__es_vigente=True,
                archivos__estado_version__codigo=code,
            ).distinct().count()
            for code in status_codes
        }
        pending_reviews = SolicitudRevision.objects.filter(
            version_documento__documento__organizacion_id=organization_id,
            estado_revision__codigo='PENDIENTE',
        )
        overdue_reviews = pending_reviews.filter(detalle__fecha_limite__lt=now).count()
        users = UsuarioDocumental.objects.filter(organizacion_id=organization_id)

        from .audit_views import fetch_audit_rows

        _, activity = fetch_audit_rows({'organization_id': organization_id}, 6)
        activity = [
            {
                'id': row['id'],
                'at': row['event_at'],
                'user': row['user_name'] or row['username'] or 'Sistema',
                'action': row['action'] or row['action_code'],
                'detail': row['result'] or '',
                'successful': row['successful'],
            }
            for row in activity
        ]
        reviews = pending_reviews.select_related(
            'version_documento__documento', 'revisor',
        ).prefetch_related('detalle').order_by('detalle__fecha_limite', '-solicitada_en')[:6]
        review_rows = []
        for review in reviews:
            try:
                detail = review.detalle
            except DetalleSolicitudRevision.DoesNotExist:
                detail = None
            review_rows.append({
                'id': str(review.id),
                'code': review.version_documento.documento.codigo,
                'title': review.version_documento.documento.nombre,
                'reviewer': f'{review.revisor.nombres} {review.revisor.apellidos}'.strip(),
                'priority': detail.prioridad if detail else 'MEDIA',
                'deadline': detail.fecha_limite if detail else None,
                'overdue': bool(detail and detail.fecha_limite and detail.fecha_limite < now),
            })

        return Response({
            'metrics': {
                'total_documents': documents.count(),
                'published_documents': status_counts['PUBLICADO'],
                'pending_reviews': pending_reviews.count(),
                'overdue_reviews': overdue_reviews,
                'active_users': users.filter(activo=True).count(),
                'pending_activation': users.filter(activo=True, debe_cambiar_contrasena=True).count(),
                'blocked_users': users.filter(bloqueado_hasta__gt=now).count(),
                'active_sessions': SesionDocumental.objects.filter(
                    usuario__organizacion_id=organization_id,
                    revocada_en__isnull=True,
                    expira_en__gt=now,
                ).count(),
            },
            'statuses': status_counts,
            'recent_documents': [serialize_dashboard_document(document) for document in dashboard_documents[:6]],
            'pending_queue': review_rows,
            'activity': activity,
        })


def get_pagination(request):
    try:
        limit = int(request.query_params.get('limit', 25))
        offset = int(request.query_params.get('offset', 0))
    except (TypeError, ValueError):
        raise ValidationError({'code': 'INVALID_PAGINATION', 'detail': 'La paginacion no es valida.'})
    return min(max(limit, 1), 100), max(offset, 0)


class UserListCreateView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def get(self, request):
        require_permission(request, 'usuarios.consultar')
        queryset = UsuarioDocumental.objects.filter(organizacion_id=request.user.organizacion_id)
        search = request.query_params.get('search', '').strip()
        if search:
            queryset = queryset.filter(
                nombre_usuario__icontains=search,
            ) | queryset.filter(
                correo__icontains=search,
            ) | queryset.filter(
                nombres__icontains=search,
            ) | queryset.filter(
                apellidos__icontains=search,
            )
        active = request.query_params.get('active')
        if active in {'true', 'false'}:
            queryset = queryset.filter(activo=active == 'true')

        limit, offset = get_pagination(request)
        total = queryset.count()
        users = queryset.order_by('apellidos', 'nombres')[offset:offset + limit]
        return Response(
            {
                'count': total,
                'next_offset': offset + limit if offset + limit < total else None,
                'results': [serialize_management_user(user) for user in users],
            },
        )

    def post(self, request):
        require_permission(request, 'usuarios.gestionar')
        serializer = UserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if data['organization_id'] != request.user.organizacion_id:
            raise PermissionDenied({'code': 'ORGANIZATION_MISMATCH', 'detail': 'Organizacion no autorizada.'})
        role_ids = data.get('role_ids', [])
        valid_role_ids = set(RolDocumental.objects.filter(
            id__in=role_ids,
            organizacion_id=data['organization_id'],
            activo=True,
        ).values_list('id', flat=True))
        if len(valid_role_ids) != len(set(role_ids)):
            return Response(
                {'code': 'INVALID_ROLE', 'detail': 'Uno o mas roles no pertenecen a la organizacion o no estan activos.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if UsuarioDocumental.objects.filter(
            organizacion_id=data['organization_id'],
        ).filter(
            nombre_usuario=data['username'],
        ).exists() or UsuarioDocumental.objects.filter(
            organizacion_id=data['organization_id'],
            correo__iexact=data['email'],
        ).exists():
            return Response(
                {'code': 'USER_ALREADY_EXISTS', 'detail': 'El usuario o correo ya existe.'},
                status=status.HTTP_409_CONFLICT,
            )

        with transaction.atomic():
            user = UsuarioDocumental.objects.create(
                id=uuid.uuid4(),
                organizacion_id=data['organization_id'],
                area_id=data.get('area_id'),
                nombre_usuario=data['username'],
                correo=data['email'],
                nombres=data['first_name'],
                apellidos=data['last_name'],
                hash_contrasena=make_password(data['temporary_password']),
                activo=True,
                debe_cambiar_contrasena=True,
            )
            assign_roles(user, role_ids, request.user.id)

        record_management_event(request, user, 'USUARIO_MODIFICADO', 'Usuario creado')
        return Response({'user': serialize_management_user(user)}, status=status.HTTP_201_CREATED)


class UserDetailView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def get(self, request, user_id):
        require_permission(request, 'usuarios.consultar')
        user = get_user_for_organization(user_id, request.user.organizacion_id)
        if not user:
            return Response({'detail': 'Usuario no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'user': serialize_management_user(user)})

    def patch(self, request, user_id):
        require_permission(request, 'usuarios.gestionar')
        user = get_user_for_organization(user_id, request.user.organizacion_id)
        if not user:
            return Response({'detail': 'Usuario no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = UserUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if 'email' in data and UsuarioDocumental.objects.filter(
            organizacion_id=user.organizacion_id,
            correo__iexact=data['email'],
        ).exclude(pk=user.pk).exists():
            return Response(
                {'code': 'EMAIL_ALREADY_EXISTS', 'detail': 'El correo ya existe.'},
                status=status.HTTP_409_CONFLICT,
            )

        updates = {}
        field_mapping = {
            'email': 'correo',
            'first_name': 'nombres',
            'last_name': 'apellidos',
            'area_id': 'area_id',
            'active': 'activo',
        }
        for key, field in field_mapping.items():
            if key in data:
                updates[field] = data[key]
        if 'active' in data and data['active']:
            updates['deshabilitado_en'] = None
        if 'active' in data and not data['active']:
            updates['deshabilitado_en'] = timezone.now()
        if updates:
            updates['actualizado_en'] = timezone.now()
            UsuarioDocumental.objects.filter(pk=user.pk).update(**updates)
            for field, value in updates.items():
                setattr(user, field, value)
        record_management_event(request, user, 'USUARIO_MODIFICADO', 'Usuario actualizado')
        return Response({'user': serialize_management_user(user)})

    def delete(self, request, user_id):
        require_permission(request, 'usuarios.gestionar')
        user = get_user_for_organization(user_id, request.user.organizacion_id)
        if not user:
            return Response({'detail': 'Usuario no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        if user.pk == request.user.id:
            return Response(
                {
                    'code': 'USER_SELF_DEACTIVATION_NOT_ALLOWED',
                    'detail': 'No puede darse de baja a si mismo.',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        now = timezone.now()
        with transaction.atomic():
            UsuarioDocumental.objects.filter(pk=user.pk, activo=True).update(
                activo=False,
                deshabilitado_en=now,
                actualizado_en=now,
            )
            SesionDocumental.objects.filter(usuario_id=user.pk, revocada_en__isnull=True).update(
                revocada_en=now,
                motivo_revocacion='Cuenta dada de baja logicamente por un administrador',
            )

        user.activo = False
        user.deshabilitado_en = now
        record_management_event(request, user, 'USUARIO_MODIFICADO', 'Usuario dado de baja logicamente')
        return Response({'user': serialize_management_user(user)})


class UserStatusView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def post(self, request, user_id):
        require_permission(request, 'usuarios.gestionar')
        serializer = UserStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = get_user_for_organization(user_id, request.user.organizacion_id)
        if not user:
            return Response({'detail': 'Usuario no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        active = serializer.validated_data['active']
        now = timezone.now()
        UsuarioDocumental.objects.filter(pk=user.pk).update(
            activo=active,
            deshabilitado_en=None if active else now,
            actualizado_en=now,
        )
        if not active:
            SesionDocumental.objects.filter(usuario_id=user.pk, revocada_en__isnull=True).update(
                revocada_en=now,
                motivo_revocacion='Cuenta deshabilitada por un administrador',
            )
        user.activo = active
        user.deshabilitado_en = None if active else now
        record_management_event(request, user, 'USUARIO_MODIFICADO', 'Estado de usuario actualizado')
        return Response({'user': serialize_management_user(user)})


class UserLockView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def post(self, request, user_id):
        require_permission(request, 'usuarios.gestionar')
        serializer = UserLockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = get_user_for_organization(user_id, request.user.organizacion_id)
        if not user:
            return Response({'detail': 'Usuario no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        data = serializer.validated_data
        now = timezone.now()
        locked_until = now + timedelta(minutes=data.get('minutes', 15)) if data['locked'] else None
        UsuarioDocumental.objects.filter(pk=user.pk).update(
            bloqueado_hasta=locked_until,
            intentos_fallidos=0,
            actualizado_en=now,
        )
        user.bloqueado_hasta = locked_until
        user.intentos_fallidos = 0
        if data['locked']:
            SesionDocumental.objects.filter(usuario_id=user.pk, revocada_en__isnull=True).update(
                revocada_en=now,
                motivo_revocacion='Cuenta bloqueada por un administrador',
            )
        record_management_event(request, user, 'USUARIO_MODIFICADO', 'Bloqueo de usuario actualizado')
        return Response({'user': serialize_management_user(user)})


class UserResetPasswordView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def post(self, request, user_id):
        require_permission(request, 'usuarios.gestionar')
        user = get_user_for_organization(user_id, request.user.organizacion_id)
        if not user:
            return Response({'detail': 'Usuario no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        temporary_password = secrets.token_urlsafe(12)
        now = timezone.now()
        UsuarioDocumental.objects.filter(pk=user.pk).update(
            hash_contrasena=make_password(temporary_password),
            debe_cambiar_contrasena=True,
            intentos_fallidos=0,
            bloqueado_hasta=None,
            actualizado_en=now,
        )
        SesionDocumental.objects.filter(usuario_id=user.pk, revocada_en__isnull=True).update(
            revocada_en=now,
            motivo_revocacion='Contraseña restablecida por un administrador',
        )
        record_management_event(request, user, 'USUARIO_MODIFICADO', 'Contraseña restablecida')
        return Response(
            {
                'user_id': str(user.id),
                'temporary_password': temporary_password,
                'must_change_password': True,
            },
        )


class UserRolesView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def get(self, request, user_id):
        require_permission(request, 'usuarios.consultar')
        user = get_user_for_organization(user_id, request.user.organizacion_id)
        if not user:
            return Response({'detail': 'Usuario no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        role_ids = list(UsuarioRolDocumental.objects.filter(
            usuario_id=user.pk,
            vigente_hasta__isnull=True,
        ).values_list('rol_id', flat=True))
        roles = RolDocumental.objects.filter(
            id__in=role_ids,
            organizacion_id=request.user.organizacion_id,
            activo=True,
        ).values(
            'id', 'codigo', 'nombre', 'descripcion', 'activo',
        )
        return Response({'roles': list(roles)})

    def put(self, request, user_id):
        require_permission(request, 'usuarios.gestionar')
        user = get_user_for_organization(user_id, request.user.organizacion_id)
        if not user:
            return Response({'detail': 'Usuario no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = RoleAssignmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        role_ids = serializer.validated_data['role_ids']
        available_role_ids = set(RolDocumental.objects.filter(
            id__in=role_ids,
            organizacion_id=request.user.organizacion_id,
            activo=True,
        ).values_list('id', flat=True))
        if len(available_role_ids) != len(set(role_ids)):
            return Response(
                {'code': 'INVALID_ROLE', 'detail': 'Uno o mas roles no son validos.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        assign_roles(user, role_ids, request.user.id)
        record_management_event(request, user, 'USUARIO_MODIFICADO', 'Roles de usuario actualizados')
        return Response({'roles': list(RolDocumental.objects.filter(
            id__in=role_ids,
            organizacion_id=request.user.organizacion_id,
        ).values('id', 'codigo', 'nombre'))})


class UserSessionsView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def get(self, request, user_id):
        require_permission(request, 'usuarios.consultar')
        user = get_user_for_organization(user_id, request.user.organizacion_id)
        if not user:
            return Response({'detail': 'Usuario no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        sessions = SesionDocumental.objects.filter(usuario_id=user.pk).order_by('-iniciada_en').values(
            'id', 'direccion_ip', 'agente_usuario', 'iniciada_en', 'ultima_actividad_en',
            'expira_en', 'revocada_en', 'motivo_revocacion',
        )
        serialized_sessions, devices = build_device_inventory(list(sessions))
        return Response({'sessions': serialized_sessions, 'devices': devices})


class UserDeviceRevokeView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def post(self, request, user_id, device_id):
        user = get_user_for_organization(user_id, request.user.organizacion_id)
        if not user:
            return Response({'detail': 'Usuario no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        if user.pk != request.user.id:
            require_permission(request, 'usuarios.gestionar')

        sessions = list(SesionDocumental.objects.filter(usuario_id=user.pk).values(
            'id', 'direccion_ip', 'agente_usuario',
        ))
        session_ids = [
            session['id'] for session in sessions
            if device_fingerprint(session['agente_usuario'], session['direccion_ip']) == device_id
        ]
        if not session_ids:
            return Response({'detail': 'Dispositivo no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        now = timezone.now()
        revoked_count = SesionDocumental.objects.filter(
            usuario_id=user.pk,
            id__in=session_ids,
            revocada_en__isnull=True,
        ).update(
            revocada_en=now,
            motivo_revocacion='Dispositivo revocado desde administracion',
        )
        record_management_event(request, user, 'SESION_REVOCADA', 'Dispositivo revocado')
        return Response({'device_id': device_id, 'revoked_sessions': revoked_count})


class SessionRevokeView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def post(self, request, session_id):
        session = SesionDocumental.objects.select_related('usuario').filter(pk=session_id).first()
        if not session or session.usuario.organizacion_id != request.user.organizacion_id:
            return Response({'detail': 'Sesion no encontrada.'}, status=status.HTTP_404_NOT_FOUND)
        if session.usuario_id != request.user.id:
            require_permission(request, 'usuarios.gestionar')
        now = timezone.now()
        SesionDocumental.objects.filter(pk=session.pk, revocada_en__isnull=True).update(
            revocada_en=now,
            motivo_revocacion='Sesión revocada desde administración',
        )
        record_auth_event(
            action_code='SESION_REVOCADA',
            resource_code='SESION',
            organization_id=request.user.organizacion_id,
            user_id=request.user.id,
            session_id=getattr(request.auth, 'id', None),
            resource_id=session.id,
            request=request,
            successful=True,
            result='Sesion revocada correctamente',
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class RoleListCreateView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def get(self, request):
        require_permission(request, 'roles.gestionar')
        roles = []
        for role in RolDocumental.objects.filter(
            organizacion_id=request.user.organizacion_id,
            activo=True,
        ).values('id', 'codigo', 'nombre', 'descripcion', 'activo'):
            role['users_count'] = UsuarioRolDocumental.objects.filter(
                rol_id=role['id'],
                vigente_hasta__isnull=True,
            ).count()
            role['permissions_count'] = RolPermisoDocumental.objects.filter(
                rol_id=role['id'],
            ).count()
            roles.append(role)
        return Response({'roles': roles})

    def post(self, request):
        require_permission(request, 'roles.gestionar')
        serializer = RoleCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if RolDocumental.objects.filter(
            organizacion_id=request.user.organizacion_id,
            codigo=data['code'],
        ).exists():
            return Response(
                {'code': 'ROLE_ALREADY_EXISTS', 'detail': 'El codigo del rol ya existe.'},
                status=status.HTTP_409_CONFLICT,
            )
        now = timezone.now()
        role = RolDocumental.objects.create(
            id=uuid.uuid4(),
            organizacion_id=request.user.organizacion_id,
            codigo=data['code'],
            nombre=data['name'],
            descripcion=data.get('description', ''),
            activo=True,
            creado_en=now,
            actualizado_en=now,
        )
        record_management_event(
            request,
            request.user,
            'ROL_MODIFICADO',
            'Rol creado',
            resource_code='ROL',
            resource_id=role.id,
        )
        return Response(
            {
                'role': {
                    'id': str(role.id),
                    'code': role.codigo,
                    'name': role.nombre,
                    'description': role.descripcion,
                    'active': role.activo,
                },
            },
            status=status.HTTP_201_CREATED,
        )


class RoleDetailView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def patch(self, request, role_id):
        require_permission(request, 'roles.gestionar')
        role = RolDocumental.objects.filter(
            pk=role_id,
            organizacion_id=request.user.organizacion_id,
        ).first()
        if not role:
            return Response({'detail': 'Rol no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = RoleUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        updates = {}
        field_mapping = {'name': 'nombre', 'description': 'descripcion', 'active': 'activo'}
        for key, field in field_mapping.items():
            if key in data:
                updates[field] = data[key]
        if updates:
            updates['actualizado_en'] = timezone.now()
            RolDocumental.objects.filter(pk=role.pk).update(**updates)
            for field, value in updates.items():
                setattr(role, field, value)
        record_management_event(
            request,
            request.user,
            'ROL_MODIFICADO',
            'Rol actualizado',
            resource_code='ROL',
            resource_id=role.id,
        )
        return Response({'role': role_to_dict(role)})


class PermissionListView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def get(self, request):
        require_permission(request, 'roles.gestionar')
        permissions = PermisoDocumental.objects.all()
        active = request.query_params.get('active')
        if active in {'true', 'false'}:
            permissions = permissions.filter(activo=active == 'true')
        search = request.query_params.get('search', '').strip()
        if search:
            permissions = permissions.filter(
                codigo__icontains=search,
            ) | permissions.filter(
                nombre__icontains=search,
            ) | permissions.filter(
                modulo__icontains=search,
            )
        permissions = permissions.order_by('modulo', 'codigo').values(
            'id', 'codigo', 'nombre', 'modulo', 'descripcion', 'activo',
        )
        return Response({'permissions': [permission_to_dict(permission) for permission in permissions]})

    def post(self, request):
        require_permission(request, 'roles.gestionar')
        serializer = PermissionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if PermisoDocumental.objects.filter(codigo__iexact=data['code']).exists():
            return Response(
                {'code': 'PERMISSION_ALREADY_EXISTS', 'detail': 'El codigo del permiso ya existe.'},
                status=status.HTTP_409_CONFLICT,
            )
        permission = PermisoDocumental.objects.create(
            id=uuid.uuid4(),
            codigo=data['code'],
            nombre=data['name'],
            modulo=data['module'],
            descripcion=data.get('description', ''),
            activo=True,
        )
        record_management_event(
            request,
            request.user,
            'PERMISO_MODIFICADO',
            'Permiso creado',
            resource_code='PERMISO',
            resource_id=permission.id,
        )
        return Response({'permission': permission_to_dict({
            'id': permission.id,
            'codigo': permission.codigo,
            'nombre': permission.nombre,
            'modulo': permission.modulo,
            'descripcion': permission.descripcion,
            'activo': permission.activo,
        })}, status=status.HTTP_201_CREATED)


class PermissionDetailView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def patch(self, request, permission_id):
        require_permission(request, 'roles.gestionar')
        permission = PermisoDocumental.objects.filter(pk=permission_id).first()
        if not permission:
            return Response({'detail': 'Permiso no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = PermissionUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        updates = {}
        field_mapping = {'name': 'nombre', 'module': 'modulo', 'description': 'descripcion', 'active': 'activo'}
        for key, field in field_mapping.items():
            if key in data:
                updates[field] = data[key]
        if updates:
            PermisoDocumental.objects.filter(pk=permission.pk).update(**updates)
            for field, value in updates.items():
                setattr(permission, field, value)
        record_management_event(
            request,
            request.user,
            'PERMISO_MODIFICADO',
            'Permiso actualizado',
            resource_code='PERMISO',
            resource_id=permission.id,
        )
        return Response({'permission': permission_to_dict({
            'id': permission.id,
            'codigo': permission.codigo,
            'nombre': permission.nombre,
            'modulo': permission.modulo,
            'descripcion': permission.descripcion,
            'activo': permission.activo,
        })})


class RolePermissionsView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def get(self, request, role_id):
        require_permission(request, 'roles.gestionar')
        role = RolDocumental.objects.filter(
            pk=role_id,
            organizacion_id=request.user.organizacion_id,
            activo=True,
        ).values(
            'id', 'codigo', 'nombre', 'descripcion', 'activo',
        ).first()
        if not role:
            return Response({'detail': 'Rol no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        permission_ids = RolPermisoDocumental.objects.filter(
            rol_id=role_id,
        ).values_list('permiso_id', flat=True)
        permissions = PermisoDocumental.objects.filter(activo=True).values(
            'id', 'codigo', 'nombre', 'modulo', 'descripcion', 'activo',
        )
        return Response(
            {
                'role': role,
                'permissions': [
                    {**permission_to_dict(permission), 'granted': permission['id'] in permission_ids}
                    for permission in permissions
                ],
            },
        )

    def put(self, request, role_id):
        require_permission(request, 'roles.gestionar')
        role = RolDocumental.objects.filter(
            pk=role_id,
            organizacion_id=request.user.organizacion_id,
            activo=True,
        ).first()
        if not role:
            return Response({'detail': 'Rol no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = PermissionAssignmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        permission_ids = serializer.validated_data['permission_ids']
        valid_permission_ids = set(PermisoDocumental.objects.filter(
            id__in=permission_ids,
            activo=True,
        ).values_list('id', flat=True))
        if len(valid_permission_ids) != len(set(permission_ids)):
            return Response(
                {'code': 'INVALID_PERMISSION', 'detail': 'Uno o mas permisos no son validos.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        with transaction.atomic():
            RolPermisoDocumental.objects.filter(rol_id=role.pk).delete()
            for permission_id in valid_permission_ids:
                RolPermisoDocumental.objects.create(
                    rol_id=role.pk,
                    permiso_id=permission_id,
                    asignado_por_id=request.user.id,
                    asignado_en=timezone.now(),
                )
        record_management_event(
            request,
            request.user,
            'PERMISO_MODIFICADO',
            'Permisos de rol actualizados',
            resource_code='PERMISO',
            resource_id=role.pk,
        )
        return Response({'role_id': str(role.pk), 'permission_ids': [str(item) for item in valid_permission_ids]})


def assign_roles(user, role_ids, assigned_by_id):
    now = timezone.now()
    with transaction.atomic():
        selected_ids = set(role_ids)
        current = UsuarioRolDocumental.objects.filter(usuario_id=user.pk)
        current.exclude(rol_id__in=selected_ids).update(vigente_hasta=now)
        for role_id in selected_ids:
            updated = current.filter(rol_id=role_id).update(
                asignado_por_id=assigned_by_id,
                asignado_en=now,
                vigente_hasta=None,
            )
            if not updated:
                UsuarioRolDocumental.objects.create(
                    usuario_id=user.pk,
                    rol_id=role_id,
                    asignado_por_id=assigned_by_id,
                    asignado_en=now,
                    vigente_hasta=None,
                )


def record_management_event(request, user, action_code, result, resource_code='USUARIO', resource_id=None):
    record_auth_event(
        action_code=action_code,
        resource_code=resource_code,
        organization_id=user.organizacion_id,
        user_id=request.user.id,
        session_id=getattr(request.auth, 'id', None),
        resource_id=resource_id or user.id,
        request=request,
        successful=True,
        result=result,
        details={'target_id': str(resource_id or user.id), 'ip': get_client_ip(request)},
    )


def role_to_dict(role):
    return {
        'id': str(role.id),
        'code': role.codigo,
        'name': role.nombre,
        'description': role.descripcion,
        'active': role.activo,
    }


def permission_to_dict(permission):
    return {
        **permission,
        'id': str(permission['id']),
        'action': permission['codigo'].rsplit('.', 1)[-1],
    }
