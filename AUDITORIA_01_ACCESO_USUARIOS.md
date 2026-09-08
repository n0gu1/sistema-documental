# Auditoría 01 — Acceso, usuarios, roles y permisos

Fecha: 2026-09-06, America/Guatemala (consultas HTTP del 2026-09-07 UTC). Referencia: `AUDITORIA_MAPA_SISTEMA.md`. Revisión selectiva de los archivos de este ámbito; no se volvió a mapear el repositorio. No se modificó código ni se escribieron datos en Neon.

## Alcance y criterio

Se contrastaron componentes React, cliente HTTP, rutas Django/DRF, controladores, serializadores, autenticación, modelos y esquema/datos reales mediante MCP Neon. Se hicieron pruebas HTTP contra `https://sistema-documental-nw05.onrender.com`. No se inspeccionaron Reportes ni Respaldos; Documentos se revisó en el informe 02 y aquí solo se cita cuando demuestra una falla de permisos.

Estados: **✅ IMPLEMENTADO** = cadena frontend/backend/persistencia presente y sin defecto identificado para ese requisito; no equivale por sí solo a prueba interactiva exitosa. **PARCIAL** = falta una parte del flujo. **❌ NO IMPLEMENTADO** = no se encontró soporte para el requisito concreto. **CON ERROR** = defecto verificable en código/contrato/datos. **⚪ NO COMPROBABLE** = falta evidencia de ejecución o acceso necesario. La columna Evidencia distingue código, DB y HTTP.

Se solicitaron credenciales de prueba para los cuatro roles. No se proporcionaron durante esta revisión. No se extrajeron hashes de contraseñas/tokens, no se restablecieron contraseñas ni se fabricaron sesiones. Por tanto, las pruebas autenticadas, cambios de usuarios y ataques con sesiones reales quedan pendientes. Consultar usuarios mediante Neon no inicia sesión en Render. Tampoco se verificó la identidad del commit desplegado ni que Render use exactamente esta rama Neon. Hay cambios locales preexistentes en `backend/settings.py` y `requirements.txt`, que se conservaron.

## Base de datos comprobada

MCP Neon: proyecto `sistema-documental` / `red-sunset-06347686`, rama `main` / `br-frosty-dream-aub7kye4`, esquema `gestion_documental`. Consultas SELECT a `information_schema.columns`, `pg_constraint`, `pg_indexes` y tablas del ámbito.

| Rol activo | Usuarios encontrados con asignación vigente | Permisos relevantes efectivos por catálogo |
|---|---|---|
| ADMINISTRADOR | `juan.perez`, `prueba.admin` | Gestión/consulta de usuarios y gestión de roles; el backend además concede acceso general por código de rol. |
| EDITOR | `pedro.enriquez`, `prueba.editor` | Consulta, búsqueda, creación, modificación y descarga documental; sin gestión de usuarios/roles. |
| REVISOR | `luis.lopez`, `prueba.revisor` | Consulta, búsqueda y descarga documental; revisión; sin gestión de usuarios/roles. |
| LECTOR | `maria.lopez`, `prueba.lector` | Consulta, búsqueda, descarga y consulta de versiones; sin gestión de usuarios/roles. |

Las ocho cuentas están activas y sin cambio de contraseña pendiente. Las cuatro cuentas `prueba.*` tienen `area_id = NULL`: según `reader_access.py`, eso permite alcance global de áreas dentro de la organización cuando existe permiso global. No representan pruebas de aislamiento por área. Hay 21 permisos; **no existe `documentos.gestionar`**. Se encontraron 82 sesiones, todas expiradas, 72 revocadas. No hay usuarios deshabilitados. Las tablas usuario–rol y rol–permiso tienen claves compuestas y referencias foráneas; `usuarios` tiene unicidad por organización/usuario y organización/correo.

## Requisitos

| # | Función | Estado | Evidencia | Problema | Qué falta |
|---|---|---|---|---|---|
| 1 | Iniciar sesión | ✅ IMPLEMENTADO | `frontend/src/Login.jsx:190` llama POST `/api/auth/login/`; `documentos/views.py:LoginView` valida credenciales y crea `SesionDocumental`; `models.py:12,50`; Neon contiene usuarios y sesiones. | Login exitoso no ejecutado en esta revisión. | Validar con contraseña de prueba de cada rol y comprobar cookie/respuesta. |
| 2 | Cerrar sesión | ✅ IMPLEMENTADO | `Login.jsx:234` espera POST `/api/auth/logout/` antes de limpiar estado; `views.py:LogoutView` revoca sesión y elimina cookie; tabla `sesiones.revocada_en`. | No se hizo logout con sesión válida ni replay posterior. | Probar revocación efectiva y rechazo del mismo token después del cierre. |
| 3 | Validar credenciales | ✅ IMPLEMENTADO | `LoginSerializer`; `LoginView`: `check_password`, cuenta activa, bloqueo, respuesta genérica 401, hash ficticio si no hay coincidencia única y límite de intentos. POST sin CSRF/referente en Render dio 403. | No se probó contraseña errónea con CSRF válido; el 403 no demuestra validación de contraseña. La identidad se busca globalmente aunque DB permite duplicados entre organizaciones. | Prueba positiva/negativa; resolver selección de organización si se admiten identidades repetidas entre organizaciones. |
| 4 | Controlar acceso por rol/permisos | CON ERROR | `permissions.py`; `auth_utils.py:get_user_roles/get_user_permission_codes/user_has_permission`; `management_views.py:require_permission`; Neon confirma roles. | Existe seguridad real en backend, pero controles granulares documentales no corresponden al catálogo y hay posibilidades de escalamiento por delegación (S2). | Alinear permisos de cada operación y limitar concesión de privilegios superiores. |
| 5 | Controlar sesión | PARCIAL | `authentication.py:CookieTokenAuthentication` comprueba hash, revocación, expiración, actividad, cuenta activa y CSRF; `Login.jsx:182` consulta `/me/`; `api.js:8` usa cookies. Token ficticio dio 401. | `api.js` convierte 401 en Error genérico; no hay invalidación central del usuario/panel al expirar. `UserDetailView.patch(active=false)` no revoca todas las sesiones (S3). | Manejo global de 401 y revocación uniforme en toda deshabilitación. |
| 6 | Crear usuarios | CON ERROR | `UsersView.jsx:102` → POST `/api/admin/users/` → `UserListCreateView.post` → `UserCreateSerializer` → `UsuarioDocumental` y `assign_roles`; Neon confirma columnas/FK. | El formulario manda `roles[0].id`, sin elección. `RolDocumental.Meta.ordering=['codigo']` y los cuatro roles actuales colocan ADMINISTRADOR primero. Usuarios nuevos reciben ese rol cuando carga el catálogo. | Selector explícito y mínimo privilegio por defecto; validar creación sin asignación accidental de Administrador. |
| 7 | Consultar usuarios | ✅ IMPLEMENTADO | `UsersView.jsx:64` → GET `/api/admin/users/`; `management_views.py:307` filtra organización, búsqueda/estado y pagina; `usuarios` existe. HTTP anónimo 401. | La pantalla carga un conjunto limitado; no ofrece navegación completa de páginas. No se ejecutó GET autenticado. | Validar respuesta con Administrador y denegación con los otros roles; paginación de UI para conjuntos grandes. |
| 8 | Modificar usuarios | PARCIAL | PATCH `/api/admin/users/<uuid>/` en `UserDetailView.patch`, serializador y UPDATE de usuario por organización. | `UsersView.jsx` no conecta un formulario de edición ni llama PATCH para correo/nombres/área; solo ofrece estado, clave y baja. | Implementar interfaz de edición que consuma el endpoint y validar persistencia. |
| 9 | Habilitar usuarios | ✅ IMPLEMENTADO | `UsersView.jsx:114` → POST `status/` → `UserStatusView:480`; actualiza `activo` y limpia `deshabilitado_en`, exige `usuarios.gestionar`. | No existen cuentas deshabilitadas en la muestra para prueba funcional. | Prueba con cuenta de ensayo y verificación de permisos antes/después. |
| 10 | Deshabilitar usuarios | CON ERROR | UI usa `status/`; `UserStatusView:497` y `UserDetailView.delete:469` revocan sesiones. `authentication.py` rechaza usuarios inactivos. | Ruta alternativa PATCH `active=false` actualiza estado pero no revoca todas las sesiones; una reactivación puede rehabilitar tokens no usados durante la baja. `status/` y PATCH también permiten auto-desactivación. | Unificar baja/revocación; impedir bloqueo accidental del último Administrador. |
| 11 | Asignar roles a usuarios | PARCIAL | PUT `/api/admin/users/<uuid>/roles/` → `UserRolesView:589` → `assign_roles` → `usuarios_roles`; comprobación de organización y rol activo. | No hay selector/flujo de cambio de roles en `UsersView`; creación asigna automáticamente el primer rol. El endpoint no limita asignación de ADMINISTRADOR al delegar `usuarios.gestionar`. | Conectar UI y separar permiso de asignar roles privilegiados. |
| 12 | Asignar permisos a usuarios | PARCIAL | `get_user_permission_codes` deriva permisos por `usuarios_roles` → `roles_permisos` → `permisos`; `RolesView.jsx:129` guarda permisos de rol. | Solo hay herencia vía rol, no asignación individual directa. Cambiar el rol afecta a todos sus miembros. | Si el requisito es individual, relación usuario–permiso, endpoints e interfaz; si es por herencia, completar asignación de roles en UI. |
| 13 | Crear roles | ✅ IMPLEMENTADO | `RolesView.jsx:71` → POST `/api/admin/roles/` → `RoleListCreateView:712` → `RoleCreateSerializer` → tabla `roles`. | Verifica duplicado de código pero no de nombre; DB tiene UNIQUE organización/nombre, por lo que nombre repetido puede producir IntegrityError no controlado. | Manejar duplicado de nombre como 400/409 y probar alta autenticada. |
| 14 | Modificar roles | PARCIAL | PATCH `/api/admin/roles/<uuid>/` → `RoleDetailView:758`, actualiza nombre/descripción/activo y exige `roles.gestionar`. | `RolesView` edita permisos, pero no tiene formulario ni petición PATCH para datos del rol. Roles inactivos quedan fuera del listado. | Conectar edición y consulta/reactivación de inactivos; validar unicidad de nombre. |
| 15 | Consultar roles | ✅ IMPLEMENTADO | `RolesView.jsx:41` → GET `/api/admin/roles/` → `RoleListCreateView:695` → `roles`, `usuarios_roles`, `roles_permisos`. HTTP anónimo 401. | Devuelve solamente roles activos; GET por ID no existe en `RoleDetailView`. | Validar listado autenticado y definir consulta de roles inactivos. |
| 16 | Asignar permisos a roles | ✅ IMPLEMENTADO | Matriz en `RolesView.jsx:129`; PUT `roles/<id>/permissions/` → `RolePermissionsView.put` → transacción DELETE/INSERT sobre `roles_permisos`; IDs activos validados. | ADMINISTRADOR sigue teniendo todos los privilegios aunque se retiren casillas, por el bypass de `user_has_permission`. Crear un código de permiso tampoco conecta automáticamente una función a ese código. | Explicar superusuario en la UI y probar que la revocación afecta a los roles ordinarios. |
| 17 | Restringir funciones según permisos | CON ERROR | `Login.jsx:264` elige panel por código de rol; backend usa helpers y permisos de DRF; respuestas anónimas 401. | UI se basa en roles fijos y no recibe la lista de permisos efectivos en `serialize_user`. En documentos se exigen permisos inexistentes y faltan verificaciones específicas de descarga/búsqueda. | Contrato de permisos efectivos para UI y controles específicos por endpoint. |
| 18 | Rechazar usuario deshabilitado con contraseña o sesión anterior | ⚪ NO COMPROBABLE | Código de `LoginView` y `CookieTokenAuthentication` comprueba `activo`; SELECT Neon: 0 usuarios inactivos. | No hubo cuenta/credenciales para ensayo; no se puede afirmar prueba en vivo. | Cuenta deshabilitada de ensayo, cookie previa y reactivación para reproducir S3. |
| 19 | Rechazar tokens inexistentes | ✅ IMPLEMENTADO | HTTP GET `/api/auth/me/` con cookie ficticia `sd_session`: 401, «La sesión no es válida». | No se encontró aceptación del token ficticio. | Nada para el caso comprobado. |
| 20 | Rechazar tokens expirados/revocados y expiración por inactividad | ⚪ NO COMPROBABLE | Comprobaciones en `authentication.py`; Neon: 82 expiradas, 72 revocadas. | Los hashes de DB no permiten reproducir sus tokens originales; no se probó replay de sesión real. | Credenciales de prueba y sesiones controladas con expiración/revocación. |

## Hallazgos de seguridad

**S1 — Alta: rol Administrador por defecto en creación de usuarios.** `UsersView.jsx:102` asigna el primer rol, y el modelo ordena por código (`models.py:289`). Con el catálogo actual, ese rol es ADMINISTRADOR. Es una inferencia determinista de UI + orden del backend + datos Neon; no se creó una cuenta para explotarlo. Si falla la carga del catálogo, se crea sin roles, otra conducta que la pantalla no permite elegir explícitamente.

**S2 — Alta, condicionada a delegación: escalamiento con `usuarios.gestionar`.** `UserRolesView.put:590` permite asignar cualquier rol activo de la organización, incluido ADMINISTRADOR, incluso al propio usuario. `UserListCreateView.post` permite además crear otra cuenta con ese rol y `UserResetPasswordView` restablece contraseñas de cualquier usuario de la organización. No exige privilegio adicional ni compara jerarquía/permisos del actor. Neon muestra que actualmente solo Administrador tiene ese permiso: **no se demostró escalamiento desde Editor/Revisor/Lector actuales**. Delegarlo a un rol limitado lo vuelve equivalente a administración completa.

**S3 — Media: deshabilitación inconsistente y rehabilitación de tokens.** `UserDetailView.patch:430` admite `active` y no revoca sesiones. Un token todavía vigente que no se use mientras la cuenta esté inactiva puede volver a autenticar cuando `active` cambie a true. Los endpoints `status/` y DELETE sí revocan. El bloqueo inmediato por `activo=false` existe; no se afirma que una cuenta actualmente inactiva pueda pasar ese control.

**S4 — Media: permisos globales editables entre organizaciones.** `PermissionDetailView.patch` busca permiso solo por ID; el catálogo `permisos` no tiene organización. Un actor con `roles.gestionar` puede activar/desactivar un permiso global que otras organizaciones usen. Riesgo por diseño multiorganización, no explotación demostrada ni evidencia de otra organización afectada. Los usuarios y roles sí se filtran por organización.

**S5 — Media: exposición adicional bajo permiso de consulta de usuarios.** `AdminDashboardView.get:230` solo exige `usuarios.consultar`, pero agrega documentos recientes, actividad y alertas sin exigir sus permisos específicos ni filtrar documentos por ACL. En los roles actuales ese permiso es de Administrador; si se delega consulta de usuarios, también se delega indirectamente esa información.

**S6 — Permisos no exclusivamente visuales, pero cobertura incompleta.** Los controles DRF y SQL son reales. No se encontró endpoint administrativo de este ámbito explícitamente público. Los defectos no se reducen a botones ocultos: ver informe 02 para escritura bloqueada al Editor y autorización granular de descarga/ACL. Las revocaciones de sesiones propias se permiten por propiedad; las ajenas exigen gestión de usuarios y organización, lo cual no es un bypass administrativo.

## Pruebas HTTP ejecutadas

| Solicitud sin autenticación, salvo indicación | Resultado observado |
|---|---|
| GET `/` | 200; entrada pública SPA. |
| GET `/admin/` | 302; no se interpretó como acceso administrativo autorizado. |
| GET `/api/auth/me/` | 401; faltan credenciales. |
| GET `/api/admin/users/` | 401. |
| GET `/api/admin/roles/` | 401. |
| GET `/api/admin/permissions/` | 401. |
| GET `/api/documents/`, `/api/documents/catalogs/`, `/api/reader/documents/` | 401 en las tres rutas. |
| GET `/api/auth/me/` con cookie ficticia | 401; sesión inválida. |
| POST `/api/auth/login/` con `{}`, sin CSRF ni referente | 403; verificación CSRF fallida. No alcanzó validación de credenciales. |

No se ejecutaron altas/bajas, cambios de roles/permisos ni pruebas de bloqueo masivo. Para cerrar la verificación en vivo faltan credenciales de `prueba.admin`, `prueba.editor`, `prueba.revisor` y `prueba.lector`, una cuenta de ensayo deshabilitada y confirmar el código/base usados por Render. Estos límites no invalidan los defectos de código y contrato descritos, pero impiden presentarlos como exploits HTTP reproducidos en producción.
