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
                ('modulo', models.CharField(max_length=50)),
                ('descripcion', models.TextField(blank=True)),
                ('activo', models.BooleanField(default=True)),
            ],
            options={
                'db_table': '"gestion_documental"."permisos"',
                'managed': False,
                'ordering': ['modulo', 'codigo'],
            },
        ),
        migrations.CreateModel(
            name='RolDocumental',
            fields=[
                ('id', models.UUIDField(editable=False, primary_key=True, serialize=False)),
                ('organizacion', models.ForeignKey(
                    db_column='organizacion_id',
                    on_delete=models.RESTRICT,
                    related_name='roles_documentales',
                    to='documentos.organizacion',
                )),
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
                ('pk', models.CompositePrimaryKey('rol_id', 'permiso_id')),
                ('asignado_en', models.DateTimeField()),
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
                ('asignado_por', models.ForeignKey(
                    blank=True,
                    db_column='asignado_por_id',
                    null=True,
                    on_delete=models.SET_NULL,
                    related_name='permisos_asignados',
                    to='documentos.usuariodocumental',
                )),
            ],
            options={
                'db_table': '"gestion_documental"."roles_permisos"',
                'managed': False,
            },
        ),
        migrations.CreateModel(
            name='UsuarioRolDocumental',
            fields=[
                ('pk', models.CompositePrimaryKey('usuario_id', 'rol_id')),
                ('asignado_en', models.DateTimeField()),
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
                ('asignado_por', models.ForeignKey(
                    blank=True,
                    db_column='asignado_por_id',
                    null=True,
                    on_delete=models.SET_NULL,
                    related_name='roles_asignados',
                    to='documentos.usuariodocumental',
                )),
            ],
            options={
                'db_table': '"gestion_documental"."usuarios_roles"',
                'managed': False,
            },
        ),
    ]
