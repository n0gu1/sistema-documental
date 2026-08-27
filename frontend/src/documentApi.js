import { apiRequest, formatDate } from './api'

export function normalizeDocument(document) {
  return {
    ...document,
    code: document.code || 'Sin código',
    title: document.title || 'Documento sin título',
    type: document.type?.name || 'Sin tipo',
    area: document.area?.name || 'Sin área',
    status: document.status?.name || 'Sin estado',
    version: document.version?.version || '—',
    versionData: document.version || null,
    downloadUrl: document.version?.download_url || null,
    updated: formatDate(document.updated_at),
    reviewer: document.reviewer?.name || '—',
  }
}

export function reviewStatusName(review) {
  return review.status?.name || review.status?.code || 'Sin estado'
}

export function reviewPriorityName(priority) {
  return ({ ALTA: 'Alta', MEDIA: 'Media', BAJA: 'Baja' })[priority] || priority || 'Media'
}

export function readerDocumentPath(documentId) {
  return `/api/reader/documents/${documentId}/`
}

export function downloadFile(url) {
  if (!url) return false
  window.open(url, '_blank', 'noopener,noreferrer')
  return true
}

export { apiRequest, formatDate }
