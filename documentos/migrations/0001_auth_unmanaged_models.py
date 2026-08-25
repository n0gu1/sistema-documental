import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='UsuarioDocumental',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('organizacion_id', models.UUIDField()),
                ('area_id', models.UUIDField(blank=True, null=True)),
                ('nombre_usuario', models.CharField(max_length=80)),
                ('correo', models.EmailField(max_length=254)),
                ('nombres', models.CharField(max_length=120)),
                ('apellidos', models.CharField(max_length=120)),
                ('hash_contrasena', models.CharField(max_length=255)),
                ('activo', models.BooleanField(default=True)),
                ('debe_cambiar_contrasena', models.BooleanField(default=True)),
                ('intentos_fallidos', models.PositiveSmallIntegerField(default=0)),
                ('bloqueado_hasta', models.DateTimeField(blank=True, null=True)),
                ('ultimo_acceso_en', models.DateTimeField(blank=True, null=True)),
                ('creado_en', models.DateTimeField(auto_now_add=True)),
                ('actualizado_en', models.DateTimeField(auto_now=True)),
                ('deshabilitado_en', models.DateTimeField(blank=True, null=True)),
            ],
            options={
                'db_table': '"gestion_documental"."usuarios"',
                'managed': False,
            },
        ),
        migrations.CreateModel(
            name='SesionDocumental',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('hash_token', models.CharField(max_length=64, unique=True)),
                ('direccion_ip', models.GenericIPAddressField(blank=True, null=True)),
                ('agente_usuario', models.TextField(blank=True, null=True)),
                ('iniciada_en', models.DateTimeField(auto_now_add=True)),
                ('ultima_actividad_en', models.DateTimeField(auto_now_add=True)),
                ('expira_en', models.DateTimeField()),
                ('revocada_en', models.DateTimeField(blank=True, null=True)),
                ('motivo_revocacion', models.CharField(blank=True, max_length=200, null=True)),
                (
                    'usuario',
                    models.ForeignKey(
                        db_column='usuario_id',
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='sesiones_documentales',
                        to='documentos.usuariodocumental',
                    ),
                ),
            ],
            options={
                'db_table': '"gestion_documental"."sesiones"',
                'managed': False,
            },
        ),
    ]
