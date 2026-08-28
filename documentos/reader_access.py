from django.db import connection
from django.http import Http404

from .auth_utils import get_client_ip, get_user_roles, record_access_denied, record_auth_event, user_has_permission
from .models import Documento, RegistroAccesoDocumento


MANAGEMENT_PERMISSIONS = {
    'documentos.gestionar',
    'usuarios.consultar',
    'usuarios.gestionar',
    'roles.gestionar',
    'revisiones.enviar',
    'revisiones.consultar',
    'revisiones.aprobar',
    'revisiones.rechazar',
}


def is_reader_user(user):
    return not any(user_has_permission(user, permission) for permission in MANAGEMENT_PERMISSIONS)


def has_area_permission(user, area_id):
    if not getattr(user, 'area_id', None):
        return True
    if any(role['code'] == 'ADMINISTRADOR' for role in get_user_roles(user.id)):
        return True
    return str(user.area_id) == str(area_id)


def has_document_permission(user, document_id, permission_code):
    global_permission = user_has_permission(user, permission_code)
    with connection.cursor() as cursor:
        cursor.execute(
            '''
            SELECT
                EXISTS (
                    SELECT 1
                    FROM gestion_documental.documentos_roles_permisos drp
                    JOIN gestion_documental.permisos p ON p.id = drp.permiso_id
                    WHERE drp.documento_id = %s
                      AND p.codigo = %s
                      AND p.activo
                ) AS has_document_roles,
                EXISTS (
                    SELECT 1
                    FROM gestion_documental.documentos_roles_permisos drp
                    JOIN gestion_documental.permisos p ON p.id = drp.permiso_id
                    JOIN gestion_documental.usuarios_roles ur ON ur.rol_id = drp.rol_id
                    JOIN gestion_documental.roles r ON r.id = ur.rol_id
                    WHERE drp.documento_id = %s
                      AND ur.usuario_id = %s
                      AND p.codigo = %s
                      AND p.activo
                      AND r.activo
                      AND (ur.vigente_hasta IS NULL OR ur.vigente_hasta > CURRENT_TIMESTAMP)
                ) AS role_allowed
            ''',
            [document_id, permission_code, document_id, user.id, permission_code],
        )
        has_document_roles, role_allowed = cursor.fetchone()
    if has_document_roles:
        is_admin = any(role['code'] == 'ADMINISTRADOR' for role in get_user_roles(user.id))
        if is_admin:
            return True
        return role_allowed
    if not global_permission:
        return False
    if not getattr(user, 'area_id', None):
        return global_permission
    is_admin = any(role['code'] == 'ADMINISTRADOR' for role in get_user_roles(user.id))
    if is_admin:
        return True
    document = Documento.objects.filter(pk=document_id).only('area_id', 'creado_por_id').first()
    if not document:
        return False
    # An assigned area scopes broad permissions; explicit document grants above take precedence.
    return not user.area_id or document.area_id == user.area_id or document.creado_por_id == user.id


def filter_accessible_documents(user, documents, permission_code='documentos.consultar'):
    return [
        document for document in documents
        if has_document_permission(user, document.id, permission_code)
    ]


def published_document_queryset(organization_id):
    return Documento.objects.filter(
        organizacion_id=organization_id,
        eliminado_en__isnull=True,
        archivos__estado_version__codigo='PUBLICADO',
    ).select_related('area', 'tipo_documento', 'creado_por').distinct()


def published_version(document, version_id=None):
    versions = document.archivos.select_related('estado_version', 'creada_por').filter(
        estado_version__codigo='PUBLICADO',
    ).order_by('-orden_version')
    if version_id is not None:
        versions = versions.filter(pk=version_id)
    return versions.first()


def get_accessible_published_document(user, document_id, permission_code='documentos.consultar', request=None):
    document = published_document_queryset(user.organizacion_id).filter(pk=document_id).first()
    if not document or not has_document_permission(user, document.id, permission_code):
        if request is not None:
            record_access_denied(request, 'DOCUMENT_ACCESS_REQUIRED', resource_code='DOCUMENTO', resource_id=document.id if document else document_id)
        raise Http404
    if not published_version(document):
        if request is not None:
            record_access_denied(request, 'PUBLISHED_VERSION_REQUIRED', resource_code='DOCUMENTO', resource_id=document.id)
        raise Http404
    return document


def record_reader_access(request, document, version, access_type, detail=None, duration=None, page=None):
    access = RegistroAccesoDocumento.objects.create(
        documento=document,
        version_documento=version,
        usuario=request.user,
        tipo=access_type,
        detalle=detail,
        duracion_segundos=duration,
        pagina_final=page,
        direccion_ip=get_client_ip(request),
        agente_usuario=request.META.get('HTTP_USER_AGENT', ''),
    )
    action_code = {
        'CONSULTA': 'DOCUMENTO_CONSULTADO',
        'LECTURA': 'LECTURA_REGISTRADA',
        'DESCARGA': 'ARCHIVO_DESCARGADO',
        'VISTA_PREVIA': 'ARCHIVO_PREVISUALIZADO',
    }[access_type]
    record_auth_event(
        action_code=action_code,
        resource_code='ARCHIVO' if access_type in {'DESCARGA', 'VISTA_PREVIA'} else 'DOCUMENTO',
        organization_id=document.organizacion_id,
        user_id=request.user.id,
        session_id=getattr(request.auth, 'id', None),
        resource_id=version.id if access_type in {'DESCARGA', 'VISTA_PREVIA'} else document.id,
        request=request,
        successful=True,
        result='Acceso documental registrado',
        details={'access_id': str(access.id), 'version_id': str(version.id)},
    )
    return access
