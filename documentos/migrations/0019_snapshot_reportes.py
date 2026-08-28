from django.db import migrations, models


REPORT_SNAPSHOT_COLUMNS_SQL = '''
ALTER TABLE gestion_documental.reportes_generados_v2
    ADD COLUMN IF NOT EXISTS clave_almacenamiento text;
ALTER TABLE gestion_documental.reportes_generados_v2
    ADD COLUMN IF NOT EXISTS tamano_bytes bigint;
ALTER TABLE gestion_documental.reportes_generados_v2
    ADD COLUMN IF NOT EXISTS sha256 varchar(64);
'''


class Migration(migrations.Migration):
    dependencies = [
        ('documentos', '0018_alertas_sesiones_invalidas'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    REPORT_SNAPSHOT_COLUMNS_SQL,
                    reverse_sql=migrations.RunSQL.noop,
                ),
            ],
            state_operations=[
                migrations.AddField(
                    model_name='reportegenerado',
                    name='clave_almacenamiento',
                    field=models.TextField(blank=True, null=True),
                ),
                migrations.AddField(
                    model_name='reportegenerado',
                    name='tamano_bytes',
                    field=models.BigIntegerField(blank=True, null=True),
                ),
                migrations.AddField(
                    model_name='reportegenerado',
                    name='sha256',
                    field=models.CharField(blank=True, max_length=64, null=True),
                ),
            ],
        ),
    ]
