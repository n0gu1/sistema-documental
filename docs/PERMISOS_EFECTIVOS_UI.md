# Requisito 17: permisos efectivos para la interfaz

Corrección local del 7 de septiembre de 2026. Pendiente de commit, push y despliegue
de estos cambios nuevos.

## Contrato autenticado

El usuario devuelto por login, GET `/api/auth/me/` y cambio de contraseña incluye:

```json
{
  "permissions": ["documentos.consultar", "documentos.descargar"],
  "has_all_permissions": false
}
```

Los campos previos permanecen disponibles. La lista es única, ordenada y procede
del cálculo del backend: permisos activos de roles activos con asignaciones vigentes.
La representación de usuarios en las listas administrativas no incorpora consultas
extra para este contrato; se usa un serializador específico para la sesión autenticada.

Para ADMINISTRADOR, el servidor devuelve todos los códigos activos del catálogo y
`has_all_permissions: true`. Esta indicación conserva la excepción actual de
`user_has_permission`, que acepta cualquier código para ese rol vigente incluso
si se retiran sus concesiones explícitas. La UI no deduce esa excepción del nombre
del rol. No se modificó la política backend.

## Uso en frontend

- `permissionPolicy.js` decide acceso y espacio de trabajo por permisos recibidos.
  La selección de panel deja de depender de ADMINISTRADOR/EDITOR/REVISOR/LECTOR.
- `Permissions.jsx` centraliza proveedor, comprobación, navegación protegida,
  botones deshabilitados, formularios ocultos y entradas de archivo protegidas.
  Si faltan los datos del contrato, no se conceden funciones por el nombre del rol.
- La navegación administrativa filtra funciones; las vistas de Editor y Revisor
  protegen navegación y contenido. Las acciones sensibles usan sus permisos específicos:
  gestión de usuarios/roles, creación y modificación, carga de versiones, publicación,
  decisiones de revisión y descargas, incluidas las pantallas de Lector.
- Consultar usuarios permite verlos, pero no habilita crear, reasignar, restablecer
  claves, desactivar ni revocar accesos. Las concesiones documentales se muestran
  únicamente con roles.gestionar.
- Se mantienen las condiciones funcionales existentes: permiso global no elimina
  bloqueos por falta de documento, estado, selección o carga en curso.
- La sesión se actualiza al recuperar el foco de la ventana, además de iniciar
  sesión, cargar la aplicación y cambiar contraseña. No se añade sondeo periódico.
- Respaldos/configuración y reportes usan las comprobaciones existentes del backend
  documentadas en CONTRATO_PERMISOS.md; este cambio no modifica esas políticas.

La lista es de permisos **globales**: no sustituye ACL, organización, área, autoridad
para delegar roles ni estado del flujo. El backend mantiene todas las comprobaciones
y sigue siendo la autoridad final aunque se altere el frontend manualmente.

## Verificación

Backend real con DRF APIRequestFactory y Neon, sin simular el cálculo de permisos:

1. `/me/` refleja los permisos efectivos del Lector.
2. Se retira temporalmente descargar; el rol permanece igual y `/me/` deja de
   devolver documentos.descargar.
3. Una llamada manual al endpoint de descarga recibe **403 INSUFFICIENT_PERMISSIONS**.
4. ADMINISTRADOR conserva su excepción incluso sin concesiones explícitas en su rol.
5. La transacción revierte toda preparación; se comprueba restauración del permiso.

Navegador sobre el frontend local, con las respuestas `/me/` obtenidas en esa prueba
y respuestas vacías para el contenido de ensayo:

- Mismo rol Lector: Descargar archivo habilitado con permiso y deshabilitado sin él.
- La actualización al recuperar el foco cambia el control sin cambiar el rol.
- Un contrato con solo usuarios.consultar abre administración, pero no habilita
  Nuevo usuario ni muestra Roles y permisos.
- ADMINISTRADOR mantiene ambas funciones.
- Los paneles Editor y Revisor renderizan y navegan correctamente con sus contratos.
- Un nombre de rol ADMINISTRADOR sin contrato de permisos no autoriza funciones.
- Sin errores de JavaScript y sin escrituras desde la prueba del navegador.

Pasaron las **21 pruebas unitarias** de AuthenticationTests, PermissionTests y
AuthApiTests. Se actualizaron dos referencias de prueba al serializador autenticado.
La compilación del frontend pasó; lint terminó sin errores, con advertencias de
hooks en componentes existentes. No se desplegó ni se ejecutaron operaciones
documentales funcionales.

Scripts: `verificar_permisos_efectivos.py` (dependencias del proyecto y BD configurada)
y `verificar_permisos_ui.cjs` (Vite en 5173 y PLAYWRIGHT_MODULE en el entorno).
Resultados: `resultado_permisos_efectivos.json` y `resultado_permisos_ui.json`.
Capturas: `permiso_descarga_habilitado.png` y `permiso_descarga_deshabilitado.png`.
