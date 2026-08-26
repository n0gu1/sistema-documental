import csv
from datetime import datetime, time

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
    Area,
    ClasificacionDocumento,
    Documento,
    EstadoDocumento,
    MetadatoDocumento,
    TipoDocumento,
    UsuarioDocumental,
)
from .permissions import IsAuthenticatedAndPasswordCurrent


READ_PERMISSION = 'documentos.consultar'
WRITE_PERMISSION = 'documentos.gestionar'
PREVIEWABLE_MIMES = {'application/pdf', 'image/jpeg', 'image/png'}


def document_queryset(organization_id):
    return Documento.objects.filter(organizacion_id=organization_id).select_related(
        'area', 'tipo', 'clasificacion', 'estado', 'responsable', 'creado_por',
    )


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
            titulo__icontains=search,
        ) | queryset.filter(
            descripcion__icontains=search,
        ) | queryset.filter(
            palabras_clave__icontains=search,
        )
    filters = {
        'tipo_id': params.get('type_id'),
        'area_id': params.get('area_id'),
        'estado_id': params.get('status_id'),
        'clasificacion_id': params.get('classification_id'),
        'responsable_id': params.get('responsible_id'),
    }
    for field, value in filters.items():
        if value:
            queryset = queryset.filter(**{field: value})
    if params.get('status_code'):
        queryset = queryset.filter(estado__codigo=params['status_code'])
    date_from = parse_filter_date(params.get('date_from'), 'date_from')
    date_to = parse_filter_date(params.get('date_to'), 'date_to', end=True)
    if date_from:
        queryset = queryset.filter(actualizado_en__gte=date_from)
    if date_to:
        queryset = queryset.filter(actualizado_en__lte=date_to)
    ordering = params.get('ordering', '-updated_at')
    ordering_fields = {
        'code': 'codigo',
        'title': 'titulo',
        'created_at': 'creado_en',
        'updated_at': 'actualizado_en',
    }
    descending = ordering.startswith('-')
    field = ordering_fields.get(ordering.lstrip('-'), 'actualizado_en')
    queryset = queryset.order_by(f'-{field}' if descending else field, 'codigo')
    return queryset


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


def serialize_file(document_file, request):
    return {
        'id': str(document_file.id),
        'name': document_file.nombre_original,
        'mime_type': document_file.mime_type,
        'size': document_file.tamano,
        'sha256': document_file.sha256,
        'created_at': document_file.creado_en,
        'download_url': request.build_absolute_uri(
            reverse('document-file-download', args=[document_file.documento_id, document_file.id]),
        ),
        'preview_url': request.build_absolute_uri(
            reverse('document-file-preview', args=[document_file.documento_id, document_file.id]),
        ) if document_file.mime_type in PREVIEWABLE_MIMES else None,
    }


def serialize_document(document, request, include_details=False):
    result = {
        'id': str(document.id),
        'code': document.codigo,
        'title': document.titulo,
        'description': document.descripcion,
        'content': document.contenido,
        'keywords': document.palabras_clave,
        'scope': document.alcance,
        'area': {'id': str(document.area_id), 'name': document.area.nombre} if document.area_id else None,
        'type': {'id': str(document.tipo_id), 'code': document.tipo.codigo, 'name': document.tipo.nombre},
        'classification': (
            {'id': str(document.clasificacion_id), 'code': document.clasificacion.codigo, 'name': document.clasificacion.nombre}
            if document.clasificacion_id else None
        ),
        'status': {'id': str(document.estado_id), 'code': document.estado.codigo, 'name': document.estado.nombre},
        'responsible': {
            'id': str(document.responsable_id),
            'username': document.responsable.nombre_usuario,
            'name': f'{document.responsable.nombres} {document.responsable.apellidos}'.strip(),
        },
        'created_by': str(document.creado_por_id),
        'created_at': document.creado_en,
        'updated_at': document.actualizado_en,
        'archived_at': document.archivado_en,
    }
    if include_details:
        result['metadata'] = {
            item.clave: item.valor for item in MetadatoDocumento.objects.filter(documento_id=document.id)
        }
        result['files'] = [
            serialize_file(item, request)
            for item in ArchivoDocumento.objects.filter(documento_id=document.id)
        ]
    return result


def get_document_or_404(request, document_id):
    document = document_queryset(request.user.organizacion_id).filter(pk=document_id).first()
    if not document:
        raise Http404
    return document


def get_reference_or_error(model, object_id, organization_id, field_name):
    filters = {'pk': object_id}
    if model is not EstadoDocumento:
        filters['organizacion_id'] = organization_id
    reference = model.objects.filter(**filters).first()
    if not reference:
        raise ValidationError({field_name: 'La referencia no existe o no pertenece a la organizacion.'})
    return reference


def get_status(data):
    if data.get('status_id'):
        return EstadoDocumento.objects.filter(pk=data['status_id'], activo=True).first()
    return EstadoDocumento.objects.filter(codigo=data.get('status_code', 'BORRADOR'), activo=True).first()


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
    return ArchivoDocumento.objects.create(
        documento=document,
        archivo=uploaded_file,
        nombre_original=file_data['name'],
        mime_type=file_data['mime_type'],
        tamano=file_data['size'],
        sha256=file_data['sha256'],
        subido_por=user,
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
        area = get_reference_or_error(Area, data.get('area_id'), organization_id, 'area_id') if data.get('area_id') else None
        document_type = get_reference_or_error(TipoDocumento, data['type_id'], organization_id, 'type_id')
        classification = (
            get_reference_or_error(ClasificacionDocumento, data['classification_id'], organization_id, 'classification_id')
            if data.get('classification_id') else None
        )
        state = get_status(data)
        if not state:
            raise ValidationError({'status_code': 'El estado solicitado no existe.'})
        responsible = request.user
        if data.get('responsible_id'):
            responsible = UsuarioDocumental.objects.filter(
                pk=data['responsible_id'], organizacion_id=organization_id, activo=True,
            ).first()
            if not responsible:
                raise ValidationError({'responsible_id': 'El responsable no existe o no esta activo.'})
        if Documento.objects.filter(organizacion_id=organization_id, codigo=data['code']).exists():
            return Response({'code': 'DOCUMENT_ALREADY_EXISTS', 'detail': 'El codigo ya existe.'}, status=status.HTTP_409_CONFLICT)
        uploaded_file = request.FILES.get('file')
        if uploaded_file:
            validate_uploaded_file(uploaded_file)
        with transaction.atomic():
            document = Documento.objects.create(
                organizacion_id=organization_id,
                codigo=data['code'],
                titulo=data['title'],
                descripcion=data.get('description', ''),
                contenido=data.get('content', ''),
                palabras_clave=data.get('keywords', ''),
                alcance=data.get('scope', ''),
                area=area,
                tipo=document_type,
                clasificacion=classification,
                estado=state,
                responsable=responsible,
                creado_por=request.user,
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
        field_mapping = {
            'code': 'codigo', 'title': 'titulo', 'description': 'descripcion', 'content': 'contenido',
            'keywords': 'palabras_clave', 'scope': 'alcance',
        }
        for key, field in field_mapping.items():
            if key in data:
                updates[field] = data[key]
        if 'code' in data and Documento.objects.filter(
            organizacion_id=document.organizacion_id, codigo=data['code'],
        ).exclude(pk=document.pk).exists():
            return Response({'code': 'DOCUMENT_ALREADY_EXISTS', 'detail': 'El codigo ya existe.'}, status=status.HTTP_409_CONFLICT)
        if 'area_id' in data:
            updates['area'] = get_reference_or_error(Area, data['area_id'], document.organizacion_id, 'area_id') if data['area_id'] else None
        if 'type_id' in data:
            updates['tipo'] = get_reference_or_error(TipoDocumento, data['type_id'], document.organizacion_id, 'type_id')
        if 'classification_id' in data:
            updates['clasificacion'] = (
                get_reference_or_error(ClasificacionDocumento, data['classification_id'], document.organizacion_id, 'classification_id')
                if data['classification_id'] else None
            )
        if 'status_id' in data or 'status_code' in data:
            state = get_status(data)
            if not state:
                raise ValidationError({'status_code': 'El estado solicitado no existe.'})
            updates['estado'] = state
        if 'responsible_id' in data:
            responsible = UsuarioDocumental.objects.filter(
                pk=data['responsible_id'], organizacion_id=document.organizacion_id, activo=True,
            ).first()
            if not responsible:
                raise ValidationError({'responsible_id': 'El responsable no existe o no esta activo.'})
            updates['responsable'] = responsible
        for field, value in updates.items():
            setattr(document, field, value)
        if updates:
            document.save(update_fields=[*updates.keys(), 'actualizado_en'])
        save_metadata(document, data.get('metadata'))
        if uploaded_file:
            save_document_file(document, uploaded_file, request.user)
        record_document_event(request, document, 'DOCUMENTO_MODIFICADO')
        return Response({'document': serialize_document(document, request, include_details=True)})

    def delete(self, request, document_id):
        require_permission(request, WRITE_PERMISSION)
        document = get_document_or_404(request, document_id)
        files = list(document.archivos.all())
        record_document_event(request, document, 'DOCUMENTO_ELIMINADO')
        with transaction.atomic():
            for document_file in files:
                document_file.archivo.delete(save=False)
            document.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def archive_document(document):
    state = EstadoDocumento.objects.filter(codigo='ARCHIVADO', activo=True).first()
    document.archivado_en = timezone.now()
    if state:
        document.estado = state
    document.save(update_fields=['archivado_en', 'estado', 'actualizado_en'])


class DocumentArchiveView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def post(self, request, document_id):
        require_permission(request, WRITE_PERMISSION)
        document = get_document_or_404(request, document_id)
        archive_document(document)
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


class DocumentFileDownloadView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def get(self, request, document_id, file_id):
        require_permission(request, READ_PERMISSION)
        document, document_file = get_document_file_or_404(request, document_id, file_id)
        try:
            response = FileResponse(document_file.archivo.open('rb'), content_type=document_file.mime_type)
        except (FileNotFoundError, OSError) as error:
            raise Http404 from error
        filename = document_file.nombre_original.replace('"', '')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        record_document_event(request, document, 'ARCHIVO_DESCARGADO', resource_code='ARCHIVO', resource_id=document_file.id)
        return response


class DocumentFilePreviewView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def get(self, request, document_id, file_id):
        require_permission(request, READ_PERMISSION)
        document, document_file = get_document_file_or_404(request, document_id, file_id)
        if document_file.mime_type not in PREVIEWABLE_MIMES:
            return Response({'code': 'PREVIEW_NOT_AVAILABLE', 'detail': 'Este tipo de archivo no tiene vista previa.'}, status=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE)
        try:
            response = FileResponse(document_file.archivo.open('rb'), content_type=document_file.mime_type)
        except (FileNotFoundError, OSError) as error:
            raise Http404 from error
        filename = document_file.nombre_original.replace('"', '')
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
            writer.writerow([
                document.codigo,
                document.titulo,
                document.tipo.nombre,
                document.area.nombre if document.area_id else '',
                document.estado.nombre,
                f'{document.responsable.nombres} {document.responsable.apellidos}'.strip(),
                document.actualizado_en.isoformat(),
            ])
        return response
