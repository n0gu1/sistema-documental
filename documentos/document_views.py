import csv
import logging
from datetime import datetime, time
from pathlib import Path
from uuid import UUID, uuid4

from django.core.files.storage import default_storage
from django.db import connection, transaction
from django.http import FileResponse, Http404, HttpResponse
from django.urls import reverse
from django.utils import timezone
from rest_framework import parsers, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .auth_utils import record_auth_event, user_has_permission
from .document_serializers import DocumentCreateSerializer, DocumentFileSerializer, DocumentUpdateSerializer
from .file_validation import validate_uploaded_file
from .management_views import require_permission
from .models import (
    ArchivoDocumento,
    AreaCatalogo,
    Documento,
    EstadoVersionCatalogo,
    HistorialEstadoVersion,
    MetadatoDocumento,
    PermisoDocumental,
    ProveedorAlmacenamiento,
    RolDocumental,
    TipoDocumentoCatalogo,
)
from .permissions import IsAuthenticatedAndPasswordCurrent
from .reader_access import (
    filter_accessible_documents,
    get_accessible_published_document,
    has_document_permission,
    is_reader_user,
    published_document_queryset,
)
from .security_utils import sanitize_text
from .serializers import DocumentPermissionsSerializer


READ_PERMISSION = 'documentos.consultar'
WRITE_PERMISSION = 'documentos.gestionar'
PREVIEWABLE_MIMES = {'application/pdf', 'image/jpeg', 'image/png'}
logger = logging.getLogger(__name__)


def document_queryset(organization_id):
    return Documento.objects.filter(
        organizacion_id=organization_id,
        eliminado_en__isnull=True,
    ).select_related('area', 'tipo_documento', 'creado_por')


def parse_filter_date(value, field_name, end=False):
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as error:
        raise ValidationError({field_name: 'Use una fecha ISO valida.'}) from error
    if parsed.tzinfo is None:
        parsed = timezone.make_aware(datetime.combine(parsed.date(), time.max if end else time.min))
    return parsed


def apply_document_filters(queryset, params):
    search = params.get('search', '').strip()
    if search:
        queryset = queryset.filter(
            codigo__icontains=search,
        ) | queryset.filter(
            nombre__icontains=search,
        ) | queryset.filter(
            descripcion__icontains=search,
        )
    if params.get('type_id'):
        queryset = queryset.filter(tipo_documento_id=params['type_id'])
    if params.get('area_id'):
        queryset = queryset.filter(area_id=params['area_id'])
    if params.get('responsible_id'):
        queryset = queryset.filter(creado_por_id=params['responsible_id'])
    if params.get('date_from'):
        queryset = queryset.filter(fecha_documento__gte=params['date_from'])
    if params.get('date_to'):
        queryset = queryset.filter(fecha_documento__lte=params['date_to'])
    if params.get('status_code'):
        queryset = queryset.filter(archivos__estado_version__codigo=params['status_code'])
    date_from = parse_filter_date(params.get('updated_from'), 'updated_from')
    date_to = parse_filter_date(params.get('updated_to'), 'updated_to', end=True)
    if date_from:
        queryset = queryset.filter(actualizado_en__gte=date_from)
    if date_to:
        queryset = queryset.filter(actualizado_en__lte=date_to)
    ordering_fields = {
        'code': 'codigo',
        'title': 'nombre',
        'created_at': 'creado_en',
        'updated_at': 'actualizado_en',
        'document_date': 'fecha_documento',
    }
    ordering = params.get('ordering', '-updated_at')
    field = ordering_fields.get(ordering.lstrip('-'), 'actualizado_en')
    queryset = queryset.order_by(f'-{field}' if ordering.startswith('-') else field, 'codigo')
    return queryset.distinct()


def page_queryset(queryset, params):
    try:
        limit = int(params.get('limit', 25))
        offset = int(params.get('offset', 0))
    except (TypeError, ValueError) as error:
        raise ValidationError({'code': 'INVALID_PAGINATION', 'detail': 'La paginacion no es valida.'}) from error
    limit = min(max(limit, 1), 100)
    offset = max(offset, 0)
    total = queryset.count()
    return total, offset, limit, queryset[offset:offset + limit]


def current_version(document):
    return document.archivos.select_related('estado_version').filter(es_vigente=True).first() or document.archivos.select_related('estado_version').first()


def serialize_version(document_file, request):
    return {
        'id': str(document_file.id),
        'name': document_file.nombre_archivo_original,
        'mime_type': document_file.tipo_mime,
        'size': document_file.tamano_bytes,
        'sha256': document_file.sha256,
        'version': f'{document_file.numero_mayor}.{document_file.numero_menor}',
        'is_current': document_file.es_vigente,
        'comment': document_file.comentario_cambio,
        'status': {
            'id': document_file.estado_version_id,
            'code': document_file.estado_version.codigo,
            'name': document_file.estado_version.nombre,
        },
        'author': {
            'id': str(document_file.creada_por_id),
            'username': document_file.creada_por.nombre_usuario,
            'name': f'{document_file.creada_por.nombres} {document_file.creada_por.apellidos}'.strip(),
        },
        'created_at': document_file.creada_en,
        'download_url': request.build_absolute_uri(
            reverse('document-file-download', args=[document_file.documento_id, document_file.id]),
        ),
        'preview_url': request.build_absolute_uri(
            reverse('document-file-preview', args=[document_file.documento_id, document_file.id]),
        ) if document_file.tipo_mime in PREVIEWABLE_MIMES else None,
    }


def serialize_file(document_file, request):
    return serialize_version(document_file, request)


def parse_version_id(value, field_name):
    try:
        return UUID(str(value))
    except (TypeError, ValueError) as error:
        raise ValidationError({field_name: 'El identificador de version no es valido.'}) from error


def version_queryset(document):
    return document.archivos.select_related(
        'estado_version', 'proveedor_almacenamiento', 'creada_por',
    ).order_by('-orden_version')


def compare_versions(first, second, request):
    fields = {
        'name': (first.nombre_archivo_original, second.nombre_archivo_original),
        'mime_type': (first.tipo_mime, second.tipo_mime),
        'size': (first.tamano_bytes, second.tamano_bytes),
        'sha256': (first.sha256, second.sha256),
        'comment': (first.comentario_cambio, second.comentario_cambio),
        'status': (first.estado_version.codigo, second.estado_version.codigo),
    }
    changed_fields = [
        {'field': field, 'from': values[0], 'to': values[1]}
        for field, values in fields.items()
        if values[0] != values[1]
    ]
    return {
        'from': serialize_version(first, request),
        'to': serialize_version(second, request),
        'same_content': first.sha256 == second.sha256,
        'changed_fields': changed_fields,
    }


def serialize_document(document, request, include_details=False):
    version = current_version(document)
    result = {
        'id': str(document.id),
        'code': document.codigo,
        'title': document.nombre,
        'description': document.descripcion or '',
        'date': document.fecha_documento,
        'area': {'id': str(document.area_id), 'name': document.area.nombre},
        'type': {'id': document.tipo_documento_id, 'code': document.tipo_documento.codigo, 'name': document.tipo_documento.nombre},
        'status': (
            {'id': version.estado_version_id, 'code': version.estado_version.codigo, 'name': version.estado_version.nombre}
            if version else None
        ),
        'responsible': {
            'id': str(document.creado_por_id),
            'username': document.creado_por.nombre_usuario,
            'name': f'{document.creado_por.nombres} {document.creado_por.apellidos}'.strip(),
        },
        'created_at': document.creado_en,
        'updated_at': document.actualizado_en,
        'archived_at': document.eliminado_en,
    }
    if include_details:
        result['metadata'] = {
            item.clave: item.valor for item in MetadatoDocumento.objects.filter(documento_id=document.id)
        }
        result['files'] = [serialize_file(item, request) for item in document.archivos.all()]
    return result


def get_document_or_404(request, document_id, include_archived=False):
    queryset = Documento.objects.filter(organizacion_id=request.user.organizacion_id)
    if not include_archived:
        queryset = queryset.filter(eliminado_en__isnull=True)
    document = queryset.select_related('area', 'tipo_documento', 'creado_por').filter(pk=document_id).first()
    if not document or not has_document_permission(
        request.user,
        document.id,
        WRITE_PERMISSION if user_has_permission(request.user, WRITE_PERMISSION) else READ_PERMISSION,
    ):
        raise Http404
    return document


def document_permissions_payload(document):
    roles = list(RolDocumental.objects.filter(
        organizacion_id=document.organizacion_id,
        activo=True,
    ).values('id', 'codigo', 'nombre').order_by('codigo'))
    permissions = list(PermisoDocumental.objects.filter(activo=True).values(
        'id', 'codigo', 'nombre', 'modulo', 'descripcion',
    ).order_by('modulo', 'codigo'))
    with connection.cursor() as cursor:
        cursor.execute(
            '''
            SELECT drp.rol_id, drp.permiso_id
            FROM gestion_documental.documentos_roles_permisos drp
            JOIN gestion_documental.roles r ON r.id = drp.rol_id
            JOIN gestion_documental.permisos p ON p.id = drp.permiso_id
            WHERE drp.documento_id = %s
              AND r.organizacion_id = %s
              AND r.activo
              AND p.activo
            ORDER BY drp.rol_id, drp.permiso_id
            ''',
            [document.id, document.organizacion_id],
        )
        assignment_rows = cursor.fetchall()
    assignments = {}
    for role_id, permission_id in assignment_rows:
        assignments.setdefault(str(role_id), []).append(str(permission_id))
    return {
        'document': {
            'id': str(document.id),
            'code': document.codigo,
            'title': document.nombre,
        },
        'roles': [
            {'id': str(role['id']), 'code': role['codigo'], 'name': role['nombre']}
            for role in roles
        ],
        'permissions': [
            {
                'id': str(permission['id']),
                'code': permission['codigo'],
                'name': permission['nombre'],
                'module': permission['modulo'],
                'description': permission['descripcion'],
            }
            for permission in permissions
        ],
        'assignments': [
            {'role_id': role_id, 'permission_ids': permission_ids}
            for role_id, permission_ids in assignments.items()
        ],
    }


def validate_document_permission_assignments(assignments, organization_id):
    role_ids = [item['role_id'] for item in assignments]
    if len(role_ids) != len(set(role_ids)):
        raise ValidationError({'assignments': 'No puede repetir un rol en las asignaciones.'})
    if any(len(item['permission_ids']) != len(set(item['permission_ids'])) for item in assignments):
        raise ValidationError({'assignments': 'No puede repetir un permiso dentro de un rol.'})
    permission_ids = {
        permission_id
        for item in assignments
        for permission_id in item['permission_ids']
    }
    roles = set(RolDocumental.objects.filter(
        organizacion_id=organization_id,
        activo=True,
        id__in=role_ids,
    ).values_list('id', flat=True))
    if roles != set(role_ids):
        raise ValidationError({'assignments': 'Todos los roles deben estar activos y pertenecer a la organizacion.'})
    permissions = set(PermisoDocumental.objects.filter(
        activo=True,
        id__in=permission_ids,
    ).values_list('id', flat=True))
    if permissions != permission_ids:
        raise ValidationError({'assignments': 'Todos los permisos deben estar activos y pertenecer al catalogo.'})


def get_read_document_or_404(request, document_id):
    if is_reader_user(request.user):
        return get_accessible_published_document(request.user, document_id, READ_PERMISSION)
    return get_document_or_404(request, document_id)


def get_reference_or_error(model, object_id, organization_id, field_name):
    filters = {'pk': object_id}
    if model is not TipoDocumentoCatalogo:
        filters['organizacion_id'] = organization_id
    reference = model.objects.filter(**filters).first()
    if not reference:
        raise ValidationError({field_name: 'La referencia no existe o no pertenece a la organizacion.'})
    return reference


def validate_metadata(metadata):
    for key, value in metadata.items():
        if not isinstance(key, str) or not key or len(key) > 100:
            raise ValidationError({'metadata': 'Las claves de metadatos deben tener entre 1 y 100 caracteres.'})
        if not all(character.isalnum() or character in '._-' for character in key):
            raise ValidationError({'metadata': 'Las claves de metadatos solo pueden usar letras, numeros, punto, guion y guion bajo.'})
        if not isinstance(value, (str, int, float, bool)) and value is not None:
            raise ValidationError({'metadata': 'Los valores de metadatos deben ser escalares.'})


def save_metadata(document, metadata):
    if metadata is None:
        return
    validate_metadata(metadata)
    MetadatoDocumento.objects.filter(documento_id=document.id).exclude(clave__in=metadata.keys()).delete()
    for key, value in metadata.items():
        MetadatoDocumento.objects.update_or_create(
            documento=document,
            clave=key,
            defaults={'valor': '' if value is None else sanitize_text(str(value))},
        )


def save_document_file(document, uploaded_file, user, comment=''):
    file_data = validate_uploaded_file(uploaded_file, document.organizacion_id)
    provider = ProveedorAlmacenamiento.objects.filter(
        organizacion_id=document.organizacion_id,
    ).order_by('-activo', 'codigo').first()
    if not provider:
        raise ValidationError({'file': 'No hay proveedor de almacenamiento configurado.'})
    state = EstadoVersionCatalogo.objects.filter(codigo='BORRADOR').first()
    if not state:
        raise ValidationError({'file': 'No hay estado BORRADOR configurado para la version.'})
    extension = Path(file_data['name']).suffix.lower()
    storage_name = f'{document.organizacion_id}/{document.id}/{uuid4().hex}{extension}'
    storage_key = None
    try:
        with transaction.atomic():
            latest = document.archivos.select_for_update().order_by('-orden_version').first()
            major = latest.numero_mayor + 1 if latest else 1
            order = latest.orden_version + 1 if latest else 1
            document.archivos.filter(es_vigente=True).update(es_vigente=False)
            storage_key = default_storage.save(storage_name, uploaded_file)
            document_file = ArchivoDocumento.objects.create(
                id=uuid4(),
                documento=document,
                estado_version=state,
                proveedor_almacenamiento=provider,
                numero_mayor=major,
                numero_menor=0,
                orden_version=order,
                es_vigente=True,
                nombre_archivo_original=file_data['name'],
                clave_almacenamiento=storage_key,
                tipo_mime=file_data['mime_type'],
                tamano_bytes=file_data['size'],
                sha256=file_data['sha256'],
                comentario_cambio=comment or 'Carga de archivo',
                creada_por=user,
                creada_en=timezone.now(),
            )
            HistorialEstadoVersion.objects.create(
                version_documento=document_file,
                estado_nuevo=state,
                cambiado_por=user,
                comentario='Version creada en estado BORRADOR',
                cambiado_en=timezone.now(),
            )
            return document_file
    except Exception as error:
        if storage_key:
            default_storage.delete(storage_key)
        logger.exception('Error al persistir archivo documental para documento %s', document.id)
        raise ValidationError({'file': 'No se pudo guardar el archivo documental.'}) from error


def record_document_event(request, document, action_code, resource_code='DOCUMENTO', resource_id=None):
    record_auth_event(
        action_code=action_code,
        resource_code=resource_code,
        organization_id=document.organizacion_id,
        user_id=request.user.id,
        session_id=getattr(request.auth, 'id', None),
        resource_id=resource_id or document.id,
        request=request,
        successful=True,
        result='Operacion documental correcta',
    )


class DocumentListCreateView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]
    parser_classes = [parsers.MultiPartParser, parsers.FormParser, parsers.JSONParser]

    def get(self, request):
        require_permission(request, READ_PERMISSION)
        if is_reader_user(request.user):
            from .reader_views import serialize_reader_document

            documents = [
                document for document in published_document_queryset(request.user.organizacion_id)
                if has_document_permission(request.user, document.id, READ_PERMISSION)
            ]
            total = len(documents)
            try:
                limit = min(max(int(request.query_params.get('limit', 25)), 1), 100)
                offset = max(int(request.query_params.get('offset', 0)), 0)
            except (TypeError, ValueError) as error:
                raise ValidationError({'code': 'INVALID_PAGINATION', 'detail': 'La paginacion no es valida.'}) from error
            page = documents[offset:offset + limit]
            return Response({
                'count': total,
                'next_offset': offset + limit if offset + limit < total else None,
                'results': [serialize_reader_document(document, request) for document in page],
            })
        queryset = apply_document_filters(document_queryset(request.user.organizacion_id), request.query_params)
        documents = filter_accessible_documents(request.user, queryset, READ_PERMISSION)
        total = len(documents)
        try:
            limit = min(max(int(request.query_params.get('limit', 25)), 1), 100)
            offset = max(int(request.query_params.get('offset', 0)), 0)
        except (TypeError, ValueError) as error:
            raise ValidationError({'code': 'INVALID_PAGINATION', 'detail': 'La paginacion no es valida.'}) from error
        page = documents[offset:offset + limit]
        return Response({
            'count': total,
            'next_offset': offset + limit if offset + limit < total else None,
            'results': [serialize_document(document, request) for document in page],
        })

    def post(self, request):
        require_permission(request, WRITE_PERMISSION)
        serializer = DocumentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        organization_id = request.user.organizacion_id
        area = get_reference_or_error(AreaCatalogo, data['area_id'], organization_id, 'area_id')
        document_type = get_reference_or_error(TipoDocumentoCatalogo, data['type_id'], organization_id, 'type_id')
        if Documento.objects.filter(organizacion_id=organization_id, codigo=data['code'], eliminado_en__isnull=True).exists():
            return Response({'code': 'DOCUMENT_ALREADY_EXISTS', 'detail': 'El codigo ya existe.'}, status=status.HTTP_409_CONFLICT)
        uploaded_file = request.FILES.get('file')
        if uploaded_file:
            validate_uploaded_file(uploaded_file, organization_id)
        with transaction.atomic():
            document = Documento.objects.create(
                id=uuid4(),
                organizacion_id=organization_id,
                area=area,
                tipo_documento=document_type,
                codigo=data['code'],
                nombre=data['title'],
                descripcion=data.get('description') or None,
                fecha_documento=data.get('date'),
                creado_por=request.user,
                creado_en=timezone.now(),
                actualizado_en=timezone.now(),
            )
            save_metadata(document, data.get('metadata'))
            if uploaded_file:
                save_document_file(document, uploaded_file, request.user, data.get('file_comment', ''))
        record_document_event(request, document, 'DOCUMENTO_CREADO')
        return Response({'document': serialize_document(document, request, include_details=True)}, status=status.HTTP_201_CREATED)


class DocumentCatalogView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def get(self, request):
        require_permission(request, READ_PERMISSION)
        return Response({
            'areas': [
                {'id': str(item.id), 'code': item.codigo, 'name': item.nombre}
                for item in AreaCatalogo.objects.filter(organizacion_id=request.user.organizacion_id, activa=True).order_by('nombre')
            ],
            'types': [
                {'id': item.id, 'code': item.codigo, 'name': item.nombre}
                for item in TipoDocumentoCatalogo.objects.filter(activo=True).order_by('nombre')
            ],
        })


class DocumentDetailView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]
    parser_classes = [parsers.MultiPartParser, parsers.FormParser, parsers.JSONParser]

    def get(self, request, document_id):
        require_permission(request, READ_PERMISSION)
        document = get_read_document_or_404(request, document_id)
        if is_reader_user(request.user):
            from .reader_views import serialize_reader_document

            return Response({'document': serialize_reader_document(document, request, include_details=True)})
        return Response({'document': serialize_document(document, request, include_details=True)})

    def patch(self, request, document_id):
        require_permission(request, WRITE_PERMISSION)
        document = get_document_or_404(request, document_id)
        serializer = DocumentUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        uploaded_file = request.FILES.get('file')
        if uploaded_file:
            validate_uploaded_file(uploaded_file, document.organizacion_id)
        updates = {}
        if 'code' in data:
            if Documento.objects.filter(organizacion_id=document.organizacion_id, codigo=data['code'], eliminado_en__isnull=True).exclude(pk=document.pk).exists():
                return Response({'code': 'DOCUMENT_ALREADY_EXISTS', 'detail': 'El codigo ya existe.'}, status=status.HTTP_409_CONFLICT)
            updates['codigo'] = data['code']
        if 'title' in data:
            updates['nombre'] = data['title']
        if 'description' in data:
            updates['descripcion'] = data['description'] or None
        if 'date' in data:
            updates['fecha_documento'] = data['date']
        if 'area_id' in data:
            updates['area'] = get_reference_or_error(AreaCatalogo, data['area_id'], document.organizacion_id, 'area_id')
        if 'type_id' in data:
            updates['tipo_documento'] = get_reference_or_error(TipoDocumentoCatalogo, data['type_id'], document.organizacion_id, 'type_id')
        for field, value in updates.items():
            setattr(document, field, value)
        if updates:
            document.actualizado_en = timezone.now()
            document.save(update_fields=[*updates.keys(), 'actualizado_en'])
        save_metadata(document, data.get('metadata'))
        if uploaded_file:
            save_document_file(document, uploaded_file, request.user, data.get('file_comment', ''))
        record_document_event(request, document, 'DOCUMENTO_MODIFICADO')
        return Response({'document': serialize_document(document, request, include_details=True)})

    def delete(self, request, document_id):
        require_permission(request, WRITE_PERMISSION)
        document = get_document_or_404(request, document_id)
        record_document_event(request, document, 'DOCUMENTO_ELIMINADO')
        files = list(document.archivos.all())
        with transaction.atomic():
            for document_file in files:
                default_storage.delete(document_file.clave_almacenamiento)
            document.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class DocumentPermissionsView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def get_document(self, request, document_id):
        document = document_queryset(request.user.organizacion_id).filter(pk=document_id).first()
        if not document:
            raise Http404
        return document

    def get(self, request, document_id):
        require_permission(request, WRITE_PERMISSION)
        return Response(document_permissions_payload(self.get_document(request, document_id)))

    def put(self, request, document_id):
        require_permission(request, WRITE_PERMISSION)
        document = self.get_document(request, document_id)
        serializer = DocumentPermissionsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        assignments = serializer.validated_data['assignments']
        validate_document_permission_assignments(assignments, document.organizacion_id)
        rows = [
            (document.id, item['role_id'], permission_id, request.user.id)
            for item in assignments
            for permission_id in item['permission_ids']
        ]

        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute(
                    'DELETE FROM gestion_documental.documentos_roles_permisos WHERE documento_id = %s',
                    [document.id],
                )
                cursor.executemany(
                    '''
                    INSERT INTO gestion_documental.documentos_roles_permisos (
                        documento_id, rol_id, permiso_id, asignado_por_id, asignado_en
                    ) VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP)
                    ''',
                    rows,
                )
        record_document_event(
            request,
            document,
            'DOCUMENTO_MODIFICADO',
            details={'operation': 'document_permissions_updated', 'assignment_count': len(rows)},
        )
        return Response(document_permissions_payload(document))


class DocumentArchiveView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def post(self, request, document_id):
        require_permission(request, WRITE_PERMISSION)
        document = get_document_or_404(request, document_id)
        document.eliminado_en = timezone.now()
        document.eliminado_por_id = request.user.id
        document.motivo_eliminacion = request.data.get('reason') or 'Archivado por el usuario'
        document.actualizado_en = timezone.now()
        document.save(update_fields=['eliminado_en', 'eliminado_por', 'motivo_eliminacion', 'actualizado_en'])
        record_document_event(request, document, 'DOCUMENTO_ARCHIVADO')
        return Response({'document': serialize_document(document, request)})


class DocumentFileListCreateView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]
    parser_classes = [parsers.MultiPartParser, parsers.FormParser]

    def get(self, request, document_id):
        require_permission(request, READ_PERMISSION)
        document = get_read_document_or_404(request, document_id)
        files = document.archivos.all()
        if is_reader_user(request.user):
            files = files.filter(estado_version__codigo='PUBLICADO')
        return Response({'files': [serialize_file(item, request) for item in files]})

    def post(self, request, document_id):
        require_permission(request, WRITE_PERMISSION)
        document = get_document_or_404(request, document_id)
        serializer = DocumentFileSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        document_file = save_document_file(
            document,
            serializer.validated_data['file'],
            request.user,
            serializer.validated_data.get('comment', ''),
        )
        record_document_event(request, document, 'ARCHIVO_CARGADO', resource_code='ARCHIVO', resource_id=document_file.id)
        return Response({'file': serialize_file(document_file, request)}, status=status.HTTP_201_CREATED)


class DocumentVersionListView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]
    parser_classes = [parsers.MultiPartParser, parsers.FormParser]

    def get(self, request, document_id):
        require_permission(request, READ_PERMISSION)
        document = get_read_document_or_404(request, document_id)
        versions = version_queryset(document)
        if is_reader_user(request.user):
            versions = versions.filter(estado_version__codigo='PUBLICADO')
        return Response({
            'current_version_id': str(next((item.id for item in versions if item.es_vigente), '')) or None,
            'versions': [serialize_version(item, request) for item in versions],
        })

    def post(self, request, document_id):
        require_permission(request, WRITE_PERMISSION)
        document = get_document_or_404(request, document_id)
        serializer = DocumentFileSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        document_file = save_document_file(
            document,
            serializer.validated_data['file'],
            request.user,
            serializer.validated_data.get('comment', ''),
        )
        record_document_event(request, document, 'ARCHIVO_CARGADO', resource_code='ARCHIVO', resource_id=document_file.id)
        return Response({'version': serialize_version(document_file, request)}, status=status.HTTP_201_CREATED)


def get_document_version_or_404(request, document_id, version_id):
    document = get_document_or_404(request, document_id)
    version = version_queryset(document).filter(pk=version_id).first()
    if not version:
        raise Http404
    return document, version


class DocumentVersionCompareView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def get(self, request, document_id):
        require_permission(request, READ_PERMISSION)
        document = get_read_document_or_404(request, document_id)
        first_id = parse_version_id(request.query_params.get('from_version'), 'from_version')
        second_id = parse_version_id(request.query_params.get('to_version'), 'to_version')
        versions = version_queryset(document).filter(pk__in=[first_id, second_id])
        if is_reader_user(request.user):
            versions = versions.filter(estado_version__codigo='PUBLICADO')
        by_id = {version.id: version for version in versions}
        if first_id not in by_id or second_id not in by_id:
            raise Http404
        return Response(compare_versions(by_id[first_id], by_id[second_id], request))


class DocumentVersionTimelineView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def get(self, request, document_id):
        require_permission(request, READ_PERMISSION)
        document = get_read_document_or_404(request, document_id)
        events = []
        for version in version_queryset(document):
            if is_reader_user(request.user) and version.estado_version.codigo != 'PUBLICADO':
                continue
            events.append({
                'id': str(version.id),
                'type': 'version_created',
                'version_id': str(version.id),
                'version': f'{version.numero_mayor}.{version.numero_menor}',
                'at': version.creada_en,
                'author': {
                    'id': str(version.creada_por_id),
                    'username': version.creada_por.nombre_usuario,
                    'name': f'{version.creada_por.nombres} {version.creada_por.apellidos}'.strip(),
                },
                'comment': version.comentario_cambio,
                'status': {
                    'id': version.estado_version_id,
                    'code': version.estado_version.codigo,
                    'name': version.estado_version.nombre,
                },
                'is_current': version.es_vigente,
            })
        return Response({'events': events})


def get_document_file_or_404(request, document_id, file_id):
    document = get_document_or_404(request, document_id)
    document_file = document.archivos.filter(pk=file_id).first()
    if not document_file:
        raise Http404
    return document, document_file


def open_stored_file(document_file):
    try:
        return default_storage.open(document_file.clave_almacenamiento, 'rb')
    except (FileNotFoundError, OSError) as error:
        raise Http404 from error


class DocumentFileDownloadView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def get(self, request, document_id, file_id):
        require_permission(request, READ_PERMISSION)
        if is_reader_user(request.user):
            document = get_accessible_published_document(request.user, document_id, 'documentos.descargar')
            document_file = document.archivos.filter(pk=file_id, estado_version__codigo='PUBLICADO').first()
            if not document_file:
                raise Http404
        else:
            document, document_file = get_document_file_or_404(request, document_id, file_id)
        response = FileResponse(open_stored_file(document_file), content_type=document_file.tipo_mime)
        filename = document_file.nombre_archivo_original.replace('"', '')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        record_document_event(request, document, 'ARCHIVO_DESCARGADO', resource_code='ARCHIVO', resource_id=document_file.id)
        return response


class DocumentVersionDownloadView(DocumentFileDownloadView):
    def get(self, request, document_id, version_id):
        require_permission(request, READ_PERMISSION)
        if is_reader_user(request.user):
            document = get_accessible_published_document(request.user, document_id, 'documentos.descargar')
            document_file = document.archivos.filter(pk=version_id, estado_version__codigo='PUBLICADO').first()
            if not document_file:
                raise Http404
        else:
            document, document_file = get_document_version_or_404(request, document_id, version_id)
        response = FileResponse(open_stored_file(document_file), content_type=document_file.tipo_mime)
        filename = document_file.nombre_archivo_original.replace('"', '')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        record_document_event(request, document, 'ARCHIVO_DESCARGADO', resource_code='ARCHIVO', resource_id=document_file.id)
        return response


class DocumentFilePreviewView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def get(self, request, document_id, file_id):
        require_permission(request, READ_PERMISSION)
        if is_reader_user(request.user):
            document = get_accessible_published_document(request.user, document_id, READ_PERMISSION)
            document_file = document.archivos.filter(pk=file_id, estado_version__codigo='PUBLICADO').first()
            if not document_file:
                raise Http404
        else:
            document, document_file = get_document_file_or_404(request, document_id, file_id)
        if document_file.tipo_mime not in PREVIEWABLE_MIMES:
            return Response({'code': 'PREVIEW_NOT_AVAILABLE', 'detail': 'Este tipo de archivo no tiene vista previa.'}, status=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE)
        response = FileResponse(open_stored_file(document_file), content_type=document_file.tipo_mime)
        filename = document_file.nombre_archivo_original.replace('"', '')
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        record_document_event(request, document, 'ARCHIVO_PREVISUALIZADO', resource_code='ARCHIVO', resource_id=document_file.id)
        return response


class DocumentExportView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def get(self, request):
        require_permission(request, READ_PERMISSION)
        if is_reader_user(request.user):
            raise PermissionDenied({'code': 'READER_ENDPOINT_REQUIRED', 'detail': 'Use los endpoints especificos del lector.'})
        queryset = apply_document_filters(document_queryset(request.user.organizacion_id), request.query_params)
        queryset = filter_accessible_documents(request.user, queryset, READ_PERMISSION)
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="documentos.csv"'
        writer = csv.writer(response)
        writer.writerow(['Codigo', 'Titulo', 'Tipo', 'Area', 'Estado', 'Responsable', 'Actualizado'])
        for document in queryset:
            version = current_version(document)
            writer.writerow([
                document.codigo,
                document.nombre,
                document.tipo_documento.nombre,
                document.area.nombre,
                version.estado_version.nombre if version else '',
                f'{document.creado_por.nombres} {document.creado_por.apellidos}'.strip(),
                document.actualizado_en.isoformat(),
            ])
        return response
