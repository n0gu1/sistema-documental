from datetime import datetime, time
from uuid import UUID

from django.core.files.storage import default_storage
from django.http import FileResponse, Http404
from django.urls import reverse
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import FavoritoDocumento, RegistroAccesoDocumento
from .permissions import IsAuthenticatedAndPasswordCurrent
from .document_filters import apply_document_filters, require_search_permission
from .management_views import require_permission
from .reader_access import (
    filter_accessible_documents,
    get_accessible_published_document,
    get_download_document,
    published_document_queryset,
    published_version,
    record_reader_access,
)


PREVIEWABLE_MIMES = {'application/pdf', 'image/jpeg', 'image/png'}


class ReaderAccessSerializer(serializers.Serializer):
    version_id = serializers.UUIDField(required=False)
    duration_seconds = serializers.IntegerField(required=False, min_value=0, max_value=86400)
    last_page = serializers.IntegerField(required=False, min_value=1)


def parse_reader_date(value, field_name, end=False):
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as error:
        raise serializers.ValidationError({field_name: 'Use una fecha ISO valida.'}) from error
    if parsed.tzinfo is None:
        parsed = timezone.make_aware(datetime.combine(parsed.date(), time.max if end else time.min))
    return parsed


def serialize_reader_version(version, request):
    return {
        'status_scope': 'version',
        'version_status': {'id': version.estado_version_id, 'code': version.estado_version.codigo, 'name': version.estado_version.nombre},
        'is_current': version.es_vigente,
        'is_published': version.estado_version.codigo == 'PUBLICADO',
        'id': str(version.id),
        'name': version.nombre_archivo_original,
        'mime_type': version.tipo_mime,
        'size': version.tamano_bytes,
        'sha256': version.sha256,
        'version': f'{version.numero_mayor}.{version.numero_menor}',
        'status': {'id': version.estado_version_id, 'code': 'PUBLICADO', 'name': version.estado_version.nombre},
        'published_at': version.historial_estados.filter(estado_nuevo__codigo='PUBLICADO').order_by('-cambiado_en').values_list('cambiado_en', flat=True).first(),
        'download_url': request.build_absolute_uri(
            reverse('reader-version-download', args=[version.documento_id, version.id]),
        ),
        'preview_url': request.build_absolute_uri(
            reverse('reader-version-preview', args=[version.documento_id, version.id]),
        ) if version.tipo_mime in {'application/pdf', 'image/jpeg', 'image/png'} else None,
    }


def serialize_reader_document(document, request, include_details=False):
    version = published_version(document)
    favorite = FavoritoDocumento.objects.filter(documento_id=document.id, usuario_id=request.user.id).exists()
    result = {
        'status_scope': 'published_version',
        'published_version_id': str(version.id) if version else None,
        'id': str(document.id),
        'code': document.codigo,
        'title': document.nombre,
        'description': document.descripcion or '',
        'date': document.fecha_documento,
        'area': {'id': str(document.area_id), 'name': document.area.nombre},
        'type': {'id': document.tipo_documento_id, 'code': document.tipo_documento.codigo, 'name': document.tipo_documento.nombre},
        'status': {'code': 'PUBLICADO', 'name': 'Publicado'},
        'version': serialize_reader_version(version, request) if version else None,
        'favorite': favorite,
        'created_at': document.creado_en,
        'updated_at': document.actualizado_en,
    }
    if include_details:
        result['metadata'] = {item.clave: item.valor for item in document.metadatos.all()}
        result['read_url'] = request.build_absolute_uri(reverse('reader-document-read', args=[document.id]))
    return result


def reader_page(queryset, request):
    try:
        limit = min(max(int(request.query_params.get('limit', 25)), 1), 100)
        offset = max(int(request.query_params.get('offset', 0)), 0)
    except (TypeError, ValueError) as error:
        raise serializers.ValidationError({'code': 'INVALID_PAGINATION', 'detail': 'La paginacion no es valida.'}) from error
    total = queryset.count()
    return total, offset, limit, queryset[offset:offset + limit]


def accessible_reader_documents(user):
    return filter_accessible_documents(user, published_document_queryset(user.organizacion_id))


class ReaderDocumentListView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def get(self, request):
        require_permission(request, 'documentos.consultar')
        require_search_permission(request)
        queryset = apply_document_filters(published_document_queryset(request.user.organizacion_id), request.query_params, reader=True, user=request.user)
        documents = filter_accessible_documents(request.user, queryset)
        total = len(documents)
        try:
            limit = min(max(int(request.query_params.get('limit', 25)), 1), 100)
            offset = max(int(request.query_params.get('offset', 0)), 0)
        except (TypeError, ValueError) as error:
            raise serializers.ValidationError({'code': 'INVALID_PAGINATION', 'detail': 'La paginacion no es valida.'}) from error
        page = documents[offset:offset + limit]
        return Response({
            'count': total,
            'next_offset': offset + limit if offset + limit < total else None,
            'results': [serialize_reader_document(document, request) for document in page],
        })


class ReaderDocumentDetailView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def get(self, request, document_id):
        document = get_accessible_published_document(request.user, document_id, 'documentos.consultar', request=request)
        version = published_version(document)
        record_reader_access(request, document, version, 'CONSULTA', 'Detalle documental consultado')
        return Response({'document': serialize_reader_document(document, request, include_details=True)})


class ReaderDocumentReadView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def post(self, request, document_id):
        document = get_accessible_published_document(request.user, document_id, 'documentos.consultar', request=request)
        serializer = ReaderAccessSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        version = published_version(document, serializer.validated_data.get('version_id'))
        if not version:
            raise Http404
        access = record_reader_access(
            request,
            document,
            version,
            'LECTURA',
            'Lectura documental registrada',
            serializer.validated_data.get('duration_seconds'),
            serializer.validated_data.get('last_page'),
        )
        return Response({
            'reading': {
                'id': str(access.id),
                'document_id': str(document.id),
                'version_id': str(version.id),
                'registered_at': access.registrado_en,
            },
        }, status=status.HTTP_201_CREATED)


class ReaderReadingHistoryView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def get(self, request):
        queryset = RegistroAccesoDocumento.objects.select_related(
            'documento', 'documento__area', 'documento__tipo_documento',
            'version_documento', 'version_documento__estado_version',
        ).filter(usuario_id=request.user.id, documento__organizacion_id=request.user.organizacion_id)
        access_type = request.query_params.get('type')
        if access_type:
            queryset = queryset.filter(tipo=access_type.upper())
        if request.query_params.get('document_id'):
            queryset = queryset.filter(documento_id=request.query_params['document_id'])
        date_from = parse_reader_date(request.query_params.get('date_from'), 'date_from')
        date_to = parse_reader_date(request.query_params.get('date_to'), 'date_to', end=True)
        if date_from:
            queryset = queryset.filter(registrado_en__gte=date_from)
        if date_to:
            queryset = queryset.filter(registrado_en__lte=date_to)
        total, offset, limit, records = reader_page(queryset, request)
        return Response({
            'count': total,
            'next_offset': offset + limit if offset + limit < total else None,
            'results': [
                {
                    'id': str(record.id),
                    'type': record.tipo,
                    'detail': record.detalle or '',
                    'document': {
                        'id': str(record.documento_id),
                        'code': record.documento.codigo,
                        'title': record.documento.nombre,
                        'area': {'id': str(record.documento.area_id), 'name': record.documento.area.nombre},
                        'type': {'id': record.documento.tipo_documento_id, 'name': record.documento.tipo_documento.nombre},
                    },
                    'version': f'{record.version_documento.numero_mayor}.{record.version_documento.numero_menor}',
                    'duration_seconds': record.duracion_segundos,
                    'last_page': record.pagina_final,
                    'ip_address': record.direccion_ip,
                    'user_agent': record.agente_usuario,
                    'result': 'Exitoso',
                    'registered_at': record.registrado_en,
                }
                for record in records
            ],
        })


class ReaderFavoritesView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def get(self, request):
        accessible_ids = {document.id for document in accessible_reader_documents(request.user)}
        queryset = FavoritoDocumento.objects.select_related('documento', 'documento__area', 'documento__tipo_documento').filter(
            usuario_id=request.user.id,
            documento_id__in=accessible_ids,
        ).order_by('-creado_en')
        total, offset, limit, favorites = reader_page(queryset, request)
        return Response({
            'count': total,
            'next_offset': offset + limit if offset + limit < total else None,
            'results': [
                {
                    'id': str(item.id),
                    'created_at': item.creado_en,
                    'document': serialize_reader_document(item.documento, request),
                }
                for item in favorites
            ],
        })


class ReaderFavoriteView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def post(self, request, document_id):
        document = get_accessible_published_document(request.user, document_id, 'documentos.consultar', request=request)
        favorite, created = FavoritoDocumento.objects.get_or_create(documento=document, usuario=request.user)
        return Response({'favorite': {'id': str(favorite.id), 'document_id': str(document.id), 'created_at': favorite.creado_en}}, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    def delete(self, request, document_id):
        get_accessible_published_document(request.user, document_id, 'documentos.consultar', request=request)
        deleted, _ = FavoritoDocumento.objects.filter(documento_id=document_id, usuario_id=request.user.id).delete()
        if not deleted:
            return Response({'code': 'FAVORITE_NOT_FOUND', 'detail': 'El documento no estaba en favoritos.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


def open_reader_file(version):
    try:
        return default_storage.open(version.clave_almacenamiento, 'rb')
    except (FileNotFoundError, OSError) as error:
        raise Http404 from error


class ReaderVersionFileView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]
    inline = False

    def get(self, request, document_id, version_id):
        document = (get_accessible_published_document(request.user, document_id, 'documentos.consultar', request=request)
                    if self.inline else get_download_document(request, document_id, published_only=True))
        version = published_version(document, version_id)
        if not version:
            raise Http404
        if self.inline and version.tipo_mime not in PREVIEWABLE_MIMES:
            return Response({'code': 'PREVIEW_NOT_AVAILABLE', 'detail': 'Este tipo de archivo no tiene vista previa.'}, status=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE)
        record_reader_access(request, document, version, 'VISTA_PREVIA' if self.inline else 'DESCARGA', 'Archivo publicado consultado')
        response = FileResponse(open_reader_file(version), content_type=version.tipo_mime)
        filename = version.nombre_archivo_original.replace('"', '')
        response['Content-Disposition'] = f'{"inline" if self.inline else "attachment"}; filename="{filename}"'
        response['X-Document-Version-Id'] = str(version.id)
        response['X-Document-Version'] = f'{version.numero_mayor}.{version.numero_menor}'
        response['X-Content-SHA256'] = version.sha256
        response['Cache-Control'] = 'private, no-store'
        return response


class ReaderVersionDownloadView(ReaderVersionFileView):
    inline = False


class ReaderVersionPreviewView(ReaderVersionFileView):
    inline = True
