from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('documentos', '0013_configuracionsistema'),
    ]

    operations = [
        migrations.RunSQL(
            sql='''
                INSERT INTO gestion_documental.acciones_auditoria (codigo, nombre)
                SELECT 'DOCUMENTO_EXPORTADO', 'Documento exportado'
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM gestion_documental.acciones_auditoria
                    WHERE codigo = 'DOCUMENTO_EXPORTADO'
                );
            ''',
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
