from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('documentos', '0008_notificaciones'),
    ]

    operations = [
        migrations.RunSQL(
            sql='''
                INSERT INTO gestion_documental.acciones_auditoria (id, codigo, nombre, descripcion, activo)
                SELECT codigo::uuid, codigo_texto, nombre, descripcion, TRUE
                FROM (VALUES
                    ('8d0e7c1d-5cc2-4b98-8d85-9a0e2f1a0001', 'ROL_MODIFICADO', 'Rol modificado', 'Cambio realizado sobre un rol documental'),
                    ('8d0e7c1d-5cc2-4b98-8d85-9a0e2f1a0002', 'PERMISO_MODIFICADO', 'Permiso modificado', 'Cambio realizado sobre permisos de un rol'),
                    ('8d0e7c1d-5cc2-4b98-8d85-9a0e2f1a0003', 'SESION_REVOCADA', 'Sesion revocada', 'Sesion revocada por un usuario autorizado'),
                    ('8d0e7c1d-5cc2-4b98-8d85-9a0e2f1a0004', 'REVISION_ASIGNADA', 'Revision asignada', 'Revision asignada a un revisor'),
                    ('8d0e7c1d-5cc2-4b98-8d85-9a0e2f1a0005', 'REVISION_COMENTADA', 'Revision comentada', 'Comentario agregado a una revision'),
                    ('8d0e7c1d-5cc2-4b98-8d85-9a0e2f1a0006', 'REVISION_DEVUELTA', 'Revision devuelta', 'Revision devuelta con observaciones'),
                    ('8d0e7c1d-5cc2-4b98-8d85-9a0e2f1a0007', 'DOCUMENTO_PUBLICADO', 'Documento publicado', 'Version documental publicada'),
                    ('8d0e7c1d-5cc2-4b98-8d85-9a0e2f1a0008', 'DOCUMENTO_CONSULTADO', 'Documento consultado', 'Documento consultado por un usuario'),
                    ('8d0e7c1d-5cc2-4b98-8d85-9a0e2f1a0009', 'LECTURA_REGISTRADA', 'Lectura registrada', 'Lectura documental registrada'),
                    ('8d0e7c1d-5cc2-4b98-8d85-9a0e2f1a0010', 'BITACORA_EXPORTADA', 'Bitacora exportada', 'Bitacora exportada por un administrador')
                ) AS seed(codigo, codigo_texto, nombre, descripcion)
                WHERE NOT EXISTS (
                    SELECT 1 FROM gestion_documental.acciones_auditoria existing
                    WHERE existing.codigo = seed.codigo_texto
                );

                INSERT INTO gestion_documental.tipos_recurso_auditoria (id, codigo, nombre, descripcion, activo)
                SELECT codigo::uuid, codigo_texto, nombre, descripcion, TRUE
                FROM (VALUES
                    ('7f8e9d2c-3b4a-4c5d-8e6f-1a2b3c4d0001', 'ROL', 'Rol', 'Rol documental'),
                    ('7f8e9d2c-3b4a-4c5d-8e6f-1a2b3c4d0002', 'PERMISO', 'Permiso', 'Permiso documental'),
                    ('7f8e9d2c-3b4a-4c5d-8e6f-1a2b3c4d0003', 'BITACORA', 'Bitacora', 'Bitacora de auditoria')
                ) AS seed(codigo, codigo_texto, nombre, descripcion)
                WHERE NOT EXISTS (
                    SELECT 1 FROM gestion_documental.tipos_recurso_auditoria existing
                    WHERE existing.codigo = seed.codigo_texto
                );
            ''',
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
