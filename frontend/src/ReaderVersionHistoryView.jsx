import { useEffect, useState } from 'react'
import { apiRequest, downloadFile, formatDate } from './documentApi'
import './ReaderVersionHistoryView.css'

function HistoryIcon({ name, size = 20 }) {
  const content = name === 'download'
    ? <><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 18v3h16v-3" /></>
    : name === 'eye'
      ? <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>
      : name === 'compare'
        ? <><path d="M7 5h10M7 19h10M7 5v14M17 5v14" /><path d="m4 8 3-3 3 3M14 16l3 3 3-3" /></>
        : <><path d="M6 2.8h8.6L19 7.2V21H6z" /><path d="M14.5 3v4.5H19M9 12h7M9 16h7" /></>
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

const changedFieldLabels = {
  name: 'Archivo',
  mime_type: 'Tipo de archivo',
  size: 'Tamaño',
  sha256: 'Huella digital',
  comment: 'Comentario',
  status: 'Estado',
}

function formatChangedValue(value, field) {
  if (value === null || value === undefined || value === '') return 'Sin valor'
  if (field === 'size') return `${Math.round(Number(value) / 1024)} KB`
  return String(value)
}

function ReaderVersionHistoryView({ documentId }) {
  const [document, setDocument] = useState(null)
  const [versions, setVersions] = useState([])
  const [fromVersion, setFromVersion] = useState('')
  const [toVersion, setToVersion] = useState('')
  const [comparison, setComparison] = useState(null)
  const [loadingComparison, setLoadingComparison] = useState(false)
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
        if (!active) return
        const loadedVersions = versionData.versions || []
        setDocument(detail.document)
        setVersions(loadedVersions)
        setToVersion(loadedVersions.find((version) => version.is_current)?.id || loadedVersions[0]?.id || '')
        setFromVersion(loadedVersions.find((version) => version.id !== (loadedVersions.find((item) => item.is_current)?.id || loadedVersions[0]?.id))?.id || '')
      } catch (requestError) { if (active) setError(requestError.message) }
    }
    load()
    return () => { active = false }
  }, [documentId])

  async function compareVersions() {
    if (!document || !fromVersion || !toVersion || fromVersion === toVersion) return
    setLoadingComparison(true)
    setError('')
    try {
      const data = await apiRequest(`/api/documents/${document.id}/versions/compare/?from_version=${fromVersion}&to_version=${toVersion}`)
      setComparison(data)
    } catch (requestError) { setError(requestError.message) }
    finally { setLoadingComparison(false) }
  }

  if (error && !document) return <div className="reader-history-view"><p className="editor-error" role="alert">{error}</p></div>
  if (!document) return <div className="reader-history-view"><p>Cargando historial...</p></div>
  const current = versions.find((version) => version.is_current) || versions[0] || document.version
  return <div className="reader-history-view">
    <header className="reader-history-heading"><div><h1>Historial de versiones</h1><p>Consulta el historial y las versiones publicadas de cada documento.</p></div></header>
    {error && <p className="editor-error" role="alert">{error}</p>}
    <section className="reader-history-document"><span className="reader-history-file"><HistoryIcon size={32} /></span><div className="reader-history-doc-title"><h2><b>{document.code}</b> {document.title} <em>Versión actual {current?.version || '—'}</em></h2><div><span><b>Área</b>{document.area?.name || '—'}</span><span><b>Tipo</b>{document.type?.name || '—'}</span><span><b>Actualización</b>{formatDate(document.updated_at)}</span><span><b>Autor</b>{current?.author?.name || '—'}</span><span><b>Estado</b><i>{current?.status?.name || 'Publicado'}</i></span></div></div><div className="reader-history-doc-actions">{current?.preview_url && <button type="button" onClick={() => window.open(current.preview_url, '_blank', 'noopener,noreferrer')}><HistoryIcon name="eye" size={20} />Ver versión</button>}{current?.download_url && <button type="button" onClick={() => downloadFile(current.download_url)}><HistoryIcon name="download" size={20} />Descargar</button>}</div></section>
    <section className="reader-history-panel"><header><h2>Historial de versiones</h2><span>{versions.length} versiones</span></header><div className="reader-history-table-wrap"><table><thead><tr><th>Versión</th><th>Fecha</th><th>Estado</th><th>Tamaño</th><th>Comentario</th><th>Acciones</th></tr></thead><tbody>{versions.map((version) => <tr key={version.id}><td><strong>{version.version}</strong>{version.is_current && <small>Actual</small>}</td><td>{formatDate(version.created_at)}</td><td><span className="reader-history-status">{version.status?.name || 'Publicado'}</span></td><td>{version.size ? `${Math.round(version.size / 1024)} KB` : '—'}</td><td>{version.comment || '—'}</td><td><div className="reader-history-row-actions">{version.preview_url && <button type="button" onClick={() => window.open(version.preview_url, '_blank', 'noopener,noreferrer')}><HistoryIcon name="eye" size={16} /> Ver versión</button>}{version.download_url && <button type="button" onClick={() => downloadFile(version.download_url)}><HistoryIcon name="download" size={16} /> Descargar</button>}</div></td></tr>)}</tbody></table>{!versions.length && <p className="reader-history-empty">No hay versiones publicadas registradas.</p>}</div><footer>Mostrando {versions.length} versiones</footer></section>
    {versions.length > 1 && <section className="reader-history-comparison"><header><div><h2>Comparar versiones</h2><p>Compara los datos registrados entre dos versiones publicadas.</p></div><HistoryIcon name="compare" size={22} /></header><div className="reader-history-compare-controls"><label><span>Versión anterior</span><select value={fromVersion} onChange={(event) => setFromVersion(event.target.value)}>{versions.map((version) => <option key={version.id} value={version.id}>{version.version}</option>)}</select></label><span className="reader-history-arrow">→</span><label><span>Versión actual</span><select value={toVersion} onChange={(event) => setToVersion(event.target.value)}>{versions.map((version) => <option key={version.id} value={version.id}>{version.version}</option>)}</select></label><button type="button" disabled={loadingComparison || !fromVersion || !toVersion || fromVersion === toVersion} onClick={compareVersions}>{loadingComparison ? 'Comparando...' : 'Comparar'}</button></div>{comparison && <div className="reader-history-comparison-result"><p>{comparison.same_content ? 'Las dos versiones tienen el mismo contenido.' : `Se detectaron ${comparison.changed_fields.length} campos modificados.`}</p>{comparison.changed_fields.length > 0 && <div className="reader-history-changes">{comparison.changed_fields.map((change) => <article key={change.field}><strong>{changedFieldLabels[change.field] || change.field}</strong><span>{formatChangedValue(change.from, change.field)}</span><b>→</b><span>{formatChangedValue(change.to, change.field)}</span></article>)}</div>}</div>}</section>}
  </div>
}

export default ReaderVersionHistoryView
