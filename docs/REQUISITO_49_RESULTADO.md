# Requisito 49: contrato de estados

Fecha: 9 de septiembre de 2026.

## Política preservada

La política existente es BORRADOR → EN_REVISION → APROBADO → PUBLICADO. La aprobación resuelve una solicitud y, al alcanzar el consenso, aprueba su versión. **No publica ni hace vigente automáticamente la versión aprobada.** La publicación sigue siendo una llamada explícita a `versions/<id>/publish/`; esa acción hace vigente la versión publicada, como ya hacía el sistema.

Una solicitud APROBADA puede corresponder a una versión APROBADO o PUBLICADO; la misma versión puede dejar de ser vigente al cargar otra. Una nueva versión BORRADOR vigente no elimina publicaciones anteriores. No se cambian transiciones, permisos, fechas de publicación ni política lectora.

## Contrato API

| Recurso | Alcance y campos explícitos |
|---|---|
| Solicitud | `status_scope: review_request`; `review_status`; `version` con ID y estado de la versión exacta solicitada. `status` conserva su significado anterior como alias del estado de solicitud. |
| Versión | `status_scope: version`; `version_status`; `is_current`; `is_published`. `status` sigue siendo un objeto de catálogo. |
| Documento general | `status_scope: current_version`; `current_version_id`, `current_version`, `current_version_status`; `publication.published_version_ids` y `requires_explicit_action`. `status` conserva el estado de la vigente. Sin vigente, ID/versión/estado son null: no se sustituye por otra fila. |
| Documento lector | `status_scope: published_version`; `published_version_id`; su versión publicada incluye vigencia y publicación explícitas. |
| Respuesta de publicación | Devuelve el mismo objeto de versión que las consultas, en lugar de un `status` string especial. |

Los campos históricos se conservan salvo la normalización indicada en la respuesta de publicación. El consumidor de publicación en Administrador usa esa respuesta y recarga los datos persistidos.

## Frontend

Editor, Revisor y gestión de versiones distinguen versión consultada, estado de versión, vigencia y publicación. Editor/Revisor tienen «Actualizar estados» para releer la API. Editor muestra los estados de las solicitudes por separado; la bandeja del Revisor etiqueta el estado como perteneciente a la solicitud y su indicador de versiones en revisión consulta el estado de versión.

Las etiquetas del historial distinguen estado de versión y vigente. El dashboard del Editor deja de contar APROBADO/Activo como publicado: utiliza las versiones efectivamente publicadas del contrato.

## Pruebas

`verificar_contrato_estados.py`: backend local con Neon real, usuarios de prueba, archivos locales temporales y rollback. Comprueba:

- BORRADOR → EN_REVISION → APROBADO → PUBLICADO mediante acción explícita.
- Lector recibe 404 antes de publicar, incluso en APROBADO; recibe 200 después de publicar.
- Solicitud permanece APROBADA mientras su versión pasa a PUBLICADO.
- Tras crear 1.1 BORRADOR vigente, 1.0 continúa PUBLICADO y no vigente, con su solicitud APROBADA. IDs de ambos recursos diferenciados.
- Ausencia controlada de vigente devuelve estado/ID null, sin escoger una versión arbitraria.

`verificar_contrato_estados_ui.cjs`: nueve comprobaciones aprobadas sobre componentes reales con snapshots de esa secuencia Neon. Incluye actualización sin recargar la página y el caso publicada anterior/borrador vigente. Capturas inspeccionadas: `estados_editor.png` y `estados_reviewer.png`. Resultados en `resultado_contrato_estados.json` y `resultado_contrato_estados_ui.json`.

Build, lint y `git diff --check` aprobados; permanecen advertencias de React y tamaño de paquete. Los avisos previos de catálogo ARCHIVO no se corrigen en esta tarea. Sin validar S3, login ni despliegue en Render; no se hicieron commit ni despliegue.

MCP Neon confirmó cero documentos y solicitudes del último ensayo tras el rollback (`88f74640-32c5-4c99-9bf9-1eb96e6567ad`, `258dceb1-c699-4e14-9f21-a5d7d1d5e04f`).
