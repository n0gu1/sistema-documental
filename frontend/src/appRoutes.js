function decodeSegment(segment) {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

function pathSegments(pathname) {
  return (pathname || '/')
    .split('/')
    .filter(Boolean)
    .map(decodeSegment)
}

function encodedId(value) {
  return value === null || value === undefined || value === '' ? '' : encodeURIComponent(String(value))
}

function documentRoute(workspace, segments) {
  if (segments[0] !== 'documentos' || segments.length > 3) return null

  const documentId = segments[1] || null
  const action = segments[2] || null
  if (!documentId && action) return null

  if (!documentId) {
    if (workspace === 'management') return { view: 'document', documentMode: 'list', documentId: null }
    if (workspace === 'editor') return { view: 'documents', documentId: null }
    if (workspace === 'reader') return { view: 'document', documentId: null }
    return null
  }

  if (action === 'versiones') {
    if (workspace === 'management') return { view: 'layers', documentId }
    if (workspace === 'editor') return { view: 'versions', documentId }
    if (workspace === 'reader') return { view: 'history', documentId }
    return null
  }

  if (action === 'editar') {
    if (workspace === 'management') return { view: 'document', documentMode: 'edit', documentId }
    if (workspace === 'editor') return { view: 'edit-document', documentId }
    return null
  }

  if (action) return null
  if (workspace === 'management') return { view: 'document', documentMode: 'detail', documentId }
  if (workspace === 'editor') return { view: 'edit-document', documentId }
  if (workspace === 'reader') return { view: 'document', documentId }
  return null
}

export function routeForPath(workspace, pathname) {
  const segments = pathSegments(pathname)
  if (!segments.length) return null

  const documents = documentRoute(workspace, segments)
  if (documents) return documents

  if (segments.length === 1 && segments[0] === 'dashboard') return { view: 'dashboard' }

  if (workspace === 'management') {
    const views = {
      versiones: 'layers',
      usuarios: 'users',
      'roles-permisos': 'shield',
      bitacora: 'clipboard',
      reportes: 'chart',
      respaldos: 'cloud',
      configuracion: 'settings',
    }
    return segments.length === 1 && views[segments[0]] ? { view: views[segments[0]] } : null
  }

  if (workspace === 'editor') {
    const views = { versiones: 'versions', bitacora: 'audit', reportes: 'reports' }
    return segments.length === 1 && views[segments[0]] ? { view: views[segments[0]] } : null
  }

  if (workspace === 'reviewer') {
    if (segments[0] === 'revisiones' && segments.length <= 2) {
      return segments[1] ? { view: 'review-document', reviewId: segments[1] } : { view: 'review-inbox' }
    }
    const views = {
      'documentos-asignados': 'review-document',
      'comparacion-versiones': 'compare',
      bitacora: 'personal-log',
      reportes: 'reports',
    }
    return segments.length === 1 && views[segments[0]] ? { view: views[segments[0]] } : null
  }

  if (workspace === 'reader') {
    const views = {
      biblioteca: 'library',
      versiones: 'history',
      'historial-lectura': 'reading',
      favoritos: 'favorites',
    }
    return segments.length === 1 && views[segments[0]] ? { view: views[segments[0]] } : null
  }

  return null
}

export function pathForRoute(workspace, view, options = {}) {
  const documentId = encodedId(options.documentId)
  const reviewId = encodedId(options.reviewId)

  if (workspace === 'management') {
    const paths = {
      dashboard: '/dashboard',
      users: '/usuarios',
      shield: '/roles-permisos',
      clipboard: '/bitacora',
      chart: '/reportes',
      cloud: '/respaldos',
      settings: '/configuracion',
    }
    if (view === 'document') {
      if (!documentId) return '/documentos'
      return options.documentMode === 'edit' ? `/documentos/${documentId}/editar` : `/documentos/${documentId}`
    }
    if (view === 'layers') return documentId ? `/documentos/${documentId}/versiones` : '/versiones'
    return paths[view] || '/dashboard'
  }

  if (workspace === 'editor') {
    const paths = { dashboard: '/dashboard', documents: '/documentos', audit: '/bitacora', reports: '/reportes' }
    if (view === 'edit-document') return documentId ? `/documentos/${documentId}/editar` : '/documentos'
    if (view === 'versions') return documentId ? `/documentos/${documentId}/versiones` : '/versiones'
    return paths[view] || '/dashboard'
  }

  if (workspace === 'reviewer') {
    const paths = {
      dashboard: '/dashboard',
      'review-inbox': '/revisiones',
      'review-document': '/documentos-asignados',
      compare: '/comparacion-versiones',
      'personal-log': '/bitacora',
      reports: '/reportes',
    }
    if (view === 'review-document' && reviewId) return `/revisiones/${reviewId}`
    return paths[view] || '/dashboard'
  }

  if (workspace === 'reader') {
    const paths = {
      dashboard: '/dashboard',
      library: '/biblioteca',
      reading: '/historial-lectura',
      favorites: '/favoritos',
    }
    if (view === 'document' || view === 'documents') return documentId ? `/documentos/${documentId}` : '/documentos'
    if (view === 'history') return documentId ? `/documentos/${documentId}/versiones` : '/versiones'
    return paths[view] || '/dashboard'
  }

  return '/'
}
