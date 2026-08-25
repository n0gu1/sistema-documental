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
