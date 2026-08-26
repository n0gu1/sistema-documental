import django.db.models.deletion
import documentos.models
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('documentos', '0004_documento_archivodocumento_metadatodocumento_and_more'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.CreateModel(
                    name='MetadatoDocumento',
                    fields=[
                        ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                        ('clave', models.CharField(max_length=100)),
                        ('valor', models.TextField(blank=True)),
                        ('creado_en', models.DateTimeField(auto_now_add=True)),
                        ('actualizado_en', models.DateTimeField(auto_now=True)),
                        ('documento', models.ForeignKey(
                            db_column='documento_id',
                            on_delete=django.db.models.deletion.CASCADE,
                            related_name='metadatos',
                            to='documentos.documento',
                        )),
                    ],
                    options={
                        'db_table': '"gestion_documental"."documentos_metadatos"',
                        'constraints': [
                            models.UniqueConstraint(
                                fields=('documento', 'clave'),
                                name='uq_documentos_metadatos_documento_clave',
                            ),
                        ],
                    },
                ),
            ],
            state_operations=[
                migrations.DeleteModel(name='ArchivoDocumento'),
                migrations.DeleteModel(name='MetadatoDocumento'),
                migrations.DeleteModel(name='Documento'),
                migrations.CreateModel(
                    name='AreaCatalogo',
                    fields=[
                        ('id', models.UUIDField(primary_key=True, serialize=False)),
                        ('organizacion_id', models.UUIDField()),
                        ('area_padre_id', models.UUIDField(blank=True, null=True)),
                        ('codigo', models.CharField(max_length=32)),
                        ('nombre', models.CharField(max_length=120)),
                        ('descripcion', models.TextField(blank=True, null=True)),
                        ('activa', models.BooleanField(default=True)),
                        ('creada_en', models.DateTimeField()),
                        ('actualizada_en', models.DateTimeField()),
                    ],
                    options={
                        'db_table': '"gestion_documental"."areas"',
                        'managed': False,
                    },
                ),
                migrations.CreateModel(
                    name='EstadoVersionCatalogo',
                    fields=[
                        ('id', models.SmallIntegerField(primary_key=True, serialize=False)),
                        ('codigo', models.CharField(max_length=32)),
                        ('nombre', models.CharField(max_length=100)),
                        ('es_final', models.BooleanField(default=False)),
                        ('permite_edicion', models.BooleanField(default=False)),
                    ],
                    options={
                        'db_table': '"gestion_documental"."estados_version"',
                        'managed': False,
                    },
                ),
                migrations.CreateModel(
                    name='ProveedorAlmacenamiento',
                    fields=[
                        ('id', models.UUIDField(primary_key=True, serialize=False)),
                        ('organizacion_id', models.UUIDField()),
                        ('codigo', models.CharField(max_length=50)),
                        ('nombre', models.CharField(max_length=120)),
                        ('tipo', models.CharField(max_length=30)),
                        ('contenedor', models.CharField(max_length=255)),
                        ('region', models.CharField(blank=True, max_length=100, null=True)),
                        ('url_base', models.TextField(blank=True, null=True)),
                        ('activo', models.BooleanField(default=True)),
                        ('creado_en', models.DateTimeField()),
                    ],
                    options={
                        'db_table': '"gestion_documental"."proveedores_almacenamiento"',
                        'managed': False,
                    },
                ),
                migrations.CreateModel(
                    name='TipoDocumentoCatalogo',
                    fields=[
                        ('id', models.SmallIntegerField(primary_key=True, serialize=False)),
                        ('codigo', models.CharField(max_length=32)),
                        ('nombre', models.CharField(max_length=100)),
                        ('descripcion', models.TextField(blank=True, null=True)),
                        ('activo', models.BooleanField(default=True)),
                    ],
                    options={
                        'db_table': '"gestion_documental"."tipos_documento"',
                        'managed': False,
                    },
                ),
                migrations.CreateModel(
                    name='Documento',
                    fields=[
                        ('id', models.UUIDField(primary_key=True, serialize=False)),
                        ('organizacion_id', models.UUIDField()),
                        ('codigo', models.CharField(max_length=64)),
                        ('nombre', models.CharField(max_length=200)),
                        ('descripcion', models.TextField(blank=True, null=True)),
                        ('fecha_documento', models.DateField(blank=True, null=True)),
                        ('creado_en', models.DateTimeField()),
                        ('actualizado_en', models.DateTimeField()),
                        ('eliminado_en', models.DateTimeField(blank=True, null=True)),
                        ('motivo_eliminacion', models.TextField(blank=True, null=True)),
                        ('area', models.ForeignKey(
                            db_column='area_id',
                            on_delete=django.db.models.deletion.PROTECT,
                            related_name='documentos_documentales',
                            to='documentos.areacatalogo',
                        )),
                        ('creado_por', models.ForeignKey(
                            db_column='creado_por_id',
                            on_delete=django.db.models.deletion.PROTECT,
                            related_name='documentos_creados',
                            to='documentos.usuariodocumental',
                        )),
                        ('eliminado_por', models.ForeignKey(
                            blank=True,
                            db_column='eliminado_por_id',
                            null=True,
                            on_delete=django.db.models.deletion.PROTECT,
                            related_name='documentos_eliminados',
                            to='documentos.usuariodocumental',
                        )),
                        ('tipo_documento', models.ForeignKey(
                            db_column='tipo_documento_id',
                            on_delete=django.db.models.deletion.PROTECT,
                            related_name='documentos_documentales',
                            to='documentos.tipodocumentocatalogo',
                        )),
                    ],
                    options={
                        'db_table': '"gestion_documental"."documentos"',
                        'managed': False,
                        'ordering': ['-actualizado_en', 'codigo'],
                    },
                ),
                migrations.CreateModel(
                    name='MetadatoDocumento',
                    fields=[
                        ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                        ('clave', models.CharField(max_length=100)),
                        ('valor', models.TextField(blank=True)),
                        ('creado_en', models.DateTimeField(auto_now_add=True)),
                        ('actualizado_en', models.DateTimeField(auto_now=True)),
                        ('documento', models.ForeignKey(
                            db_column='documento_id',
                            on_delete=django.db.models.deletion.CASCADE,
                            related_name='metadatos',
                            to='documentos.documento',
                        )),
                    ],
                    options={
                        'db_table': '"gestion_documental"."documentos_metadatos"',
                        'ordering': ['clave'],
                        'constraints': [
                            models.UniqueConstraint(
                                fields=('documento', 'clave'),
                                name='uq_documentos_metadatos_documento_clave',
                            ),
                        ],
                    },
                ),
                migrations.CreateModel(
                    name='ArchivoDocumento',
                    fields=[
                        ('id', models.UUIDField(primary_key=True, serialize=False)),
                        ('numero_mayor', models.IntegerField()),
                        ('numero_menor', models.IntegerField(default=0)),
                        ('orden_version', models.IntegerField()),
                        ('es_vigente', models.BooleanField(default=False)),
                        ('nombre_archivo_original', models.CharField(max_length=255)),
                        ('clave_almacenamiento', models.TextField()),
                        ('tipo_mime', models.CharField(max_length=150)),
                        ('tamano_bytes', models.BigIntegerField()),
                        ('sha256', models.CharField(max_length=64)),
                        ('comentario_cambio', models.TextField()),
                        ('creada_en', models.DateTimeField()),
                        ('creada_por', models.ForeignKey(
                            db_column='creada_por_id',
                            on_delete=django.db.models.deletion.PROTECT,
                            related_name='versiones_creadas',
                            to='documentos.usuariodocumental',
                        )),
                        ('documento', models.ForeignKey(
                            db_column='documento_id',
                            on_delete=django.db.models.deletion.CASCADE,
                            related_name='archivos',
                            to='documentos.documento',
                        )),
                        ('estado_version', models.ForeignKey(
                            db_column='estado_version_id',
                            on_delete=django.db.models.deletion.PROTECT,
                            related_name='versiones_documentales',
                            to='documentos.estadoversioncatalogo',
                        )),
                        ('proveedor_almacenamiento', models.ForeignKey(
                            db_column='proveedor_almacenamiento_id',
                            on_delete=django.db.models.deletion.PROTECT,
                            related_name='versiones_documentales',
                            to='documentos.proveedoralmacenamiento',
                        )),
                    ],
                    options={
                        'db_table': '"gestion_documental"."versiones_documento"',
                        'managed': False,
                        'ordering': ['-orden_version'],
                    },
                ),
            ],
        ),
    ]
