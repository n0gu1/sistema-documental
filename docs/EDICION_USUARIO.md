# Requisito 8 — Edición de usuario

En Administración de usuarios, seleccionar una fila y pulsar «Editar usuario seleccionado». El formulario precarga correo, nombres, apellidos y área. Guardar envía únicamente campos modificados al PATCH existente y consulta de nuevo el usuario para actualizar la tabla. Cancelar descarta la edición; se impiden envíos duplicados y se muestran errores del servidor.

El listado entrega las áreas activas de la organización para el selector. «Sin área» envía null. El estado conserva su control existente; no se añaden cambios de roles, contraseñas ni nombre de usuario (este último no está soportado por PATCH).

## Prueba obtenida

Navegador con frontend/backend locales y BD configurada, sin simular respuestas. Se editó prueba.editor@test.local: correo temporal, nombres, apellidos y área activa diferente. PATCH devolvió 200. Tras recargar la página se abrió otra vez el editor y los cuatro campos coincidieron; GET independiente confirmó los mismos valores. Rol y estado permanecieron iguales. La petición sólo contenía email, first_name, last_name y area_id.

Se restauraron los cuatro valores originales mediante PATCH y se comprobaron por GET al finalizar. Resultado PASS en resultado_edicion_usuario.json; script reproducible verificar_edicion_usuario.cjs. Build aprobado; lint sin errores (advertencias preexistentes). La primera ejecución encontró un origen local no admitido por CSRF; se corrigió la URL del ensayo a localhost. La prueba también permitió corregir la etiqueta accesible del selector de área.

Cambios locales pendientes de publicación.
