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
    typeId: document.type?.id || document.type_id || null,
    areaId: document.area?.id || document.area_id || null,
    statusCode: document.status?.code || document.status_code || null,
    responsibleId: document.responsible?.id || document.responsible_id || null,
    downloadUrl: document.version?.download_url || null,
    updated: formatDate(document.updated_at),
    reviewer: document.reviewer?.name || '—',
  }
}

export function buildDocumentQuery({ search = '', type = '', area = '', status = '', responsible = '', from = '', until = '', catalogs = {}, limit = 100, offset = 0 } = {}) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  if (search.trim()) params.set('search', search.trim())
  const typeId = catalogs.types?.find((item) => item.name === type)?.id || type
  const areaId = catalogs.areas?.find((item) => item.name === area)?.id || area
  const statusCode = catalogs.statuses?.find((item) => item.name === status)?.code || status
  const responsibleId = catalogs.responsibles?.find((item) => item.name === responsible)?.id || responsible
  if (typeId) params.set('type_id', typeId)
  if (areaId) params.set('area_id', areaId)
  if (statusCode) params.set('status_code', statusCode)
  if (responsibleId) params.set('responsible_id', responsibleId)
  if (from) params.set('updated_from', from)
  if (until) params.set('updated_to', until)
  return params.toString()
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
