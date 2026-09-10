# Requisito 63 — creación de respaldo nuevo controlado

Fecha: 9 de septiembre de 2026, Guatemala (10 de septiembre UTC).

Resultado: creación y contenido de una copia nueva de BD comprobados. No se ejecutó restauración. No se usaron archivos de respaldos históricos como prueba.

## Corrección limitada

El primer intento nuevo devolvió HTTP 500: `No existe una regla de aislamiento para la tabla estados_respaldo`. Registro fallido: `a3717638-e995-4d16-ad54-89993afd0d6f`; sin archivo generado.

Se cotejó el esquema actual por MCP de Neon y se completaron únicamente las reglas faltantes en `documentos/backup_service.py`:

- Catálogos globales: `estados_respaldo`, `tipos_respaldo`, `tipos_reporte`.
- Relaciones de organización para `documentos_etiquetas`, `documentos_politicas_acl`, `documentos_usuarios_permisos` y `usuarios_permisos`, incluyendo actores de concesión/asignación cuando existen.

Se conserva el rechazo de tablas desconocidas y la exigencia de que todas las relaciones no nulas pertenezcan a la organización. No se alteraron restauración, retención, programación ni otros reportes.

## Copia nueva comprobada

| Comprobación | Resultado |
|---|---|
| ID | `20d99ed6-f98f-433a-ade6-1d4bcff03dbd` |
| POST `/api/backups/` | HTTP 201 |
| GET de descarga de este ID | HTTP 200; bytes idénticos al archivo físico |
| Estado en Neon | `exitoso` |
| Creación del manifiesto | `2026-09-10T04:03:40.687013+00:00` |
| Tamaño físico y registro | **63.455 bytes**, mayor que cero |
| SHA-256 físico, registro y respuesta | `5e3a7e6fdf369202ccb5e60d6e58b0a8c00e9600e01b9c545ef70a8a99f94368` |
| Cifrado | AES-GCM, cabecera `SDBK1`, descifrado de lectura correcto |
| Manifiesto | `manifest.json`, formato `sistema-documental-backup-v2`, organización esperada, `complete=true` |
| Contenido BD | 43 tablas, 777 registros, 10 secuencias |
| Consistencia de lectura | `REPEATABLE READ`, `read_only=true` |
| Restauración | No ejecutada; `restaurado_en=NULL` confirmado por MCP |

Archivo físico conservado en `media/req63-controlado/respaldos/2a8b6daa-ab1c-411d-916e-6d3d1c29436e/2026/09/10/20d99ed6-f98f-433a-ade6-1d4bcff03dbd.sdbk`.

El ZIP descifrado pasa CRC e incluye `database.json`, `schema.json`, `sequences.json`, `reconstruction.json`, `RECONSTRUCCION.md` y `manifest.json`. Los documentos de reconstrucción solo se comprobaron como artefactos presentes; no se ejecutaron. Los hashes de cada artefacto están en `resultado_respaldo_nuevo_63.json`.

## Contenido esperado cotejado

Los conjuntos completos de IDs de usuarios, roles, documentos y versiones coinciden con consultas independientes a la BD. MCP de Neon confirmó nuevamente estos conteos:

| Tabla | Filas en la copia |
|---|---:|
| usuarios | 12 |
| roles | 6 |
| documentos | 17 |
| versiones_documento | 3 |
| permisos | 21 |
| usuarios_roles | 13 |
| roles_permisos | 42 |
| bitacora_auditoria | 326 |
| historial_estados_version | 6 |
| solicitudes_revision | 1 |

`PRUEBA-001` conserva sus datos identificadores y sus dos versiones. Se comprobaron 2.192 referencias FK no nulas contra filas del propio archivo y la organización de todas las filas con `organizacion_id`. Los registros de tablas operativas forman parte natural del snapshot; sus archivos históricos no se abrieron ni se utilizaron para acreditar el respaldo nuevo.

## Pruebas y límites

Pasaron 23 comprobaciones del archivo nuevo y 11 pruebas unitarias seleccionadas de creación, cifrado, artefactos y aislamiento. No se ejecutaron pruebas de restauración. `git diff --check` sin errores en los dos archivos de código modificados por este requisito.

La creación se ejecutó desde el backend local mediante Django APIClient con el administrador autenticado por `force_authenticate`, conectado a los datos existentes de Neon. No acredita login, UI ni despliegue en Render.

Se usó una configuración temporal no persistida, destino filesystem y alcance **solo BD del esquema documental por organización**, sin binarios documentales ni copia de toda la instancia PostgreSQL. La purga se omitió exclusivamente en el ensayo para preservar históricos. La configuración S3 y la programación existentes no se cambiaron. La clave específica de este ensayo permanece en `media/req63-controlado/.encryption-key`, fuera de Git; debe conservarse junto con el archivo para poder leer esta copia con la configuración del ensayo. El archivo no se publicó en el storage de Render.

Una comprobación adicional con el validador existente falló al tratar como inválida una FK compuesta parcialmente nula de `usuarios`. MCP confirmó que `fk_usuarios_area_organizacion` usa `MATCH SIMPLE`, que permite `area_id=NULL`. Este defecto pertenece a la validación/recuperación y quedó sin modificar por el alcance solicitado. El contenido de la misma copia nueva se cotejó después con una comprobación independiente de solo lectura que respeta esa semántica; no se generó una segunda copia exitosa. **Estos resultados no certifican restaurabilidad ni el endpoint de verificación.**

Evidencia: `docs/resultado_respaldo_nuevo_63.json`. Procedimiento: `docs/verificar_respaldo_nuevo_63.py`; la opción `--resume-new-63` relee exclusivamente el ID nuevo de este ensayo. Cambios locales, sin commit ni despliegue.
