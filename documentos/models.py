import uuid
from pathlib import Path

from django.db import models


def document_file_upload_to(instance, filename):
    extension = Path(filename).suffix.lower()
    return f'{instance.documento.organizacion_id}/{instance.documento_id}/{uuid.uuid4()}{extension}'


class UsuarioDocumental(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organizacion_id = models.UUIDField()
    area_id = models.UUIDField(null=True, blank=True)
    nombre_usuario = models.CharField(max_length=80)
    correo = models.EmailField(max_length=254)
    nombres = models.CharField(max_length=120)
    apellidos = models.CharField(max_length=120)
    hash_contrasena = models.CharField(max_length=255)
    activo = models.BooleanField(default=True)
    debe_cambiar_contrasena = models.BooleanField(default=True)
    intentos_fallidos = models.PositiveSmallIntegerField(default=0)
    bloqueado_hasta = models.DateTimeField(null=True, blank=True)
    ultimo_acceso_en = models.DateTimeField(null=True, blank=True)
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)
    deshabilitado_en = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = '"gestion_documental"."usuarios"'

    @property
    def is_authenticated(self):
        return True

    @property
    def is_anonymous(self):
        return False

    @property
    def is_active(self):
        return self.activo

    def __str__(self):
        return self.nombre_usuario


class SesionDocumental(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    usuario = models.ForeignKey(
        UsuarioDocumental,
        db_column='usuario_id',
        on_delete=models.CASCADE,
        related_name='sesiones_documentales',
    )
    hash_token = models.CharField(max_length=64, unique=True)
    direccion_ip = models.GenericIPAddressField(null=True, blank=True)
    agente_usuario = models.TextField(null=True, blank=True)
    iniciada_en = models.DateTimeField(auto_now_add=True)
    ultima_actividad_en = models.DateTimeField(auto_now_add=True)
    expira_en = models.DateTimeField()
    revocada_en = models.DateTimeField(null=True, blank=True)
    motivo_revocacion = models.CharField(max_length=200, null=True, blank=True)

    class Meta:
        managed = False
        db_table = '"gestion_documental"."sesiones"'

    def __str__(self):
        return str(self.id)


class Organizacion(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    codigo = models.CharField(max_length=32)
    nombre = models.CharField(max_length=150)
    descripcion = models.TextField(blank=True)
    activo = models.BooleanField(default=True)
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = '"gestion_documental"."organizaciones"'
        ordering = ['nombre']
        constraints = [
            models.UniqueConstraint(fields=['codigo'], name='uq_organizaciones_codigo'),
            models.CheckConstraint(
                condition=models.Q(codigo__regex=r'^[A-Z0-9_-]+$'),
                name='ck_organizaciones_codigo_formato',
            ),
        ]

    def __str__(self):
        return self.nombre


class Area(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organizacion = models.ForeignKey(
        Organizacion,
        db_column='organizacion_id',
        on_delete=models.CASCADE,
        related_name='areas',
    )
    codigo = models.CharField(max_length=32)
    nombre = models.CharField(max_length=120)
    descripcion = models.TextField(blank=True)
    activo = models.BooleanField(default=True)
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = '"gestion_documental"."areas"'
        ordering = ['nombre']
        constraints = [
            models.UniqueConstraint(
                fields=['organizacion', 'codigo'],
                name='uq_areas_organizacion_codigo',
            ),
            models.CheckConstraint(
                condition=models.Q(codigo__regex=r'^[A-Z0-9_-]+$'),
                name='ck_areas_codigo_formato',
            ),
        ]
        indexes = [
            models.Index(fields=['organizacion', 'activo'], name='ix_areas_org_activo'),
        ]

    def __str__(self):
        return self.nombre


class TipoDocumento(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organizacion = models.ForeignKey(
        Organizacion,
        db_column='organizacion_id',
        on_delete=models.CASCADE,
        related_name='tipos_documento',
    )
    codigo = models.CharField(max_length=32)
    nombre = models.CharField(max_length=100)
    descripcion = models.TextField(blank=True)
    activo = models.BooleanField(default=True)
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = '"gestion_documental"."tipos_documento"'
        ordering = ['nombre']
        constraints = [
            models.UniqueConstraint(
                fields=['organizacion', 'codigo'],
                name='uq_tipos_doc_organizacion_codigo',
            ),
            models.CheckConstraint(
                condition=models.Q(codigo__regex=r'^[A-Z0-9_-]+$'),
                name='ck_tipos_doc_codigo_formato',
            ),
        ]
        indexes = [
            models.Index(fields=['organizacion', 'activo'], name='ix_tipos_doc_org_activo'),
        ]

    def __str__(self):
        return self.nombre


class ClasificacionDocumento(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organizacion = models.ForeignKey(
        Organizacion,
        db_column='organizacion_id',
        on_delete=models.CASCADE,
        related_name='clasificaciones_documento',
    )
    codigo = models.CharField(max_length=32)
    nombre = models.CharField(max_length=100)
    descripcion = models.TextField(blank=True)
    nivel = models.PositiveSmallIntegerField(default=1)
    requiere_autorizacion = models.BooleanField(default=False)
    activo = models.BooleanField(default=True)
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = '"gestion_documental"."clasificaciones_documento"'
        ordering = ['nivel', 'nombre']
        constraints = [
            models.UniqueConstraint(
                fields=['organizacion', 'codigo'],
                name='uq_clasif_doc_organizacion_codigo',
            ),
            models.CheckConstraint(
                condition=models.Q(codigo__regex=r'^[A-Z0-9_-]+$'),
                name='ck_clasif_doc_codigo_formato',
            ),
            models.CheckConstraint(
                condition=models.Q(nivel__gte=1),
                name='ck_clasif_doc_nivel_positivo',
            ),
        ]
        indexes = [
            models.Index(fields=['organizacion', 'activo'], name='ix_clasif_doc_org_activo'),
        ]

    def __str__(self):
        return self.nombre


class EstadoDocumento(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    codigo = models.CharField(max_length=32, unique=True)
    nombre = models.CharField(max_length=100)
    descripcion = models.TextField(blank=True)
    orden = models.PositiveSmallIntegerField(default=0)
    es_final = models.BooleanField(default=False)
    permite_edicion = models.BooleanField(default=True)
    activo = models.BooleanField(default=True)

    class Meta:
        db_table = '"gestion_documental"."estados_documento"'
        ordering = ['orden', 'nombre']
        constraints = [
            models.CheckConstraint(
                condition=models.Q(codigo__regex=r'^[A-Z0-9_-]+$'),
                name='ck_estados_doc_codigo_formato',
            ),
            models.CheckConstraint(
                condition=models.Q(orden__gte=0),
                name='ck_estados_doc_orden_no_negativo',
            ),
        ]

    def __str__(self):
        return self.nombre


class AccionAuditoria(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    codigo = models.CharField(max_length=50, unique=True)
    nombre = models.CharField(max_length=120)
    descripcion = models.TextField(blank=True)
    activo = models.BooleanField(default=True)

    class Meta:
        db_table = '"gestion_documental"."acciones_auditoria"'
        ordering = ['codigo']

    def __str__(self):
        return self.nombre


class TipoRecursoAuditoria(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    codigo = models.CharField(max_length=50, unique=True)
    nombre = models.CharField(max_length=120)
    descripcion = models.TextField(blank=True)
    activo = models.BooleanField(default=True)

    class Meta:
        db_table = '"gestion_documental"."tipos_recurso_auditoria"'
        ordering = ['codigo']

    def __str__(self):
        return self.nombre


class RolDocumental(models.Model):
    id = models.UUIDField(primary_key=True, editable=False)
    organizacion = models.ForeignKey(
        Organizacion,
        db_column='organizacion_id',
        on_delete=models.RESTRICT,
        related_name='roles_documentales',
    )
    codigo = models.CharField(max_length=50)
    nombre = models.CharField(max_length=120)
    descripcion = models.TextField(blank=True)
    activo = models.BooleanField(default=True)
    creado_en = models.DateTimeField()
    actualizado_en = models.DateTimeField()

    class Meta:
        managed = False
        db_table = '"gestion_documental"."roles"'
        ordering = ['codigo']

    def __str__(self):
        return self.nombre


class PermisoDocumental(models.Model):
    id = models.UUIDField(primary_key=True, editable=False)
    codigo = models.CharField(max_length=80)
    nombre = models.CharField(max_length=120)
    modulo = models.CharField(max_length=50)
    descripcion = models.TextField(blank=True)
    activo = models.BooleanField(default=True)

    class Meta:
        managed = False
        db_table = '"gestion_documental"."permisos"'
        ordering = ['modulo', 'codigo']

    def __str__(self):
        return self.nombre


class UsuarioRolDocumental(models.Model):
    pk = models.CompositePrimaryKey('usuario_id', 'rol_id')
    usuario = models.ForeignKey(
        UsuarioDocumental,
        db_column='usuario_id',
        on_delete=models.CASCADE,
        related_name='roles_documentales',
    )
    rol = models.ForeignKey(
        RolDocumental,
        db_column='rol_id',
        on_delete=models.CASCADE,
        related_name='usuarios_documentales',
    )
    asignado_por = models.ForeignKey(
        UsuarioDocumental,
        db_column='asignado_por_id',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='roles_asignados',
    )
    asignado_en = models.DateTimeField()
    vigente_hasta = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = '"gestion_documental"."usuarios_roles"'
class RolPermisoDocumental(models.Model):
    pk = models.CompositePrimaryKey('rol_id', 'permiso_id')
    rol = models.ForeignKey(
        RolDocumental,
        db_column='rol_id',
        on_delete=models.CASCADE,
        related_name='permisos_documentales',
    )
    permiso = models.ForeignKey(
        PermisoDocumental,
        db_column='permiso_id',
        on_delete=models.CASCADE,
        related_name='roles_documentales',
    )
    asignado_por = models.ForeignKey(
        UsuarioDocumental,
        db_column='asignado_por_id',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='permisos_asignados',
    )
    asignado_en = models.DateTimeField()

    class Meta:
        managed = False
        db_table = '"gestion_documental"."roles_permisos"'


class TipoDocumentoCatalogo(models.Model):
    id = models.SmallIntegerField(primary_key=True)
    codigo = models.CharField(max_length=32)
    nombre = models.CharField(max_length=100)
    descripcion = models.TextField(null=True, blank=True)
    activo = models.BooleanField(default=True)

    class Meta:
        managed = False
        db_table = '"gestion_documental"."tipos_documento"'


class AreaCatalogo(models.Model):
    id = models.UUIDField(primary_key=True)
    organizacion_id = models.UUIDField()
    area_padre_id = models.UUIDField(null=True, blank=True)
    codigo = models.CharField(max_length=32)
    nombre = models.CharField(max_length=120)
    descripcion = models.TextField(null=True, blank=True)
    activa = models.BooleanField(default=True)
    creada_en = models.DateTimeField()
    actualizada_en = models.DateTimeField()

    class Meta:
        managed = False
        db_table = '"gestion_documental"."areas"'


class EstadoVersionCatalogo(models.Model):
    id = models.SmallIntegerField(primary_key=True)
    codigo = models.CharField(max_length=32)
    nombre = models.CharField(max_length=100)
    es_final = models.BooleanField(default=False)
    permite_edicion = models.BooleanField(default=False)

    class Meta:
        managed = False
        db_table = '"gestion_documental"."estados_version"'


class ProveedorAlmacenamiento(models.Model):
    id = models.UUIDField(primary_key=True)
    organizacion_id = models.UUIDField()
    codigo = models.CharField(max_length=50)
    nombre = models.CharField(max_length=120)
    tipo = models.CharField(max_length=30)
    contenedor = models.CharField(max_length=255)
    region = models.CharField(max_length=100, null=True, blank=True)
    url_base = models.TextField(null=True, blank=True)
    activo = models.BooleanField(default=True)
    creado_en = models.DateTimeField()

    class Meta:
        managed = False
        db_table = '"gestion_documental"."proveedores_almacenamiento"'


class Documento(models.Model):
    id = models.UUIDField(primary_key=True)
    organizacion_id = models.UUIDField()
    area = models.ForeignKey(
        AreaCatalogo,
        db_column='area_id',
        on_delete=models.PROTECT,
        related_name='documentos_documentales',
    )
    tipo_documento = models.ForeignKey(
        TipoDocumentoCatalogo,
        db_column='tipo_documento_id',
        on_delete=models.PROTECT,
        related_name='documentos_documentales',
    )
    codigo = models.CharField(max_length=64)
    nombre = models.CharField(max_length=200)
    descripcion = models.TextField(null=True, blank=True)
    fecha_documento = models.DateField(null=True, blank=True)
    creado_por = models.ForeignKey(
        UsuarioDocumental,
        db_column='creado_por_id',
        on_delete=models.PROTECT,
        related_name='documentos_creados',
    )
    creado_en = models.DateTimeField()
    actualizado_en = models.DateTimeField()
    eliminado_en = models.DateTimeField(null=True, blank=True)
    eliminado_por = models.ForeignKey(
        UsuarioDocumental,
        db_column='eliminado_por_id',
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='documentos_eliminados',
    )
    motivo_eliminacion = models.TextField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = '"gestion_documental"."documentos"'
        ordering = ['-actualizado_en', 'codigo']

    def __str__(self):
        return f'{self.codigo} - {self.nombre}'


class MetadatoDocumento(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    documento = models.ForeignKey(
        Documento,
        db_column='documento_id',
        on_delete=models.CASCADE,
        related_name='metadatos',
    )
    clave = models.CharField(max_length=100)
    valor = models.TextField(blank=True)
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = '"gestion_documental"."documentos_metadatos"'
        ordering = ['clave']
        constraints = [
            models.UniqueConstraint(
                fields=['documento', 'clave'],
                name='uq_documentos_metadatos_documento_clave',
            ),
        ]


class ArchivoDocumento(models.Model):
    id = models.UUIDField(primary_key=True)
    documento = models.ForeignKey(
        Documento,
        db_column='documento_id',
        on_delete=models.CASCADE,
        related_name='archivos',
    )
    estado_version = models.ForeignKey(
        EstadoVersionCatalogo,
        db_column='estado_version_id',
        on_delete=models.PROTECT,
        related_name='versiones_documentales',
    )
    proveedor_almacenamiento = models.ForeignKey(
        ProveedorAlmacenamiento,
        db_column='proveedor_almacenamiento_id',
        on_delete=models.PROTECT,
        related_name='versiones_documentales',
    )
    numero_mayor = models.IntegerField()
    numero_menor = models.IntegerField(default=0)
    orden_version = models.IntegerField()
    es_vigente = models.BooleanField(default=False)
    nombre_archivo_original = models.CharField(max_length=255)
    clave_almacenamiento = models.TextField()
    tipo_mime = models.CharField(max_length=150)
    tamano_bytes = models.BigIntegerField()
    sha256 = models.CharField(max_length=64)
    comentario_cambio = models.TextField()
    creada_por = models.ForeignKey(
        UsuarioDocumental,
        db_column='creada_por_id',
        on_delete=models.PROTECT,
        related_name='versiones_creadas',
    )
    creada_en = models.DateTimeField()

    class Meta:
        managed = False
        db_table = '"gestion_documental"."versiones_documento"'
        ordering = ['-orden_version']


class EstadoRevisionCatalogo(models.Model):
    id = models.SmallIntegerField(primary_key=True)
    codigo = models.CharField(max_length=32)
    nombre = models.CharField(max_length=100)
    es_final = models.BooleanField(default=False)

    class Meta:
        managed = False
        db_table = '"gestion_documental"."estados_revision"'


class SolicitudRevision(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    version_documento = models.ForeignKey(
        ArchivoDocumento,
        db_column='version_documento_id',
        on_delete=models.CASCADE,
        related_name='solicitudes_revision',
    )
    revisor = models.ForeignKey(
        UsuarioDocumental,
        db_column='revisor_id',
        on_delete=models.PROTECT,
        related_name='solicitudes_asignadas',
    )
    solicitada_por = models.ForeignKey(
        UsuarioDocumental,
        db_column='solicitada_por_id',
        on_delete=models.PROTECT,
        related_name='solicitudes_enviadas',
    )
    estado_revision = models.ForeignKey(
        EstadoRevisionCatalogo,
        db_column='estado_revision_id',
        on_delete=models.PROTECT,
        related_name='solicitudes_documentales',
    )
    comentario_solicitud = models.TextField(null=True, blank=True)
    comentario_resolucion = models.TextField(null=True, blank=True)
    solicitada_en = models.DateTimeField()
    resuelta_en = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = '"gestion_documental"."solicitudes_revision"'
        ordering = ['-solicitada_en']


class HistorialEstadoVersion(models.Model):
    id = models.BigAutoField(primary_key=True)
    version_documento = models.ForeignKey(
        ArchivoDocumento,
        db_column='version_documento_id',
        on_delete=models.CASCADE,
        related_name='historial_estados',
    )
    estado_anterior = models.ForeignKey(
        EstadoVersionCatalogo,
        db_column='estado_anterior_id',
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='historial_desde',
    )
    estado_nuevo = models.ForeignKey(
        EstadoVersionCatalogo,
        db_column='estado_nuevo_id',
        on_delete=models.PROTECT,
        related_name='historial_hasta',
    )
    cambiado_por = models.ForeignKey(
        UsuarioDocumental,
        db_column='cambiado_por_id',
        on_delete=models.PROTECT,
        related_name='cambios_estado_version',
    )
    comentario = models.TextField(null=True, blank=True)
    cambiado_en = models.DateTimeField()

    class Meta:
        managed = False
        db_table = '"gestion_documental"."historial_estados_version"'
        ordering = ['-cambiado_en']


class DetalleSolicitudRevision(models.Model):
    PRIORIDADES = (
        ('BAJA', 'Baja'),
        ('MEDIA', 'Media'),
        ('ALTA', 'Alta'),
        ('URGENTE', 'Urgente'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    solicitud = models.OneToOneField(
        SolicitudRevision,
        db_column='solicitud_revision_id',
        on_delete=models.CASCADE,
        related_name='detalle',
    )
    fecha_limite = models.DateTimeField(null=True, blank=True)
    prioridad = models.CharField(max_length=20, choices=PRIORIDADES, default='MEDIA')
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = '"gestion_documental"."solicitudes_revision_detalle"'


class ElementoChecklistRevision(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    solicitud = models.ForeignKey(
        SolicitudRevision,
        db_column='solicitud_revision_id',
        on_delete=models.CASCADE,
        related_name='checklist',
    )
    orden = models.PositiveIntegerField(default=0)
    titulo = models.CharField(max_length=255)
    completada = models.BooleanField(default=False)
    completada_por = models.ForeignKey(
        UsuarioDocumental,
        db_column='completada_por_id',
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='checklist_completada',
    )
    completada_en = models.DateTimeField(null=True, blank=True)
    creada_en = models.DateTimeField(auto_now_add=True)
    actualizada_en = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = '"gestion_documental"."revisiones_checklist"'
        ordering = ['orden', 'creada_en']


class ComentarioRevision(models.Model):
    TIPOS = (
        ('OBSERVACION', 'Observacion'),
        ('RESPUESTA', 'Respuesta'),
        ('RESOLUCION', 'Resolucion'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    solicitud = models.ForeignKey(
        SolicitudRevision,
        db_column='solicitud_revision_id',
        on_delete=models.CASCADE,
        related_name='comentarios',
    )
    autor = models.ForeignKey(
        UsuarioDocumental,
        db_column='autor_id',
        on_delete=models.PROTECT,
        related_name='comentarios_revision',
    )
    comentario_padre = models.ForeignKey(
        'self',
        db_column='comentario_padre_id',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='respuestas',
    )
    tipo = models.CharField(max_length=20, choices=TIPOS, default='OBSERVACION')
    contenido = models.TextField()
    resuelto = models.BooleanField(default=False)
    resuelto_por = models.ForeignKey(
        UsuarioDocumental,
        db_column='resuelto_por_id',
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='comentarios_resueltos',
    )
    resuelto_en = models.DateTimeField(null=True, blank=True)
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = '"gestion_documental"."revision_comentarios"'
        ordering = ['creado_en']


class RegistroAccesoDocumento(models.Model):
    TIPOS = (
        ('CONSULTA', 'Consulta'),
        ('LECTURA', 'Lectura'),
        ('DESCARGA', 'Descarga'),
        ('VISTA_PREVIA', 'Vista previa'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    documento = models.ForeignKey(
        Documento,
        db_column='documento_id',
        on_delete=models.CASCADE,
        related_name='registros_acceso',
    )
    version_documento = models.ForeignKey(
        ArchivoDocumento,
        db_column='version_documento_id',
        on_delete=models.CASCADE,
        related_name='registros_acceso',
    )
    usuario = models.ForeignKey(
        UsuarioDocumental,
        db_column='usuario_id',
        on_delete=models.PROTECT,
        related_name='accesos_documentales',
    )
    tipo = models.CharField(max_length=20, choices=TIPOS)
    detalle = models.TextField(null=True, blank=True)
    duracion_segundos = models.PositiveIntegerField(null=True, blank=True)
    pagina_final = models.PositiveIntegerField(null=True, blank=True)
    direccion_ip = models.GenericIPAddressField(null=True, blank=True)
    agente_usuario = models.TextField(null=True, blank=True)
    registrado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = '"gestion_documental"."documentos_accesos"'
        ordering = ['-registrado_en']
        indexes = [
            models.Index(fields=['usuario', '-registrado_en'], name='ix_accesos_usuario_fecha'),
            models.Index(fields=['documento', '-registrado_en'], name='ix_accesos_documento_fecha'),
            models.Index(fields=['tipo', '-registrado_en'], name='ix_accesos_tipo_fecha'),
        ]


class FavoritoDocumento(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    documento = models.ForeignKey(
        Documento,
        db_column='documento_id',
        on_delete=models.CASCADE,
        related_name='favoritos',
    )
    usuario = models.ForeignKey(
        UsuarioDocumental,
        db_column='usuario_id',
        on_delete=models.CASCADE,
        related_name='documentos_favoritos',
    )
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = '"gestion_documental"."documentos_favoritos"'
        constraints = [
            models.UniqueConstraint(
                fields=['documento', 'usuario'],
                name='uq_documentos_favoritos_documento_usuario',
            ),
        ]
        indexes = [
            models.Index(fields=['usuario', '-creado_en'], name='ix_favoritos_usuario_fecha'),
        ]


class Notificacion(models.Model):
    TIPOS = (
        ('REVISION_ASIGNADA', 'Revision asignada'),
        ('COMENTARIO_REVISION', 'Comentario de revision'),
        ('APROBACION_REVISION', 'Revision aprobada'),
        ('DEVOLUCION_REVISION', 'Revision devuelta'),
        ('RECHAZO_REVISION', 'Revision rechazada'),
        ('PUBLICACION_DOCUMENTO', 'Documento publicado'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    usuario = models.ForeignKey(
        UsuarioDocumental,
        db_column='usuario_id',
        on_delete=models.CASCADE,
        related_name='notificaciones',
    )
    tipo = models.CharField(max_length=30, choices=TIPOS)
    titulo = models.CharField(max_length=200)
    mensaje = models.TextField()
    documento = models.ForeignKey(
        Documento,
        db_column='documento_id',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='notificaciones',
    )
    version_documento = models.ForeignKey(
        ArchivoDocumento,
        db_column='version_documento_id',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='notificaciones',
    )
    solicitud_revision = models.ForeignKey(
        SolicitudRevision,
        db_column='solicitud_revision_id',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='notificaciones',
    )
    leida_en = models.DateTimeField(null=True, blank=True)
    correo_enviado_en = models.DateTimeField(null=True, blank=True)
    error_correo = models.TextField(null=True, blank=True)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = '"gestion_documental"."notificaciones"'
        ordering = ['-creado_en']
        indexes = [
            models.Index(fields=['usuario', 'leida_en', '-creado_en'], name='ix_notif_usuario_estado_fecha'),
            models.Index(fields=['tipo', '-creado_en'], name='ix_notif_tipo_fecha'),
        ]
