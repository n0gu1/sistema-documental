# Requisito 31 — D8

Estado local: requiere aplicar la migración 0020_politica_acl al desplegar. No se ha publicado ni aplicado permanentemente en la BD remota.

Cada documento conserva un estado por permiso, separado de las concesiones a roles:

- HEREDAR: usa el permiso global y el alcance de área existente (incluida la excepción de autor y de usuario sin área).
- PERMITIR: lista explícita de roles autorizados. Lista vacía significa acceso bloqueado, aunque exista permiso global.
- DENEGAR: bloquea el permiso para todos los roles ordinarios.

Se conserva la excepción de ADMINISTRADOR. Las concesiones explícitas siguen prevaleciendo sobre el área. No se cambiaron los endpoints de búsqueda ni descarga; utilizan la decisión compartida de acceso donde ya la invocaban.

Sin política ni concesiones previas se hereda. La migración preserva las concesiones existentes como PERMITIR. Eliminar concesiones conserva PERMITIR vacío; para restaurar herencia hay que enviar HEREDAR explícitamente. DENEGAR y HEREDAR no aceptan simultáneamente concesiones. El guardado mantiene validaciones, bloqueo del documento y transacción para políticas y concesiones. La API acepta policies: [{permission_id, mode}] junto con assignments; omitir policies conserva estados previos salvo permisos a los que se conceden roles, que pasan a PERMITIR.

## Evidencia

Backend local contra la BD configurada, migración y datos dentro de una transacción revertida. PUT y GET comprobaron igualdad tras cada guardado; no demuestra un despliegue en Render. Usuario Editor con permiso global de consulta, distinto del creador; área asignada en el objeto de prueba sin modificar su cuenta.

| Caso | Esperado | Obtenido |
| --- | --- | --- |
| Sin ACL, permiso global y misma área | Permitir | Permitir |
| PERMITIR, rol incluido | Permitir | Permitir |
| DENEGAR, aunque tenga permiso global | Denegar | Denegar |
| Eliminar concesiones sin pedir HEREDAR | Denegar | Denegar |
| Elegir HEREDAR expresamente | Permitir | Permitir |
| HEREDAR, otra área | Denegar | Denegar |
| HEREDAR, área permitida | Permitir | Permitir |
| PERMITIR, rol incluido de otra área | Permitir | Permitir |
| DENEGAR, otra área | Denegar | Denegar |

Excepción de Administrador comprobada. Nueve pruebas DocumentPermissionsTests/ReaderAccessTests aprobadas; build frontend aprobado. Script reproducible: verificar_semantica_acl.py. Resultados: resultado_semantica_acl.json.
