# Requisito 19 — Carga inicial

Fecha: 7 de septiembre de 2026, Guatemala. **Estado: corrección de interfaz realizada; prueba integral bloqueada por almacenamiento S3.**

## Cambio acotado

`CreateDocumentDialog.jsx` ahora permite seleccionar un archivo inicial opcional. Se envía como `file` mediante FormData en el alta POST `/api/documents/`, protegida por `documentos.crear`. Si no se selecciona archivo, se omite la parte vacía para conservar el alta sin archivo del requisito 18. El backend conserva su validación y autorización existentes. No se modificaron rutas de nuevas versiones, numeración, estados, descarga ni configuración de almacenamiento.

## Pruebas reales

Inicio de sesión con `prueba.editor@test.local`. Interfaz local corregida conectada mediante un puente de pruebas al backend real `https://sistema-documental-nw05.onrender.com`, conservando cookies y CSRF. No se desplegaron cambios.

Las reglas de carga se consultaron con el MCP de Neon en el proyecto `red-sunset-06347686`: extensiones PDF, DOCX, XLSX, PPTX, JPG, JPEG y PNG; máximo por archivo 50 MiB; máximo por petición 250 MiB.

| Caso enviado al backend de Render | Resultado |
|---|---|
| `.txt` no permitido | 400, extensión no permitida |
| PNG con MIME text/plain | 400, MIME no coincide |
| PNG cuyo contenido es texto | 400, contenido no coincide |
| Archivo de 52 428 801 bytes | 400, supera el límite de 50 MB |
| PNG conocido de 68 bytes | 400, no se pudo guardar el archivo documental |

Evidencia reproducible: `verificar_carga_inicial.cjs`; resultados negativos: `resultado_validacion_carga_inicial.json`. Requiere `DOCUMENT_TEST_PASSWORD`; `DOCUMENT_TEST_VALIDATION_ONLY=1` ejecuta únicamente las validaciones negativas.

## Causa comprobada en Render

Logs del servicio `srv-da6i7t0u01pc73875cbg`, espacio My Workspace confirmado por el usuario. A las `2026-09-08T04:35:55Z`, `save_document_file` falló en `default_storage.save`, durante la comprobación `S3Storage.exists`:

```text
botocore.exceptions.ClientError: An error occurred (403) when calling the HeadObject operation: Forbidden
```

Esto confirma una denegación del almacenamiento antes de guardar el objeto. No permite distinguir por sí solo entre credenciales, permisos, bucket o endpoint incorrectos. Se requiere revisar la configuración existente de S3 en Render y autorizar las operaciones necesarias de lectura/escritura. El entorno local no contiene credenciales S3. No se eludió la comprobación ni se cambió a almacenamiento temporal.

El MCP de Neon confirmó cero documentos `REQ19-%` y cero versiones con nombre `req19-pixel.png`: el fallo no dejó un registro parcial. El único proveedor de catálogo sigue siendo `EXTERNO_POR_CONFIGURAR`, tipo OTRO, contenedor `pendiente-configuracion`, inactivo; no demuestra el destino real de `default_storage`, que se configura por entorno. No se alteró ese catálogo.

## Archivo conocido y comprobación pendiente

`req19-pixel.png`: PNG de 68 bytes. SHA-256 del archivo fuente:

```text
3fd24bcfdb17a6027c5f3ed896d17a020d6ff9d9e4d06362461a9b44b6ac1b52
```

**No se puede afirmar persistencia de ArchivoDocumento, almacenamiento correcto ni igualdad de bytes descargados:** la carga válida no llegó a completarse. Una vez corregido el acceso S3, el script exige HTTP 201, exactamente un archivo inicial 1.0, tamaño y hash iguales al origen, HTTP 200 al descargar e igualdad byte por byte. Después corresponde confirmar la fila con MCP de Neon.

## Verificación local

Compilación frontend correcta; lint sin errores, con advertencias existentes. Las siete pruebas existentes `documentos.tests.DocumentFileValidationTests` pasaron. Distribución frontend recompilada. El requisito #19 continúa pendiente de resolución del acceso S3 y prueba integral satisfactoria.
