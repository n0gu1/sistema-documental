from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('documentos', '0015_linea_tiempo_documental'),
    ]

    operations = [
        migrations.RunSQL(
            sql='''
                INSERT INTO gestion_documental.acciones_auditoria (codigo, nombre)
                SELECT 'VERSION_RESTAURADA', 'Version restaurada'
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM gestion_documental.acciones_auditoria
                    WHERE codigo = 'VERSION_RESTAURADA'
                );
            ''',
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
