from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('documentos', '0008_notificaciones'),
    ]

    operations = [
        migrations.RunSQL(
            sql='''
                INSERT INTO gestion_documental.acciones_auditoria (codigo, nombre)
                SELECT codigo_texto, nombre
                FROM (VALUES
                    ('ROL_MODIFICADO', 'Rol modificado'),
                    ('PERMISO_MODIFICADO', 'Permiso modificado'),
                    ('SESION_REVOCADA', 'Sesion revocada'),
                    ('REVISION_ASIGNADA', 'Revision asignada'),
                    ('REVISION_COMENTADA', 'Revision comentada'),
                    ('REVISION_DEVUELTA', 'Revision devuelta'),
                    ('DOCUMENTO_PUBLICADO', 'Documento publicado'),
                    ('DOCUMENTO_CONSULTADO', 'Documento consultado'),
                    ('LECTURA_REGISTRADA', 'Lectura registrada'),
                    ('BITACORA_EXPORTADA', 'Bitacora exportada')
                ) AS seed(codigo_texto, nombre)
                WHERE NOT EXISTS (
                    SELECT 1 FROM gestion_documental.acciones_auditoria existing
                    WHERE existing.codigo = seed.codigo_texto
                );

                INSERT INTO gestion_documental.tipos_recurso_auditoria (codigo, nombre)
                SELECT codigo_texto, nombre
                FROM (VALUES
                    ('ROL', 'Rol'),
                    ('PERMISO', 'Permiso'),
                    ('BITACORA', 'Bitacora')
                ) AS seed(codigo_texto, nombre)
                WHERE NOT EXISTS (
                    SELECT 1 FROM gestion_documental.tipos_recurso_auditoria existing
                    WHERE existing.codigo = seed.codigo_texto
                );
            ''',
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
