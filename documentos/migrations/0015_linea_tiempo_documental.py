from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('documentos', '0014_documento_exportado'),
    ]

    operations = [
        migrations.RunSQL(
            sql='''
                INSERT INTO gestion_documental.acciones_auditoria (codigo, nombre)
                SELECT 'DOCUMENTO_RESTAURADO', 'Documento restaurado'
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM gestion_documental.acciones_auditoria
                    WHERE codigo = 'DOCUMENTO_RESTAURADO'
                );
            ''',
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
