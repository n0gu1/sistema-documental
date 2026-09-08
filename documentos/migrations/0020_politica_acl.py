from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [('documentos', '0019_snapshot_reportes')]
    operations = [migrations.RunSQL(
        sql="""
        CREATE TABLE gestion_documental.documentos_politicas_acl (
            documento_id uuid NOT NULL REFERENCES gestion_documental.documentos(id) ON DELETE CASCADE,
            permiso_id uuid NOT NULL REFERENCES gestion_documental.permisos(id),
            modo varchar(8) NOT NULL CHECK (modo IN ('HEREDAR', 'PERMITIR', 'DENEGAR')),
            PRIMARY KEY (documento_id, permiso_id)
        );
        INSERT INTO gestion_documental.documentos_politicas_acl (documento_id, permiso_id, modo)
        SELECT DISTINCT documento_id, permiso_id, 'PERMITIR'
        FROM gestion_documental.documentos_roles_permisos;
        """,
        reverse_sql='DROP TABLE gestion_documental.documentos_politicas_acl;',
    )]
