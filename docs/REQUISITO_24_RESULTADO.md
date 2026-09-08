# Requisito 24: archivo documental

Fecha: 8 de septiembre de 2026. Se revisó `AUDITORIA_FINAL.md` y se limitó el cambio a la baja lógica.

Los listados de Administrador y Editor incluyen la acción Archivar, controlada por `documentos.eliminar`. El diálogo identifica el documento por código y título, solicita motivo, permite cancelar y bloquea envíos repetidos. Solo retira la fila después de recibir una respuesta satisfactoria, informa del resultado y vuelve a consultar el listado.

La UI utiliza `POST /api/documents/<id>/archive/`. El backend conserva el permiso específico y la autorización documental, bloquea la fila dentro de una transacción y actualiza únicamente `eliminado_en`, `eliminado_por`, `motivo_eliminacion` y `actualizado_en`. La ruta DELETE existente también sigue haciendo baja lógica. No se ejecuta borrado físico ni se altera el almacenamiento de archivos.

El motivo debe ser texto; el valor normalizado guardado se usa también en la bitácora. Se corrigió el código del evento para utilizar `DOCUMENTO_ELIMINADO`, ya existente en Neon y denominado “Documento eliminado lógicamente”. Se conserva compatibilidad de lectura con eventos históricos `DOCUMENTO_ARCHIVADO`. No hay migración ni política nueva de versiones o restauración.

## Pruebas

- [Backend contra Neon](resultado_archivo_documental.json): cinco grupos aprobados. Incluyen denegación a Lector/Revisor, validación del motivo, reversión ante excepción, exclusión del listado normal, archivo repetido rechazado y bitácora con el motivo correcto.
- La prueba conserva exactamente la fila de archivo, el historial de estados, los metadatos y el hash de los bytes de un archivo temporal real. Los fixtures de esta prueba se revierten al terminar. Es una prueba de conservación; no acredita acceso a S3.
- [Script backend](verificar_archivo_documental.py) y [script UI](verificar_archivo_documental_ui.cjs) reproducibles. La prueba UI crea el documento por API autenticada y ejecuta archivo, cancelación y recarga desde el navegador.

Cambios locales; no se ha realizado commit, push ni despliegue de este requisito.

**UI aprobada:** [resultado](resultado_archivo_documental_ui.json), [captura tras recargar](archivo_documental_ui.png). Consulta independiente mediante MCP de Neon confirma que el documento `1d12f2a7-e9f5-49ca-b39d-24c40213d165` permanece, con fecha/actor/motivo de baja, metadatos y un evento de eliminación lógica: [evidencia Neon](resultado_archivo_documental_neon.json). El archivo y su historial se verifican con el fixture del script backend; el documento UI se creó sin archivo.

Compilación frontend aprobada (aviso existente por tamaño de bundle), Oxlint del componente nuevo sin errores y `git diff --check` correcto.
