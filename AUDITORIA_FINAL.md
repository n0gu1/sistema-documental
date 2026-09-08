# AUDITORIA_FINAL — Matriz consolidada de 65 requisitos

Fecha: 7 de septiembre de 2026.

**Seguimiento posterior, únicamente requisito #22 (8 de septiembre de 2026):** Dashboard conserva el ID seleccionado entre Ver, Editar e Historial. El historial ya no elige el primer documento; sin selección solicita elegir uno. Trece comprobaciones UI aprobadas con dos documentos distintos, incluyendo PATCH y consultas de detalle/versiones/timeline con el mismo ID, contra backend local conectado a Neon. Véase [resultado del requisito 22](docs/REQUISITO_22_RESULTADO.md). Pendiente desplegar a Render. Sin cambios en backend ni reglas de versiones; se conserva la matriz histórica.

**Seguimiento posterior, requisitos #20 y #21 (8 de septiembre de 2026):** fecha documental en su columna existente; clasificación y observaciones como metadatos de texto, con captura/consulta en UI y validación backend. Unicidad del código alineada con Neon, incluidos archivados, con respuesta 409 también ante la restricción real de PostgreSQL. Pruebas locales contra Neon y evidencia en [resultado de requisitos 20–21](docs/REQUISITOS_20_21_RESULTADO.md). Pendiente desplegar a Render. Sin cambios en modelos, migraciones ni lógica de versiones. La matriz original se conserva como evidencia previa.

**Seguimiento posterior, requisito #19:** selector de archivo inicial añadido al Editor y validaciones de extensión/MIME/contenido/tamaño comprobadas contra Render. La carga válida falla por S3 `HeadObject: 403 Forbidden`, confirmado en logs de Render; MCP de Neon confirma que no quedaron registros parciales. Persistencia y comparación de bytes descargados pendientes de resolver el acceso S3. Véase [resultado del requisito 19](docs/REQUISITO_19_RESULTADO.md). Sin cambios en creación de nuevas versiones.

**Seguimiento posterior, únicamente requisito #18:** alta del Editor corregida y probada desde UI local con backend conectado a Neon. Administrador/Editor: HTTP 201 y registros confirmados mediante MCP de Neon; Revisor/Lector: HTTP 403. Sin versiones. Pendiente desplegar el formulario en Render. Véase [resultado del requisito 18](docs/REQUISITO_18_RESULTADO.md). La matriz original se conserva como evidencia de la auditoría previa.

**ESTADO GENERAL: E) FLUJO PRINCIPAL INCOMPLETO.**

**¿Está listo para mostrar TODO el sistema de principio a fin en una exposición? NO.** Se pueden mostrar funciones individuales verificadas, pero no el recorrido íntegro solicitado. El primer incumplimiento por UI es crear un Editor con el rol equivocado; usando cuentas correctas, la escritura documental del Editor queda bloqueada. Aprobación/publicación, restauración, reportes y respaldos añaden obstáculos independientes.

## Fuente, alcance y normalización

Este documento sustituye el consolidado anterior del 5 de septiembre. Usa exclusivamente como evidencia funcional los siete informes solicitados:

| Referencia | Informe |
|---|---|
| A01 | [Acceso, usuarios y permisos](AUDITORIA_01_ACCESO_USUARIOS.md) |
| A02 | [Documentos](AUDITORIA_02_DOCUMENTOS.md) |
| A03 | [Versiones](AUDITORIA_03_VERSIONES.md) |
| A04 | [Revisión](AUDITORIA_04_REVISION.md) |
| A05 | [Bitácora](AUDITORIA_05_BITACORA.md) |
| A06 | [Reportes y respaldos](AUDITORIA_06_REPORTES_RESPALDOS.md) |
| A07 | [Flujo completo](AUDITORIA_07_FLUJO_COMPLETO.md) |

No se volvió a analizar el repositorio, no se consultó código fuente en esta consolidación, no se repitieron pruebas HTTP/SQL y no se implementaron correcciones. Las referencias a código dentro de la matriz proceden de esos informes.

Los informes contienen requisitos, subcampos, controles negativos, casos de prueba y hallazgos adicionales con numeraciones propias; no constituyen por sí solos una lista única numerada 1–65. Esta matriz establece una **numeración consolidada de 65 requisitos funcionales**, sin contar varias veces un requisito por cada fallo o prueba. No se presenta como transcripción de un pliego original de 65 ítems que no fue aportado como lista independiente.

| Bloque | Numeración | Cantidad | Regla de consolidación |
|---|---|---:|---|
| Acceso, usuarios, roles y permisos | 1–17 | 17 | A01 requisitos 1–17; pruebas negativas se incorporan como evidencia/límites. |
| Gestión y búsqueda documental | 18–32 | 15 | A02 requisitos 1–8 y 19–25. Campos documentales se agrupan en identificación (#21); vigente se evalúa en Versiones. |
| Versiones | 33–42 | 10 | A03 requisitos 1–10; integridad/concurrencia se reflejan en problemas y tareas pendientes. |
| Revisión | 43–49 | 7 | A04 requisitos 1–7; controles de decisión se incorporan sin duplicarlos como funciones. |
| Bitácora | 50–57 | 8 | A05 ocho funciones principales; los eventos concretos son cobertura de esas funciones. |
| Reportes | 58–62 | 5 | A06 cinco clases de reportes. |
| Respaldos y recuperación | 63–65 | 3 | Copia DB, copia de archivos y recuperación conjunta; programación, validación y cobertura se incorporan a ellas. |
| **TOTAL** | **1–65** | **65** | A07 contrasta las dependencias del recorrido, no añade 35 requisitos repetidos. |

Por ello, el único requisito íntegramente ausente en la cuenta es el reporte integral de trazabilidad; **no significa que solo falte una función**. Por ejemplo, observaciones documentales está ausente como subfunción de #21, y varias UI faltan en requisitos parciales que sí tienen backend.

### Criterio de estados y evidencia

- **✅ IMPLEMENTADO:** soporte funcional identificado para el alcance concreto, con evidencia estructural/DB o de ejecución indicada. No equivale a prueba integral aprobada ni ausencia de todo caso límite.
- **PARCIAL:** una parte útil existe, pero falta completar integración, alcance, historia o presentación.
- **❌ NO IMPLEMENTADO:** no se encontró implementación de la función integral definida.
- **CON ERROR:** defecto concreto o fallo de ejecución impide cumplir el requisito, aunque exista código/UI.
- **⚪ NO COMPROBABLE:** falta evidencia operativa decisiva para certificar ese requisito. No se cuenta como implementado ni se inventa un fallo de creación que no fue probado.

Cada fila tiene un único estado. Un defecto específico prevalece sobre una etiqueta previa de “implementado” cuando afecta al mismo alcance: #13 incorpora el conflicto de nombres documentado por A01; #21 incorpora la unicidad incompatible documentada por A02. La falta de una prueba no elimina un defecto ya documentado.

### Diferencias entre informes resueltas sin nueva revisión de código

1. A01–A04 no probaron login con contraseñas; A05–A06 sí. Se conserva evidencia posterior de login/logout, sin asumir probadas las altas nuevas y el cambio inicial de contraseña.
2. A04 observa una aprobación en tablas de revisión; A05 no encuentra eventos de aprobación en la bitácora consultada. Son fuentes y hechos distintos: una transición persistida no garantiza su evento de auditoría.
3. A07 indica que “modificar → nueva versión” fallaría sin archivo; A03 describe numeración correcta **si hay carga menor**. No son resultados contradictorios.
4. Aprobar, hacer vigente y publicar son operaciones/estados distintos. A07 precisa que falta publicar antes del acceso del lector; no se interpreta APROBADO como PUBLICADO.
5. La consulta de timeline funcionó en A05, aunque tiene cobertura incompleta. A03 documenta índices únicos reales de versiones; los conflictos concurrentes no se presentan como duplicados persistidos demostrados.
6. A06/A07 no ejecutaron creación nueva de respaldo: se deja #63–64 sin certificar. Sí probaron descarga/verificación fallida de copias existentes, lo que afecta a #65.
7. El consolidado anterior no es una octava fuente para añadir fallos. No se arrastran sus afirmaciones de “doble vigente por ausencia de constraints”, “timeline siempre falla” ni causas de cron no acreditadas por A01–A07.

## Matriz final

| # | Requisito | Estado | Evidencia | Problema | Qué falta |
|---|---|---|---|---|---|
| 1 | Iniciar sesión | ✅ IMPLEMENTADO | A01 §1; A05 eventos 207/208 y A06 consultas autenticadas: login real con administrador, editor, revisor y lector de prueba. | Comprobado para cuentas existentes; las altas nuevas exigen cambio de contraseña y rol correcto (A07). | Ensayar primer ingreso de una cuenta nueva y cambio obligatorio; no volver a marcar el login existente como no probado. |
| 2 | Cerrar sesión | ✅ IMPLEMENTADO | A05: logout HTTP 204 y eventos de cierre 208/211 comprobados desde otra sesión; A06 cerró sesiones de prueba. | No acredita cierre de todas las sesiones/dispositivos simultáneamente. | Verificar replay del token cerrado y distinguir cierre actual de cierre global. |
| 3 | Validar credenciales | ✅ IMPLEMENTADO | A01: check_password, cuenta activa, bloqueo y validación. A05/A06: logins correctos; A05: 7 eventos históricos SESION_FALLIDA. | Identidades repetidas entre organizaciones pueden resultar ambiguas; fallo de contraseña controlado no se reprodujo en estas pruebas. | Ensayo negativo con CSRF válido y validación de identidad/organización. |
| 4 | Controlar acceso por rol/permisos | CON ERROR | A01 §requisito/fila 4: `permissions.py`; `auth_utils.py:get_user_roles/get_user_permission_codes/user_has_permission`; `management_views.py:require_permission`; Neon confirma roles. | Existe seguridad real en backend, pero controles granulares documentales no corresponden al catálogo y hay posibilidades de escalamiento por delegación (S2). | Alinear permisos de cada operación y limitar concesión de privilegios superiores. |
| 5 | Controlar sesión | PARCIAL | A01 §requisito/fila 5: `authentication.py:CookieTokenAuthentication` comprueba hash, revocación, expiración, actividad, cuenta activa y CSRF; `Login.jsx:182` consulta `/me/`; `api.js:8` usa cookies. Token ficticio dio 401. | `api.js` convierte 401 en Error genérico; no hay invalidación central del usuario/panel al expirar. `UserDetailView.patch(active=false)` no revoca todas las sesiones (S3). | Manejo global de 401 y revocación uniforme en toda deshabilitación. |
| 6 | Crear usuarios | CON ERROR | A01 §requisito/fila 6: `UsersView.jsx:102` → POST `/api/admin/users/` → `UserListCreateView.post` → `UserCreateSerializer` → `UsuarioDocumental` y `assign_roles`; Neon confirma columnas/FK. | El formulario manda `roles[0].id`, sin elección. `RolDocumental.Meta.ordering=['codigo']` y los cuatro roles actuales colocan ADMINISTRADOR primero. Usuarios nuevos reciben ese rol cuando carga el catálogo. | Selector explícito y mínimo privilegio por defecto; validar creación sin asignación accidental de Administrador. |
| 7 | Consultar usuarios | ✅ IMPLEMENTADO | A01 §requisito/fila 7: `UsersView.jsx:64` → GET `/api/admin/users/`; `management_views.py:307` filtra organización, búsqueda/estado y pagina; `usuarios` existe. HTTP anónimo 401. | La pantalla carga un conjunto limitado; no ofrece navegación completa de páginas. No se ejecutó GET autenticado. | Validar respuesta con Administrador y denegación con los otros roles; paginación de UI para conjuntos grandes. |
| 8 | Modificar usuarios | PARCIAL | A01 §requisito/fila 8: PATCH `/api/admin/users/<uuid>/` en `UserDetailView.patch`, serializador y UPDATE de usuario por organización. | `UsersView.jsx` no conecta un formulario de edición ni llama PATCH para correo/nombres/área; solo ofrece estado, clave y baja. | Implementar interfaz de edición que consuma el endpoint y validar persistencia. |
| 9 | Habilitar usuarios | ✅ IMPLEMENTADO | A01 §requisito/fila 9: `UsersView.jsx:114` → POST `status/` → `UserStatusView:480`; actualiza `activo` y limpia `deshabilitado_en`, exige `usuarios.gestionar`. | No existen cuentas deshabilitadas en la muestra para prueba funcional. | Prueba con cuenta de ensayo y verificación de permisos antes/después. |
| 10 | Deshabilitar usuarios | CON ERROR | A01 §requisito/fila 10: UI usa `status/`; `UserStatusView:497` y `UserDetailView.delete:469` revocan sesiones. `authentication.py` rechaza usuarios inactivos. | Ruta alternativa PATCH `active=false` actualiza estado pero no revoca todas las sesiones; una reactivación puede rehabilitar tokens no usados durante la baja. `status/` y PATCH también permiten auto-desactivación. | Unificar baja/revocación; impedir bloqueo accidental del último Administrador. |
| 11 | Asignar roles a usuarios | PARCIAL | A01 §requisito/fila 11: PUT `/api/admin/users/<uuid>/roles/` → `UserRolesView:589` → `assign_roles` → `usuarios_roles`; comprobación de organización y rol activo. | No hay selector/flujo de cambio de roles en `UsersView`; creación asigna automáticamente el primer rol. El endpoint no limita asignación de ADMINISTRADOR al delegar `usuarios.gestionar`. | Conectar UI y separar permiso de asignar roles privilegiados. |
| 12 | Asignar permisos a usuarios | PARCIAL | A01 §requisito/fila 12: `get_user_permission_codes` deriva permisos por `usuarios_roles` → `roles_permisos` → `permisos`; `RolesView.jsx:129` guarda permisos de rol. | Solo hay herencia vía rol, no asignación individual directa. Cambiar el rol afecta a todos sus miembros. | Si el requisito es individual, relación usuario–permiso, endpoints e interfaz; si es por herencia, completar asignación de roles en UI. |
| 13 | Crear roles | CON ERROR | A01 §requisito/fila 13: `RolesView.jsx:71` → POST `/api/admin/roles/` → `RoleListCreateView:712` → `RoleCreateSerializer` → tabla `roles`. | El alta valida código duplicado, pero no nombre duplicado, sujeto a UNIQUE en BD; puede producir error no controlado (A01 §13). | Manejo de conflicto de nombre/código y ensayo de creación. |
| 14 | Modificar roles | PARCIAL | A01 §requisito/fila 14: PATCH `/api/admin/roles/<uuid>/` → `RoleDetailView:758`, actualiza nombre/descripción/activo y exige `roles.gestionar`. | `RolesView` edita permisos, pero no tiene formulario ni petición PATCH para datos del rol. Roles inactivos quedan fuera del listado. | Conectar edición y consulta/reactivación de inactivos; validar unicidad de nombre. |
| 15 | Consultar roles | ✅ IMPLEMENTADO | A01 §requisito/fila 15: `RolesView.jsx:41` → GET `/api/admin/roles/` → `RoleListCreateView:695` → `roles`, `usuarios_roles`, `roles_permisos`. HTTP anónimo 401. | Devuelve solamente roles activos; GET por ID no existe en `RoleDetailView`. | Validar listado autenticado y definir consulta de roles inactivos. |
| 16 | Asignar permisos a roles | ✅ IMPLEMENTADO | A01 §requisito/fila 16: Matriz en `RolesView.jsx:129`; PUT `roles/<id>/permissions/` → `RolePermissionsView.put` → transacción DELETE/INSERT sobre `roles_permisos`; IDs activos validados. | ADMINISTRADOR sigue teniendo todos los privilegios aunque se retiren casillas, por el bypass de `user_has_permission`. Crear un código de permiso tampoco conecta automáticamente una función a ese código. | Explicar superusuario en la UI y probar que la revocación afecta a los roles ordinarios. |
| 17 | Restringir funciones según permisos | CON ERROR | A01 §requisito/fila 17: `Login.jsx:264` elige panel por código de rol; backend usa helpers y permisos de DRF; respuestas anónimas 401. | UI se basa en roles fijos y no recibe la lista de permisos efectivos en `serialize_user`. En documentos se exigen permisos inexistentes y faltan verificaciones específicas de descarga/búsqueda. | Contrato de permisos efectivos para UI y controles específicos por endpoint. |
| 18 | Registrar documentos | CON ERROR | A02 §requisito/fila 1: `DocumentsView.jsx:318` envía FormData a POST `/api/documents/`; `DocumentListCreateView:535`, `DocumentCreateSerializer`, `Documento`; datos reales en Neon. | Exige `WRITE_PERMISSION=documentos.gestionar`, ausente del catálogo; Editor solo tiene `documentos.crear`. Además, el panel Editor no ofrece el alta del panel Administrador. | Usar permiso de creación coherente y exponer formulario al Editor; prueba autenticada. |
| 19 | Cargar archivos | CON ERROR | A02 §requisito/fila 2: FormData `file` → POST documento o `files/`; `save_document_file:423` → `validate_uploaded_file` → `default_storage.save` → `ArchivoDocumento`/`versiones_documento`. | Escritura general bloqueada al Editor por permiso incorrecto. Almacenamiento real no inspeccionado. Registro sin archivo permitido. | Corregir permiso; probar carga y descarga con hash/tamaño; decidir si el archivo debe ser obligatorio. |
| 20 | Clasificar documentos | PARCIAL | A02 §requisito/fila 3: Creación usa `area_id/type_id`; edición `EditorDocumentEditView.jsx:111` envía `metadata.classification`; `save_metadata:401` → `documentos_metadatos`. | Clasificación es metadato libre, no referencia validada al catálogo de clasificaciones. En Neon no hay metadatos; guardado del Editor bloqueado. | Definir clasificación admitida, conectar/validar catálogo si aplica y corregir escritura. |
| 21 | Registrar identificación documental: nombre, código, tipo, área, estado, fecha, descripción y observaciones | CON ERROR | A02 §§4,10–18: campos y FK reales; fechas NULL en la muestra; no hay campo explícito de observaciones. A02 D7: código de documento eliminado sigue sujeto a UNIQUE. | Fecha no capturada por UI; observaciones documentales no implementadas; validación de código ignora bajas aunque la unicidad no las ignora. | Completar captura y consulta de campos, definir observaciones y alinear unicidad. Nombre/área/descripción existentes no compensan estos defectos. |
| 22 | Consultar documentos | PARCIAL | A02 §requisito/fila 5: Listados `DocumentsView:234`, `EditorDocumentsView:185`, `ReaderLibraryView:107`; GET general/lector → filtros/serializadores → tablas; anónimo 401. | En Administrador los botones Ver/Editar pasan ID a `onOpenVersions`, pero `Dashboard.jsx:120` descarta ese ID y abre una vista general. No se confirmó consulta del documento seleccionado desde esos botones. | Conservar selección y abrir detalle correcto; validar UI por rol. |
| 23 | Modificar documentos | CON ERROR | A02 §requisito/fila 6: `EditorDocumentEditView.jsx:111` → PATCH `/api/documents/<id>/` → `DocumentDetailView:620` → serializador/ORM/metadatos. | Editor carece de `documentos.gestionar`; UI no permite editar todos los campos admitidos en backend. PATCH no es atómico para datos/metadatos/archivo. | Permiso `documentos.modificar`, edición completa y transacción integral con manejo de almacenamiento. |
| 24 | Eliminar documentos | PARCIAL | A02 §requisito/fila 7: DELETE `/api/documents/<id>/` y POST `archive/` → `archive_document:138`; modifica `eliminado_en/por/motivo`, conserva archivos. Neon tiene una baja lógica. | No se encontró acción conectada de eliminación/archivo en las pantallas documentales revisadas. Usa permiso genérico, no `documentos.eliminar`. | UI de baja lógica y autorización específica; probar conservación de historial. |
| 25 | Descargar documentos autorizados | CON ERROR | A02 §requisito/fila 8: `documentApi.js:downloadFile`; rutas `files/<id>/download/`, `versions/<id>/download/` y lector; `DocumentFileDownloadView:1105` → `open_stored_file` → FileResponse. Descarga anónima con IDs reales: 401. | Rama no lectora solo exige consultar/acceso al documento, no `documentos.descargar`. En listado Editor falta URL por contrato de versión. | Exigir permiso de descarga para todos; devolver versión/URL al listado; probar archivo permitido y denegado. |
| 26 | Buscar por nombre | PARCIAL | A02 §requisito/fila 19: `buildDocumentQuery(search)` → listado general `apply_document_filters:78`; lector dedicado filtra nombre/código/descripción. | GET `/api/documents/` cuando usuario es lector ignora search y otros filtros, a diferencia de `/api/reader/documents/`. No se ejecutaron búsquedas autenticadas. | Unificar filtrado entre rutas y probar resultados positivos/vacíos. |
| 27 | Buscar por tipo | PARCIAL | A02 §requisito/fila 20: Selector → `type_id` → ORM general o filtro en `ReaderDocumentListView`. | La rama lectora de `/api/documents/` ignora type_id. | Aplicar filtro consistente en ambas rutas y validar tipos inválidos. |
| 28 | Buscar por área | PARCIAL | A02 §requisito/fila 21: Selector → `area_id` → filtro general/lector dedicado; `filter_accessible_documents` antes de paginar. | Rama lectora general ignora filtro; cuentas de prueba sin área no comprueban aislamiento. | Unificar filtros y ensayar áreas autorizadas/ajenas. |
| 29 | Buscar por estado | PARCIAL | A02 §requisito/fila 22: `status_code`; general filtra estado de vigente, lector dedicado solo PUBLICADO. | Rama lectora general ignora filtro; sin archivo no hay estado de versión. | Unificar comportamiento y aclarar estados sin archivo/archivado. |
| 30 | Buscar por fecha | PARCIAL | A02 §requisito/fila 23: `DocumentsView.jsx:227` y `buildDocumentQuery` envían updated_from/to; `apply_document_filters` aplica actualización y admite date_from/to para fecha documental. | `ReaderLibraryView` no tiene control de fecha. Backend lector espera date_from/to y los interpreta como actualización. No hay contrato uniforme de fecha documental/actualización. | UI lectora y nombres/semántica consistentes; validar fechas e intervalos. |
| 31 | Mostrar solamente documentos autorizados | CON ERROR | A02 §requisito/fila 24: Filtrado por organización y `has_document_permission`, ACL de rol/área y publicación para lectores; rutas anónimas 401. | Configuración ACL no puede guardar concesiones no vacías por nombres de columnas incompatibles (D2). Retirar toda concesión no significa denegar: restaura permiso global. | Reparar SQL, aclarar herencia/denegación y ejecutar matriz por rol/área/ID. |
| 32 | Restringir búsqueda según permiso | CON ERROR | A02 §requisito/fila 25: Neon contiene `documentos.buscar`; listado general exige solo consultar y lector filtra por acceso documental. | No se comprueba `documentos.buscar`; quitar ese permiso no impide seguir buscando si puede consultar. | Aplicar permiso específico o eliminar/documentar la distinción en catálogo. |
| 33 | Crear nueva versión al modificar documento | CON ERROR | A03 §requisito/fila 1: `EditorDocumentEditView.jsx:111` hace PATCH sin archivo; `DocumentDetailView.patch`, `document_views.py:620`, solo invoca `save_document_file` si hay archivo. POST `versions/`, líneas 798–818, sí crea una fila mediante `save_document_file:423`. | PATCH de texto/metadatos no crea versión; nueva carga sí, pero Editor queda bloqueado por documentos.gestionar. Botón de carga del historial Administrador sin handler (A03/A07). | Definir y versionar toda modificación requerida; conectar botón y permiso `versiones.crear`. |
| 34 | Identificar número de versión | ✅ IMPLEMENTADO | A03 §requisito/fila 2: `next_version_numbers:415`; columnas `numero_mayor`, `numero_menor`, `orden_version`; `serialize_version:172`; tablas de historial muestran `version`. Neon confirma 1.0 y 2.0. | Numeración secuencial identificada y persistida. La asignación concurrente de números tiene riesgo de conflicto; los índices impiden duplicados guardados, no aseguran éxito de toda petición. | Serializar cálculo por documento y ensayar concurrencia; verificar 1.0→1.1→1.2 con cargas minor. |
| 35 | Identificar versión vigente | CON ERROR | A03 §requisito/fila 3: `es_vigente`, GET `versions/` devuelve `current_version_id:794`; índice único parcial en Neon. `VersionsView.jsx:33,63,70` usa selección de comparación como vigente. | Administrador inicia con primera por orden, no con ID vigente; cambiar selector altera el rótulo. Editor también reutiliza selección como «Versión actual». Fallback del backend puede presentar última como vigente sin flag. | Separar selección de comparación y vigencia persistida; no ocultar ausencia de vigente. |
| 36 | Conservar versiones anteriores | ✅ IMPLEMENTADO | A03 §requisito/fila 4: `save_document_file:441` solo cambia flag anterior; crea UUID y clave nuevos. Restauración hace copia nueva. Neon conserva 1.0 y 2.0 de PRUEBA-001. | Registros anteriores conservados; bytes remotos no comprobados. No hay instantáneas de datos generales del documento. | Verificar objetos y hashes; versionar metadatos si forman parte del historial requerido. |
| 37 | Consultar historial | PARCIAL | A03 §requisito/fila 5: GET `versions/` → `version_queryset`; GET `timeline/` → `DocumentVersionTimelineView:1077`. `VersionsView.jsx:30` consulta ambos; Editor consulta versiones. | Administrador y Editor cargan `/api/documents/?limit=1` y el primer documento, sin selector/ID recibido. La línea de tiempo reconstruye estado y autor desde datos actuales. | Consultar documento seleccionado y distinguir evento histórico de estado actual. |
| 38 | Consultar versión anterior | PARCIAL | A03 §requisito/fila 6: GET de versiones devuelve todas las permitidas; URLs con ID específico en `serialize_version:186`; `get_document_version_or_404:907`; UI Editor/Lector tiene preview/descarga por fila. | «Ver versión» en `VersionsView.jsx:74` no tiene onClick. El historial lector solo contiene PUBLICADO; no se probó lectura de objetos. | Conectar preview del Administrador y comprobar archivo histórico autorizado. |
| 39 | Restaurar versión anterior | PARCIAL | A03 §requisito/fila 7: POST `/api/documents/<document_id>/versions/<version_id>/restore/` → `DocumentVersionRestoreView:821` → copia y fila nueva. | Backend existe, pero falta acción UI. Con última 1.3, restaurar contenido de 1.2 crea 1.4 BORRADOR vigente; no reactiva la 1.2 ni restaura metadatos/aprobación (A07 paso 31). No recalcula hash fuente. | UI, permiso específico, cotejo de integridad y prueba aislada conservando todas las versiones. |
| 40 | Registrar creador de versión | ✅ IMPLEMENTADO | A03 §requisito/fila 8: Carga: `creada_por=user:458`; restauración: `creada_por=request.user:864`; FK NOT NULL/RESTRICT; serialización `author:180`. Las tres filas Neon tienen creador. | El nombre mostrado se resuelve desde el usuario actual, no es una instantánea del nombre histórico. | Si se requiere identidad histórica literal, conservarla junto al evento; el ID ya se registra. |
| 41 | Registrar fecha de creación de versión | ✅ IMPLEMENTADO | A03 §requisito/fila 9: `creada_en=timezone.now()` en carga y restauración; `created_at:185`; DB NOT NULL y tres fechas presentes. | POST nueva versión/restauración no actualiza `Documento.actualizado_en`, que UI etiqueta «Última actualización». `published_at` del serializador lector usa fecha de creación, no publicación. | Separar fechas de creación/publicación y actualizar o derivar última actividad de versión. |
| 42 | Registrar cambios | PARCIAL | A03 §requisito/fila 10: `comentario_cambio`; carga admite comment, restauración comentario por defecto; `compare_versions:212` compara nombre/MIME/tamaño/hash/comentario/estado; timeline consulta eventos. | Comentario puede ser genérico; `EditorVersionsView:82` envía solo file. No hay diff del contenido ni snapshot de título/descripción/metadatos; PATCH registra evento sin valores antes/después. | Capturar cambio significativo y datos históricos por versión; no presentar comparación de hash como diff de contenido. |
| 43 | Enviar documento a revisión | PARCIAL | A04 §requisito/fila 1: `EditorDocumentEditView.jsx:164` → POST `documents/<doc>/versions/<version>/submit-review/` → `ReviewSubmitView:318` → `transition_version` y solicitudes/detalles/checklist. Neon conserva BORRADOR → EN_REVISION. | Envío de BORRADOR existente está conectado, pero creación/nueva versión del Editor exige permiso incorrecto, bloqueando inicio/corrección. No exige versión vigente ni bloquea fila para envío. | Resolver permisos/carga antes de probar envío, mantener selección de versión y serializar transición; verificar persistencia y notificación. |
| 44 | Consultar pendientes | PARCIAL | A04 §requisito/fila 2: `ReviewerReviewInboxView.jsx:44` → GET `reviews/inbox/?limit=100`; backend exige `revisiones.consultar`, organización y revisor asignado, permite `status=PENDIENTE`. | UI carga solo primeras 100, filtra localmente y no continúa `next_offset`; contador «en revisión» compara estado de solicitud con código inexistente EN_REVISION. | Paginación/filtro backend coherentes y separación estado de solicitud/versión. |
| 45 | Revisar documento | CON ERROR | A04 §requisito/fila 3: Bandeja pasa reviewId; `ReviewerDocumentReviewView.jsx:47` consulta solicitud y documento; preview `:62` y `:127` usa `files.find(is_current)`. | No selecciona `review.document.version_id`. Si existe otro archivo vigente, se observa ese archivo y se decide la versión antigua de la solicitud. | Fijar preview/descarga/metadatos a la versión asignada; no a vigente global. |
| 46 | Aprobar | CON ERROR | A04 §requisito/fila 4: `decide('approve')` → POST `reviews/<id>/approve/` → `ReviewDecisionView:520`, permiso, asignación, PENDIENTE y checklist; última pendiente cambia versión a APROBADO. Neon tiene una solicitud APROBADA. | Falta bloqueo ante decisiones concurrentes. El estado del documento puede seguir EN_REVISION si faltan otros revisores. No asegura versión vigente. | Bloquear/releer versión y solicitudes; diferenciar aprobación individual/total y validar vigencia esperada. |
| 47 | Rechazar | PARCIAL | A04 §requisito/fila 5: Formulario `ReviewerDocumentReviewView.jsx:105,152`; POST `reject/`; `require_review_observation:311`; guarda comentario, RECHAZADA y versión RECHAZADO, cierra otras pendientes. | Backend y formulario existen, pero recepción del motivo en Editor no está conectada; concurrencia puede sobrescribir decisión. No hay rechazo real en muestra Neon. | Renderizar observación al Editor, proteger concurrencia y ejecutar caso de ensayo. |
| 48 | Enviar rechazado para corrección | CON ERROR | A04 §requisito/fila 6: Rechazo genera aviso al solicitante; corrección por nueva versión BORRADOR + nuevo envío. Alternativa `return/` devuelve misma versión a BORRADOR y solicitud CANCELADA. | Editor oculta observaciones; nueva versión está bloqueada por permiso genérico. Reenvío de devolución al mismo revisor choca con UNIQUE versión/revisor. | Completar UI de corrección, alinear permisos y modelar rondas de revisión. |
| 49 | Consultar estado | CON ERROR | A04 §requisito/fila 7: `serialize_review:149` entrega estado de solicitud; documento entrega estado de vigente; `EditorDocumentEditView` recarga documento al enviar. | Se confunden estados de solicitud y versión; UI puede quedar desactualizada. APROBADO no implica vigente ni PUBLICADO: el lector requiere publicación explícita (A07 pasos 23–27). | Contrato de estados/ID consistente, refresco y recorrido explícito de publicación antes de validar acceso lector. |
| 50 | Registrar acciones | PARCIAL | A05 §requisito/fila 1: `documentos/auth_utils.py:78`: `INSERT ... SELECT` en `bitacora_auditoria`; API devolvió 207 registros en la lectura inicial. | Si falta una combinación de catálogos, inserta cero filas y solo escribe un mensaje crítico. Las excepciones se capturan sin comunicar el fallo al llamador (`:127`, `:135`). Operaciones ya confirmadas pueden quedar sin evento; dentro de transacciones un error SQL también puede invalidarlas. | Garantía explícita de persistencia junto a la operación, tratamiento de errores y comprobación de catálogos; supervisión del registro técnico de fallos. |
| 51 | Consultar bitácora | ✅ IMPLEMENTADO | A05 §requisito/fila 2: `/api/audit/` permitió paginar los 207 eventos. `audit_views.py:223` limita a 100 por página. Lector: global 403; consulta propia correcta. | Consulta global del Administrador y consulta propia comprobadas. UI personal del revisor limita a 100 y exportación a 10 000; no se certifica exploración ilimitada. | Paginación/exportación completa y comprobación visual; la consulta básica ya tiene evidencia web. |
| 52 | Registrar usuario responsable | PARCIAL | A05 §requisito/fila 3: Cero `user_id` vacíos entre 207 eventos. `record_document_event` (`document_views.py:481`) y `record_management_event` (`management_views.py:988`) usan al actor autenticado. | `record_auth_event` permite `user_id=None`; la consulta resuelve nombres mediante el usuario actual, no una identidad histórica congelada. No se inspeccionaron restricciones de la BD desplegada. | Identificación explícita de actor humano, anónimo o sistema; conservación de identidad histórica y restricciones verificadas. |
| 53 | Registrar fecha y hora | PARCIAL | A05 §requisito/fila 4: Cero `event_at` vacíos entre 207 eventos. Evento 207: `2026-09-07T07:36:59.549998Z`; evento 210: `2026-09-07T07:37:53.875430Z`. | El INSERT de `auth_utils.py:97` no envía fecha. `audit_views.py:36` busca una columna temporal compatible, pero no valida su valor predeterminado ni obligatoriedad. | Confirmar `NOT NULL`, valor automático y tipo temporal en producción. Los valores observados están en UTC; no deben confundirse con hora local de Guatemala. |
| 54 | Registrar modificaciones | PARCIAL | A05 §requisito/fila 5: `document_views.py:661` y `management_views.py:445`; evento documental 102 tiene `details={}`. Helper de usuarios `management_views.py:994` guarda objetivo e IP. | Normalmente informa que hubo una modificación, pero no cuáles campos cambiaron ni sus valores anteriores/nuevos. | Diferencias por campo para datos auditables, incluidos metadatos y permisos; excluir contraseñas y secretos. |
| 55 | Consultar actividad por documento | PARCIAL | A05 §requisito/fila 6: `/api/documents/7954d65d-2eb8-4dc7-aef6-74ea7c8726fe/timeline/` devolvió 4 eventos. `document_views.py:1024` une documento y versiones. | Solo incluye acciones permitidas por `TIMELINE_ACTIONS` y `ba.exitoso`; excluye accesos denegados, checklist, observaciones resueltas, consultas/lecturas y eliminaciones históricas. Las altas de versión se reconstruyen desde las versiones (`:1083`), no son prueba de un INSERT de auditoría. | Consulta documental completa de seguridad y cambios, con identificación estable de documento, versión y revisión. Mantener separada la vista limitada del lector si corresponde. |
| 56 | Registrar intentos de acceso no autorizado | PARCIAL | A05 §requisito/fila 7: Prueba lector → `/api/audit/`: 403 y evento 210 `ACCESO_DENEGADO`, `successful=false`, motivo `AUDIT_ACCESS_REQUIRED`. `audit_views.py:58`, `auth_utils.py:146`. | No existe cobertura uniforme de todas las denegaciones: autenticación sin cookie, token desconocido, CSRF y algunos controles salen sin este registro. | Registro común de denegaciones con ruta, método, motivo y actor cuando sea identificable. |
| 57 | Consultar intentos no autorizados | ✅ IMPLEMENTADO | A05 §requisito/fila 8: `/api/audit/?action=ACCESO_DENEGADO` devolvió el evento 210. `critical=true` devolvió 8 eventos; `/api/audit/alerts/` respondió correctamente. | Filtros y alertas responden para eventos existentes. Cero alertas bajo umbral no equivale a cero incidentes; intentos no registrados no son consultables. | Canal para intentos anónimos/no atribuibles a organización y explicación de umbrales. |
| 58 | Reportes del sistema / ejecutivos | CON ERROR | A06 §requisito/fila 1: `ReportsView.jsx:58` → GET `/api/reports/?scope=executive` → `ReportListView`, `reports_views.py:440` → `build_report_data`. Dos consultas, sin filtros y con `status_code=PUBLICADO`, devolvieron 500. | `document_report_rows` sustituye el QuerySet por el resultado de `filter_accessible_documents` (`:151`), que es una lista (`reader_access.py:82`), y luego llama `.order_by()` (`:157`). Es un defecto concreto local compatible con el fallo web; sin traceback no se atribuye con certeza el 500 desplegado a esa línea. Además, «executive» resume documentos, no usuarios, seguridad y salud de todo el sistema. | Corregir el contrato lista/QuerySet y verificar consulta, indicadores y exportación. Definir si se requiere un reporte verdaderamente global del sistema. |
| 59 | Reportes de documentos | CON ERROR | A06 §requisito/fila 2: `EditorBasicReportsView.jsx:64` → `/api/reports/?scope=editor`; cuenta editor recibió 500. `reports_views.py:125` consulta Documento, área, tipo, creador y versión vigente. | Comparte el defecto de ordenación anterior. El editor se limita a documentos creados por él; el «responsable» es el creador, no otro responsable documental. Excluye documentos con `eliminado_en` informado. | Arreglar consulta y confirmar alcance funcional, filtros y significado de responsable. |
| 60 | Reportes de versiones | PARCIAL | A06 §requisito/fila 3: `reports_views.py:125` precarga únicamente `es_vigente=True`; `:327` exporta la columna Versión. `SCOPES` solo contiene executive/editor/reviewer. | Mostrar el número de versión vigente no equivale a reportar todas las versiones, autores de carga, cambios, restauraciones y estados históricos. Las rutas de ejecutivo/editor también fallan. | Reporte específico sobre versiones con historial, actor, fecha, documento y transiciones; comprobar archivo generado. |
| 61 | Reportes de actividad | PARCIAL | A06 §requisito/fila 4: `ReviewerBasicReportsView.jsx:99` → scope reviewer → `reviewer_report_rows` (`reports_views.py:180`). Cuenta revisor: respuesta correcta, `rows=[]`, total 0. `WeeklyChart`, `ReviewerBasicReportsView.jsx:61`, cuenta filas por `created_at`. | La gráfica cuenta solicitudes recibidas/creadas, porque `created_at=solicitada_en`; no mide acciones realizadas, tiempo trabajado, descargas o logins. No se contrastó con datos positivos del revisor. | Definir actividad y obtener eventos/fechas de las acciones correspondientes; prueba con revisiones reales y resultados conocidos. |
| 62 | Reportes de trazabilidad | ❌ NO IMPLEMENTADO | A06 §requisito/fila 5: `build_report_data` (`reports_views.py:276`) usa documentos o solicitudes; encabezados `:321` y filas `:327` no incluyen cadena de eventos. | No consulta bitácora ni historial de cambios para generar una cronología completa. La existencia de una bitácora o timeline en otro módulo no satisface por sí sola este reporte. | Reporte exportable que relacione documento, versiones, revisiones, actores, fechas, decisiones y eventos de seguridad según alcance. |
| 63 | Respaldar base de datos: flujo completo | ⚪ NO COMPROBABLE | A06 §§12,14,20–23; A07 paso 34: snapshot SQL→ZIP→cifrado→storage real en código; dos registros históricos, descarga/verificación HTTP 500. | No se probó crear una copia nueva ni se obtuvieron bytes de las antiguas. No se afirma que POST falle necesariamente. Exporta esquema documental por organización, no toda la instancia. | Crear copia controlada, inspeccionar manifiesto/tablas/hash y probar recuperación aislada; comprobar cron vencido y tratamiento de copias incompletas. |
| 64 | Respaldar archivos | ⚪ NO COMPROBABLE | A06 §§13,14,28–29: lectura y empaquetado real de ArchivoDocumento en código; ambas copias web declaran cero archivos y no se descargan. | No se acreditó copia binaria real. Estado exitoso puede coexistir con faltantes; no se incluyen otros objetos como instantáneas de reportes. | Respaldo con archivos/versiones, inventario y hashes cotejados; incluir otros artefactos necesarios o declarar exclusiones. |
| 65 | Recuperar base de datos y archivos desde respaldo | CON ERROR | A06 §§15–20,24–30: selección→validación→UPSERT y recuperación de archivos; mode=verify devolvió 500 para ambas copias existentes. | El flujo de recuperación no supera validación en las copias disponibles. Restauración total no ejecutada; requiere esquema previo, omite catálogos globales, conserva filas posteriores y storage no tiene rollback SQL. | Resolver acceso/validación, definir recuperación exacta o por combinación y ensayar DB/archivos aislados; verificar usuarios, roles, permisos, versiones y bitácora sin sobrescribir auditoría. |

## Totales y porcentaje funcional estimado

**TOTAL: 65**

| Estado | Cantidad |
|---|---:|
| ✅ Implementados | 13 |
| Parciales | 28 |
| ❌ No implementados | 1 |
| Con error | 21 |
| ⚪ No comprobables | 2 |
| **Suma** | **65** |

**PORCENTAJE FUNCIONAL ESTIMADO: 42 %** (41,54 % antes de redondear).

Fórmula: **(implementados + 0,5 × parciales) / 65 × 100 = (13 + 14) / 65 × 100 = 41,54 %.**

Es una estimación de cobertura funcional por requisitos, con pesos iguales, no una medición de avance del código, porcentaje de pruebas aprobadas ni probabilidad de completar la exposición. Los requisitos con error, ausentes y no comprobables reciben cero crédito en esta estimación conservadora. La proporción clasificada como implementada sin crédito parcial es **13/65 = 20 %**; tampoco es una tasa de pruebas en ejecución, pues algunas filas se sustentan en código/DB de los informes.

El porcentaje no pondera dependencias: un solo bloqueo temprano puede impedir el recorrido completo, aunque otras funciones existan.

## Funciones que faltan

Se distingue ausencia total de función, integración incompleta y garantías faltantes. La prioridad se refiere a terminar el sistema y demostrar el recorrido; no es una puntuación formal de vulnerabilidades.

### CRÍTICAS

- **Alta y asignación correcta de perfiles:** selector de rol y reasignación operativa sin conceder Administrador por defecto; completar permisos efectivos y ACL. Requisitos #4, #6, #11, #17, #31.
- **Recorrido documental real del Editor:** alta, carga, modificación y nueva versión con permisos coherentes; persistencia de archivo/DB comprobada. #18–19, #23, #33.
- **Revisión de la versión correcta y decisiones consistentes:** preview ligado a la solicitud, validación de estados bajo concurrencia y resultado final definido. #45–46, #49.
- **Respaldo recuperable demostrado:** copia accesible con DB/archivos, validación y recuperación aislada. Las dos copias existentes fallan al validarse; falta prueba de creación actual. #63–65.

### ALTAS

- **Corrección tras rechazo:** mostrar motivo/comentarios al Editor, permitir carga correctiva y reenvío; resolver rondas de devolución. #47–48.
- **Versionado completo y publicación explícita:** definir qué modificaciones versionan; distinguir vigente, seleccionada y publicada antes de acceso lector. #33, #35, #49.
- **Restauración de versión operable desde UI:** seleccionar fuente, copiar con hash verificado, conservar historia y explicar que se crea nueva versión BORRADOR. #39.
- **Trazabilidad completa de cambios:** diferencias antes/después, enlaces documento/versión/revisión, cobertura de eventos y persistencia confiable; preservar auditoría durante restauración. #42, #50, #54–56.
- **Reportes ejecutivo/documental operativos y reporte integral de trazabilidad:** reparar constructor y completar reporte ausente. #58–59, #62.
- **Descarga de la versión correcta bajo permisos específicos:** contrato de listado y comprobación de archivo permitido/denegado. #25, #31, #35.

### MEDIAS

- **Edición de usuarios y roles en UI**, con manejo de duplicados y validación de bajas/reactivación. #8–10, #13–14.
- **Campos documentales completos:** fecha, observaciones explícitas y clasificación validada; corregir código reutilizado tras baja. #20–21.
- **Historial del documento seleccionado**, sin elegir automáticamente la primera fila; separar comparación de vigencia. #22, #35, #37–38.
- **Reportes específicos de versiones y actividad**, con fechas/actores adecuados y exportación coherente con filtros. #60–61.
- **Consulta completa y programación verificable:** paginar pendientes/historiales, no truncar exportaciones silenciosamente, comprobar crons y alertar ejecuciones vencidas. #37, #44, #51, #58–65.

### BAJAS

- **Claridad de etiquetas y resultados:** distinguir solicitud APROBADA de versión APROBADO/PUBLICADO; identificar fecha de creación frente a publicación/actualización. #41, #49.
- **Mensajes fieles de recuperación:** “contenedor verificado” frente a “sistema recuperado”; RPO/RTO como objetivos, no tiempos medidos. #65.
- **Acciones de navegación honestas:** “Administrar puntos” debe seleccionar/gestionar puntos y no lanzar restauración del último; indicar límites de gráficos e historiales. #61, #65.

Estas últimas tareas son de claridad e integración. No convierten por sí solas un requisito defectuoso en completo.

## Errores lógicos

| Error | Consecuencia concreta | Fuente |
|---|---|---|
| Primer rol del catálogo como rol del usuario nuevo | Se puede crear Administrador al intentar crear Editor/Revisor/Lector. | A01 S1; A07 pasos 2–5. |
| Permiso exigido no existe en catálogo | Los permisos de crear/modificar/versiones del Editor no habilitan las rutas que exigen documentos.gestionar. | A02 D1; A03 V5. |
| ACL escribe nombres de columnas distintos a los de BD | Guardar concesiones no vacías fallaría; ver el panel no prueba persistencia. | A02 D2. |
| Vaciar ACL vuelve a herencia global | Quitar todas las concesiones puede ampliar acceso en vez de denegarlo. | A02 D8. |
| Consultar permite descarga en ramas no lectoras | Revocar documentos.descargar no asegura impedir la descarga a Editor/Revisor con consulta. | A02 D4. |
| PATCH de desactivación no revoca uniformemente sesiones | Reactivar puede rehabilitar tokens no usados durante la baja. | A01 S3. |
| Prevalidar código excluyendo bajas frente a UNIQUE que las conserva | Reutilizar código archivado pasa validación y falla en BD. | A02 D7. |
| Guardar texto se confunde con crear versión | No aparecen 1.1/1.2; se sobrescribe contexto común sin snapshot. | A03 V1; A07 pasos 10–11,19–20. |
| Historial elige primer documento y selector de comparación cambia “vigente” | Se muestran documento/versión distintos de los esperados sin cambiar la vigencia real. | A03 V2–V3. |
| Preview usa vigente global en lugar de versión de solicitud | Puede aprobar/rechazar una versión mirando otra. | A04 R1. |
| Decisiones leen estados antes del bloqueo adecuado | Rechazo/aprobación concurrentes pueden contradecirse; varios aprobadores pueden dejar EN_REVISION sin pendientes. | A04 R3–R4. |
| Reenviar misma versión devuelta al mismo revisor crea fila nueva | Choca con UNIQUE versión/revisor; nueva versión evita ese conflicto concreto. | A04 R5. |
| Aprobar se interpreta como hacer vigente/publicar | La versión puede no ser vigente; el lector no ve APROBADO sin PUBLICADO. | A04 caso 2; A07 pasos 23–27. |
| Restaurar se interpreta como volver vigente la fila antigua | Tras 1.3, restaurar 1.2 crea 1.4 BORRADOR, no reactiva 1.2 aprobada. | A03 restauración; A07 paso 31. |
| Auditoría tolera cero inserciones/fallos y omite diferencias | Operación confirmada puede quedar sin traza suficiente para reconstruirla. | A05 filas 1,5,16,29. |
| Reporte llama order_by sobre lista | Constructor ejecutivo/editor defectuoso, compatible con los 500 observados. | A06 filas 1–2. |
| Reporte antiguo sin snapshot se recalcula | Descargar histórico puede devolver datos de hoy; PDF además limita detalle a 1 000 filas. | A06 fila 9. |
| Respaldo parcial marcado exitoso | Puede faltar contenido aunque aparezca como punto utilizable; verificación puede devolver valid=true con complete=false. | A06 fila 20. |
| Restauración por UPSERT se interpreta como vuelta exacta al pasado | Conserva filas posteriores, requiere esquema previo y omite catálogos globales. | A06 filas 17,26. |
| Transacción SQL se interpreta como rollback de storage | Reemplazos de archivos pueden quedar parciales aunque revierta DB. | A06 fila 18. |
| Fecha de prueba/restauración se interpreta como recuperación integral | Verificar contenedor o restaurar solo archivos puede alimentar indicadores sin demostrar sistema recuperado. | A06 fila 19. |

Las carreras y errores deducidos de código/contratos no se presentan como explotaciones reproducidas. Las respuestas 500 de reportes y descarga/verificación de respaldos sí están documentadas como observadas.

## Funciones fantasma

Solo se incluyen casos con interfaz, etiqueta, endpoint o mecanismo aparente que no completa lo anunciado. “Fantasma” describe la promesa incompleta, no que todo el módulo sea ficticio.

| Apariencia | Implementación realmente encontrada / tramo faltante | Fuente |
|---|---|---|
| Alta lista para crear cualquiera de los cuatro perfiles | Formulario crea usuario, pero asigna primer rol y no permite elegir el solicitado. | A01 §6; A07 paso 2. |
| Gestión de usuarios/roles aparentemente completa | Hay PATCH y PUT de roles, pero falta UI de edición/reasignación correspondiente. | A01 §§8,11,14. |
| Matriz de permisos documentales lista para guardar | Existe PUT, pero INSERT usa columnas incompatibles con el esquema auditado. | A02 D2. |
| “Subir nueva versión” y “Ver versión” del historial Administrador | Botones sin handler. Backend de carga/consulta existe, pero no completa esas acciones de UI. | A03 V4. |
| “Versión vigente” del comparador | Rótulo cambia con selección local; no representa necesariamente es_vigente. | A03 V3. |
| Historial del documento seleccionado | Vistas generales cargan primero del listado en lugar de conservar ID seleccionado. | A03 V2. |
| Paneles “Observaciones” y “Comentarios del revisor” del Editor | API tiene motivo/comentarios; UI presenta placeholders y campana sin flujo operativo. | A04 R2. |
| Restauración de versión disponible como capacidad del sistema | Endpoint copia a versión nueva, pero historiales examinados no tienen acción de restauración conectada. | A03 §7/V4; A07 paso 31. |
| “Prueba de recuperación exitosa” | Botón valida contenedor; no restaura una instancia ni comprueba el sistema recuperado. | A06 §19. |
| “Administrar puntos” | Botón llama restauración del último punto; no es un gestor de selección. | A06 §15. |
| Copias “exitosas” y disponibles | Hay registros, pero ambas descargas y verificaciones dieron 500; no se demostró archivo utilizable. | A06 §§14,16. |
| Programación diaria y próxima ejecución | Configuración activa, pero fecha vencida desde 28 de agosto y sin ejecución automática reciente acreditada. No prueba ausencia del comando/cron declarado. | A06 §21. |

No se incluyen aquí funciones completamente ausentes sin apariencia operativa, ni constantes de estilos, ni ceros iniciales como si fueran mocks. Reportes y respaldos tienen lógica real; no se los califica íntegramente como simulados. RPO 24 h y RTO 8 h son valores fijos, no mediciones.

## Orden recomendado para terminar el sistema

| Orden | Trabajo y dependencia | Evidencia necesaria para cerrarlo |
|---|---|---|
| 1 | Fijar línea base de despliegue, BD y entorno de ensayo. Antes de cambios, obtener una copia de protección utilizable de los datos/archivos afectados. | Identidad de versión/configuración conocida; copia verificada. No usar las copias fallidas como garantía. |
| 2 | Resolver roles, permisos efectivos y ACL: alta con selección, reasignación, columnas correctas, herencia/denegación y permisos de operación. | Cuentas nuevas de cada perfil con privilegios esperados, sin Administrador accidental. |
| 3 | Validar los cuatro roles **después de permisos**: primer login, cambio obligatorio, sesión, bajas y denegaciones por área/documento. | Matriz positiva/negativa con cuenta adscrita a área y documentos permitidos/ajenos; no solo cuentas con área NULL. |
| 4 | Completar CRUD documental del Editor, campos y contratos de selección/archivo. | Crear documento, cargar, abrir, modificar y descargar contenido correcto con hash conocido; sin éxito parcial oculto. |
| 5 | Establecer estados y política de versiones: borrador/revisión/rechazo/aprobado/publicado, vigencia y significado de modificación. | Especificación y casos de transición inequívocos. **Estados antes del flujo de aprobación.** |
| 6 | Completar control de versiones e historial: incremento menor/mayor, selección correcta, autor/fecha, snapshot requerido, integridad y concurrencia. | 1.0→1.1→1.2 con archivos conservados y una sola vigente; edición sin archivo tratada conforme a la política. **Versiones antes de restauración.** |
| 7 | Completar revisión/corrección: asignación con acceso efectivo, preview de versión exacta, motivo visible, rondas, checklist y consenso bajo bloqueo. | Rechazar con motivo→corregir en nueva versión→reenviar→aprobar; casos concurrentes sin estados contradictorios. |
| 8 | Completar publicación y lectura autorizada. | Aprobada no se expone antes de publicar; lector autorizado encuentra y descarga la publicación prevista; lector ajeno no accede. |
| 9 | Completar garantías de auditoría junto a las escrituras anteriores y consolidar trazabilidad. | Cada paso crítico tiene evento persistido con actor, fecha, recurso y detalle suficiente; controles de inmutabilidad. La auditoría se diseña desde pasos 4–7, no se añade solo al final. |
| 10 | Completar restauración de versión, sobre el versionado e historial ya validados. | Desde 1.3 restaurar contenido de 1.2 como 1.4 según la política definida, conservar anteriores y cotejar bytes/estado/evento. |
| 11 | Corregir y completar reportes sobre datos/estados estables. | Consulta y generación ejecutivo/editor sin 500; archivo descargable cotejado; reportes de versiones/actividad/trazabilidad completos y filtros consistentes. |
| 12 | Certificar respaldos y recuperación integral con el modelo final. | Copia nueva descargable, hash/manifiesto y cobertura de DB/usuarios/roles/permisos/documentos/versiones/archivos/bitácora; recuperación en destino aislado y comprobación funcional. No confundir la protección inicial del paso 1 con esta certificación. |
| 13 | Validar automatización, retención y observabilidad. | Logs de cron real, próximas fechas avanzadas, alertas de retraso/fallo y ensayo de recuperación; distinguir objetivos de tiempos medidos. |
| 14 | Ensayar exposición completa con los cuatro roles y datos nuevos. | Recorrido A07 completo, incorporando cambios de contraseña y publicación; archivo/reportes/copias comprobables. Repetir desde limpio sin intervenciones manuales ocultas ni privilegios Administrador para simular Editor. |

El orden no implica que haya que esperar al final para corregir storage o registrar eventos: son dependencias transversales. La validación final de respaldo requiere el esquema y los artefactos definitivos; una copia de protección previa es condición para trabajar con datos existentes.

## Estado general y exposición

**ESTADO GENERAL: E) FLUJO PRINCIPAL INCOMPLETO.**

**¿ESTÁ LISTO PARA MOSTRAR TODO EL SISTEMA DE PRINCIPIO A FIN EN UNA EXPOSICIÓN? NO.**

Se puede realizar una demostración limitada y explícita de login/logout con cuentas existentes, consulta de bitácora y algunos datos históricos. Eso no demuestra altas por perfil, cargas, correcciones, recuperación ni el recorrido completo.

### Qué podría fallar exactamente durante la exposición

| Paso de A07 | Acción visible | Fallo o límite concreto |
|---|---|---|
| **2** | Crear Editor | **Primer incumplimiento por interfaz:** el alta asigna Administrador por defecto. Lo mismo afecta a Revisor/Lector en pasos 3–4. Es inferencia de UI/catálogo confirmada en A07, no alta ejecutada. |
| 5 | Corregir roles/permisos | Falta UI de reasignación; ACL documental con concesiones no vacías puede fallar por columnas inexistentes. |
| 6→7, 14, 24 | Primer ingreso de cuentas nuevas | Se exige cambiar contraseña temporal. Omitirlo bloquea funciones aunque el login sea correcto; es requisito omitido, no login roto. |
| **7–8** | Editor crea documento y carga archivo | **Primer bloqueo documental con roles correctos:** falta alta en su panel y permiso genérico ausente; 403 previsto, antes de probar almacenamiento. |
| 10–11, 19–20 | Modificar y esperar 1.1/1.2 | Cambiar texto no crea versión; carga explícita vuelve a encontrar bloqueo de permiso. |
| 12 | Abrir historial | Puede aparecer el primer documento, no el seleccionado; comparación puede cambiar la etiqueta de vigente. |
| 16–17, 22 | Revisar y decidir | Preview puede mostrar otra versión; checklist incompleto bloquea aprobación; decisiones concurrentes pueden producir estado incoherente. |
| 18–19 | Mostrar rechazo y corregir | Motivo no presentado en los paneles del Editor; no basta que exista en API/DB. |
| **25–27** | Lector busca y descarga 1.2 aprobada | Falta publicación. Documento nuevo APROBADO no aparece como PUBLICADO; puede verse una publicación anterior si existía, no la vigente interna esperada. Bytes de documentos no certificados por los informes. |
| 28–29 | Mostrar trazabilidad completa | Consulta de bitácora funciona, pero podrían faltar eventos o detalles de los cambios; timeline no cubre todas las acciones. |
| 30–31 | Crear 1.3 y restaurar 1.2 | Botón de carga del historial Administrador sin handler; restauración de versión sin acción UI. Por API crearía 1.4 BORRADOR, no reactivaría 1.2 aprobada. |
| **33** | Abrir/generar reporte ejecutivo | Consulta ejecutivo/editor ya dio HTTP 500 en A06; generación comparte constructor defectuoso, aunque POST de generación no se ensayó. |
| **34** | Mostrar respaldo y comprobar recuperación | Ambas copias existentes dieron 500 al descargarse y verificarse, y declaran cero archivos. Creación nueva no ensayada; no prometer ni su fallo inevitable ni éxito recuperable. |
| 35 | Cerrar sesión | Es una operación comprobada; cerrar una sesión no cierra automáticamente las de todos los participantes. |

**Respuesta exacta al punto de ruptura:** el recorrido por UI incumple lo solicitado en el **paso 2, crear Editor con rol correcto**. Si se usan cuentas preexistentes correctamente configuradas, el primer bloqueo pasa al **paso 7, creación documental por Editor**. Superar un bloqueo usando Administrador o llamadas API manuales no acredita que el recorrido por los cuatro perfiles esté terminado.

No se modificó código ni se realizaron reparaciones. Este consolidado reemplaza el contenido anterior de `AUDITORIA_FINAL.md`; los siete informes fuente permanecen como evidencia.
