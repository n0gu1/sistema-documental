# Requisitos 13 y 14

Se valida código y nombre duplicados por organización, incluyendo roles inactivos. PATCH comprueba el nombre excluyendo el propio rol. Las restricciones reales uq_roles_organizacion_codigo y uq_roles_organizacion_nombre también se capturan tras rollback del bloque de escritura, devolviendo 409 incluso si otro proceso inserta el duplicado entre validación y escritura. Otras excepciones de integridad no se ocultan.

Roles y permisos permite seleccionar un rol y pulsar «Editar rol seleccionado» para cambiar nombre, descripción y estado. El catálogo de esta pantalla solicita include_inactive=true para poder volver a editar/reactivar un rol inactivo. El listado por defecto conserva sólo los activos. No se modifican las asignaciones de permisos.

Prueba de navegador local y backend local contra BD real:

| Caso | Esperado | Obtenido |
| --- | --- | --- |
| Alta desde UI | 201 | 201 |
| Código duplicado | 409 | 409 |
| Nombre duplicado | 409 | 409 |
| Editar nombre/descripción/estado desde UI | 200 | 200 |
| Recargar y consultar valores persistidos | Coinciden | Coinciden |
| PATCH con nombre de otro rol | 409 | 409 |

Se dejó el rol de prueba inactivo y sin permisos. El rol del primer ensayo interrumpido también quedó inactivo. La primera prueba permitió corregir la etiqueta accesible de descripción. Evidencia: resultado_roles_edicion.json; script: verificar_roles_edicion.cjs. Build aprobado. Cambios locales pendientes de publicación; no requieren migración nueva.
