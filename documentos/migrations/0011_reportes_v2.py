from django.db import migrations


REPORT_TABLES_V2_SQL = '''
CREATE TABLE IF NOT EXISTS gestion_documental.reportes_generados_v2 (
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
CREATE INDEX IF NOT EXISTS ix_reportes_v2_org_fecha
    ON gestion_documental.reportes_generados_v2 (organizacion_id, creado_en DESC);
CREATE TABLE IF NOT EXISTS gestion_documental.programaciones_reportes_v2 (
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
CREATE INDEX IF NOT EXISTS ix_prog_reportes_v2_ejecucion
    ON gestion_documental.programaciones_reportes_v2 (organizacion_id, activa, proxima_ejecucion_en);
'''


class Migration(migrations.Migration):
    dependencies = [
        ('documentos', '0010_reportes'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[migrations.RunSQL(REPORT_TABLES_V2_SQL, reverse_sql=migrations.RunSQL.noop)],
            state_operations=[
                migrations.AlterModelTable(
                    name='reportegenerado',
                    table='"gestion_documental"."reportes_generados_v2"',
                ),
                migrations.AlterModelTable(
                    name='programacionreporte',
                    table='"gestion_documental"."programaciones_reportes_v2"',
                ),
            ],
        ),
    ]
