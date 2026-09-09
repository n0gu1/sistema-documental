# Requisito 33: política de versionado inequívoca

Fecha: 8 de septiembre de 2026.

## Política encontrada antes de modificar código

Se revisaron `AUDITORIA_FINAL.md`, `Documento`, `ArchivoDocumento`, los serializadores, `save_document_file`, `next_version_numbers`, el editor y el esquema real mediante MCP de Neon. La arquitectura implementa **versiones de archivo**, no instantáneas de toda la ficha documental:

- `versiones_documento` contiene clave de almacenamiento, hash, tamaño, autor, estado y numeración mayor/menor.
- Texto y fecha pertenecen a `documentos`; los metadatos se relacionan con el documento, no con una versión.
- `next_version_numbers` asigna 1.0 al primer archivo; una carga menor incrementa el menor y una mayor incrementa el mayor y reinicia el menor.

Evidencia: [columnas consultadas en Neon](politica_versionado_neon.json). La auditoría histórica señaló la ausencia de instantáneas; el modelo actual no las representa. Se adopta explícitamente la política de archivos existente, sin inventar copias de metadatos ni versiones vacías.

## Comportamiento final

| Operación | Resultado |
|---|---|
| Crear documento con archivo | Primera versión 1.0. |
| Crear ficha sin archivo | Sin versión hasta cargar el primer archivo. |
| PATCH de texto, fecha, referencias o metadatos | Actualiza la ficha y conserva las versiones, siempre que el estado permita editar. |
| Cargar archivo por files/ o versions/ | Crea versión; menor por defecto: 1.0 → 1.1. |
| Elegir carga mayor | Conserva la regla existente: por ejemplo, 1.1 → 2.0. |

Los metadatos actuales son comunes al documento; no se presentan como datos históricos de cada archivo. Esta corrección resuelve la ambigüedad mediante una política explícita, no añade versionado automático de cada PATCH. Si se exige en el futuro versionar la ficha completa, será necesario otro modelo de instantáneas.

La API declara `version_policy: file_content` y `version_created` en las respuestas de alta, PATCH y carga. PATCH continúa rechazando archivos; las rutas de carga ahora rechazan campos de ficha desconocidos en vez de ignorarlos silenciosamente. La UI distingue “Guardar datos” y “Subir nueva versión”, con una explicación visible. Se actualizó el contrato de permisos que aún describía carga por PATCH.

## Pruebas

[Script reproducible](verificar_politica_versionado.py) y [resultado aprobado](resultado_politica_versionado.json): seis comprobaciones, incluida la secuencia **crear con archivo → 1.0 → PATCH → 1.0 → nueva versión menor → 1.1**. Se verificaron recarga, persistencia de texto/metadatos, conservación exacta de filas tras PATCH, rechazo de operaciones ambiguas y bytes íntegros de ambos archivos.

Prueba contra Neon con almacenamiento temporal real `FileSystemStorage`; registros revertidos al terminar. No acredita conectividad S3. Compilación frontend y `git diff --check` aprobados; Vite mantiene su aviso de tamaño del bundle. Se observó el aviso preexistente de catálogo de auditoría para `ARCHIVO_CARGADO`/`ARCHIVO`, fuera de esta corrección.

Sin cambios en restauración. Cambios locales pendientes de commit, push y despliegue.
