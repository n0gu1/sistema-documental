import { useEffect, useRef, useState } from 'react'
import { apiRequest, downloadFile, formatDate } from './documentApi'
import './EditorVersionsView.css'

function VersionIcon({ name, size = 18 }) {
  const content = name === 'download'
    ? <><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 18v3h16v-3" /></>
    : name === 'compare'
      ? <><path d="M7 4v16M17 4v16M3 8h8M13 16h8" /><path d="m4 8 3-3 3 3m4 8 3 3 3-3" /></>
      : name === 'upload'
        ? <><path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M5 14v6h14v-6" /></>
        : name === 'eye'
          ? <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>
          : name === 'calendar'
            ? <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></>
            : <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 12h7M9 16h5" /></>
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

const fieldLabels = { name: 'Archivo', mime_type: 'Tipo de archivo', size: 'Tamaño', sha256: 'Huella digital', comment: 'Comentario', status: 'Estado' }

function versionStatusTone(status) {
  const value = `${status?.code || ''} ${status?.name || ''}`.toLowerCase()
  if (value.includes('revision') || value.includes('revisión')) return 'review'
  if (value.includes('aprob') || value.includes('public')) return 'approved'
  return 'draft'
}

function formatSize(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function displayChangedValue(value, field) {
  if (value === null || value === undefined || value === '') return 'Sin valor'
  return field === 'size' ? formatSize(Number(value)) : String(value)
}

function EditorVersionsView({ onAction }) {
  const fileInput = useRef(null)
  const compareRef = useRef(null)
  const [document, setDocument] = useState(null)
  const [versions, setVersions] = useState([])
  const [previousId, setPreviousId] = useState('')
  const [currentId, setCurrentId] = useState('')
  const [comparison, setComparison] = useState(null)
  const [loadingUpload, setLoadingUpload] = useState(false)
  const [loadingCompare, setLoadingCompare] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const list = await apiRequest('/api/documents/?limit=1')
        const first = list.results?.[0]
        if (!first) throw new Error('No hay documentos disponibles.')
        const [detail, versionData] = await Promise.all([apiRequest(`/api/documents/${first.id}/`), apiRequest(`/api/documents/${first.id}/versions/`)] )
        if (!active) return
        const loadedVersions = versionData.versions || []
        const selectedCurrent = versionData.current_version_id || loadedVersions[0]?.id || ''
        setDocument(detail.document)
        setVersions(loadedVersions)
        setCurrentId(selectedCurrent)
        setPreviousId(loadedVersions.find((version) => version.id !== selectedCurrent)?.id || '')
      } catch (requestError) { if (active) setError(requestError.message) }
    }
    load()
    return () => { active = false }
  }, [])

  const currentVersion = versions.find((version) => version.id === currentId) || versions[0]

  async function uploadVersion(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !document?.id) return
    setLoadingUpload(true)
    setError('')
    try {
      const body = new FormData()
      body.append('file', file)
      const response = await apiRequest(`/api/documents/${document.id}/versions/`, { method: 'POST', body })
      const uploaded = response.version
      setVersions((current) => [uploaded, ...current.map((version) => ({ ...version, is_current: false }))])
      setCurrentId(uploaded.id)
      setPreviousId(versions[0]?.id || '')
      onAction?.('La nueva versión se cargó correctamente.')
    } catch (requestError) { setError(requestError.message) }
    finally { setLoadingUpload(false) }
  }

  async function compare() {
    if (!document?.id || !previousId || !currentId || previousId === currentId) return
    setLoadingCompare(true)
    setError('')
    try {
      const result = await apiRequest(`/api/documents/${document.id}/versions/compare/?from_version=${previousId}&to_version=${currentId}`)
      setComparison(result)
      compareRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch (requestError) { setError(requestError.message) }
    finally { setLoadingCompare(false) }
  }

  if (error && !document) return <div className="editor-versions-view"><p className="editor-error" role="alert">{error}</p></div>
  if (!document) return <div className="editor-versions-view"><p>Cargando versiones...</p></div>
  const versionStatus = currentVersion?.status
  return <div className="editor-versions-view"><header className="editor-versions-heading"><div><h1>Mis versiones</h1><p>Consulta y gestiona el historial de versiones del documento seleccionado.</p></div></header>{error && <p className="editor-error" role="alert">{error}</p>}<section className="editor-versions-document"><span className="editor-versions-document-icon"><VersionIcon size={42} /></span><div className="editor-versions-document-info"><h2>{document.title}</h2><dl><div><dt>Código</dt><dd>{document.code}</dd></div><div><dt>Área</dt><dd>{document.area?.name || '—'}</dd></div><div><dt>Versión actual</dt><dd><b>{currentVersion?.version || '—'}</b></dd></div><div><dt>Estado</dt><dd><span className={`editor-versions-status editor-versions-status--${versionStatusTone(versionStatus)}`}><i />{versionStatus?.name || '—'}</span></dd></div><div><dt>Última actualización</dt><dd>{formatDate(document.updated_at)}</dd></div></dl></div><div className="editor-versions-document-actions"><input ref={fileInput} className="editor-versions-file-input" type="file" onChange={uploadVersion} /><button className="is-primary" type="button" disabled={loadingUpload} onClick={() => fileInput.current?.click()}><VersionIcon name="upload" size={17} />{loadingUpload ? 'Cargando...' : 'Subir nueva versión'}</button><button type="button" onClick={() => compareRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}><VersionIcon name="compare" size={17} />Comparar versiones</button>{currentVersion?.download_url && <button type="button" onClick={() => downloadFile(currentVersion.download_url)}><VersionIcon name="download" size={17} />Descargar</button>}</div></section><div className="editor-versions-layout"><main><section className="editor-versions-panel editor-versions-history"><header><h2>Historial de versiones</h2><span>{versions.length} versiones</span></header><div className="editor-versions-table-scroll"><table><thead><tr><th>Versión</th><th>Fecha</th><th>Estado</th><th>Tamaño</th><th>Comentario</th><th>Acciones</th></tr></thead><tbody>{versions.map((version) => <tr key={version.id}><td><strong>{version.version}</strong>{version.is_current && <small>Actual</small>}</td><td>{formatDate(version.created_at)}</td><td><span className={`editor-versions-status editor-versions-status--${versionStatusTone(version.status)}`}><i />{version.status?.name || '—'}</span></td><td>{formatSize(version.size)}</td><td>{version.comment || '—'}</td><td><div className="editor-versions-row-actions">{version.preview_url && <button type="button" aria-label={`Previsualizar versión ${version.version}`} onClick={() => window.open(version.preview_url, '_blank', 'noopener,noreferrer')}><VersionIcon name="eye" size={16} /></button>}{version.download_url && <button type="button" aria-label={`Descargar versión ${version.version}`} onClick={() => downloadFile(version.download_url)}><VersionIcon name="download" size={16} /></button>}</div></td></tr>)}</tbody></table>{!versions.length && <p className="editor-versions-empty">No hay versiones registradas.</p>}</div><footer>Mostrando {versions.length} versiones</footer></section><section ref={compareRef} className="editor-versions-panel editor-versions-compare"><header><div><h2>Comparar versiones</h2><p>Consulta los cambios registrados entre dos versiones.</p></div><VersionIcon name="compare" size={20} /></header><div className="editor-versions-compare-controls"><label><span>Versión anterior</span><select value={previousId} onChange={(event) => setPreviousId(event.target.value)}>{versions.map((version) => <option key={version.id} value={version.id}>{version.version} · {formatDate(version.created_at)}</option>)}</select></label><span className="editor-versions-compare-arrow">⇄</span><label><span>Versión actual</span><select value={currentId} onChange={(event) => setCurrentId(event.target.value)}>{versions.map((version) => <option key={version.id} value={version.id}>{version.version} · {formatDate(version.created_at)}</option>)}</select></label><button type="button" disabled={loadingCompare || previousId === currentId || !previousId || !currentId} onClick={compare}>{loadingCompare ? 'Comparando...' : 'Comparar'}</button></div>{comparison && <div className="editor-versions-comparison-result"><p>{comparison.same_content ? 'Las versiones tienen la misma huella de contenido.' : 'Las versiones tienen distinta huella de contenido.'}</p>{comparison.changed_fields.length ? <div className="editor-versions-changes">{comparison.changed_fields.map((change) => <article key={change.field}><strong>{fieldLabels[change.field] || change.field}</strong><span>{displayChangedValue(change.from, change.field)}</span><b>→</b><span>{displayChangedValue(change.to, change.field)}</span></article>)}</div> : <p className="editor-versions-no-changes">No hay campos de registro modificados.</p>}</div>}</section></main></div></div>
}

export default EditorVersionsView
