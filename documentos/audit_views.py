import csv
from datetime import datetime, time

from django.db import connection
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from .auth_utils import get_user_roles, record_auth_event
from .permissions import IsAuthenticatedAndPasswordCurrent


AUDIT_COLUMNS = [
    'id', 'event_at', 'user_id', 'username', 'user_name', 'action_code', 'action',
    'resource_code', 'module', 'resource_id', 'successful', 'result', 'details',
    'ip', 'user_agent',
]


def require_audit_access(request):
    if not any(role['code'] == 'ADMINISTRADOR' for role in get_user_roles(request.user.id)):
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


def audit_query_parts(params):
    filters = ['ba.organizacion_id = %s']
    values = [params['organization_id']]
    date_from = parse_audit_datetime(params.get('date_from'), 'date_from')
    date_to = parse_audit_datetime(params.get('date_to'), 'date_to', end=True)
    if date_from:
        filters.append('ba.creado_en >= %s')
        values.append(date_from)
    if date_to:
        filters.append('ba.creado_en <= %s')
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
        filters.append("(NOT ba.exitoso OR a.codigo IN ('SESION_FALLIDA', 'ALERTA_SEGURIDAD_GENERADA'))")
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
    where, values = audit_query_parts(params)
    with connection.cursor() as cursor:
        cursor.execute(
            f'''SELECT
                ba.id,
                ba.creado_en AS event_at,
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
            ORDER BY ba.creado_en DESC, ba.id DESC
            LIMIT %s OFFSET %s''',
            [*values, limit, offset],
        )
        columns = [item[0] for item in cursor.description]
        rows = [dict(zip(columns, row)) for row in cursor.fetchall()]
        cursor.execute(f'SELECT COUNT(*) {audit_base_sql(where)}', values)
        total = cursor.fetchone()[0]
    return total, rows


class AuditListView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def get(self, request):
        require_audit_access(request)
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
        with connection.cursor() as cursor:
            cursor.execute(
                '''
                SELECT
                    ba.direccion_ip::text AS ip,
                    ba.usuario_id AS user_id,
                    COALESCE(u.nombre_usuario, 'desconocido') AS username,
                    COUNT(*) AS failed_attempts,
                    MAX(ba.creado_en) AS last_event_at
                FROM gestion_documental.bitacora_auditoria ba
                LEFT JOIN gestion_documental.usuarios u ON u.id = ba.usuario_id
                JOIN gestion_documental.acciones_auditoria a ON a.id = ba.accion_id
                WHERE ba.organizacion_id = %s
                  AND a.codigo = 'SESION_FALLIDA'
                  AND ba.creado_en >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
                GROUP BY ba.direccion_ip, ba.usuario_id, u.nombre_usuario
                HAVING COUNT(*) >= 3
                ORDER BY failed_attempts DESC, last_event_at DESC
                LIMIT 50
                ''',
                [request.user.organizacion_id],
            )
            alerts = [dict(zip(['ip', 'user_id', 'username', 'failed_attempts', 'last_event_at'], row)) for row in cursor.fetchall()]
        return Response({'count': len(alerts), 'alerts': alerts})
