"""Contrato común de búsqueda para listados generales y de lector."""
from datetime import datetime, time

from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers

from .management_views import require_permission


FILTER_FIELDS = ('search', 'type_id', 'area_id', 'status_code', 'responsible_id',
                 'date_from', 'date_to', 'updated_from', 'updated_to', 'favorite')


def require_search_permission(request):
    if any(str(request.query_params.get(key, '')).strip() for key in FILTER_FIELDS):
        require_permission(request, 'documentos.buscar')


class DocumentFilterSerializer(serializers.Serializer):
    search = serializers.CharField(required=False, allow_blank=True)
    type_id = serializers.IntegerField(required=False, min_value=1)
    area_id = serializers.UUIDField(required=False)
    responsible_id = serializers.UUIDField(required=False)
    status_code = serializers.RegexField(r'^[A-Z][A-Z0-9_]*$', required=False, max_length=32)
    date_from = serializers.DateField(required=False, input_formats=['%Y-%m-%d'])
    date_to = serializers.DateField(required=False, input_formats=['%Y-%m-%d'])
    updated_from = serializers.DateField(required=False, input_formats=['%Y-%m-%d'])
    updated_to = serializers.DateField(required=False, input_formats=['%Y-%m-%d'])
    favorite = serializers.BooleanField(required=False)

    def validate(self, attrs):
        for start, end in (('date_from', 'date_to'), ('updated_from', 'updated_to')):
            if start in attrs and end in attrs and attrs[start] > attrs[end]:
                raise serializers.ValidationError({end: 'La fecha final debe ser igual o posterior a la inicial.'})
        return attrs


def apply_document_filters(queryset, params, *, reader=False, user=None):
    serializer = DocumentFilterSerializer(data={key: params[key] for key in FILTER_FIELDS if str(params.get(key, '')).strip()})
    serializer.is_valid(raise_exception=True)
    filters = serializer.validated_data
    if filters.get('search'):
        value = filters['search']
        queryset = queryset.filter(Q(codigo__icontains=value) | Q(nombre__icontains=value) | Q(descripcion__icontains=value))
    for key, field in (('type_id', 'tipo_documento_id'), ('area_id', 'area_id'), ('responsible_id', 'creado_por_id'),
                       ('date_from', 'fecha_documento__gte'), ('date_to', 'fecha_documento__lte')):
        if key in filters:
            queryset = queryset.filter(**{field: filters[key]})
    if filters.get('status_code'):
        if reader:
            # El lector consulta la versión publicada, que puede no ser la vigente.
            if filters['status_code'] != 'PUBLICADO':
                queryset = queryset.none()
        else:
            queryset = queryset.filter(archivos__es_vigente=True, archivos__estado_version__codigo=filters['status_code'])
    for key, lookup, boundary in (('updated_from', 'actualizado_en__gte', time.min), ('updated_to', 'actualizado_en__lte', time.max)):
        if key in filters:
            queryset = queryset.filter(**{lookup: timezone.make_aware(datetime.combine(filters[key], boundary))})
    if filters.get('favorite') and user is not None:
        from .models import FavoritoDocumento
        queryset = queryset.filter(id__in=FavoritoDocumento.objects.filter(usuario_id=user.id).values('documento_id'))
    ordering_fields = {'code': 'codigo', 'title': 'nombre', 'created_at': 'creado_en', 'updated_at': 'actualizado_en', 'document_date': 'fecha_documento'}
    ordering = params.get('ordering', '-updated_at')
    field = ordering_fields.get(ordering.lstrip('-'), 'actualizado_en')
    return queryset.order_by(f'-{field}' if ordering.startswith('-') else field, 'codigo').distinct()
