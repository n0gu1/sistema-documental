import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('documentos', '0002_accionauditoria_tiporecursoauditoria_estadodocumento_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='PermisoDocumental',
            fields=[
                ('id', models.UUIDField(editable=False, primary_key=True, serialize=False)),
                ('codigo', models.CharField(max_length=80)),
                ('nombre', models.CharField(max_length=120)),
                ('modulo', models.CharField(max_length=60)),
                ('accion', models.CharField(max_length=40)),
                ('descripcion', models.TextField(blank=True)),
                ('activo', models.BooleanField(default=True)),
            ],
            options={
                'db_table': '"gestion_documental"."permisos"',
                'managed': False,
                'ordering': ['modulo', 'accion', 'codigo'],
            },
        ),
        migrations.CreateModel(
            name='RolDocumental',
            fields=[
                ('id', models.UUIDField(editable=False, primary_key=True, serialize=False)),
                ('codigo', models.CharField(max_length=50)),
                ('nombre', models.CharField(max_length=120)),
                ('descripcion', models.TextField(blank=True)),
                ('activo', models.BooleanField(default=True)),
                ('creado_en', models.DateTimeField()),
                ('actualizado_en', models.DateTimeField()),
            ],
            options={
                'db_table': '"gestion_documental"."roles"',
                'managed': False,
                'ordering': ['codigo'],
            },
        ),
        migrations.CreateModel(
            name='RolPermisoDocumental',
            fields=[
                ('id', models.UUIDField(editable=False, primary_key=True, serialize=False)),
                ('concedido', models.BooleanField(default=True)),
                ('permiso', models.ForeignKey(
                    db_column='permiso_id',
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='roles_documentales',
                    to='documentos.permisodocumental',
                )),
                ('rol', models.ForeignKey(
                    db_column='rol_id',
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='permisos_documentales',
                    to='documentos.roldocumental',
                )),
            ],
            options={
                'db_table': '"gestion_documental"."roles_permisos"',
                'managed': False,
                'constraints': [
                    models.UniqueConstraint(
                        fields=('rol', 'permiso'),
                        name='uq_roles_permisos_rol_permiso',
                    ),
                ],
            },
        ),
        migrations.CreateModel(
            name='UsuarioRolDocumental',
            fields=[
                ('id', models.UUIDField(editable=False, primary_key=True, serialize=False)),
                ('vigente_desde', models.DateTimeField()),
                ('vigente_hasta', models.DateTimeField(blank=True, null=True)),
                ('rol', models.ForeignKey(
                    db_column='rol_id',
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='usuarios_documentales',
                    to='documentos.roldocumental',
                )),
                ('usuario', models.ForeignKey(
                    db_column='usuario_id',
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='roles_documentales',
                    to='documentos.usuariodocumental',
                )),
            ],
            options={
                'db_table': '"gestion_documental"."usuarios_roles"',
                'managed': False,
                'constraints': [
                    models.UniqueConstraint(
                        fields=('usuario', 'rol'),
                        name='uq_usuarios_roles_usuario_rol',
                    ),
                ],
            },
        ),
    ]
