# AUDITORIA_CODIGO_MUERTO — Sin eliminar nada

> Alcance: solo detección (archivos/funciones/componentes/endpoints/vars/imports/clases/config/comentarios/implementaciones/duplicados/nombres/modelos). **Nada eliminado.** Antes de marcar cada hallazgo se buscaron referencias estáticas **y** dinámicas: imports, `urls.py`, `permission_classes`, `settings` por string, descubrimiento Django (`admin`, `migrations`, `management/commands`, `tests.py`), `serializers` por reflexión DRF, códigos de permiso por string, `fetch/apiRequest` en frontend (incl. `window.open`), y `dist/` compilado. Sin runner de cobertura; clasificación honesta abajo.
> Fecha: 2026-09-05.

## 1. Tabla resumen

| ID | Categoría | Elemento | Estado |
|----|-----------|----------|--------|
| M01 | imports sin uso | `backend/urls.py:7 mimetypes`, `:4 HttpResponseNotFound`, `:10 logger` | CONFIRMADO COMO NO UTILIZADO |
| M02 | funciones sin referencias (prod) | `documentos/permissions.py:21 HasDocumentalPermission` (solo tests), `documentos/models.py:7 document_file_upload_to` (solo migración vieja + test) | CONFIRMADO COMO NO UTILIZADO |
| M03 | modelos duplicados (misma tabla) | `Area ↔ AreaCatalogo` (`areas`), `TipoDocumento ↔ TipoDocumentoCatalogo` (`tipos_documento`) (`models.py:99/135/369/381`) | CONFIRMADO COMO NO UTILIZADO (un lado por par) |
| M04 | configuraciones antiguas / DDL huérfano | Migración `0004` tabla `archivos_documentos`; migración `0010` tablas `reportes_generados` / `programaciones_reportes` (no-`v2`) | CONFIRMADO COMO NO UTILIZADO (tablas, no archivos) |
| M05 | archivos aparentemente no utilizados | `frontend/src/App.css`, assets `hero.png`, `react.svg`, `vite.svg`, `icons.svg` (favicon sí se usa) | PROBABLEMENTE NO UTILIZADO |
| M06 | implementaciones antiguas | `iniciar.bat` (bash con extensión `.bat`, `cd backend`, `/api/hola-mundo/` inexistente) vs `iniciar-unificado.bat` vigente | PROBABLEMENTE NO UTILIZADO |
| M07 | endpoints no utilizados (sin UI) | `POST admin/users/:id/lock/`, `POST documents/:id/unarchive/`, `POST reviews/comments/:id/resolve/`, `POST notifications/.../read/`, `POST notifications/read-all/`, `PATCH/DELETE reports/schedules/:id/` | PROBABLEMENTE NO UTILIZADO (vivos por ruta directa/tests) |
| M08 | funcionalidades duplicadas (no muertas, peso muerto) | `DocumentsView↔EditorDocumentsView`, `VersionsView↔EditorVersionsView↔ReaderVersionHistoryView`, `ReportsView↔EditorBasicReportsView↔ReviewerBasicReportsView`, 4 dashboards por rol | PROBABLEMENTE NO UTILIZADO (consolidar, no borrar a ciegas) |
| M09 | nombres contradictorios | `code/codigo`, `title/nombre`, `status/estado`, `responsible/creado_por`, `file/archivo/version`, `reviewer/revisor`, `reader/lector`, `audit/bitacora`, `schedule/programacion`, `backup/respaldo`, `REVISOR/REVIEWER` | NO SE PUEDE CONFIRMAR (convención, no muerte) |
| M10 | código comentado obsoleto | `documentos/admin.py:3` placeholder, `reports_views.py:48-49` (`pass` en excepción — en realidad vigente) | NO SE PUEDE CONFIRMAR |
| M11 | variables innecesarias / componentes abandonados | Sin hallazgo confirmable; candidatos (`backup_views.latest`, `Login remember`, shells) **todos usados** | NO SE PUEDE CONFIRMAR |
| M12 | artefactos locales (no código muerto) | `.env`, `db.sqlite3` (gitignorados, presentes), `.playwright-mcp/page-*.yml`, `frontend/dist/`, `build.sh` vs `render.yaml` | NO SE PUEDE CONFIRMAR (ver §3) |

## 2. Detalle con evidencia y chequeo dinámico

### M01 — CONFIRMADO COMO NO UTILIZADO — Imports/variables sin uso en `backend/urls.py`
- **Elemento:** `import mimetypes` (`:7`), `HttpResponseNotFound` (`:4`), `logger = getLogger` (`:10`).
- **Chequeo dinámico:** `MIME_TYPES` es un dict manual (`:14-26`); ninguna llamada a `mimetypes.guess_type`; ningún `HttpResponseNotFound(` en el repo; ningún `logger.` en el archivo. Django no los invoca por string.
- **Evidencia:** lectura completa `backend/urls.py:1-55`.
- **Riesgo si se quita:** nulo. Recomendación: quitar en commit de limpieza con `ruff --select F401`.

### M02 — CONFIRMADO COMO NO UTILIZADO — Símbolos vivos solo fuera de prod
- **a) `HasDocumentalPermission` (`documentos/permissions.py:21`).** Definida, importada solo por `documentos/tests.py:70,2107,2117`. Ninguna vista la lista en `permission_classes` (todas usan `IsAuthenticatedAndPasswordCurrent`); `settings.DEFAULT_PERMISSION_CLASSES` tampoco. DRF la instanciaría solo si figurase por import path — no figura.
- **b) `document_file_upload_to` (`documentos/models.py:7`).** En runtime ningún `FileField(upload_to=...)` la usa (verificado: único `upload_to` del repo está congelado en `migrations/0004:49` para la tabla vieja `archivos_documentos`); el código actual construye `storage_name` a mano (`document_views.py:434,846`). Referencias: migración vieja + `tests.py:69,1951`.
- **Riesgo:** nulo en prod; quitar `b)` exige dejar la migración intacta (las migraciones congelan la referencia histórica).

### M03 — CONFIRMADO COMO NO UTILIZADO — Modelos duplicados sobre la misma tabla
- **Elementos:** `Area (models.py:99→areas)` ↔ `AreaCatalogo (:381→areas)`; `TipoDocumento (:135→tipos_documento)` ↔ `TipoDocumentoCatalogo (:369→tipos_documento)`.
- **Chequeo:** `db_table` idéntico por par (grep §1); usos reales: `Documento.area/tipo_documento` apuntan a los `*Catalogo`; `Area/TipoDocumento` (managed) solo aparecen en catálogos gestionados/contraints, no en el path documental caliente. Dos definiciones compiten por el mismo `db_table` (deriva `managed`).
- **Riesgo si se quita:** medio — elegir un lado por tabla con migración `SeparateDatabaseAndState`; mientras tanto documentar cuál manda.

### M04 — CONFIRMADO COMO NO UTILIZADO — DDL huérfano de implementaciones antiguas (tablas, no archivos)
- **Elementos:** `migrations/0004`: tabla `archivos_documentos` (hoy el modelo es `versiones_documento`); `migrations/0010`: `reportes_generados` / `programaciones_reportes` (hoy solo existen modelos `*_v2`, `models.py:693,715`).
- **Chequeo dinámico:** el migrador Django **sí** ejecuta estos archivos (descubrimiento por directorio + dependencias), así que los archivos están vivos; lo muerto son las **tablas** que crean (ningún modelo actual las mapea; `grep` solo las encuentra en esas migraciones).
- **Riesgo:** no borrar migraciones aplicadas; en su lugar, migración de retirada que elimine las tablas huérfanas tras backup.

### M05 — PROBABLEMENTE NO UTILIZADO — Archivos frontend sin referencia
- **Elementos:** `frontend/src/App.css` (`App.jsx:1-7` importa solo `./Login`, no el CSS); assets `hero.png`, `react.svg`, `vite.svg`, `icons.svg` (grep en `frontend/` —incl. CSS— solo halla `favicon.svg` en `index.html:5` y su copia en `dist/`).
- **Chequeo dinámico:** Vite solo empaqueta lo importado o citado; `url(...)` en CSS habría aparecido en el grep; `index.css` sí está importado por `main.jsx` (vivo). Queda una duda menor (referencia construida por string), de ahí “probablemente”.
- **Riesgo:** nulo (assets/CSS no referenciados no entran al bundle).

### M06 — PROBABLEMENTE NO UTILIZADO — `iniciar.bat` (implementación antigua)
- **Elemento:** `iniciar.bat` (23 lín, shebang `#!/bin/bash` con extensión `.bat`, `cd backend`, endpoint inexistente `/api/hola-mundo/` `:17`).
- **Chequeo:** el flujo vigente es `iniciar-unificado.bat` (`runserver` unificado `:8000`, ver contexto §21); `render.yaml`/`build.sh` no lo citan. Podría seguir usándose manualmente en alguna máquina — de ahí “probablemente”.
- **Riesgo:** bajo; archivar, no borrar, hasta confirmar con el equipo.

### M07 — PROBABLEMENTE NO UTILIZADO — Endpoints vivos sin UI (no muertos)
- **Elementos y prueba de ausencia en UI:** `POST .../lock/` (grep UI: 0), `POST .../unarchive/` (0), `POST .../comments/:id/resolve/` (UI comenta pero no resuelve), `POST .../notifications/.../read/` + `read-all/` (inbox solo `GET`), `PATCH/DELETE .../schedules/:id/` (UI solo lista+crea).
- **Chequeo dinámico:** rutas registradas en `documentos/urls.py:24,41,63,93-94` + `ReportScheduleDetailView` (`reports_views.py:562,575`); varias tienen cobertura en `tests.py` (p. ej. unarchive). Son **alcanzables por ruta directa/curl**, así que no se marcan confirmados.
- **Riesgo si se quitan:** romperían clientes/scripts externos; antes: o añadir UI o despublicar con `410`.

### M08 — PROBABLEMENTE NO UTILIZADO — Funcionalidades duplicadas (peso, no muerte)
- **Elementos:** listados (`DocumentsView` 790 lín ↔ `EditorDocumentsView`), historiales (`VersionsView` ↔ `EditorVersionsView` ↔ `ReaderVersionHistoryView`), reportes (×3), dashboards (×4), shells lector (×5).
- **Chequeo:** cada copia está importada por su dashboard (vivas). El problema es duplicación, no muerte.
- **Riesgo:** consolidar mal rompe un rol; tratar como refactor, no como borrado.

### M09 — NO SE PUEDE CONFIRMAR — Nombres contradictorios
- **Elementos:** ES↔EN (`codigo/code`, `nombre/title/name`, `estado/status`, `creado_por/responsible`, `archivo/file/version`, `revisor/reviewer`, `lector/reader`, `bitacora/audit`, `programacion/schedule`, `respaldo/backup`) + `REVISOR`/`REVIEWER` (aceptados ambos en `Login.jsx:266`).
- **Motivo:** es deuda de convención con mapeos explícitos (`normalizeDocument`, `RolesView ||`), no código sin ejecutar. Confirmar exigiría renombrado con codemod + contratos OpenAPI.

### M10 — NO SE PUEDE CONFIRMAR — Comentarios/placeholders
- **Elementos:** `documentos/admin.py:3` (`# Register your models here.`, plantilla Django — el módulo **sí** se importa por autodiscovery aunque no registre nada); `reports_views.py:48-49` (`class ReportSnapshotError(Exception): pass` — excepción vigente, no obsoleta).
- **Motivo:** sin rastro de código comentado real (`grep TODO/FIXME/HACK` vacío salvo esto).

### M11 — NO SE PUEDE CONFIRMAR — Variables innecesarias / componentes abandonados
- **Revisados y en uso:** `backup_views.latest` (métricas), `Login remember` (payload login), todos los `*Shell` (montados en `Login.jsx:282`), `ReviewerVersionComparisonView/EditorActivityLogView/DocumentPermissionsPanel` (importados por sus dashboards). Sin candidato confirmable sin analizador de flujo (p. ej. `ruff F841`/`vulture`) + cobertura.

### M12 — NO SE PUEDE CONFIRMAR — Artefactos y duplicación aparente de build
- **Elementos:** `.env` (164 B) y `db.sqlite3` (128 KB) presentes pero gitignorados (verificado `git check-ignore`); `.playwright-mcp/page-*.yml` (~190 snapshots, sin suite); `frontend/dist/` (salida de build); `build.sh` vs `buildCommand` de `render.yaml` (misma secuencia `npm ci → build → pip → collectstatic → migrate`: duplicación intencional local/CI, ambos referenciados en sus contextos).
- **Motivo:** no es código muerto; `.env` no se leyó. No tocar.

## 3. Nota metodológica (qué dinámicas se comprobaron)

- Django: `admin.py` (autodiscovery), `migrations/*` (grafo + `RunSQL`), `management/commands` (invocación por nombre en `render.yaml`), `permission_classes` y `serializers` (resolución por clase, no por string salvo settings), `tests.py` (descubrimiento `test*.py`).
- Frontend: `import` estáticos + `apiRequest('...')`/`window.open('...')` literales + `url(...)` en CSS; `dist/` excluido del veredicto (artefacto).
- Códigos de permiso/acción como strings (`'documentos.gestionar'`, `'PENDIENTE'`) se buscaron como literales antes de declarar nada sin uso.
