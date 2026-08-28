from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('documentos', '0016_restauracion_version_documental'),
    ]

    operations = [
        migrations.RunSQL(
            sql='''
                INSERT INTO gestion_documental.acciones_auditoria (codigo, nombre)
                SELECT seed.codigo_texto, seed.nombre
                FROM (VALUES
                    ('ACCESO_DENEGADO', 'Acceso denegado'),
                    ('CHECKLIST_MODIFICADO', 'Checklist modificado'),
                    ('OBSERVACION_RESUELTA', 'Observacion resuelta'),
                    ('REPORTE_CONSULTADO', 'Reporte consultado'),
                    ('REPORTE_GENERADO', 'Reporte generado'),
                    ('REPORTE_DESCARGADO', 'Reporte descargado'),
                    ('REPORTE_PROGRAMADO', 'Reporte programado'),
                    ('REPORTE_PROGRAMACION_MODIFICADA', 'Programacion de reporte modificada'),
                    ('REPORTE_PROGRAMACION_CANCELADA', 'Programacion de reporte cancelada'),
                    ('RESPALDO_CONSULTADO', 'Respaldo consultado'),
                    ('RESPALDO_CREADO', 'Respaldo creado'),
                    ('RESPALDO_FALLIDO', 'Respaldo fallido'),
                    ('RESPALDO_DESCARGADO', 'Respaldo descargado'),
                    ('RESPALDO_RESTAURADO', 'Respaldo restaurado'),
                    ('RESPALDO_VERIFICADO', 'Respaldo verificado'),
                    ('CONFIGURACION_CONSULTADA', 'Configuracion consultada'),
                    ('CONFIGURACION_MODIFICADA', 'Configuracion modificada'),
                    ('CONFIGURACION_PROBADA', 'Configuracion probada')
                ) AS seed(codigo_texto, nombre)
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM gestion_documental.acciones_auditoria existing
                    WHERE existing.codigo = seed.codigo_texto
                );

                INSERT INTO gestion_documental.tipos_recurso_auditoria (codigo, nombre)
                SELECT seed.codigo_texto, seed.nombre
                FROM (VALUES
                    ('REVISION', 'Revision'),
                    ('REPORTE', 'Reporte'),
                    ('RESPALDO', 'Respaldo'),
                    ('CONFIGURACION', 'Configuracion')
                ) AS seed(codigo_texto, nombre)
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM gestion_documental.tipos_recurso_auditoria existing
                    WHERE existing.codigo = seed.codigo_texto
                );
            ''',
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
