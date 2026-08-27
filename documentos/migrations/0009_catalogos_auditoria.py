from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('documentos', '0008_notificaciones'),
    ]

    operations = [
        migrations.RunSQL(
            sql='''
                INSERT INTO gestion_documental.acciones_auditoria (id, codigo, nombre)
                SELECT codigo::uuid, codigo_texto, nombre
                FROM (VALUES
                    ('8d0e7c1d-5cc2-4b98-8d85-9a0e2f1a0001', 'ROL_MODIFICADO', 'Rol modificado'),
                    ('8d0e7c1d-5cc2-4b98-8d85-9a0e2f1a0002', 'PERMISO_MODIFICADO', 'Permiso modificado'),
                    ('8d0e7c1d-5cc2-4b98-8d85-9a0e2f1a0003', 'SESION_REVOCADA', 'Sesion revocada'),
                    ('8d0e7c1d-5cc2-4b98-8d85-9a0e2f1a0004', 'REVISION_ASIGNADA', 'Revision asignada'),
                    ('8d0e7c1d-5cc2-4b98-8d85-9a0e2f1a0005', 'REVISION_COMENTADA', 'Revision comentada'),
                    ('8d0e7c1d-5cc2-4b98-8d85-9a0e2f1a0006', 'REVISION_DEVUELTA', 'Revision devuelta'),
                    ('8d0e7c1d-5cc2-4b98-8d85-9a0e2f1a0007', 'DOCUMENTO_PUBLICADO', 'Documento publicado'),
                    ('8d0e7c1d-5cc2-4b98-8d85-9a0e2f1a0008', 'DOCUMENTO_CONSULTADO', 'Documento consultado'),
                    ('8d0e7c1d-5cc2-4b98-8d85-9a0e2f1a0009', 'LECTURA_REGISTRADA', 'Lectura registrada'),
                    ('8d0e7c1d-5cc2-4b98-8d85-9a0e2f1a0010', 'BITACORA_EXPORTADA', 'Bitacora exportada')
                ) AS seed(codigo, codigo_texto, nombre)
                WHERE NOT EXISTS (
                    SELECT 1 FROM gestion_documental.acciones_auditoria existing
                    WHERE existing.codigo = seed.codigo_texto
                );

                INSERT INTO gestion_documental.tipos_recurso_auditoria (id, codigo, nombre)
                SELECT codigo::uuid, codigo_texto, nombre
                FROM (VALUES
                    ('7f8e9d2c-3b4a-4c5d-8e6f-1a2b3c4d0001', 'ROL', 'Rol'),
                    ('7f8e9d2c-3b4a-4c5d-8e6f-1a2b3c4d0002', 'PERMISO', 'Permiso'),
                    ('7f8e9d2c-3b4a-4c5d-8e6f-1a2b3c4d0003', 'BITACORA', 'Bitacora')
                ) AS seed(codigo, codigo_texto, nombre)
                WHERE NOT EXISTS (
                    SELECT 1 FROM gestion_documental.tipos_recurso_auditoria existing
                    WHERE existing.codigo = seed.codigo_texto
                );
            ''',
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
