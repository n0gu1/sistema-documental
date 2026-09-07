// Missing or older session contracts fail closed. Role names never grant access.
export function hasPermission(user, permission) {
  return Boolean(user && (user.has_all_permissions === true ||
    (Array.isArray(user.permissions) && user.permissions.includes(permission))))
}

export function hasAnyPermission(user, permissions) {
  return permissions.some((permission) => hasPermission(user, permission))
}

export function workspaceFor(user) {
  if (hasAnyPermission(user, ['usuarios.consultar', 'usuarios.gestionar', 'roles.gestionar'])) return 'management'
  if (hasAnyPermission(user, ['documentos.crear', 'documentos.modificar', 'versiones.crear', 'revisiones.enviar'])) return 'editor'
  if (hasAnyPermission(user, ['revisiones.consultar', 'revisiones.aprobar', 'revisiones.rechazar'])) return 'reviewer'
  if (hasPermission(user, 'documentos.consultar')) return 'reader'
  return null
}

export const managementViews = {
  dashboard: 'usuarios.consultar', document: 'documentos.consultar', layers: 'versiones.consultar',
  users: 'usuarios.consultar', shield: 'roles.gestionar', clipboard: 'auditoria.consultar',
  chart: 'reportes.generar', cloud: 'usuarios.gestionar', settings: 'usuarios.consultar',
}

export const editorViews = {
  dashboard: 'documentos.consultar', documents: 'documentos.consultar', 'edit-document': 'documentos.consultar',
  versions: 'versiones.consultar', audit: 'documentos.consultar', reports: 'documentos.consultar',
}

export const reviewerViews = {
  dashboard: 'revisiones.consultar', 'review-inbox': 'revisiones.consultar', 'review-document': 'revisiones.consultar',
  compare: 'versiones.consultar', 'personal-log': 'revisiones.consultar', reports: 'revisiones.consultar',
}
