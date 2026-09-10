import hashlib
import uuid
from datetime import datetime, time, timedelta
from io import BytesIO
from xml.sax.saxutils import escape

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import connection
from django.db.models import Prefetch
from django.http import HttpResponse
from django.utils import timezone
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .management_views import require_permission
from .auth_utils import get_user_roles, record_auth_event
from .audit_views import audit_timestamp_column
from .models import (
    ArchivoDocumento,
    Documento,
    ProgramacionReporte,
    ReporteGenerado,
)
from .permissions import IsAuthenticatedAndPasswordCurrent
from .reader_access import filter_accessible_documents


SCOPES = {'executive', 'editor', 'reviewer', 'versions', 'traceability', 'activity'}
FORMATS = {'PDF', 'XLSX'}
FREQUENCIES = {'daily', 'weekly', 'monthly'}
REPORT_DOCUMENT_PERMISSIONS = {
    'executive': 'reportes.generar',
    'editor': 'documentos.consultar',
    'reviewer': 'revisiones.consultar',
    'versions': 'reportes.generar',
    'activity': 'reportes.generar',
}
REPORT_STORAGE_PREFIX = 'reportes'


class ReportSnapshotError(Exception):
    pass


def parse_report_datetime(value, field_name, end=False):
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value))
    except ValueError as error:
        raise ValidationError({field_name: 'Use una fecha ISO valida.'}) from error
    if parsed.tzinfo is None:
        parsed = timezone.make_aware(datetime.combine(parsed.date(), time.max if end else time.min))
    return parsed


def clean_filters(params, scope=None):
    if scope == 'traceability':
        try:
            return {'document_id': str(uuid.UUID(str(params.get('document_id', ''))))}
        except (ValueError, TypeError, AttributeError) as error:
            raise ValidationError({'document_id': 'Seleccione un documento válido para la trazabilidad.'}) from error
    filters = {}
    for key in ('date_from', 'date_to', 'area_id', 'type_id', 'status_code', 'responsible_id'):
        value = params.get(key)
        if value not in (None, ''):
            filters[key] = str(value)
    parse_report_datetime(filters.get('date_from'), 'date_from')
    parse_report_datetime(filters.get('date_to'), 'date_to', end=True)
    if scope == 'versions' and params.get('document_id'):
        try:
            filters['document_id'] = str(uuid.UUID(str(params['document_id'])))
        except (ValueError, TypeError, AttributeError) as error:
            raise ValidationError({'document_id': 'Use un UUID de documento válido.'}) from error
    return filters


def require_report_access(request, scope, generate=False):
    permission = {
        'executive': 'reportes.generar' if generate else 'reportes.generar',
        'editor': 'documentos.consultar',
        'reviewer': 'revisiones.consultar',
        'versions': 'reportes.generar',
        'traceability': 'reportes.generar',
        'activity': 'reportes.generar',
    }.get(scope)
    if not permission:
        raise ValidationError({'scope': 'El alcance del reporte no es valido.'})
    require_permission(request, permission)
    if scope == 'traceability':
        from .audit_views import require_audit_access
        require_audit_access(request)


def is_report_administrator(user):
    return any(role['code'] == 'ADMINISTRADOR' for role in get_user_roles(user.id))


def report_schedule_queryset(request, scope=None, active_only=False):
    filters = {'organizacion_id': request.user.organizacion_id}
    if scope:
        filters['alcance'] = scope
    if active_only:
        filters['activa'] = True
    if not is_report_administrator(request.user):
        filters['creado_por_id'] = request.user.id
    return ProgramacionReporte.objects.filter(**filters)


def can_manage_report_schedule(request, schedule):
    return str(schedule.creado_por_id) == str(request.user.id) or is_report_administrator(request.user)


def record_report_event(request, action_code, resource_id=None, details=None):
    return record_auth_event(
        action_code=action_code,
        resource_code='REPORTE',
        organization_id=request.user.organizacion_id,
        user_id=request.user.id,
        session_id=getattr(request.auth, 'id', None),
        resource_id=resource_id,
        request=request,
        successful=True,
        result='Operacion de reporte correcta',
        details=details,
    )


def current_report_version(document):
    versions = getattr(document, 'report_versions', [])
    return versions[0] if versions else None


def document_report_rows(request, scope, filters):
    queryset = Documento.objects.filter(
        organizacion_id=request.user.organizacion_id,
        eliminado_en__isnull=True,
    ).select_related('area', 'tipo_documento', 'creado_por').prefetch_related(
        Prefetch(
            'archivos',
            queryset=ArchivoDocumento.objects.select_related('estado_version').filter(es_vigente=True),
            to_attr='report_versions',
        ),
    )
    if scope == 'editor':
        queryset = queryset.filter(creado_por_id=request.user.id)
    date_from = parse_report_datetime(filters.get('date_from'), 'date_from')
    date_to = parse_report_datetime(filters.get('date_to'), 'date_to', end=True)
    if date_from:
        queryset = queryset.filter(actualizado_en__gte=date_from)
    if date_to:
        queryset = queryset.filter(actualizado_en__lte=date_to)
    if filters.get('area_id'):
        queryset = queryset.filter(area_id=filters['area_id'])
    if filters.get('type_id'):
        queryset = queryset.filter(tipo_documento_id=filters['type_id'])
    if filters.get('responsible_id'):
        queryset = queryset.filter(creado_por_id=filters['responsible_id'])

    documents = filter_accessible_documents(
        request.user,
        queryset.order_by('-actualizado_en', 'codigo'),
        REPORT_DOCUMENT_PERMISSIONS[scope],
    )
    rows = []
    for document in documents:
        version = current_report_version(document)
        status_code = version.estado_version.codigo if version else 'SIN_VERSION'
        if filters.get('status_code') and status_code != filters['status_code']:
            continue
        rows.append({
            'id': str(document.id),
            'code': document.codigo,
            'title': document.nombre,
            'area_id': str(document.area_id),
            'area': document.area.nombre,
            'type_id': str(document.tipo_documento_id),
            'type': document.tipo_documento.nombre,
            'responsible_id': str(document.creado_por_id),
            'responsible': f'{document.creado_por.nombres} {document.creado_por.apellidos}'.strip(),
            'status_code': status_code,
            'status': version.estado_version.nombre if version else 'Sin version',
            'version': f'{version.numero_mayor}.{version.numero_menor}' if version else None,
            'updated_at': document.actualizado_en,
        })
    return rows


def version_report_rows(request, filters):
    documents = Documento.objects.filter(
        organizacion_id=request.user.organizacion_id, eliminado_en__isnull=True,
    ).select_related('area', 'tipo_documento')
    for field in ('document_id', 'area_id', 'type_id'):
        if filters.get(field):
            documents = documents.filter(**{
                {'document_id': 'id', 'area_id': 'area_id', 'type_id': 'tipo_documento_id'}[field]: filters[field],
            })
    versions = ArchivoDocumento.objects.select_related('estado_version', 'creada_por')
    date_from = parse_report_datetime(filters.get('date_from'), 'date_from')
    date_to = parse_report_datetime(filters.get('date_to'), 'date_to', end=True)
    if date_from:
        versions = versions.filter(creada_en__gte=date_from)
    if date_to:
        versions = versions.filter(creada_en__lte=date_to)
    if filters.get('status_code'):
        versions = versions.filter(estado_version__codigo=filters['status_code'])
    if filters.get('responsible_id'):
        versions = versions.filter(creada_por_id=filters['responsible_id'])
    documents = documents.order_by('codigo', 'id').prefetch_related(Prefetch(
        'archivos', queryset=versions.order_by('numero_mayor', 'numero_menor', 'id'),
        to_attr='report_versions',
    ))
    rows = []
    for document in filter_accessible_documents(request.user, documents, REPORT_DOCUMENT_PERMISSIONS['versions']):
        for version in document.report_versions:
            author = f'{version.creada_por.nombres} {version.creada_por.apellidos}'.strip()
            rows.append({
                'id': str(version.id), 'document_id': str(document.id),
                'code': document.codigo, 'title': document.nombre,
                'area_id': str(document.area_id), 'area': document.area.nombre,
                'type_id': str(document.tipo_documento_id), 'type': document.tipo_documento.nombre,
                'version': f'{version.numero_mayor}.{version.numero_menor}',
                'author_id': str(version.creada_por_id), 'author': author,
                'responsible_id': str(version.creada_por_id), 'responsible': author,
                'created_at': version.creada_en,
                'status_code': version.estado_version.codigo, 'status': version.estado_version.nombre,
                'comment': version.comentario_cambio or '', 'is_current': version.es_vigente,
            })
    return rows


REVIEW_ACTIVITY_ACTIONS = {
    'DOCUMENTO_APROBADO': ('APROBADA', 'Aprobación emitida'),
    'DOCUMENTO_RECHAZADO': ('RECHAZADA', 'Rechazo emitido'),
    'REVISION_DEVUELTA': ('DEVUELTA', 'Devolución emitida'),
}


def reviewer_report_rows(request, filters):
    # State changes can close other reviewers' requests automatically. Only
    # successful decision events identify the actor who actually performed work.
    timestamp = connection.ops.quote_name(audit_timestamp_column())
    conditions = [
        'ba.organizacion_id = %s', 'ba.usuario_id = %s', 'ba.exitoso = TRUE',
        "tr.codigo = 'VERSION'", 'a.codigo IN (%s, %s, %s)',
    ]
    params = [request.user.organizacion_id, request.user.id, *REVIEW_ACTIVITY_ACTIONS]
    for key, operator in [('date_from', '>='), ('date_to', '<=')]:
        value = parse_report_datetime(filters.get(key), key, end=key == 'date_to')
        if value:
            conditions.append(f'ba.{timestamp} {operator} %s')
            params.append(value)
    with connection.cursor() as cursor:
        cursor.execute(f"""SELECT ba.id, ba.recurso_id, a.codigo, ba.{timestamp}
            FROM gestion_documental.bitacora_auditoria ba
            JOIN gestion_documental.acciones_auditoria a ON a.id = ba.accion_id
            JOIN gestion_documental.tipos_recurso_auditoria tr ON tr.id = ba.tipo_recurso_id
            WHERE {' AND '.join(conditions)}
            ORDER BY ba.{timestamp} DESC, ba.id DESC""", params)
        events = cursor.fetchall()
    versions = ArchivoDocumento.objects.filter(
        id__in=[event[1] for event in events],
        documento__organizacion_id=request.user.organizacion_id,
    ).select_related('documento__area', 'documento__tipo_documento', 'documento__creado_por').in_bulk()
    access = {}
    rows = []
    for event_id, version_id, action, occurred_at in events:
        version = versions.get(version_id)
        if not version:
            continue
        document = version.documento
        if document.id not in access:
            access[document.id] = bool(filter_accessible_documents(
                request.user, [document], REPORT_DOCUMENT_PERMISSIONS['reviewer']))
        if not access[document.id]:
            continue
        status_code, label = REVIEW_ACTIVITY_ACTIONS[action]
        if filters.get('area_id') and str(document.area_id) != filters['area_id']:
            continue
        if filters.get('type_id') and str(document.tipo_documento_id) != filters['type_id']:
            continue
        if filters.get('status_code') and status_code != filters['status_code']:
            continue
        if filters.get('responsible_id') and str(document.creado_por_id) != filters['responsible_id']:
            continue
        rows.append({
            'id': str(event_id), 'document_id': str(document.id),
            'version_id': str(version.id), 'version': f'{version.numero_mayor}.{version.numero_menor}',
            'code': document.codigo, 'title': document.nombre,
            'area_id': str(document.area_id), 'area': document.area.nombre,
            'type_id': str(document.tipo_documento_id), 'type': document.tipo_documento.nombre,
            'responsible_id': str(document.creado_por_id),
            'responsible': f'{document.creado_por.nombres} {document.creado_por.apellidos}'.strip(),
            'actor_id': str(request.user.id),
            'actor': f'{request.user.nombres} {request.user.apellidos}'.strip(),
            'action_code': action, 'status_code': status_code, 'status': label,
            'activity_at': occurred_at, 'activity_date': timezone.localdate(occurred_at).isoformat(),
            # Compatibility alias, now explicitly the event date.
            'created_at': occurred_at,
        })
    return rows


def activity_report_rows(request, filters):
    """Vista de acciones realizadas por usuarios/sistema (bitácora, alcance organización)."""
    timestamp = connection.ops.quote_name(audit_timestamp_column())
    conditions = ['ba.organizacion_id = %s']
    params = [request.user.organizacion_id]
    date_from = parse_report_datetime(filters.get('date_from'), 'date_from')
    date_to = parse_report_datetime(filters.get('date_to'), 'date_to', end=True)
    if date_from:
        conditions.append(f'ba.{timestamp} >= %s')
        params.append(date_from)
    if date_to:
        conditions.append(f'ba.{timestamp} <= %s')
        params.append(date_to)
    if filters.get('action'):
        conditions.append('a.codigo = %s')
        params.append(str(filters['action']).upper())
    if filters.get('responsible_id'):
        conditions.append('ba.usuario_id = %s')
        params.append(filters['responsible_id'])
    if filters.get('search'):
        search = f"%{str(filters['search']).strip()}%"
        conditions.append('''(COALESCE(a.codigo,'') ILIKE %s OR COALESCE(a.nombre,'') ILIKE %s
            OR COALESCE(u.nombre_usuario,'') ILIKE %s
            OR COALESCE(u.nombres || ' ' || u.apellidos,'') ILIKE %s
            OR COALESCE(tr.codigo,'') ILIKE %s OR COALESCE(d.codigo,'') ILIKE %s
            OR COALESCE(ba.resultado,'') ILIKE %s)''')
        params.extend([search] * 7)
    with connection.cursor() as cursor:
        cursor.execute(f"""SELECT ba.id, ba.{timestamp}, ba.usuario_id,
                TRIM(COALESCE(u.nombres,'') || ' ' || COALESCE(u.apellidos,'')),
                u.nombre_usuario, a.codigo, a.nombre, tr.codigo, tr.nombre,
                ba.recurso_id, ba.documento_id, ba.version_documento_id,
                ba.exitoso, ba.resultado, d.codigo, d.nombre,
                v.numero_mayor, v.numero_menor
            FROM gestion_documental.bitacora_auditoria ba
            LEFT JOIN gestion_documental.usuarios u ON u.id = ba.usuario_id
            JOIN gestion_documental.acciones_auditoria a ON a.id = ba.accion_id
            JOIN gestion_documental.tipos_recurso_auditoria tr ON tr.id = ba.tipo_recurso_id
            LEFT JOIN gestion_documental.documentos d ON d.id = ba.documento_id
            LEFT JOIN gestion_documental.versiones_documento v ON v.id = ba.version_documento_id
            WHERE {' AND '.join(conditions)}
            ORDER BY ba.{timestamp} DESC, ba.id DESC""", params)
        events = cursor.fetchall()
    rows = []
    for (event_id, occurred_at, user_id, user_name, username, action_code,
            action_name, resource_code, module, resource_id, document_id,
            version_id, successful, result, doc_code, doc_title,
            numero_mayor, numero_menor) in events:
        actor = (user_name or username or 'Sistema').strip()
        status_code = 'EXITOSO' if successful else 'FALLIDO'
        version = f'{numero_mayor}.{numero_menor}' if numero_mayor is not None else None
        rows.append({
            'id': str(event_id),
            'code': doc_code or action_code, 'title': doc_title or action_name,
            'area_id': resource_code or 'SISTEMA', 'area': module or 'Sistema',
            'type_id': action_code, 'type': action_name,
            'responsible_id': str(user_id) if user_id else '',
            'responsible': actor,
            'actor_id': str(user_id) if user_id else '',
            'actor': actor,
            'action_code': action_code, 'action': action_name,
            'status_code': status_code, 'status': 'Exitoso' if successful else 'Fallido',
            'activity_at': occurred_at, 'created_at': occurred_at,
            'document_id': str(document_id) if document_id else None,
            'version_id': str(version_id) if version_id else None,
            'version': version,
            'resource': resource_code, 'resource_id': str(resource_id) if resource_id else None,
            'result': result or '', 'successful': successful,
        })
    return rows


def report_options(rows):
    def unique(key, label_key):
        values = {row[key]: row[label_key] for row in rows if row.get(key) and row.get(label_key)}
        return [{'id': key, 'name': value} for key, value in sorted(values.items(), key=lambda item: item[1])]

    statuses = {row['status_code']: row['status'] for row in rows if row.get('status_code')}
    return {
        'areas': unique('area_id', 'area'),
        'types': unique('type_id', 'type'),
        'responsibles': unique('responsible_id', 'responsible'),
        'statuses': [{'id': key, 'name': value} for key, value in sorted(statuses.items())],
    }


def summarize_report(rows, scope):
    status_counts = {}
    area_counts = {}
    type_counts = {}
    responsible_counts = {}
    overdue = 0
    for row in rows:
        status_counts[row['status_code']] = status_counts.get(row['status_code'], 0) + 1
        area_counts[row['area']] = area_counts.get(row['area'], 0) + 1
        type_counts[row['type']] = type_counts.get(row['type'], 0) + 1
        responsible_counts[row['responsible']] = responsible_counts.get(row['responsible'], 0) + 1
        overdue += int(row.get('overdue', False))
    completed_statuses = {'APROBADO', 'PUBLICADO', 'COMPLETADA', 'APROBADA'}
    summary = {
        'total': len(rows),
        'published': status_counts.get('PUBLICADO', 0),
        'in_review': status_counts.get('EN_REVISION', 0) + status_counts.get('PENDIENTE', 0),
        'completed': len(rows) if scope == 'reviewer' else sum(value for key, value in status_counts.items() if key in completed_statuses),
        **({'approved': status_counts.get('APROBADA', 0), 'rejected': status_counts.get('RECHAZADA', 0),
            'returned': status_counts.get('DEVUELTA', 0)} if scope == 'reviewer' else {}),
        'overdue': overdue,
        'by_status': [{'code': key, 'name': key.replace('_', ' ').title(), 'count': value} for key, value in sorted(status_counts.items())],
        'by_area': [{'name': key, 'count': value} for key, value in sorted(area_counts.items())],
        'by_type': [{'name': key, 'count': value} for key, value in sorted(type_counts.items())],
        'by_responsible': [{'name': key, 'count': value} for key, value in sorted(responsible_counts.items())],
        'scope': scope,
    }
    if scope == 'reviewer':
        # These are workload/version-state metrics, not performed actions.
        for key in ('published', 'in_review', 'overdue'):
            summary.pop(key)
    return summary


def build_report_data(request, scope, filters):
    if scope == 'traceability':
        from .traceability_report import build_traceability_report
        return build_traceability_report(request, filters)
    if scope == 'versions':
        rows = version_report_rows(request, filters)
    elif scope == 'activity':
        rows = activity_report_rows(request, filters)
    else:
        rows = reviewer_report_rows(request, filters) if scope == 'reviewer' else document_report_rows(request, scope, filters)
    return {
        'scope': scope,
        'filters': filters,
        'summary': summarize_report(rows, scope),
        'options': report_options(rows),
        'rows': rows,
        **({'activity_definition': 'successful_review_decisions',
            'activity_timezone': timezone.get_current_timezone_name()} if scope == 'reviewer' else {}),
    }


def serialize_report(report):
    return {
        'id': str(report.id),
        'name': report.nombre,
        'scope': report.alcance,
        'format': report.formato,
        'filters': report.filtros,
        'rows': report.filas,
        'created_at': report.creado_en,
        'snapshot_available': bool(getattr(report, 'clave_almacenamiento', None)),
        'snapshot_size': getattr(report, 'tamano_bytes', None),
        'snapshot_sha256': getattr(report, 'sha256', None),
        'download_url': f'/api/reports/{report.id}/download/',
    }


def report_history(request, scope, document_id=None):
    filters = {
        'organizacion_id': request.user.organizacion_id,
        'alcance': scope,
    }
    if scope in {'editor', 'reviewer'}:
        filters['generado_por_id'] = request.user.id
    if scope == 'traceability':
        filters['filtros__document_id'] = document_id
    return [serialize_report(report) for report in ReporteGenerado.objects.filter(
        **filters,
    ).order_by('-creado_en', '-id')[:20]]


def cell_value(value):
    if isinstance(value, (datetime,)):
        return timezone.localtime(value).strftime('%Y-%m-%d %H:%M')
    return '' if value is None else value


def report_headers(scope):
    if scope == 'versions':
        return ['Código', 'Documento', 'Versión', 'Autor', 'Fecha de creación', 'Estado', 'Comentario / cambio']
    if scope == 'reviewer':
        return ['Código', 'Documento', 'Área', 'Tipo', 'Autor del documento', 'Acción', 'Revisor que actuó', 'Fecha de actividad']
    if scope == 'activity':
        return ['Fecha', 'Acción', 'Actor', 'Recurso', 'Documento', 'Resultado']
    return ['Código', 'Documento', 'Área', 'Tipo', 'Responsable', 'Estado', 'Versión', 'Actualización']


def report_row_values(row, scope):
    if scope == 'versions':
        return [row['code'], row['title'], row['version'], row['author'], cell_value(row['created_at']), row['status'], row['comment']]
    if scope == 'reviewer':
        return [row['code'], row['title'], row['area'], row['type'], row['responsible'], row['status'], row['actor'], cell_value(row['activity_at'])]
    if scope == 'activity':
        return [cell_value(row['activity_at']), row['action'], row['actor'], row['resource'] or '', row['code'] or '', row['result'] or row['status']]
    return [row['code'], row['title'], row['area'], row['type'], row['responsible'], row['status'], row['version'] or '', cell_value(row['updated_at'])]


def build_xlsx(data):
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = 'Resumen'
    sheet.append(['Reporte', 'Alcance', 'Generado'])
    sheet.append(['Reporte documental', data['scope'], timezone.localtime().strftime('%Y-%m-%d %H:%M')])
    sheet.append([])
    sheet.append(['Indicador', 'Valor'])
    for key, value in data['summary'].items():
        if isinstance(value, (int, float)):
            sheet.append([key, value])
    for cell in sheet[1] + sheet[4]:
        cell.font = Font(bold=True, color='FFFFFF')
        cell.fill = PatternFill('solid', fgColor='1F4E78')
    detail = workbook.create_sheet('Detalle')
    detail.append(report_headers(data['scope']))
    for row in data['rows']:
        detail.append(report_row_values(row, data['scope']))
        if data['scope'] == 'versions':
            for cell in detail[detail.max_row]:
                # Comments are literal document data, never spreadsheet formulas.
                cell.data_type = 's'
                cell.alignment = Alignment(wrap_text=True, vertical='top')
    for sheet_item in workbook.worksheets:
        for column in sheet_item.columns:
            width = min(max(len(str(cell.value or '')) for cell in column) + 2, 42)
            sheet_item.column_dimensions[column[0].column_letter].width = width
        sheet_item.freeze_panes = 'A2'
    output = BytesIO()
    workbook.save(output)
    return output.getvalue()


def build_pdf(data):
    output = BytesIO()
    document = SimpleDocTemplate(output, pagesize=landscape(letter), rightMargin=0.35 * inch, leftMargin=0.35 * inch, topMargin=0.35 * inch, bottomMargin=0.35 * inch)
    styles = getSampleStyleSheet()
    story = [Paragraph('Reporte documental', styles['Title']), Paragraph(f"Alcance: {data['scope']} | Registros: {len(data['rows'])}", styles['Normal']), Spacer(1, 12)]
    summary = [['Indicador', 'Valor']] + [[key, value] for key, value in data['summary'].items() if isinstance(value, (int, float))]
    summary_table = Table(summary, colWidths=[2.2 * inch, 1 * inch])
    summary_table.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1F4E78')), ('TEXTCOLOR', (0, 0), (-1, 0), colors.white), ('GRID', (0, 0), (-1, -1), 0.25, colors.HexColor('#D9E2F3')), ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold')]))
    story.extend([summary_table, Spacer(1, 14)])
    detail = [report_headers(data['scope'])] + [[str(value) for value in report_row_values(row, data['scope'])] for row in data['rows'][:1000]]
    if data['scope'] == 'versions':
        # Version comments and titles wrap within the page instead of widening it.
        from reportlab.lib.styles import ParagraphStyle
        cell_style = ParagraphStyle('VersionCell', fontSize=7, leading=9)
        header_style = ParagraphStyle('VersionHeader', parent=cell_style, textColor=colors.white)
        detail = [[Paragraph(escape(str(value)).replace('\n', '<br/>'), header_style if index == 0 else cell_style)
                   for value in row] for index, row in enumerate(
                       [report_headers('versions')] + [report_row_values(row, 'versions') for row in data['rows']])]
        detail_table = Table(detail, colWidths=[65, 145, 40, 90, 80, 65, 156.6], repeatRows=1)
    else:
        detail_table = Table(detail, repeatRows=1)
    detail_table.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1F4E78')), ('TEXTCOLOR', (0, 0), (-1, 0), colors.white), ('GRID', (0, 0), (-1, -1), 0.25, colors.HexColor('#D9E2F3')), ('FONTSIZE', (0, 0), (-1, -1), 7), ('VALIGN', (0, 0), (-1, -1), 'TOP')]))
    story.append(detail_table)
    document.build(story)
    return output.getvalue()


def build_report_content(data, report_format):
    if data['scope'] == 'traceability':
        from .traceability_exports import build_traceability_pdf, build_traceability_xlsx
        return build_traceability_pdf(data) if report_format == 'PDF' else build_traceability_xlsx(data)
    return build_pdf(data) if report_format == 'PDF' else build_xlsx(data)


def report_binary_response(content, report_format):
    content_type = 'application/pdf' if report_format == 'PDF' else 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    extension = report_format.lower()
    response = HttpResponse(content, content_type=content_type)
    response['Content-Disposition'] = f'attachment; filename="reporte-documental.{extension}"'
    return response


def report_response(data, report_format):
    return report_binary_response(build_report_content(data, report_format), report_format)


def report_storage_name(organization_id, report_id, report_format):
    return f'{REPORT_STORAGE_PREFIX}/{organization_id}/{report_id}.{report_format.lower()}'


def persist_report_snapshot(*, organization_id, generated_by_id, scope, report_format, name, filters, data):
    report_id = uuid.uuid4()
    content = build_report_content(data, report_format)
    storage_name = report_storage_name(organization_id, report_id, report_format)
    stored_name = default_storage.save(storage_name, ContentFile(content))
    try:
        return ReporteGenerado.objects.create(
            id=report_id,
            organizacion_id=organization_id,
            generado_por_id=generated_by_id,
            alcance=scope,
            formato=report_format,
            nombre=name,
            filtros=filters,
            filas=len(data['rows']),
            clave_almacenamiento=stored_name,
            tamano_bytes=len(content),
            sha256=hashlib.sha256(content).hexdigest(),
        )
    except Exception:
        default_storage.delete(stored_name)
        raise


def read_report_snapshot(report):
    storage_name = getattr(report, 'clave_almacenamiento', None)
    if not storage_name:
        return None
    try:
        with default_storage.open(storage_name, 'rb') as source:
            content = source.read()
    except Exception as error:
        raise ReportSnapshotError('La instantanea del reporte no esta disponible.') from error
    expected_size = getattr(report, 'tamano_bytes', None)
    expected_sha256 = getattr(report, 'sha256', None)
    if expected_size is not None and len(content) != expected_size:
        raise ReportSnapshotError('La instantanea del reporte no pudo verificarse.')
    if expected_sha256 and hashlib.sha256(content).hexdigest() != expected_sha256:
        raise ReportSnapshotError('La instantanea del reporte no pudo verificarse.')
    return content


class ReportListView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def get(self, request):
        scope = request.query_params.get('scope', 'executive')
        require_report_access(request, scope)
        filters = clean_filters(request.query_params, scope)
        data = build_report_data(request, scope, filters)
        data['history'] = report_history(request, scope, filters.get('document_id')) if scope == 'traceability' else report_history(request, scope)
        record_report_event(request, 'REPORTE_CONSULTADO', details={'scope': scope, 'rows': len(data['rows'])})
        return Response(data)


class ReportGenerateView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def post(self, request):
        scope = request.data.get('scope', 'executive')
        require_report_access(request, scope, generate=True)
        report_format = str(request.data.get('format', 'PDF')).upper()
        if report_format not in FORMATS:
            raise ValidationError({'format': 'El formato debe ser PDF o XLSX.'})
        filters = clean_filters(request.data.get('filters', {}), scope)
        data = build_report_data(request, scope, filters)
        report = persist_report_snapshot(
            organization_id=request.user.organizacion_id,
            generated_by_id=request.user.id,
            scope=scope,
            report_format=report_format,
            name=f'Reporte {scope} - {timezone.localtime().strftime("%Y-%m-%d %H:%M")}',
            filters=filters,
            data=data,
        )
        record_report_event(
            request,
            'REPORTE_GENERADO',
            resource_id=report.id,
            details={'scope': scope, 'format': report_format, 'rows': len(data['rows'])},
        )
        return Response({'report': serialize_report(report)}, status=status.HTTP_201_CREATED)


class ReportDownloadView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def get(self, request, report_id):
        report = ReporteGenerado.objects.filter(pk=report_id, organizacion_id=request.user.organizacion_id).first()
        if not report:
            return Response({'detail': 'Reporte no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        if report.alcance in {'editor', 'reviewer'} and report.generado_por_id != request.user.id:
            return Response({'detail': 'Reporte no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        require_report_access(request, report.alcance)
        if report.alcance == 'traceability':
            from .traceability_report import trace_document
            trace_document(request, report.filtros.get('document_id'))
        try:
            snapshot = read_report_snapshot(report)
        except ReportSnapshotError as error:
            return Response({'detail': str(error)}, status=status.HTTP_410_GONE)
        response = (
            report_response(build_report_data(request, report.alcance, report.filtros), report.formato)
            if snapshot is None
            else report_binary_response(snapshot, report.formato)
        )
        record_report_event(request, 'REPORTE_DESCARGADO', resource_id=report.id, details={'format': report.formato})
        return response


def serialize_schedule(schedule):
    return {
        'id': str(schedule.id),
        'name': schedule.nombre,
        'scope': schedule.alcance,
        'format': schedule.formato,
        'frequency': schedule.frecuencia,
        'filters': schedule.filtros,
        'next_run_at': schedule.proxima_ejecucion_en,
        'active': schedule.activa,
    }


class ReportScheduleListView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def get(self, request):
        scope = request.query_params.get('scope', 'executive')
        require_report_access(request, scope)
        schedules = report_schedule_queryset(request, scope, active_only=True)
        response = Response({'schedules': [serialize_schedule(item) for item in schedules]})
        record_report_event(request, 'REPORTE_CONSULTADO', details={'scope': scope, 'scheduled': True})
        return response

    def post(self, request):
        scope = request.data.get('scope', 'executive')
        require_report_access(request, scope, generate=True)
        frequency = request.data.get('frequency', 'monthly')
        report_format = str(request.data.get('format', 'PDF')).upper()
        if frequency not in FREQUENCIES:
            raise ValidationError({'frequency': 'La frecuencia debe ser daily, weekly o monthly.'})
        if report_format not in FORMATS:
            raise ValidationError({'format': 'El formato debe ser PDF o XLSX.'})
        filters = clean_filters(request.data.get('filters', {}), scope)
        next_run = parse_report_datetime(request.data.get('next_run_at'), 'next_run_at') or timezone.now() + timedelta(days=1)
        schedule = ProgramacionReporte.objects.create(
            organizacion_id=request.user.organizacion_id,
            creado_por_id=request.user.id,
            nombre=request.data.get('name') or f'Reporte {scope} programado',
            alcance=scope,
            formato=report_format,
            frecuencia=frequency,
            filtros=filters,
            proxima_ejecucion_en=next_run,
        )
        record_report_event(
            request,
            'REPORTE_PROGRAMADO',
            resource_id=schedule.id,
            details={'scope': scope, 'format': report_format, 'frequency': frequency},
        )
        return Response({'schedule': serialize_schedule(schedule)}, status=status.HTTP_201_CREATED)


class ReportScheduleDetailView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def patch(self, request, schedule_id):
        schedule = ProgramacionReporte.objects.filter(pk=schedule_id, organizacion_id=request.user.organizacion_id).first()
        if not schedule or not can_manage_report_schedule(request, schedule):
            return Response({'detail': 'Programacion no encontrada.'}, status=status.HTTP_404_NOT_FOUND)
        require_report_access(request, schedule.alcance, generate=True)
        if 'active' in request.data:
            schedule.activa = bool(request.data['active'])
        if 'next_run_at' in request.data:
            schedule.proxima_ejecucion_en = parse_report_datetime(request.data['next_run_at'], 'next_run_at')
        schedule.save(update_fields=['activa', 'proxima_ejecucion_en', 'actualizada_en'])
        record_report_event(request, 'REPORTE_PROGRAMACION_MODIFICADA', resource_id=schedule.id, details={'active': schedule.activa})
        return Response({'schedule': serialize_schedule(schedule)})

    def delete(self, request, schedule_id):
        schedule = ProgramacionReporte.objects.filter(pk=schedule_id, organizacion_id=request.user.organizacion_id).first()
        if not schedule or not can_manage_report_schedule(request, schedule):
            return Response({'detail': 'Programacion no encontrada.'}, status=status.HTTP_404_NOT_FOUND)
        require_report_access(request, schedule.alcance, generate=True)
        schedule.activa = False
        schedule.save(update_fields=['activa', 'actualizada_en'])
        record_report_event(request, 'REPORTE_PROGRAMACION_CANCELADA', resource_id=schedule.id)
        return Response(status=status.HTTP_204_NO_CONTENT)
