# AUDITORIA_FRONTEND — Funcionamiento (no estética)

> Alcance: solo frontend (`frontend/src/`, 70 ficheros, React 19 + Vite, sin router/store/tests). No se evalúa estética. Base: lectura de `App.jsx`, `main.jsx`, `Login.jsx` (394), `api.js` (37), `documentApi.js`, `Dashboard.jsx` (135), `DocumentsView.jsx` (790), `EditorDashboard.jsx` (108), `EditorDocumentEditView.jsx` (241), `EditorVersionsView.jsx` (112), `VersionsView.jsx` (80), `ReviewerDashboard.jsx` (91), `ReviewerDocumentReviewView.jsx` (157), `ReaderDocumentView.jsx` (57), `ReaderLibraryView.jsx` (427), `ReaderDocumentShell.jsx`, `UsersView.jsx` (168), `RolesView.jsx`, `ReportsView.jsx` (128), `BackupsView.jsx` (144), `SettingsView.jsx`, `DocumentPermissionsPanel.jsx` (73), `AuditView.jsx`.
> Fecha: 2026-09-05.

## 1. Tabla resumen

| ID | Severidad | Pantalla/archivo | Problema |
|----|-----------|------------------|----------|
| F01 | CRÍTICO | `App.jsx:3`, `Login.jsx:264-283` | Sin router: recarga pierde vista, sin deep-link, multi-rol solo primer match |
| F02 | ALTO | `VersionsView.jsx:27-30`, `EditorVersionsView.jsx:56-59`, `ReaderDocumentView.jsx:24-27`, `ReviewerDocumentReviewView.jsx:42-45` | Abren “primer elemento” (`limit=1`) en vez del seleccionado → datos equivocados |
| F03 | ALTO | `DocumentsView.jsx:318-348`, `UsersView.jsx:28,99-110`, `EditorDocumentEditView.jsx:106-115` | Formularios incompletos + validación solo cliente (o ninguna) |
| F04 | ALTO | `VersionsView.jsx:71`, `EditorDocumentEditView.jsx:229`, `Dashboard.jsx:117` | Botones sin funcionalidad / placeholders que fingen acción |
| F05 | ALTO | Documentos/versiones/reportes vs `Backups/Users/Roles` | Destructivas sin confirmación (excepto 4 con `confirm`) |
| F06 | ALTO | `api.js:1-30`, `Login.jsx:180-252` | Sesión expirada no redirige; errores pierden `code`; binarios rompen a `{}` |
| F07 | MEDIO | `Dashboard.jsx:97-98`, `DocumentsView.jsx:237-268`, `EditorDashboard.jsx:71-75`, `UsersView.jsx:94-97`, `AuditView.jsx:80-83`, `ReportsView.jsx:112` | Doble filtrado cliente + conteos sobre página → datos obsoletos/incorrectos |
| F08 | MEDIO | `DocumentsView.jsx:331-333`, `ReportsView.jsx:85`, `BackupsView.jsx:79`, `ReviewerDocumentReviewView.jsx:87-96` | Estados no se actualizan / operaciones duplicables (sin `pending` o con update optimista falso) |
| F09 | MEDIO | `Login.jsx:180-189,372-379`, `Dashboard.jsx:88-95`, `Reader*Shell` | Loading inexistente/parcial + flash de login + `me` sin retry |
| F10 | MEDIO | `documentApi.js:12-29`, `RolesView.jsx:66-69`, `ReportsView.jsx:103-110` | Nulos/inconsistencias A↔B: `version/downloadUrl` siempre `—`, ES/EN, `download_url` relativa |
| F11 | MEDIO | `EditorDocumentEditView.jsx:11-14,106-115`, `VersionsView.jsx:52-60`, `ReviewerDocumentReviewView.jsx:92-103` | Permitido visualmente, prohibido en backend (sin `disabled` real) |
| F12 | MEDIO | `UsersView` (sin lock UI), `ReportsView` (sin edit/delete schedule), `DocumentsView` (sin unarchive) | Oculto visualmente pero accesible directo por API |
| F13 | BAJO | Iconos/`normalize`/`buildQuery`/dashboards/shells | Componentes duplicados (SVG ×6, queries ×3, shells ×5) |
| F14 | BAJO | `Login.jsx:154-176,254-262`, `EditorDashboard.jsx:53-62,99-100` | Estado solo local + doble vía navegación (props + `CustomEvent`) + props obsoletas |

---

## 2. Hallazgos detallados

### F01 — CRÍTICO — Navegación, rutas y recarga: sin router, estado en memoria
- **Archivo:** `App.jsx:3`, `Login.jsx:264-283`, `Dashboard.jsx:76-104`, `EditorDashboard.jsx:50-100`, `ReviewerDashboard.jsx:33-86`
- **Componente:** `App→Login→Dashboard/*` + `activeView` local
- **Problema:** No hay `react-router` (ni `wouter`); la “ruta” es `useState('dashboard'|'document'|...)`. Recargar pierde vista/filtros/página/selección (vuelve a `dashboard`); no hay deep-link/bookmark/historial (atrás del navegador sale de la app); multi-rol solo entra a la primera rama (`admin→editor→reviewer→reader`, `return` encadenados) y oculta los otros dashboards sin selector.
- **Evidencia:** `App.jsx: return <Login/>`; `Login.jsx:269-283` cuatro `if (...) return <XDashboard/>`; `Dashboard.jsx:101-104 navigate(view){setActiveView(view)}` sin URL.
- **Impacto:** Soporte imposible (“pásame el link”), F5 en edición pierde borrador, usuarios multi-rol creen que les faltan permisos.
- **Solución:** Router (`/admin/documentos`, `/editor/documentos/:id`, ...) + `AuthContext` + `ProtectedRoute` + persistir `?q=&page=` en URL.

### F02 — ALTO — Pantallas en estado incorrecto: abren el primer registro, no el seleccionado
- **Archivo:** `VersionsView.jsx:27-30`, `EditorVersionsView.jsx:56-59`, `ReaderDocumentView.jsx:24-27`, `ReaderVersionHistoryView.jsx:47`, `ReviewerDocumentReviewView.jsx:42-45`, `ReviewerVersionComparisonView.jsx:63`
- **Componente:** Vistas de detalle/historial/comparación
- **Problema:** Si no reciben `id` (navegación sin parámetro, recarga, o prop `null`), hacen `GET /api/.../?limit=1` y usan `results[0]` como si fuera el seleccionado. `VersionsView` ignora qué documento venía de `DocumentsView`; `ReviewerDocumentReviewView` ignora `reviewId` nulo y abre la primera del inbox; `ReaderDocumentView` abre el primer publicado.
- **Evidencia:** `const list = await apiRequest('/api/documents/?limit=1'); const first = list.results?.[0]` (×3); `selectedId = list.results?.[0]?.id` (×2).
- **Impacto:** Publicar/comparar/aprobar sobre documento equivocado; trazabilidad rota; el checklist pendiente ya pedía corregirlo.
- **Solución:** Exigir `id` por ruta/prop; si falta, mostrar selector vacío (no auto-elegir); pasar `documentId/reviewId` siempre desde el padre.

### F03 — ALTO — Formularios con validación incompleta / solo cliente / incompletos
- **Archivo:** `DocumentsView.jsx:318-348`, `UsersView.jsx:28,99-110`, `EditorDocumentEditView.jsx:106-115,164-189`, `ReviewerDocumentReviewView.jsx:92-120`, `ReportsView.jsx:91-101`, `SettingsView.jsx:65-86`
- **Componente:** Crear documento/usuario, borrador, revisión, reportes, settings
- **Problema:**
  - Crear documento: `FormData` con lo que haya (`if (value) append`), sin `required`/`pattern` en cliente para `code ^[A-Z0-9_-]+$`, `title`, `area_id/type_id`, `file`; el error llega tarde del backend (400) y el modal no mapea `field→input`.
  - Crear usuario: solo `username/email/nombres/apellidos/temporary_password` (sin `area_id`, sin fuerza de clave en cliente, un solo `role_ids[0]` aunque el backend acepta N).
  - Borrador: `saveDraft` envía `title/description/metadata` sin validar longitud ni `DOCUMENT_VERSION_LOCKED` hasta el 400.
  - Revisión: `decide('return')` permite `comment=''` en cliente (backend exige observación → 400 tardío); `checklist.split('\n')` sin `maxLength` por ítem hasta el 400.
  - Reportes/schedule: sin validar `date_from<=date_to`, `next_run` pasado; settings `extensions.join(',')` frágil si ya es string.
- **Evidencia:** `Object.entries(form).forEach(([k,v])=>{if(v) body.append(k,v)})`; `initialForm` sin `area_id/role_ids`; `decide(action, comment)` sin pre-check de `return/reject`.
- **Impacto:** Rondas backend inútiles, mensajes genéricos, datos a medio guardar.
- **Solución:** Esquema compartido (zod/yup) espejo del serializer + errores por campo + deshabilitar submit inválido.

### F04 — ALTO — Botones sin funcionalidad / acciones simuladas
- **Archivo:** `VersionsView.jsx:71`, `EditorDocumentEditView.jsx:229`, `Dashboard.jsx:117,122`, `EditorDashboard` campana
- **Componente:** Versiones, flujo, notificaciones
- **Problema:** `VersionsView` “Subir nueva versión” es `<button>` sin `onClick`; “Ver versión” (ojo) sin `onClick` (solo descargar funciona); `EditorDocumentEditView` “Ver flujo del documento” hace `onAction('...no está disponible en el backend actual.')`; “Checklist/Comentarios” pintan `Sin datos registrados` fijos (no leen `documentReviews`); campana `dashboard-notification`/`editor-notification` sin panel (en inbox sí hay notificaciones pero no enlazan al documento).
- **Evidencia:** `<button type="button">Subir nueva versión</button>` sin handler (`VersionsView.jsx:71`); `onClick={() => onAction('El flujo...')}`.
- **Impacto:** Usuario cree que operó; soporte recibe “no pasa nada al pulsar”.
- **Solución:** Deshabilitar con `title="Próximamente"` + `aria-disabled` o implementar (subida ya existe en `EditorVersionsView` para reutilizar); enlazar checklist/comentarios reales.

### F05 — ALTO — Destructivas/op. sensibles sin confirmación (inconsistente)
- **Archivo:** `BackupsView.jsx:105`, `UsersView.jsx:128,137,147`, `RolesView.jsx:109` (sí confirman) vs resto (no)
- **Componente:** Documentos/versiones/reportes/revisión
- **Problema:** Solo 4 acciones piden `window.confirm` (restore backup, baja usuario, revocar sesión/dispositivo, activar permiso). Sin confirm: archivar/eliminar documento, publicar versión, aprobar/devolver/rechazar, resolver observación, guardar permisos explícitos (sobrescribe ACL), generar reporte/schedule, guardar settings SMTP. `window.confirm` además bloquea el hilo y no es accesible.
- **Evidencia:** `grep window.confirm` solo 5 hits citados; `publishVersion`, `decide`, `savePermissions`, `deactivate?` en `DocumentsView` sin diálogo propio visible.
- **Impacto:** Click accidental = publicación/borrado lógico/cierre masivo de revisiones (ver B05).
- **Solución:** Modal de confirmación uniforme con resumen + `requirement` (escribir código) para publicar/baja/restore + `destructive` styling.

### F06 — ALTO — Manejo incorrecto de errores + sesión
- **Archivo:** `api.js:1-30`, `Login.jsx:180-252`, `Dashboard.jsx:88-95`
- **Componente:** `apiRequest/errorMessage`, `handleLogin/Logout`
- **Problema:** `errorMessage` pierde `code` (ver P05 API): `PASSWORD_CHANGE_REQUIRED`, `REVIEW_NOT_PENDING`, `CHECKLIST_INCOMPLETE` se muestran como toast genérico sin rama (p. ej. 401 expirada no redirige a login, deja dashboard con `loadError` y botones muertos). `apiRequest` ante `204` devuelve `null` (bien) pero ante binario (`FileResponse/CSV/.sdbk`) hace `json().catch(()=>({}))` → `{}` silencioso. `handleLogout` en fallo solo `setError` sin limpiar `user` (sesión fantasma). `/me` inicial sin `loading` (flash login → dashboard).
- **Evidencia:** `if (!response.ok) throw new Error(errorMessage(data))`; `catch{ setError } finally{ setSubmitting(false) }` sin `if (code==='PASSWORD_CHANGE...')`.
- **Impacto:** Usuario bloqueado sin saber por qué; export/descarga que falla parece éxito.
- **Solución:** `ApiError{code,fields,status}` + interceptor 401 → `setUser(null)` + `location='#/login?expired=1'`; `blob()` para binarios; no tragar `catch(()=>{})` en `read()`.

### F07 — MEDIO — Estados que no se actualizan / datos obsoletos por doble filtrado en cliente
- **Archivo:** `Dashboard.jsx:97-98`, `DocumentsView.jsx:234-268`, `EditorDashboard.jsx:71-75`, `UsersView.jsx:94-97`, `AuditView.jsx:80-83`, `ReportsView.jsx:112`
- **Componente:** Búsquedas, conteos, métricas
- **Problema:** Backend ya filtra/pagina, pero el cliente **re-filtra** lo cargado: `Dashboard` filtra `recent_documents` (solo recientes, no todo); `DocumentsView.counts` cuenta estados **sobre la página** (25) no sobre `total`; `EditorDashboard` trae `limit=100` y filtra en memoria (más de 100 → invisibles); `UsersView.visibleUsers` + `AuditView.visibleEvents` + `ReportsView.searchableRows` igual. Cambiar filtro global no recarga (cada vista tiene su `query` local además de `globalQuery`).
- **Evidencia:** `documents.filter(...).length` para `counts`; `setTotal(data.count)` pero `counts` de `documents` (página).
- **Impacto:** “Total 120 pero gráfica suma 25”, búsqueda que no encuentra, paginación que miente (`Mostrando X de Y` con X de página).
- **Solución:** Una fuente: filtros → backend (`buildDocumentQuery`) + conteos por endpoint agregados; o documentar “filtro local sobre página”.

### F08 — MEDIO — Operaciones duplicadas / updates optimistas falsos
- **Archivo:** `DocumentsView.jsx:331-333`, `ReportsView.jsx:81-89`, `BackupsView.jsx:75-80`, `ReviewerDocumentReviewView.jsx:85-96`, `ReaderDocumentView.jsx:40-47`, `VersionsView.jsx:52-60`
- **Componente:** Crear/generar/respaldar/decidir/favorito/publicar
- **Problema:** `createDocument` hace prepend optimista + `total+1` sin revalidar orden/filtros (aparece aunque no coincida, rompe `PAGE_SIZE`). `generateReport/executeBackup/decide/toggleFavorite/publishVersion` sin `Idempotency-Key` y con `pending` parcial (`saveDraft` **sin** `saving`, `toggleFavorite` sin pending → doble click duplica; `decide` comparte `comment` para 3 acciones). `publishVersion` marca local `PUBLICADO` sin recargar timeline/versiones.
- **Evidencia:** `setDocuments([created,...current]); setTotal(+1)`; `saveDraft` sin `setSaving`; `toggleFavorite` sin `disabled`.
- **Solución:** `pending` por acción + deshabilitar + `Idempotency-Key: crypto.randomUUID()` + revalidar (`reload()` tras mutar, no patch local).

### F09 — MEDIO — Loading inexistente / parcial + problemas al recargar
- **Archivo:** `Login.jsx:180-189`, `EditorDocumentEditView.jsx:106-115`, `ReaderDocumentView.jsx:32`, `VersionsView.jsx:65-66`
- **Componente:** `me`, borrador, lectura, versiones
- **Problema:** `me` sin `loading` (flash). `saveDraft` sin spinner (doble guardado). `read()` con `.catch(()=>{})` tragado (si falla, ni error ni reintento). `VersionsView` si `error && !document` muestra solo error sin reintentar; si `!document` muestra “Cargando...” infinito si `limit=1` devuelve vacío con `200` (no es error). Recarga en `edit-document`/`review-document` pierde `selectedDocument/selectedReviewId` (F01) y cae a F02.
- **Evidencia:** `apiRequest(.../read/, ...).catch(()=>{})`; `if (!document) return <p>Cargando...</p>`.
- **Solución:** `loading` global por vista + `Retry` + `Empty` diferenciados; no tragar `catch`.

### F10 — MEDIO — Nulos e inconsistencias A↔B ya visibles en UI
- **Archivo:** `documentApi.js:12-29`, `RolesView.jsx:66-69`, `ReportsView.jsx:103-110`, `BackupsView.jsx:79`
- **Componente:** `normalizeDocument`, roles, descargas
- **Problema:** `normalizeDocument` pone `Sin código/Sin tipo/Sin área/Sin estado/—` (bien) pero enmascara el roto P01 (`version:'—'`, `downloadUrl:null` → botón descargar silenciosamente no hace nada por `if (!url) return false`). Roles/permisos mezclan `name/nombre`, `module/modulo`, `code/codigo` con `||` (funciona, pero si ambos existen y difieren muestra el inglés). `download(report)` usa `report.download_url` relativa sin `credentials` check (misma pestaña, bien) pero `downloadFile(url)` con `window.open` puede ser bloqueado como popup.
- **Evidencia:** `downloadUrl: ... || null` + `if (!url) return false`; `role.nombre || role.name`.
- **Solución:** Contrato único (ver P13 API) + `disabled` si `!downloadUrl` + `a[download]` con `blob` en vez de `window.open`.

### F11 — MEDIO — Permitido visualmente, prohibido en backend (sin `disabled` real)
- **Archivo:** `EditorDocumentEditView.jsx:106-120,230`, `VersionsView.jsx:52-60`, `ReviewerDocumentReviewView.jsx:92-103,147-153`
- **Componente:** Borrador, publicar, decidir, checklist
- **Problema:** `Guardar borrador`/`Enviar a revisión` siempre clicables; si `directEditLocked` solo muestran `onAction(...)` (no `disabled`, no tooltip). `Publicar` lista versiones `APROBADO` sin comprobar permiso `aprobar` en cliente (backend 403 tardío). `Devolver/Rechazar` no pre-exigen comentario (backend 400). Checklist se puede pulsar aunque no seas asignado (backend 403/404).
- **Evidencia:** `if (directEditLocked(...)) return onAction(...)` dentro del handler, no en `disabled`.
- **Solución:** Derivar `canEdit/canPublish/canDecide/canCheck` de `user.permissions + status + assignee` y `disabled + title`.

### F12 — MEDIO — Oculto visualmente pero accesible directo (superficie sin UI)
- **Archivo:** `UsersView.jsx` (sin lock), `ReportsView.jsx:123-124` (sin edit/delete), `DocumentsView` (sin unarchive), `SettingsView.jsx:65-71` (backups redirige)
- **Componente:** Endpoints huérfanos de UI
- **Problema:** Existen y funcionan por API pero sin botón: `POST admin/users/:id/lock/`, `PATCH/DELETE reports/schedules/:id/`, `POST documents/:id/unarchive/`, `PUT admin/users/:id/roles/`, `GET admin/users/:id/sessions/` (sí hay en drawer? parcial), `POST settings/integrations/:provider/test/` (solo algunos). Inverso: `EditorDocumentEditView` muestra “Asignar revisor” aunque sin `PENDIENTE` (luego `disabled` por `some`, bien) pero `ReviewAssignmentPanel` lista `pendingReviews[0]` por defecto.
- **Evidencia:** `grep` UI sin `lock`, sin `schedule edit/delete`, sin `unarchive`.
- **Impacto:** Funcionalidad muerta o solo vía curl; tests manuales la omiten.
- **Solución:** Mapear matriz permiso→botón; o despublicar endpoint (410) si no se quiere exponer.

### F13 — BAJO — Componentes duplicados (estado y código)
- **Archivo:** `*Icon` ×8, `normalizeDocument`/`buildDocumentQuery` + filtros ×3, `Dashboard/EditorDashboard/ReviewerDashboard/ReaderDashboard` shells, `VersionsView/EditorVersionsView/ReaderVersionHistoryView`
- **Problema:** Mismo SVG/filtro/tabla copiado (PAGE_SIZE 25 vs 10, `typeTones` vs nada, `ordering` vs `classification`). Cambiar un filtro obliga a 3 edits (ya divergieron: lector tiene `favorite`, editor no; documentos tiene `responsible`, lector no).
- **Evidencia:** `DocumentViewIcon/LibraryIcon/EditorIcon/ReviewerIcon/VersionIcon...`; `buildDocumentQuery` reutilizada pero cada vista redeclara `PAGE_SIZE/options/counts`.
- **Solución:** `components/{Icon,DocumentTable,DocumentFilters,Shell,Empty,Error,Confirm}.jsx` + `hooks/usePaginatedQuery.js`.

### F14 — BAJO — Estado global/local: todo local + doble vía
- **Archivo:** `Login.jsx:154-176,254-262`, `EditorDashboard.jsx:53-62,99-100`, `Reader*Shell.jsx`
- **Componente:** `user/query/notice/selected*`, overlays lector
- **Problema:** Sin contexto/store: `user` baja por props 3 niveles; `query` vive en cada dashboard + `globalQuery` del padre (desincronizados); `selectedDocument` (lista) vs `loadedDocument` (detalle) divergen tras `saveDraft` (detalle actualiza, lista no hasta reload); lector con 5 booleanos + `CustomEvent reader-*-open` además de `onNavigate` (doble fuente, pueden pelear).
- **Evidencia:** `useState(document?.title)` inicial una vez (si cambia `document` sin desmontar, stale); `openLibrary/openDocument/...` listeners + `openReaderView` prop.
- **Solución:** `AuthContext + QueryContext + ToastContext`; overlays como rutas anidadas; `key={document.id}` para reset.

## 3. Veredicto

- **Navegación/estado:** frágil por diseño (F01/F14); recarga = pérdida.
- **Datos:** riesgo de operar sobre registro equivocado (F02) + conteos/filtros locales mentirosos (F07) + optimismo sin revalidar (F08).
- **Formularios/errores/loading/sesión:** incompletos y tardíos (F03/F06/F09); destructivas a medias (F05).
- **Contratos:** rotos en versión/descarga (F10/P01) + bilingües.
- **Permisos UI:** permisiva de más y a la vez incompleta (F11/F12).
- **Prioridad:** F01→F02→F06→F03/F05→F07/F08→F10/F11→resto. Sin router + contratos (P01/P13 API) nada más es estable.
