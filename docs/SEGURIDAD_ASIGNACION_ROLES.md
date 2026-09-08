# Seguridad de asignación de roles — requisitos 4 y 11

Fecha: 7 de septiembre de 2026. Corrección local, pendiente de despliegue en Render.

## Hallazgo

La creación de usuarios y la reasignación exigían `usuarios.gestionar` y validaban
organización, existencia y estado activo de los roles. Sin embargo, ese permiso
bastaba para otorgar cualquier rol válido, incluido ADMINISTRADOR. Este último
tiene autoridad completa por el tratamiento especial de `user_has_permission`.

Las cuentas Editor, Revisor y Lector de prueba actualmente no poseen
`usuarios.gestionar`; el riesgo afecta a un gestor no administrador al que se
delegue ese permiso.

## Regla implementada en backend

- Solo una cuenta activa con una asignación vigente al rol activo ADMINISTRADOR
  de su misma organización puede otorgar ADMINISTRADOR.
- Un gestor no administrador necesita `usuarios.gestionar` y únicamente puede
  asignar roles cuyo conjunto de permisos activos esté contenido en sus permisos
  actuales, obtenidos de roles activos y asignaciones vigentes de su organización.
- Ese gestor tampoco puede reemplazar o quitar roles de un Administrador ni de
  un usuario cuyos roles actuales excedan su autoridad.
- Se comparan permisos, no nombres ni un orden artificial Editor/Revisor/Lector.
- La comprobación se aplica en POST de creación y PUT de reasignación, antes de
  escribir usuarios o asignaciones. Las denegaciones devuelven 403 con código
  `ROLE_ASSIGNMENT_FORBIDDEN` y registran acceso denegado.
- Se conservan las validaciones previas de contexto, UUID, existencia y estado.

Implementación: `require_role_assignment_authority` en
`documentos/management_views.py`, invocada desde ambas vistas.

## Verificación

30 pruebas aprobadas mediante DRF APIRequestFactory, backend local y BD Neon,
sin mocks de permisos, consultas ni asignaciones. Se utilizaron roles, concesiones
y usuarios de ensayo dentro de una transacción revertida al finalizar. No quedaron
cuentas ni concesiones de ensayo persistidas; no se editaron permisos del catálogo.

Se verificó:

- Administrador crea Editor, Revisor, Lector y Administrador; reasigna correctamente.
- Gestor limitado crea/asigna Lector, que está dentro de su autoridad.
- Gestor limitado no crea/asigna Administrador, Editor o Revisor fuera de su autoridad.
- Autoelevación y lista mixta Lector + Administrador: rechazadas.
- Degradar Administrador o vaciar los roles de un usuario superior: rechazado.
- Editor, Revisor y Lector sin gestión: intentos de creación/reasignación rechazados.
- UUID inexistente y rol inactivo: 400, incluso con Administrador.
- Una asignación ADMINISTRADOR vencida no conserva la excepción administrativa.
- Cada rechazo conserva íntegramente las asignaciones anteriores; cada alta
  prohibida deja el usuario sin crear. Los éxitos se comprueban contra la BD.

La transacción externa de ensayo fija CURRENT_TIMESTAMP en PostgreSQL; por ello
el script verifica la vigencia de las asignaciones con la hora de cada comprobación.
No se ejecutó una prueba de navegador ni se desplegó en Render.

Evidencia: `resultado_seguridad_roles.json`.
Script reproducible: `verificar_seguridad_roles.py` (requiere dependencias y BD
del proyecto). Sintaxis Python y `git diff --check` correctos.

Alcance: solo autorización de creación/reasignación de roles. Documentos, ACL,
flujo documental y edición del catálogo de permisos permanecen sin cambios.
