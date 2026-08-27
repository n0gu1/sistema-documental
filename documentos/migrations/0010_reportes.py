import uuid

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('documentos', '0009_catalogos_auditoria'),
    ]

    operations = [
        migrations.CreateModel(
            name='ReporteGenerado',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('organizacion_id', models.UUIDField()),
                ('generado_por_id', models.UUIDField()),
                ('alcance', models.CharField(max_length=20)),
                ('formato', models.CharField(max_length=10)),
                ('nombre', models.CharField(max_length=200)),
                ('filtros', models.JSONField(default=dict)),
                ('filas', models.PositiveIntegerField(default=0)),
                ('creado_en', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'db_table': '"gestion_documental"."reportes_generados"',
                'ordering': ['-creado_en'],
                'indexes': [models.Index(fields=['organizacion_id', '-creado_en'], name='ix_reportes_org_fecha')],
            },
        ),
        migrations.CreateModel(
            name='ProgramacionReporte',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('organizacion_id', models.UUIDField()),
                ('creado_por_id', models.UUIDField()),
                ('nombre', models.CharField(max_length=200)),
                ('alcance', models.CharField(max_length=20)),
                ('formato', models.CharField(max_length=10)),
                ('frecuencia', models.CharField(max_length=10)),
                ('filtros', models.JSONField(default=dict)),
                ('proxima_ejecucion_en', models.DateTimeField()),
                ('activa', models.BooleanField(default=True)),
                ('creada_en', models.DateTimeField(auto_now_add=True)),
                ('actualizada_en', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': '"gestion_documental"."programaciones_reportes"',
                'ordering': ['proxima_ejecucion_en'],
                'indexes': [models.Index(fields=['organizacion_id', 'activa', 'proxima_ejecucion_en'], name='ix_prog_reportes_ejecucion')],
            },
        ),
    ]
