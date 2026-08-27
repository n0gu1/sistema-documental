import uuid

from django.db import migrations, models


REPORT_TABLES_SQL = '''
CREATE TABLE IF NOT EXISTS gestion_documental.reportes_generados (
    id uuid PRIMARY KEY,
    organizacion_id uuid NOT NULL,
    generado_por_id uuid NOT NULL,
    alcance varchar(20) NOT NULL,
    formato varchar(10) NOT NULL,
    nombre varchar(200) NOT NULL,
    filtros jsonb NOT NULL DEFAULT '{}'::jsonb,
    filas integer NOT NULL DEFAULT 0,
    creado_en timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_reportes_org_fecha
    ON gestion_documental.reportes_generados (organizacion_id, creado_en DESC);
CREATE TABLE IF NOT EXISTS gestion_documental.programaciones_reportes (
    id uuid PRIMARY KEY,
    organizacion_id uuid NOT NULL,
    creado_por_id uuid NOT NULL,
    nombre varchar(200) NOT NULL,
    alcance varchar(20) NOT NULL,
    formato varchar(10) NOT NULL,
    frecuencia varchar(10) NOT NULL,
    filtros jsonb NOT NULL DEFAULT '{}'::jsonb,
    proxima_ejecucion_en timestamptz NOT NULL,
    activa boolean NOT NULL DEFAULT TRUE,
    creada_en timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizada_en timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_prog_reportes_ejecucion
    ON gestion_documental.programaciones_reportes (organizacion_id, activa, proxima_ejecucion_en);
'''


REPORT_STATE = [
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


class Migration(migrations.Migration):
    dependencies = [
        ('documentos', '0009_catalogos_auditoria'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[migrations.RunSQL(REPORT_TABLES_SQL, reverse_sql=migrations.RunSQL.noop)],
            state_operations=REPORT_STATE,
        ),
    ]
