# Requisito 11: reasignación de roles

Verificado el 7 de septiembre de 2026, con frontend y backend locales conectados
a la base de datos Neon configurada. No se desplegó en Render.

En Administración de usuarios, seleccionar la fila del usuario abre su ficha.
La sección «Cambiar rol» muestra el rol actual y permite elegir un rol activo
y pulsar «Guardar rol». La selección reemplaza los roles anteriores.
La interfaz usa `PUT /api/admin/users/<id>/roles/` con `role_ids: [id]` y luego
consulta `GET /api/admin/users/<id>/` para actualizar la tabla y la ficha.
El formulario se reinicia al seleccionar otro usuario y bloquea envíos mientras guarda.

Se reutilizó el backend existente: exige `usuarios.gestionar`, busca al usuario
dentro de la organización del administrador y valida UUID, existencia, organización
y estado activo de los roles antes de asignarlos. Usuario fuera de contexto devuelve
404; rol inválido, inactivo o de otra organización devuelve 400. No fue necesario
modificarlo para esta corrección.

## Prueba ejecutada desde navegador

- Cuenta: `req11.editor.1788791057409@test.local`.
- ID: `c9fb4e31-1ac7-4387-a498-78bfc86240e8`.
- Creación seleccionando Editor: HTTP 201, rol EDITOR.
- Cambio a Revisor desde su ficha: HTTP 200.
- Consulta posterior: HTTP 200, lista exacta de roles `[REVISOR]`.
- Tabla y ficha: Revisor después de guardar y después de recargar.
- BD: EDITOR con `vigente_hasta=2026-09-07T14:24:30.528474Z`;
  REVISOR con `vigente_hasta=NULL`. Solo REVISOR vigente.

La cuenta de ensayo permanece en Neon. El script cierra la sesión de administrador
que abre para la prueba. La compilación del frontend pasó.

Evidencia: `resultado_reasignacion_roles.json` y `reasignacion_roles.png`.
Script: `verificar_reasignacion_roles.cjs`; requiere servidores locales en 8000/5173,
Playwright y las variables `PLAYWRIGHT_MODULE` y `ROLE_TEST_PASSWORD`.
Cada ejecución crea un usuario nuevo.

No se modificó el catálogo de permisos ni ACL. Los cambios previos del requisito 6
y otros cambios existentes en el directorio se conservaron.
