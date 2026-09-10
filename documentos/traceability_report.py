"""Document-scoped evidence chronology. Sources stay distinguishable, not deduped actions."""
import json
from collections import Counter

from django.db import connection
from django.http import Http404
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .audit_views import audit_timestamp_column
from .models import Documento, ArchivoDocumento, SolicitudRevision, HistorialEstadoVersion
from .reader_access import filter_accessible_documents


def trace_document(request, document_id):
    if not document_id:
        raise ValidationError({'document_id': 'Seleccione un documento para consultar su trazabilidad.'})
    document = Documento.objects.select_related('creado_por', 'eliminado_por', 'area', 'tipo_documento').filter(
        pk=document_id, organizacion_id=request.user.organizacion_id).first()
    if not document or not filter_accessible_documents(request.user, [document], 'reportes.generar'):
        raise Http404
    return document


def person(user):
    return {'id': str(user.id), 'name': f'{user.nombres} {user.apellidos}'.strip() or user.nombre_usuario} if user else None


def build_traceability_report(request, filters):
    document = trace_document(request, filters.get('document_id'))
    versions = list(ArchivoDocumento.objects.filter(documento=document).select_related(
        'creada_por', 'estado_version').order_by('numero_mayor', 'numero_menor', 'id'))
    version_map = {str(v.id): v for v in versions}
    reviews = list(SolicitudRevision.objects.filter(version_documento__documento=document).select_related(
        'solicitada_por', 'revisor', 'estado_revision').order_by('solicitada_en', 'id'))
    review_map = {str(r.id): r for r in reviews}
    rows = []

    def add(source, source_id, code, label, at, *, actor=None, version_id=None, review=None,
            comment='', state_from=None, state_to=None, successful=None, details=None, restored_from=None):
        version = version_map.get(str(version_id))
        rows.append({
            'id': f'{source}:{source_id}', 'source': source, 'source_id': str(source_id),
            'document_id': str(document.id), 'code': document.codigo, 'title': document.nombre,
            'event_code': code, 'event': label, 'at': at, 'actor': actor,
            'version_id': str(version.id) if version else None,
            'version': f'{version.numero_mayor}.{version.numero_menor}' if version else None,
            'review_id': str(review.id) if review else None,
            'reviewer': person(review.revisor) if review else None,
            'state_from': state_from, 'state_to': state_to,
            'comment': comment or '', 'successful': successful,
            'details': details or {}, 'restored_from': restored_from,
        })

    add('document', document.id, 'DOCUMENTO_CREADO', 'Creación del documento', document.creado_en,
        actor=person(document.creado_por), successful=True)
    if document.eliminado_en:
        add('document_archive', document.id, 'DOCUMENTO_ELIMINADO', 'Archivo del documento', document.eliminado_en,
            actor=person(document.eliminado_por), comment=document.motivo_eliminacion, successful=True)
    for version in versions:
        # Current version state belongs in the version inventory, not at creation time.
        add('version', version.id, 'VERSION_CREADA', 'Creación de versión', version.creada_en,
            actor=person(version.creada_por), version_id=version.id, comment=version.comentario_cambio, successful=True)
    for review in reviews:
        add('review_sent', review.id, 'REVISION_SOLICITADA', 'Envío a revisión', review.solicitada_en,
            actor=person(review.solicitada_por), version_id=review.version_documento_id, review=review,
            comment=review.comentario_solicitud, successful=True)
        if review.resuelta_en:
            # A resolved request may be an automatic closure. The assigned reviewer
            # is not evidence of who decided; that actor is available in audit/state rows.
            add('review_resolution', review.id, 'RESOLUCION_REGISTRADA',
                f'Resolución de solicitud: {review.estado_revision.nombre}', review.resuelta_en,
                version_id=review.version_documento_id, review=review, state_to=review.estado_revision.codigo,
                comment=review.comentario_resolucion,
                details={'actor_attribution': 'No consta en la solicitud; puede ser un cierre automático.'})
    for change in HistorialEstadoVersion.objects.filter(version_documento__documento=document).select_related(
            'cambiado_por', 'estado_anterior', 'estado_nuevo').order_by('cambiado_en', 'id'):
        code = 'DOCUMENTO_PUBLICADO' if change.estado_nuevo.codigo == 'PUBLICADO' else 'CAMBIO_ESTADO'
        add('state', change.id, code, 'Publicación' if code == 'DOCUMENTO_PUBLICADO' else 'Cambio de estado',
            change.cambiado_en, actor=person(change.cambiado_por), version_id=change.version_documento_id,
            state_from=change.estado_anterior.codigo if change.estado_anterior else None,
            state_to=change.estado_nuevo.codigo, comment=change.comentario, successful=True)

    timestamp = connection.ops.quote_name(audit_timestamp_column())
    with connection.cursor() as cursor:
        cursor.execute(f'''SELECT ba.id, ba.{timestamp}, ba.usuario_id,
                TRIM(COALESCE(u.nombres, '') || ' ' || COALESCE(u.apellidos, '')),
                a.codigo, a.nombre, tr.codigo, ba.recurso_id, ba.exitoso, ba.resultado, ba.detalles
            FROM gestion_documental.bitacora_auditoria ba
            JOIN gestion_documental.acciones_auditoria a ON a.id=ba.accion_id
            JOIN gestion_documental.tipos_recurso_auditoria tr ON tr.id=ba.tipo_recurso_id
            LEFT JOIN gestion_documental.usuarios u ON u.id=ba.usuario_id
            WHERE ba.organizacion_id=%s AND (
                (tr.codigo='DOCUMENTO' AND ba.recurso_id=%s)
                OR (tr.codigo IN ('VERSION','ARCHIVO') AND ba.recurso_id IN
                    (SELECT id FROM gestion_documental.versiones_documento WHERE documento_id=%s))
                OR (tr.codigo='REVISION' AND ba.recurso_id IN
                    (SELECT r.id FROM gestion_documental.solicitudes_revision r
                     JOIN gestion_documental.versiones_documento v ON v.id=r.version_documento_id WHERE v.documento_id=%s)))
            ORDER BY ba.{timestamp}, ba.id''', [document.organizacion_id, document.id, document.id, document.id])
        audit_rows = cursor.fetchall()
    for event_id, at, user_id, name, code, label, resource, resource_id, successful, result, details in audit_rows:
        if isinstance(details, str):
            details = json.loads(details)
        details = details if isinstance(details, dict) else {}
        review = review_map.get(str(resource_id)) if resource == 'REVISION' else None
        version_id = review.version_documento_id if review else resource_id if resource in ('VERSION', 'ARCHIVO') else None
        # Include only explicit document-event details, not arbitrary request/session payloads.
        safe_details = {key: details[key] for key in ('comment', 'reason', 'content', 'changes', 'path', 'method') if key in details}
        restored = version_map.get(str(details.get('source_version_id'))) if code == 'VERSION_RESTAURADA' else None
        relation = {'id': str(restored.id), 'version': f'{restored.numero_mayor}.{restored.numero_menor}'} if restored else None
        if code == 'VERSION_RESTAURADA' and not restored:
            safe_details['source_note'] = 'No hay versión de origen vinculable a este documento.'
        add('audit', event_id, code, label, at,
            actor={'id': str(user_id), 'name': name or 'Nombre no disponible'} if user_id else None,
            version_id=version_id, review=review, successful=successful, restored_from=relation,
            comment=details.get('comment') or details.get('reason') or details.get('content') or result or '',
            details=safe_details)
    rows.sort(key=lambda row: (row['at'], row['source'], row['source_id']))
    return {
        'scope': 'traceability', 'filters': {'document_id': str(document.id)},
        'document': {'id': str(document.id), 'code': document.codigo, 'title': document.nombre,
                     'area': document.area.nombre, 'type': document.tipo_documento.nombre},
        'versions': [{'id': str(v.id), 'version': f'{v.numero_mayor}.{v.numero_menor}', 'author': person(v.creada_por),
                      'created_at': v.creada_en, 'current_state': v.estado_version.codigo, 'is_current': v.es_vigente,
                      'comment': v.comentario_cambio or ''} for v in versions],
        'rows': rows, 'summary': {'records': len(rows), 'versions': len(versions), 'reviews': len(reviews),
                                'audit_events': len(audit_rows), 'by_source': dict(Counter(r['source'] for r in rows))},
        'timezone': timezone.get_current_timezone_name(),
        'notes': [
            'Cronología de evidencias: una operación puede aparecer en varias fuentes. El total cuenta registros, no acciones únicas.',
            'El revisor de una solicitud es su asignación guardada; una resolución no acredita por sí sola quién actuó.',
            'Los estados actuales de versiones no se presentan como estados históricos de creación.',
            'Solo se incluyen datos conservados y auditoría vinculada por recurso a este documento, sus versiones o revisiones.',
        ],
    }
