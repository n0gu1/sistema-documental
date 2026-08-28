import csv
from datetime import datetime, time

from django.db import connection
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from .auth_utils import get_user_roles, record_access_denied, record_auth_event
from .permissions import IsAuthenticatedAndPasswordCurrent


AUDIT_COLUMNS = [
    'id', 'event_at', 'user_id', 'username', 'user_name', 'action_code', 'action',
    'resource_code', 'module', 'resource_id', 'successful', 'result', 'details',
    'ip', 'user_agent',
]
AUDIT_TIMESTAMP_CANDIDATES = ('creado_en', 'registrado_en', 'fecha_hora', 'fecha_evento', 'ocurrido_en', 'created_at')
SECURITY_ALERT_THRESHOLD = 3
SECURITY_ALERT_WINDOW_HOURS = 24
SECURITY_ALERT_THRESHOLDS = {
    'SESION_FALLIDA': SECURITY_ALERT_THRESHOLD,
    'SESION_INVALIDA': 1,
    'ACCESO_DENEGADO': SECURITY_ALERT_THRESHOLD,
}
SECURITY_ALERT_LABELS = {
    'SESION_FALLIDA': ('Intentos de inicio de sesion fallidos', 'critico'),
    'SESION_INVALIDA': ('Uso de sesiones invalidas', 'critico'),
    'ACCESO_DENEGADO': ('Accesos no autorizados', 'alto'),
}


def audit_timestamp_column():
    with connection.cursor() as cursor:
        cursor.execute(
            '''
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'gestion_documental'
              AND table_name = 'bitacora_auditoria'
            ''',
        )
        columns = {row[0] for row in cursor.fetchall()}
    for candidate in AUDIT_TIMESTAMP_CANDIDATES:
        if candidate in columns:
            return candidate
    raise serializers.ValidationError({'code': 'AUDIT_SCHEMA_ERROR', 'detail': 'La bitacora no tiene una columna temporal compatible.'})


def require_audit_access(request, allow_own_events=False):
    if any(role['code'] == 'ADMINISTRADOR' for role in get_user_roles(request.user.id)):
        return
    if allow_own_events and request.query_params.get('user_id') == str(request.user.id):
        return
    record_access_denied(request, 'AUDIT_ACCESS_REQUIRED', resource_code='BITACORA')
    raise PermissionDenied({'code': 'AUDIT_ACCESS_REQUIRED', 'detail': 'Solo un administrador puede consultar la bitacora.'})


def parse_audit_datetime(value, field_name, end=False):
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as error:
        raise serializers.ValidationError({field_name: 'Use una fecha ISO valida.'}) from error
    if parsed.tzinfo is None:
        parsed = timezone.make_aware(datetime.combine(parsed.date(), time.max if end else time.min))
    return parsed


def audit_query_parts(params, timestamp_column='creado_en'):
    filters = ['ba.organizacion_id = %s']
    values = [params['organization_id']]
    date_from = parse_audit_datetime(params.get('date_from'), 'date_from')
    date_to = parse_audit_datetime(params.get('date_to'), 'date_to', end=True)
    if date_from:
        filters.append(f'ba.{timestamp_column} >= %s')
        values.append(date_from)
    if date_to:
        filters.append(f'ba.{timestamp_column} <= %s')
        values.append(date_to)
    if params.get('user_id'):
        filters.append('ba.usuario_id = %s')
        values.append(params['user_id'])
    if params.get('action'):
        filters.append('a.codigo = %s')
        values.append(params['action'].upper())
    if params.get('module'):
        filters.append('tr.codigo = %s')
        values.append(params['module'].upper())
    if params.get('result'):
        result = params['result'].lower()
        if result not in {'true', 'false'}:
            raise serializers.ValidationError({'result': 'El resultado debe ser true o false.'})
        filters.append('ba.exitoso = %s')
        values.append(result == 'true')
    if params.get('ip'):
        filters.append('ba.direccion_ip::text ILIKE %s')
        values.append(f"%{params['ip'].strip()}%")
    if params.get('search'):
        search = f"%{params['search'].strip()}%"
        filters.append('''(
            COALESCE(u.nombre_usuario, '') ILIKE %s
            OR COALESCE(u.nombres || ' ' || u.apellidos, '') ILIKE %s
            OR COALESCE(a.codigo, '') ILIKE %s
            OR COALESCE(a.nombre, '') ILIKE %s
            OR COALESCE(tr.codigo, '') ILIKE %s
            OR COALESCE(ba.resultado, '') ILIKE %s
            OR COALESCE(ba.detalles::text, '') ILIKE %s
            OR COALESCE(ba.recurso_id::text, '') ILIKE %s
            OR COALESCE(ba.direccion_ip::text, '') ILIKE %s
        )''')
        values.extend([search] * 9)
    if params.get('critical') == 'true':
        filters.append("(NOT ba.exitoso OR a.codigo IN ('SESION_FALLIDA', 'SESION_INVALIDA', 'ACCESO_DENEGADO', 'ALERTA_SEGURIDAD_GENERADA'))")
    return ' AND '.join(filters), values


def audit_base_sql(where):
    return f'''
        FROM gestion_documental.bitacora_auditoria ba
        LEFT JOIN gestion_documental.usuarios u ON u.id = ba.usuario_id
        LEFT JOIN gestion_documental.acciones_auditoria a ON a.id = ba.accion_id
        LEFT JOIN gestion_documental.tipos_recurso_auditoria tr ON tr.id = ba.tipo_recurso_id
        WHERE {where}
    '''


def fetch_audit_rows(params, limit, offset=0):
    timestamp_column = audit_timestamp_column()
    where, values = audit_query_parts(params, timestamp_column)
    with connection.cursor() as cursor:
        cursor.execute(
            f'''SELECT
                ba.id,
                ba.{timestamp_column} AS event_at,
                ba.usuario_id AS user_id,
                u.nombre_usuario AS username,
                TRIM(COALESCE(u.nombres, '') || ' ' || COALESCE(u.apellidos, '')) AS user_name,
                a.codigo AS action_code,
                a.nombre AS action,
                tr.codigo AS resource_code,
                tr.nombre AS module,
                ba.recurso_id AS resource_id,
                ba.exitoso AS successful,
                ba.resultado AS result,
                ba.detalles AS details,
                ba.direccion_ip::text AS ip,
                ba.agente_usuario AS user_agent
            {audit_base_sql(where)}
            ORDER BY ba.{timestamp_column} DESC, ba.id DESC
            LIMIT %s OFFSET %s''',
            [*values, limit, offset],
        )
        columns = [item[0] for item in cursor.description]
        rows = [dict(zip(columns, row)) for row in cursor.fetchall()]
        cursor.execute(f'SELECT COUNT(*) {audit_base_sql(where)}', values)
        total = cursor.fetchone()[0]
    return total, rows


def fetch_security_alerts(organization_id):
    timestamp_column = audit_timestamp_column()
    with connection.cursor() as cursor:
        cursor.execute(
            f'''
                SELECT
                    a.codigo AS action_code,
                    COALESCE(MAX(tr.codigo), 'DESCONOCIDO') AS resource_code,
                    ba.direccion_ip::text AS ip,
                    ba.usuario_id AS user_id,
                    COALESCE(u.nombre_usuario, 'desconocido') AS username,
                    COUNT(*) AS event_count,
                    MAX(ba.{timestamp_column}) AS last_event_at
                FROM gestion_documental.bitacora_auditoria ba
                LEFT JOIN gestion_documental.usuarios u ON u.id = ba.usuario_id
                JOIN gestion_documental.acciones_auditoria a ON a.id = ba.accion_id
                LEFT JOIN gestion_documental.tipos_recurso_auditoria tr ON tr.id = ba.tipo_recurso_id
                WHERE ba.organizacion_id = %s
                  AND a.codigo IN ('SESION_FALLIDA', 'SESION_INVALIDA', 'ACCESO_DENEGADO')
                  AND ba.{timestamp_column} >= CURRENT_TIMESTAMP - INTERVAL '{SECURITY_ALERT_WINDOW_HOURS} hours'
                GROUP BY a.codigo, ba.direccion_ip, ba.usuario_id, u.nombre_usuario
                HAVING COUNT(*) >= CASE WHEN a.codigo = 'SESION_INVALIDA' THEN 1 ELSE {SECURITY_ALERT_THRESHOLD} END
                ORDER BY event_count DESC, last_event_at DESC
                LIMIT 50
            ''',
            [organization_id],
        )
        rows = [dict(zip(['action_code', 'resource_code', 'ip', 'user_id', 'username', 'event_count', 'last_event_at'], row)) for row in cursor.fetchall()]

    alerts = []
    for row in rows:
        title, severity = SECURITY_ALERT_LABELS.get(row['action_code'], ('Evento de seguridad', 'alto'))
        event_count = int(row['event_count'])
        user_id = str(row['user_id']) if row['user_id'] else None
        source = row['username'] or 'Usuario desconocido'
        if row['ip']:
            source = f'{source} - IP {row["ip"]}'
        alerts.append({
            'id': f'{row["action_code"]}:{user_id or "unknown"}:{row["ip"] or "unknown"}',
            'action_code': row['action_code'],
            'resource_code': row['resource_code'],
            'ip': row['ip'],
            'user_id': user_id,
            'username': row['username'],
            'event_count': event_count,
            'failed_attempts': event_count,
            'last_event_at': row['last_event_at'],
            'severity': severity,
            'title': title,
            'message': f'Se detectaron {event_count} eventos en las ultimas {SECURITY_ALERT_WINDOW_HOURS} horas.',
            'source': source,
        })
    return alerts


class AuditListView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def get(self, request):
        require_audit_access(request, allow_own_events=True)
        try:
            limit = min(max(int(request.query_params.get('limit', 25)), 1), 100)
            offset = max(int(request.query_params.get('offset', 0)), 0)
        except (TypeError, ValueError) as error:
            raise serializers.ValidationError({'code': 'INVALID_PAGINATION', 'detail': 'La paginacion no es valida.'}) from error
        params = {**request.query_params.dict(), 'organization_id': request.user.organizacion_id}
        total, rows = fetch_audit_rows(params, limit, offset)
        return Response({
            'count': total,
            'next_offset': offset + limit if offset + limit < total else None,
            'results': rows,
        })


class AuditExportView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def get(self, request):
        require_audit_access(request)
        params = {**request.query_params.dict(), 'organization_id': request.user.organizacion_id}
        _, rows = fetch_audit_rows(params, 10000)
        record_auth_event(
            action_code='BITACORA_EXPORTADA',
            resource_code='BITACORA',
            organization_id=request.user.organizacion_id,
            user_id=request.user.id,
            session_id=getattr(request.auth, 'id', None),
            request=request,
            successful=True,
            result='Bitacora exportada correctamente',
        )
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="bitacora-sistema.csv"'
        response.write('\ufeff')
        writer = csv.writer(response)
        writer.writerow(AUDIT_COLUMNS)
        for row in rows:
            writer.writerow([row.get(column) for column in AUDIT_COLUMNS])
        return response


class AuditAlertsView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def get(self, request):
        require_audit_access(request)
        alerts = fetch_security_alerts(request.user.organizacion_id)
        return Response({
            'count': len(alerts),
            'alerts': alerts,
            'threshold': SECURITY_ALERT_THRESHOLD,
            'thresholds': SECURITY_ALERT_THRESHOLDS,
            'window_hours': SECURITY_ALERT_WINDOW_HOURS,
        })
