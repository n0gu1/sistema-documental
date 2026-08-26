import csv
from datetime import datetime, time
from pathlib import Path
from uuid import uuid4

from django.core.files.storage import default_storage
from django.db import transaction
from django.http import FileResponse, Http404, HttpResponse
from django.urls import reverse
from django.utils import timezone
from rest_framework import parsers, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .auth_utils import record_auth_event
from .document_serializers import DocumentCreateSerializer, DocumentFileSerializer, DocumentUpdateSerializer
from .file_validation import validate_uploaded_file
from .management_views import require_permission
from .models import (
    ArchivoDocumento,
    AreaCatalogo,
    Documento,
    EstadoVersionCatalogo,
    MetadatoDocumento,
    ProveedorAlmacenamiento,
    TipoDocumentoCatalogo,
)
from .permissions import IsAuthenticatedAndPasswordCurrent


READ_PERMISSION = 'documentos.consultar'
WRITE_PERMISSION = 'documentos.gestionar'
PREVIEWABLE_MIMES = {'application/pdf', 'image/jpeg', 'image/png'}


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


def serialize_file(document_file, request):
    return {
        'id': str(document_file.id),
        'name': document_file.nombre_archivo_original,
        'mime_type': document_file.tipo_mime,
        'size': document_file.tamano_bytes,
        'sha256': document_file.sha256,
        'version': f'{document_file.numero_mayor}.{document_file.numero_menor}',
        'created_at': document_file.creada_en,
        'download_url': request.build_absolute_uri(
            reverse('document-file-download', args=[document_file.documento_id, document_file.id]),
        ),
        'preview_url': request.build_absolute_uri(
            reverse('document-file-preview', args=[document_file.documento_id, document_file.id]),
        ) if document_file.tipo_mime in PREVIEWABLE_MIMES else None,
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
    if not document:
        raise Http404
    return document


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
            defaults={'valor': '' if value is None else str(value)},
        )


def save_document_file(document, uploaded_file, user):
    file_data = validate_uploaded_file(uploaded_file)
    provider = ProveedorAlmacenamiento.objects.filter(
        organizacion_id=document.organizacion_id,
    ).order_by('-activo', 'codigo').first()
    if not provider:
        raise ValidationError({'file': 'No hay proveedor de almacenamiento configurado.'})
    state = EstadoVersionCatalogo.objects.filter(codigo='BORRADOR').first()
    if not state:
        raise ValidationError({'file': 'No hay estado BORRADOR configurado para la version.'})
    latest = document.archivos.order_by('-orden_version').first()
    major = latest.numero_mayor + 1 if latest else 1
    order = latest.orden_version + 1 if latest else 1
    extension = Path(file_data['name']).suffix.lower()
    storage_name = f'{document.organizacion_id}/{document.id}/{uuid4().hex}{extension}'
    storage_key = default_storage.save(storage_name, uploaded_file)
    return ArchivoDocumento.objects.create(
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
        comentario_cambio='Carga inicial de archivo',
        creada_por=user,
    )


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
        queryset = apply_document_filters(document_queryset(request.user.organizacion_id), request.query_params)
        total, offset, limit, documents = page_queryset(queryset, request.query_params)
        return Response({
            'count': total,
            'next_offset': offset + limit if offset + limit < total else None,
            'results': [serialize_document(document, request) for document in documents],
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
            validate_uploaded_file(uploaded_file)
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
                save_document_file(document, uploaded_file, request.user)
        record_document_event(request, document, 'DOCUMENTO_CREADO')
        return Response({'document': serialize_document(document, request, include_details=True)}, status=status.HTTP_201_CREATED)


class DocumentDetailView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]
    parser_classes = [parsers.MultiPartParser, parsers.FormParser, parsers.JSONParser]

    def get(self, request, document_id):
        require_permission(request, READ_PERMISSION)
        document = get_document_or_404(request, document_id)
        return Response({'document': serialize_document(document, request, include_details=True)})

    def patch(self, request, document_id):
        require_permission(request, WRITE_PERMISSION)
        document = get_document_or_404(request, document_id)
        serializer = DocumentUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        uploaded_file = request.FILES.get('file')
        if uploaded_file:
            validate_uploaded_file(uploaded_file)
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
            save_document_file(document, uploaded_file, request.user)
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
        document = get_document_or_404(request, document_id)
        return Response({'files': [serialize_file(item, request) for item in document.archivos.all()]})

    def post(self, request, document_id):
        require_permission(request, WRITE_PERMISSION)
        document = get_document_or_404(request, document_id)
        serializer = DocumentFileSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        document_file = save_document_file(document, serializer.validated_data['file'], request.user)
        record_document_event(request, document, 'ARCHIVO_CARGADO', resource_code='ARCHIVO', resource_id=document_file.id)
        return Response({'file': serialize_file(document_file, request)}, status=status.HTTP_201_CREATED)


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
        document, document_file = get_document_file_or_404(request, document_id, file_id)
        response = FileResponse(open_stored_file(document_file), content_type=document_file.tipo_mime)
        filename = document_file.nombre_archivo_original.replace('"', '')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        record_document_event(request, document, 'ARCHIVO_DESCARGADO', resource_code='ARCHIVO', resource_id=document_file.id)
        return response


class DocumentFilePreviewView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def get(self, request, document_id, file_id):
        require_permission(request, READ_PERMISSION)
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
        queryset = apply_document_filters(document_queryset(request.user.organizacion_id), request.query_params)
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
