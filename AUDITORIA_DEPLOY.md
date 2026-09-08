# AUDITORIA_DEPLOY — Configuración, ambientes y despliegue

> Alcance: archivos de configuración, env, ambientes (dev/test/prod), Docker, build, scripts, CI/CD, migraciones, dependencias, secretos, puertos, URLs, DB, almacenamiento y logging. Se responde si cada punto puede impedir el despliegue, divergir dev/prod, exponer secretos, usar valores inseguros o fallar al arrancar. Sin modificar nada; `.env` no leído (solo existencia + `.env.example` + `.gitignore`).
> Fecha: 2026-09-05.

## 1. Inventario (qué configura qué)

| Pieza | Archivo(s) | Rol |
|---|---|---|
| Settings únicos por env vars | `backend/settings.py:1-310` | Dev/test/prod con `ENVIRONMENT/DEBUG`, fail-fast parcial |
| Env local (no leído) | `.env` (existe) + `.env.example:1-33` | Plantilla dev limpia, sin secretos |
| Deploy Render | `render.yaml:1-164` (web + 2 cron + PG) | Build/start/health/env por servicio |
| Build | `build.sh:1-7` ≈ `render.yaml:5` (misma secuencia) | `npm ci → vite build → pip → collectstatic → migrate` |
| Arranque | `backend/wsgi.py:16`, `asgi.py:16` (solo defines), `manage.py:9` | `gunicorn backend.wsgi:application --bind 0.0.0.0:$PORT` |
| Scripts locales | `iniciar-unificado.bat` (vigente), `iniciar.bat` (obsoleto, ver D11) | `runserver :8000` vs doble proceso |
| Frontend build | `frontend/package.json:6-10`, `vite.config.js:5-13` (`base /static/`, proxy `/api→127.0.0.1:8000`) | `dist/` **commiteado** (5 ficheros con hash) |
| Migraciones | `documentos/migrations/0001-0019` (`SeparateDatabaseAndState` + `RunSQL IF NOT EXISTS`, reversa `noop`) | Esquema `gestion_documental` (creado en `0002:16`) |
| Dependencias | `requirements.txt` (12, pin `==`), `frontend/package.json` (`^` + lock) | Sin `runtime.txt/.python-version/.nvmrc`, sin hashes |
| Docker/CI | Inexistentes (sin `Dockerfile`, sin `.github/`) | Solo Render + checks manuales (`backend-checklist.txt:9-12`) |
| Logging | `settings.py:283-310` (consola `operational`, `django.request ERROR`, `documentos INFO`) | Solo stderr (bien Render, sin rotación local) |

## 2. Hallazgos (¿bloquea? ¿diverge? ¿expone? ¿inseguro? ¿falla al arrancar?)

### D01 — ALTO — Sin Docker ni CI ni pins de runtime: despliegue no reproducible [impide/diverge/falla]
- **Evidencia:** no hay `Dockerfile/docker-compose/.dockerignore`, ni `.github/`; ni `runtime.txt/.python-version/.nvmrc/engines`; `frontend` usa `^19.2.8/^8.2.2` (lock sí commiteado, bien).
- **Riesgo:** Render puede cambiar Python/Node mayor y romper `cryptography/boto3/vite`; sin CI nadie lo detecta antes de prod. `backend-checklist.txt:9-12` sustituye CI con checks manuales.
- **Solución:** fijar `runtime.txt` (`python-3.12.x`) + `engines`/`nvmrc` (node 20/22 LTS verificado) y workflow mínimo `check + check --deploy + test + vite build`.

### D02 — ALTO — Crons declarados pero inoperativos + env divergente [impide/diverge]
- **Evidencia:** `render.yaml:60-159` dos cron `starter` (pago); checklist `:42` admite “falta conectar el Blueprint y configurar facturación”. Env del cron-reportes (`:119-157`) **omite** `BACKUP_ENCRYPTION_KEY`, `EMAIL_*`, `CORS/CSRF`; el de respaldos omite `EMAIL_*`/`CORS`. Web (`:8-56`) sí los tiene.
- **Riesgo:** en prod no hay respaldos/reportes programados aunque la UI diga “próxima ejecución”; el cron corre con defaults distintos (SMTP desactivado, CORS vacío) y falla o se comporta distinto que la web.
- **Solución:** conectar Blueprint + facturación, o documentar “manual-only”; unificar env por anclas YAML y test de paridad web/cron.

### D03 — ALTO — `BACKUP_ENCRYPTION_KEY` opcional con fallback inseguro [inseguro/falla-silenciosa]
- **Evidencia:** `settings.py:216` default `''`; `backup_service` cae a `SHA256(SECRET_KEY)`; `render.yaml:39,105` es `sync:false` sin `generateValue` (a diferencia de `SECRET_KEY:9`).
- **Riesgo:** el deploy **arranca y cifra** sin la clave (diverge de lo esperado, irrecuperable/rotación imposible — ver `AUDITORIA_SEGURIDAD.md:S02`). No expone el secreto (bien), pero permite el valor inseguro.
- **Solución:** `if not DEBUG and not BACKUP_ENCRYPTION_KEY: raise ImproperlyConfigured` + `generateValue` o guía de `base64(32B)`.

### D04 — ALTO — Testing sin ambiente: imposible validar antes de desplegar [impide/diverge]
- **Evidencia:** sin settings/DB de test (los tests usan la misma settings dev), sin `pytest.ini/coverage`, sin Postgres local (`backend-checklist.txt:37`); `settings.py:153-179` en dev tolera `DB_*` ausentes con defaults `localhost` sin servidor → `test` falla local.
- **Riesgo:** `migrate`/`test` solo se prueban en Render; regresiones llegan a prod.
- **Solución:** servicio `db-test` o `TESTING` con sqlite/PG efímero + `coverage` en CI.

### D05 — MEDIO — `frontend/dist/` commiteado con hashes [diverge/falla]
- **Evidencia:** `git ls-files frontend/dist` → `index-Bo0g-cI8.css`, `index-DXmwqQGI.js` + `index.html/favicon/icons`; `frontend/.gitignore:10-14` ignora `dist-ssr` pero **no** `dist` (“Render serves the committed bundle”).
- **Riesgo:** cada build genera hashes nuevos y deja huérfanos versionados; conflictos en merges; `collectstatic`/`WhiteNoise` pueden servir `index.html` viejo si el build no corrió; `STATICFILES_DIRS=frontend/dist` enmascara en local un `dist` desactualizado (el `check` del checklist pasa con bundle viejo).
- **Solución:** no commitear `dist/` (lo genera el build) o commitearlo con limpieza (`rimraf dist` pre-build) + `manifest` verificado.

### D06 — MEDIO — Migraciones solo-hacia-adelante [falla al revertir]
- **Evidencia:** `0002:16 CREATE SCHEMA IF NOT EXISTS` (bien); `0010/0011/0012/0013` y `0014-0019` con `RunSQL(..., reverse_sql=noop)` + `SeparateDatabaseAndState` + `managed=False`.
- **Riesgo:** `migrate` avanza bien (idempotente), pero `migrate <anterior>` **no revierte DDL** (rollback roto) y `managed=False` oculta deriva fuera de `migrate` (ver `AUDITORIA_DATABASE.md:D05`).
- **Solución:** documentar “sin rollback DDL; recuperar por backup `.sdbk`” + `sqlmigrate --check` en CI.

### D07 — MEDIO — Arranque frágil por parseos sin `ImproperlyConfigured` [falla al iniciar]
- **Evidencia:** `settings.py:99 EMAIL_PORT int(...)`, `:184-187 AUTH_*/MAX_* int(...)`, `:149,176 DB_CONN_MAX_AGE int(...)` lanzan `ValueError` crudo (traceback) en vez del mensaje guiado que sí tienen `SECRET_KEY/DB/S3/CORS`.
- **Riesgo:** typo (`EMAIL_PORT=abc`) tumba web **y crons** a las 02:00/03:00 con log poco accionable.
- **Solución:** helper `env_int()` con mensaje `ImproperlyConfigured` + rangos (reusar los de `config_service`).

### D08 — MEDIO — Puertos/URLs hardcodeadas y host único [diverge/falla]
- **Evidencia:** web escucha `$PORT` (`render.yaml:6`, bien) pero scripts/proxy fijan `:8000/:5173` (`iniciar*.bat`, `vite.config.js:10`); `ALLOWED_HOSTS/CORS/CSRF` fijan un solo host `sistema-documental.onrender.com` (`:15-24`); B2 fijo en `settings.py:227-228` + ejemplo.
- **Riesgo:** dominio personalizado o preview-env → 400/CSRF; `iniciar.bat:17` anuncia `/api/hola-mundo/` inexistente; `cd backend` inexistente (el proyecto no tiene `backend/` como cwd con `manage.py` dentro) → el script obsoleto falla siempre.
- **Solución:** `ALLOWED_HOSTS/CORS/CSRF` por lista + `RENDER_EXTERNAL_HOSTNAME` (ya soportado) documentado; corregir o archivar `iniciar.bat`; health separada de API (`/healthz/`).

### D09 — MEDIO — DB/storage: defaults que divergen y plan free al límite [diverge/impide]
- **Evidencia:** `CONN_MAX_AGE=600` (`settings.py:149,176`, ejemplo `:15`) con PG `free` + gunicorn sin `--workers` (default 1, bien hoy; al escalar, conexiones clavadas); `DB_SSLMODE` vacío en ejemplo (dev bien, prod lo fuerza a `require`, bien); `STORAGE_BACKEND=filesystem` en ejemplo + `MEDIA_ROOT=media/` (dev) vs `s3` exigido en prod (`:237-241`, bien); `AWS_LOCATION=documentos` igual en web y crons (colisiones de claves si dos respaldos coinciden en minuto — `respaldo/{org}/{fecha}/{id}.sdbk` incluye id, bien).
- **Riesgo:** dev guarda en `media/` gitignorada (se pierde al limpiar); free-DB con retención/conexiones largas se agota; `filesystem` en prod falla tarde (en arranque, bien) pero el mensaje llega tras el build.
- **Solución:** validar storage/DB en `check --deploy` (ya se hace manual) + pasarlo a CI; `CONN_MAX_AGE=60-120` + `statement_timeout`; documentar que `media/` es efímero.

### D10 — BAJO — Secretos bien custodiados, con dos matices [expone: no]
- **Evidencia:** `.env` gitignorado (`:10`), `*.sqlite3/media/node_modules` ignorados; `.env.example` sin valores (solo `us-east-005`/endpoint público); Render `sync:false` para `AWS_*`/`BACKUP_*`/`EMAIL_*` y `generateValue` para `SECRET_KEY`.
- **Matices:** `.env` y `db.sqlite3` **existen en el checkout local** (verificado por existencia, contenido no leído) — riesgo solo si alguien fuerza `git add -f`; `EMAIL_*`/`BACKUP_*` ausentes en crons (D02) hacen que el cron opere con SMTP desactivado sin avisar.
- **Solución:** `git-secrets`/`gitleaks` en pre-commit + `git log --all -- .env` puntual.

### D11 — BAJO — Scripts/build duplicados y logging solo-consola [diverge]
- **Evidencia:** `iniciar.bat` (bash, `cd backend`, hola-mundo) vs `iniciar-unificado.bat` (`runserver` unificado, vigente); `build.sh` == `render.yaml:5` (duplicación intencional local/CI); logging solo `StreamHandler` (`settings.py:283-310`, `django.request ERROR`, `documentos INFO`, sin fichero/rotación — correcto en Render, sin historial local).
- **Riesgo:** celemín de “¿cómo arranco?”; sin `sentry`/ Duración: logs locales se pierden al cerrar.
- **Solución:** un solo `README arranque` + `iniciar.bat` archivado; `RotatingFileHandler` solo en `DEBUG`.

## 3. Respuestas a las 5 preguntas

| Pregunta | Respuesta |
|---|---|
| ¿Qué impide el despliegue? | Nada hoy en web (checklist: `check`, `check --deploy`, `migrate`, health 200 verificados). Lo impiden a futuro: crons sin facturación (D02), Pins ausentes (D01), `int()` crudos (D07), rollback DDL inexistente (D06). |
| ¿Divergencias dev/prod? | `DEBUG`, `SECRET_KEY` efímera en dev, `filesystem→s3`, `media/` efímera, `dist` commiteado, env de crons recortado, `ALLOWED_HOSTS/CORS` de un host, `CONN_MAX_AGE` 600. |
| ¿Expone secretos? | No en repo (example limpio, gitignore correcto, `sync:false`). Cuidado operativo: `.env`/`db.sqlite3` locales + `generateValue` ausente en backup key. |
| ¿Valores inseguros? | `BACKUP_ENCRYPTION_KEY` ausente permitida (D03), `DEBUG=True` en ejemplo (dev, correcto si no se copia a prod), `DB_PASSWORD` vacía en ejemplo (dev). |
| ¿Falla al iniciar? | Sí con mensaje claro en `SECRET_KEY/DB/S3/CORS/filesystem`; con traceback crudo en `*_PORT/MAX_*/CONN_MAX_AGE` (D07). |

## 4. Prioridad

1. D02 (crons operativos + paridad env) y D03 (backup key obligatoria).
2. D01 (pins + CI mínimo) y D04 (ambiente de test).
3. D07 (parseos), D08 (hosts/scripts), D05/D06 (dist + rollback).
4. D09-D11 (pool, secretos operativos, scripts/logging).
