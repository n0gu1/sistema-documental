import uuid

from django.db import models


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
