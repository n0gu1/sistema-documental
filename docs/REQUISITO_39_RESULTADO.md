# Requisito 39: restaurar contenido como versión nueva

Fecha: 8 de septiembre de 2026.

Se revisó el endpoint existente y la política de AUDITORIA_FINAL.md antes de modificar código. La restauración copia contenido a una fila nueva BORRADOR vigente; no reactiva la fila original ni recupera metadatos o aprobación antiguos.

Administrador y Editor ofrecen «Restaurar como nueva versión» por fila, con permiso `versiones.restaurar`. La UI envía POST al documento y versión elegidos con `version_type: minor`, impide repetir mientras está pendiente, desactiva la vigente, muestra el número creado y recarga versiones/timeline según la vista. Un error se muestra sin anunciar éxito.

El endpoint adquiere el bloqueo del documento antes de calcular el siguiente número, compatible con cargas secuenciales. Lee la copia almacenada y coteja su tamaño y SHA-256 contra el origen registrado; una discrepancia revierte filas/vigencia y elimina la copia fallida. No cambia el incremento mayor existente.

Neon MCP confirmó `VERSION_RESTAURADA` y el recurso `VERSION`; `ARCHIVO`, usado anteriormente por esta operación, no existe en ese catálogo. La restauración usa ahora `VERSION` y la consulta de timeline admite ese recurso además del anterior.

Prueba `docs/verificar_restauracion_version.py`, contra Neon real con almacenamiento local temporal y rollback total:

- Alta 1.0 y cargas menores 1.1, 1.2 y 1.3.
- Restaurar 1.2 crea nueva 1.4 BORRADOR con autor y fecha; solo 1.4 vigente.
- Filas anteriores conservadas excepto el cambio de vigencia de 1.3. Archivos originales intactos y copia independiente, con bytes/hash idénticos a 1.2.
- Historial de estado y evento VERSION_RESTAURADA persistidos; el evento contiene origen y número nuevo y aparece en timeline.
- Recarga devuelve 1.4, 1.3, 1.2, 1.1 y 1.0.
- Corrupción controlada rechazada sin consumir número, alterar vigente ni dejar copia huérfana.

Cinco comprobaciones agrupadas aprobadas. MCP confirmó cero documentos y versiones del ID de prueba `1c58d94e-bdf9-4c5e-a17f-c7dc2c794ca3` después de rollback.

Prueba `docs/verificar_restauracion_ui.cjs`: cuatro casos aprobados con API controlada (éxito y error en Administrador y Editor). Verifica endpoint, IDs, payload, conservación de filas y recarga de 1.4. Compilación aprobada; persiste advertencia de tamaño del paquete Vite. Resultados en `resultado_restauracion_version.json` y `resultado_restauracion_ui.json`.

Los archivos de la prueba backend son locales: no se certifica acceso S3 ni despliegue en Render. Durante las cargas preparatorias se observó el problema previo de catálogo ARCHIVO_CARGADO/ARCHIVO; la restauración sí registra su evento y este cambio no amplía la reparación a otros eventos. No se trabaja en backup del sistema. Cambios pendientes de commit y despliegue.
