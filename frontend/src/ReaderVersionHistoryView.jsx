import { useEffect, useState } from 'react'
import { apiRequest, downloadFile, formatDate } from './documentApi'
import './ReaderVersionHistoryView.css'

function HistoryIcon({ name, size = 20 }) {
  const content = name === 'download'
    ? <><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 18v3h16v-3" /></>
    : name === 'eye'
      ? <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>
      : <><path d="M6 2.8h8.6L19 7.2V21H6z" /><path d="M14.5 3v4.5H19M9 12h7M9 16h7" /></>
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function ReaderVersionHistoryView({ documentId, onAction }) {
  const [document, setDocument] = useState(null)
  const [versions, setVersions] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      try {
        let id = documentId
        if (!id) {
          const list = await apiRequest('/api/reader/documents/?limit=1')
          id = list.results?.[0]?.id
        }
        if (!id) throw new Error('No hay documentos publicados disponibles.')
        const [detail, versionData] = await Promise.all([
          apiRequest(`/api/reader/documents/${id}/`),
          apiRequest(`/api/documents/${id}/versions/`),
        ])
        if (active) { setDocument(detail.document); setVersions(versionData.versions || []) }
      } catch (requestError) { if (active) setError(requestError.message) }
    }
    load()
    return () => { active = false }
  }, [documentId])

  if (error) return <div className="reader-history-view"><p className="editor-error" role="alert">{error}</p></div>
  if (!document) return <div className="reader-history-view"><p>Cargando historial...</p></div>
  const current = document.version
  return <div className="reader-history-view"><header className="reader-history-heading"><h1>Historial de versiones</h1><p>Consulta las versiones publicadas del documento.</p></header><section className="reader-history-layout"><main><header className="reader-history-document"><span className="reader-history-file"><HistoryIcon size={32} /></span><div className="reader-history-doc-title"><h2><b>{document.code}</b> {document.title} <em>Versión actual {current?.version || '—'}</em></h2><div><span><b>Área</b>{document.area?.name}</span><span><b>Tipo</b>{document.type?.name}</span><span><b>Actualización</b>{formatDate(document.updated_at)}</span><span><b>Estado</b><i>Publicado</i></span></div></div><div className="reader-history-doc-actions">{current?.preview_url && <button type="button" onClick={() => window.open(current.preview_url, '_blank', 'noopener,noreferrer')}><HistoryIcon name="eye" size={21} />Ver versión</button>}{current?.download_url && <button type="button" onClick={() => downloadFile(current.download_url)}><HistoryIcon name="download" size={21} />Descargar</button>}</div></header><section className="reader-history-table-card"><h2>Versiones publicadas</h2><div className="reader-history-table-wrap"><table><thead><tr><th>Versión</th><th>Fecha</th><th>Estado</th><th>Tamaño</th><th>Comentario</th><th>Acciones</th></tr></thead><tbody>{versions.map((version) => <tr key={version.id}><td><strong>{version.version}</strong></td><td>{formatDate(version.created_at || version.published_at)}</td><td><span className="reader-history-status is-publicado">Publicado</span></td><td>{version.size ? `${Math.round(version.size / 1024)} KB` : '—'}</td><td>{version.comment || '—'}</td><td><button type="button" onClick={() => version.preview_url ? window.open(version.preview_url, '_blank', 'noopener,noreferrer') : onAction('Vista previa no disponible.')}><HistoryIcon name="eye" size={16} /> Ver versión</button></td></tr>)}</tbody></table>{!versions.length && <p>No hay versiones publicadas registradas.</p>}</div><footer><span>Mostrando {versions.length} versiones</span></footer></section></main></section></div>
}

export default ReaderVersionHistoryView
