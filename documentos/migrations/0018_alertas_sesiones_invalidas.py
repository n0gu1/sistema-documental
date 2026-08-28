from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('documentos', '0017_auditoria_operaciones'),
    ]

    operations = [
        migrations.RunSQL(
            sql='''
                INSERT INTO gestion_documental.acciones_auditoria (codigo, nombre)
                SELECT seed.codigo_texto, seed.nombre
                FROM (VALUES
                    ('SESION_INVALIDA', 'Sesion invalida')
                ) AS seed(codigo_texto, nombre)
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM gestion_documental.acciones_auditoria existing
                    WHERE existing.codigo = seed.codigo_texto
                );
            ''',
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
