from datetime import timedelta
from uuid import UUID, uuid4

from django.db import transaction
from django.http import Http404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .auth_utils import get_user_roles
from .document_views import get_document_or_404, get_document_version_or_404, record_document_event
from .management_views import require_permission
from .models import (
    ArchivoDocumento,
    ComentarioRevision,
    DetalleSolicitudRevision,
    ElementoChecklistRevision,
    EstadoRevisionCatalogo,
    EstadoVersionCatalogo,
    HistorialEstadoVersion,
    SolicitudRevision,
    UsuarioDocumental,
)
from .permissions import IsAuthenticatedAndPasswordCurrent
from .security_utils import sanitize_text
from .notifications import (
    notify_document_publication,
    notify_review_assignment,
    notify_review_comment,
    notify_review_decision,
)


REVIEW_READ = 'revisiones.consultar'
REVIEW_SEND = 'revisiones.enviar'
REVIEW_APPROVE = 'revisiones.aprobar'
REVIEW_REJECT = 'revisiones.rechazar'

VERSION_TRANSITIONS = {
    'BORRADOR': {'EN_REVISION'},
    'EN_REVISION': {'APROBADO', 'BORRADOR', 'RECHAZADO'},
    'APROBADO': {'PUBLICADO'},
    'PUBLICADO': set(),
    'RECHAZADO': set(),
    'ARCHIVADO': set(),
}


class SubmitReviewSerializer(serializers.Serializer):
    reviewer_ids = serializers.ListField(
        child=serializers.UUIDField(),
        allow_empty=False,
        min_length=1,
    )
    deadline = serializers.DateTimeField(required=False, allow_null=True)
    priority = serializers.ChoiceField(
        choices=[item[0] for item in DetalleSolicitudRevision.PRIORIDADES],
        default='MEDIA',
    )
    comment = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    checklist = serializers.ListField(
        child=serializers.CharField(max_length=255, trim_whitespace=True),
        required=False,
        allow_empty=True,
    )

    def validate_reviewer_ids(self, value):
        if len(set(value)) != len(value):
            raise serializers.ValidationError('No repita revisores en la asignacion.')
        return value

    def validate_comment(self, value):
        return sanitize_text(value)

    def validate_checklist(self, value):
        return [sanitize_text(item) for item in value]


class ReviewDecisionSerializer(serializers.Serializer):
    comment = serializers.CharField(required=False, allow_blank=True, max_length=2000)

    def validate_comment(self, value):
        return sanitize_text(value)


class ReviewAssignmentSerializer(serializers.Serializer):
    reviewer_id = serializers.UUIDField()
    deadline = serializers.DateTimeField(required=False, allow_null=True)
    priority = serializers.ChoiceField(
        choices=[item[0] for item in DetalleSolicitudRevision.PRIORIDADES],
        required=False,
    )


class ReviewCommentSerializer(serializers.Serializer):
    content = serializers.CharField(max_length=5000, trim_whitespace=True)
    parent_id = serializers.UUIDField(required=False, allow_null=True)
    type = serializers.ChoiceField(
        choices=['OBSERVACION', 'RESPUESTA'],
        default='OBSERVACION',
    )

    def validate_content(self, value):
        return sanitize_text(value)


class ChecklistSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=255, trim_whitespace=True)

    def validate_title(self, value):
        return sanitize_text(value)


class ChecklistUpdateSerializer(serializers.Serializer):
    completed = serializers.BooleanField()


def is_admin(user):
    return any(role['code'] == 'ADMINISTRADOR' for role in get_user_roles(user.id))


def serialize_user_summary(user):
    return {
        'id': str(user.id),
        'username': user.nombre_usuario,
        'name': f'{user.nombres} {user.apellidos}'.strip(),
    }


def serialize_comment(comment):
    return {
        'id': str(comment.id),
        'parent_id': str(comment.comentario_padre_id) if comment.comentario_padre_id else None,
        'type': comment.tipo,
        'content': comment.contenido,
        'resolved': comment.resuelto,
        'resolved_by_id': str(comment.resuelto_por_id) if comment.resuelto_por_id else None,
        'resolved_at': comment.resuelto_en,
        'author': serialize_user_summary(comment.autor),
        'created_at': comment.creado_en,
        'updated_at': comment.actualizado_en,
    }


def serialize_review(review):
    try:
        detail = review.detalle
    except DetalleSolicitudRevision.DoesNotExist:
        detail = None
    return {
        'id': str(review.id),
        'status': {
            'id': review.estado_revision_id,
            'code': review.estado_revision.codigo,
            'name': review.estado_revision.nombre,
        },
        'document': {
            'id': str(review.version_documento.documento_id),
            'version_id': str(review.version_documento_id),
            'code': review.version_documento.documento.codigo,
            'title': review.version_documento.documento.nombre,
            'version': f'{review.version_documento.numero_mayor}.{review.version_documento.numero_menor}',
        },
        'reviewer': serialize_user_summary(review.revisor),
        'requested_by': serialize_user_summary(review.solicitada_por),
        'request_comment': review.comentario_solicitud or '',
        'resolution_comment': review.comentario_resolucion or '',
        'requested_at': review.solicitada_en,
        'resolved_at': review.resuelta_en,
        'deadline': detail.fecha_limite if detail else None,
        'priority': detail.prioridad if detail else 'MEDIA',
        'checklist': [
            {
                'id': str(item.id),
                'title': item.titulo,
                'order': item.orden,
                'completed': item.completada,
                'completed_by_id': str(item.completada_por_id) if item.completada_por_id else None,
                'completed_at': item.completada_en,
            }
            for item in review.checklist.all()
        ],
        'comments': [serialize_comment(comment) for comment in review.comentarios.select_related('autor').all()],
    }


def get_review_or_404(request, review_id):
    review = SolicitudRevision.objects.select_related(
        'estado_revision',
        'revisor',
        'solicitada_por',
        'version_documento__documento',
        'version_documento__estado_version',
    ).filter(
        pk=review_id,
        version_documento__documento__organizacion_id=request.user.organizacion_id,
    ).first()
    if not review:
        raise Http404
    if not is_admin(request.user) and request.user.id not in {review.revisor_id, review.solicitada_por_id}:
        raise Http404
    return review


def get_catalog_state(model, code):
    state = model.objects.filter(codigo=code).first()
    if not state:
        raise serializers.ValidationError({'code': 'WORKFLOW_CONFIGURATION_ERROR', 'detail': f'No existe el estado {code}.'})
    return state


def transition_version(version, target_code, user, comment=''):
    current_code = version.estado_version.codigo
    if target_code not in VERSION_TRANSITIONS.get(current_code, set()):
        raise serializers.ValidationError({
            'code': 'INVALID_VERSION_TRANSITION',
            'detail': f'No se permite cambiar de {current_code} a {target_code}.',
        })
    target = get_catalog_state(EstadoVersionCatalogo, target_code)
    now = timezone.now()
    HistorialEstadoVersion.objects.create(
        version_documento=version,
        estado_anterior=version.estado_version,
        estado_nuevo=target,
        cambiado_por=user,
        comentario=comment or None,
        cambiado_en=now,
    )
    version.estado_version = target
    version.save(update_fields=['estado_version'])


def get_revision_state(code):
    return get_catalog_state(EstadoRevisionCatalogo, code)


def validate_reviewer_ids(reviewer_ids, organization_id):
    reviewers = list(UsuarioDocumental.objects.filter(
        id__in=reviewer_ids,
        organizacion_id=organization_id,
        activo=True,
    ))
    reviewers_by_id = {reviewer.id: reviewer for reviewer in reviewers}
    if len(reviewers_by_id) != len(reviewer_ids):
        raise serializers.ValidationError({'reviewer_ids': 'Uno o mas revisores no existen o estan inactivos.'})
    for reviewer in reviewers:
        if not any(role['code'] in {'REVISOR', 'ADMINISTRADOR'} for role in get_user_roles(reviewer.id)):
            raise serializers.ValidationError({'reviewer_ids': f'{reviewer.nombre_usuario} no tiene rol de revisor.'})
    return [reviewers_by_id[reviewer_id] for reviewer_id in reviewer_ids]


def add_resolution_comment(review, user, content, comment_type='RESOLUCION', parent=None):
    if not content:
        return None
    return ComentarioRevision.objects.create(
        id=uuid4(),
        solicitud=review,
        autor=user,
        comentario_padre=parent,
        tipo=comment_type,
        contenido=content,
    )


class ReviewSubmitView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def post(self, request, document_id, version_id):
        require_permission(request, REVIEW_SEND)
        document, version = get_document_version_or_404(request, document_id, version_id)
        serializer = SubmitReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if version.estado_version.codigo != 'BORRADOR':
            raise serializers.ValidationError({'code': 'VERSION_NOT_EDITABLE', 'detail': 'Solo se pueden enviar versiones en borrador.'})
        reviewers = validate_reviewer_ids(data['reviewer_ids'], document.organizacion_id)
        if data.get('deadline') and data['deadline'] <= timezone.now():
            raise serializers.ValidationError({'deadline': 'La fecha limite debe ser futura.'})
        pending_state = get_revision_state('PENDIENTE')
        now = timezone.now()
        deadline = data.get('deadline') or now + timedelta(days=3)
        with transaction.atomic():
            if SolicitudRevision.objects.filter(version_documento=version, estado_revision=pending_state).exists():
                return Response({'code': 'REVIEW_ALREADY_PENDING', 'detail': 'La version ya tiene una revision pendiente.'}, status=status.HTTP_409_CONFLICT)
            transition_version(version, 'EN_REVISION', request.user, data.get('comment', 'Enviada a revision'))
            reviews = []
            for reviewer in reviewers:
                review = SolicitudRevision.objects.create(
                    id=uuid4(),
                    version_documento=version,
                    revisor=reviewer,
                    solicitada_por=request.user,
                    estado_revision=pending_state,
                    comentario_solicitud=data.get('comment') or None,
                    solicitada_en=now,
                )
                DetalleSolicitudRevision.objects.create(
                    id=uuid4(),
                    solicitud=review,
                    fecha_limite=deadline,
                    prioridad=data['priority'],
                )
                for order, title in enumerate(data.get('checklist', [])):
                    ElementoChecklistRevision.objects.create(
                        id=uuid4(),
                        solicitud=review,
                        orden=order,
                        titulo=title,
                    )
                if data.get('comment'):
                    add_resolution_comment(review, request.user, data['comment'], comment_type='OBSERVACION')
                reviews.append(review)
        record_document_event(
            request,
            document,
            'REVISION_SOLICITADA',
            resource_code='ARCHIVO',
            resource_id=version.id,
            details={'comment': data.get('comment', ''), 'reviewer_count': len(reviews)},
        )
        for review in reviews:
            record_document_event(
                request,
                document,
                'REVISION_ASIGNADA',
                resource_code='ARCHIVO',
                resource_id=version.id,
                details={'reviewer_id': str(review.revisor_id)},
            )
            notify_review_assignment(review, actor_id=request.user.id)
        return Response({'reviews': [serialize_review(review) for review in reviews]}, status=status.HTTP_201_CREATED)


class ReviewInboxView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def get(self, request):
        require_permission(request, REVIEW_READ)
        queryset = SolicitudRevision.objects.select_related(
            'estado_revision', 'revisor', 'solicitada_por', 'version_documento__documento',
        ).filter(version_documento__documento__organizacion_id=request.user.organizacion_id)
        if not is_admin(request.user):
            queryset = queryset.filter(revisor=request.user)
        state = request.query_params.get('status')
        if state:
            queryset = queryset.filter(estado_revision__codigo=state.upper())
        if request.query_params.get('overdue') == 'true':
            queryset = queryset.filter(detalle__fecha_limite__lt=timezone.now(), estado_revision__codigo='PENDIENTE')
        try:
            limit = min(max(int(request.query_params.get('limit', 25)), 1), 100)
            offset = max(int(request.query_params.get('offset', 0)), 0)
        except (TypeError, ValueError) as error:
            raise serializers.ValidationError({'code': 'INVALID_PAGINATION', 'detail': 'La paginacion no es valida.'}) from error
        total = queryset.count()
        reviews = queryset.select_related('version_documento__estado_version').prefetch_related('checklist', 'comentarios__autor')[offset:offset + limit]
        return Response({
            'count': total,
            'next_offset': offset + limit if offset + limit < total else None,
            'results': [serialize_review(review) for review in reviews],
        })


class ReviewDetailView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def get(self, request, review_id):
        require_permission(request, REVIEW_READ)
        return Response({'review': serialize_review(get_review_or_404(request, review_id))})


class ReviewAssignmentView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def post(self, request, review_id):
        require_permission(request, REVIEW_SEND)
        review = get_review_or_404(request, review_id)
        if not is_admin(request.user) and review.solicitada_por_id != request.user.id:
            raise serializers.ValidationError({'code': 'REQUESTER_NOT_ALLOWED', 'detail': 'Solo quien solicito la revision puede reasignarla.'})
        if review.estado_revision.codigo != 'PENDIENTE':
            return Response({'code': 'REVIEW_NOT_PENDING', 'detail': 'Solo se pueden reasignar revisiones pendientes.'}, status=status.HTTP_409_CONFLICT)
        serializer = ReviewAssignmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        reviewer = validate_reviewer_ids([data['reviewer_id']], review.version_documento.documento.organizacion_id)[0]
        if data.get('deadline') and data['deadline'] <= timezone.now():
            raise serializers.ValidationError({'deadline': 'La fecha limite debe ser futura.'})
        review.revisor = reviewer
        review.save(update_fields=['revisor'])
        detail, _ = DetalleSolicitudRevision.objects.get_or_create(
            solicitud=review,
            defaults={'id': uuid4(), 'fecha_limite': data.get('deadline') or timezone.now() + timedelta(days=3), 'prioridad': data.get('priority', 'MEDIA')},
        )
        detail_updates = []
        if 'deadline' in data:
            detail.fecha_limite = data['deadline']
            detail_updates.append('fecha_limite')
        if 'priority' in data:
            detail.prioridad = data['priority']
            detail_updates.append('prioridad')
        if detail_updates:
            detail.actualizado_en = timezone.now()
            detail.save(update_fields=[*detail_updates, 'actualizado_en'])
        record_document_event(
            request,
            review.version_documento.documento,
            'REVISION_ASIGNADA',
            resource_code='ARCHIVO',
            resource_id=review.version_documento_id,
            details={'reviewer_id': str(review.revisor_id)},
        )
        notify_review_assignment(review, actor_id=request.user.id)
        return Response({'review': serialize_review(review)})


class ReviewDecisionView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    action = None
    permission = None

    def post(self, request, review_id):
        require_permission(request, self.permission)
        review = get_review_or_404(request, review_id)
        if not is_admin(request.user) and review.revisor_id != request.user.id:
            raise serializers.ValidationError({'code': 'REVIEWER_NOT_ASSIGNED', 'detail': 'Solo el revisor asignado puede resolver esta solicitud.'})
        decision = ReviewDecisionSerializer(data=request.data)
        decision.is_valid(raise_exception=True)
        if review.estado_revision.codigo != 'PENDIENTE':
            return Response({'code': 'REVIEW_NOT_PENDING', 'detail': 'La solicitud ya fue resuelta.'}, status=status.HTTP_409_CONFLICT)
        document = review.version_documento.documento
        version = review.version_documento
        pending = get_revision_state('PENDIENTE')
        new_review_state = get_revision_state('APROBADA' if self.action == 'approve' else 'RECHAZADA' if self.action == 'reject' else 'CANCELADA')
        now = timezone.now()
        with transaction.atomic():
            review.estado_revision = new_review_state
            review.comentario_resolucion = decision.validated_data.get('comment') or None
            review.resuelta_en = now
            review.save(update_fields=['estado_revision', 'comentario_resolucion', 'resuelta_en'])
            add_resolution_comment(review, request.user, decision.validated_data.get('comment'), 'RESOLUCION' if self.action != 'return' else 'OBSERVACION')
            if self.action == 'approve':
                if review.checklist.filter(completada=False).exists():
                    raise serializers.ValidationError({'code': 'CHECKLIST_INCOMPLETE', 'detail': 'Complete el checklist antes de aprobar.'})
                if not SolicitudRevision.objects.filter(version_documento=version, estado_revision=pending).exists():
                    transition_version(version, 'APROBADO', request.user, decision.validated_data.get('comment', 'Revision aprobada'))
            else:
                target = 'RECHAZADO' if self.action == 'reject' else 'BORRADOR'
                transition_version(version, target, request.user, decision.validated_data.get('comment', ''))
                SolicitudRevision.objects.filter(version_documento=version, estado_revision=pending).update(
                    estado_revision=get_revision_state('RECHAZADA' if self.action == 'reject' else 'CANCELADA'),
                    comentario_resolucion='Cerrada por decision de la revision',
                    resuelta_en=now,
                )
        if self.action == 'approve':
            action_code = 'DOCUMENTO_APROBADO'
        elif self.action == 'reject':
            action_code = 'DOCUMENTO_RECHAZADO'
        elif self.action == 'return':
            action_code = 'REVISION_DEVUELTA'
        record_document_event(
            request,
            document,
            action_code,
            resource_code='ARCHIVO',
            resource_id=version.id,
            details={'comment': decision.validated_data.get('comment', '')},
        )
        notify_review_decision(review, self.action)
        return Response({'review': serialize_review(review)})


class ReviewApproveView(ReviewDecisionView):
    action = 'approve'
    permission = REVIEW_APPROVE


class ReviewReturnView(ReviewDecisionView):
    action = 'return'
    permission = REVIEW_REJECT


class ReviewRejectView(ReviewDecisionView):
    action = 'reject'
    permission = REVIEW_REJECT


class ReviewCommentListCreateView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def post(self, request, review_id):
        require_permission(request, REVIEW_READ)
        review = get_review_or_404(request, review_id)
        serializer = ReviewCommentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        parent = None
        parent_id = serializer.validated_data.get('parent_id')
        if parent_id:
            parent = ComentarioRevision.objects.filter(pk=parent_id, solicitud=review).first()
            if not parent:
                raise serializers.ValidationError({'parent_id': 'El comentario padre no pertenece a esta revision.'})
        comment = ComentarioRevision.objects.create(
            id=uuid4(),
            solicitud=review,
            autor=request.user,
            comentario_padre=parent,
            tipo='RESPUESTA' if parent else serializer.validated_data['type'],
            contenido=serializer.validated_data['content'],
        )
        record_document_event(
            request,
            review.version_documento.documento,
            'REVISION_COMENTADA',
            resource_code='ARCHIVO',
            resource_id=review.version_documento_id,
            details={'comment': comment.contenido, 'comment_type': comment.tipo},
        )
        notify_review_comment(review, request.user.id)
        return Response({'comment': serialize_comment(comment)}, status=status.HTTP_201_CREATED)


class ReviewCommentResolveView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def post(self, request, comment_id):
        require_permission(request, REVIEW_APPROVE)
        comment = ComentarioRevision.objects.select_related('solicitud__revisor', 'solicitud__version_documento__documento').filter(
            pk=comment_id,
            solicitud__version_documento__documento__organizacion_id=request.user.organizacion_id,
        ).first()
        if not comment:
            raise Http404
        if not is_admin(request.user) and comment.solicitud.revisor_id != request.user.id:
            raise Http404
        if comment.tipo != 'OBSERVACION':
            raise serializers.ValidationError({'code': 'COMMENT_NOT_OBSERVATION', 'detail': 'Solo se pueden resolver observaciones.'})
        if comment.resuelto:
            return Response({'comment': serialize_comment(comment)})
        comment.resuelto = True
        comment.resuelto_por = request.user
        comment.resuelto_en = timezone.now()
        comment.save(update_fields=['resuelto', 'resuelto_por', 'resuelto_en', 'actualizado_en'])
        resolution = request.data.get('content', '').strip()
        if resolution:
            add_resolution_comment(comment.solicitud, request.user, resolution, 'RESOLUCION', comment)
        return Response({'comment': serialize_comment(comment)})


class ReviewChecklistCreateView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def post(self, request, review_id):
        require_permission(request, REVIEW_READ)
        review = get_review_or_404(request, review_id)
        serializer = ChecklistSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item = ElementoChecklistRevision.objects.create(
            id=uuid4(),
            solicitud=review,
            orden=review.checklist.count(),
            titulo=serializer.validated_data['title'],
        )
        return Response({'item': serialize_review(review)['checklist'][-1]}, status=status.HTTP_201_CREATED)


class ReviewChecklistUpdateView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def patch(self, request, item_id):
        require_permission(request, REVIEW_READ)
        item = ElementoChecklistRevision.objects.select_related('solicitud').filter(
            pk=item_id,
            solicitud__version_documento__documento__organizacion_id=request.user.organizacion_id,
        ).first()
        if not item:
            raise Http404
        review = get_review_or_404(request, item.solicitud_id)
        serializer = ChecklistUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item.completada = serializer.validated_data['completed']
        item.completada_por = request.user if item.completada else None
        item.completada_en = timezone.now() if item.completada else None
        item.save(update_fields=['completada', 'completada_por', 'completada_en', 'actualizada_en'])
        return Response({'review': serialize_review(review)})


class VersionPublishView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def post(self, request, document_id, version_id):
        require_permission(request, REVIEW_APPROVE)
        document, version = get_document_version_or_404(request, document_id, version_id)
        comment = request.data.get('comment', '')
        with transaction.atomic():
            transition_version(version, 'PUBLICADO', request.user, comment or 'Version publicada')
            document.archivos.filter(es_vigente=True).exclude(pk=version.pk).update(es_vigente=False)
            version.es_vigente = True
            version.save(update_fields=['es_vigente'])
        record_document_event(
            request,
            document,
            'DOCUMENTO_APROBADO',
            resource_code='ARCHIVO',
            resource_id=version.id,
            details={'comment': comment},
        )
        record_document_event(
            request,
            document,
            'DOCUMENTO_PUBLICADO',
            resource_code='ARCHIVO',
            resource_id=version.id,
            details={'comment': comment},
        )
        notify_document_publication(document, version, actor_id=request.user.id)
        return Response({'version': {'id': str(version.id), 'status': 'PUBLICADO', 'is_current': True}})
