import { useEffect, useState } from 'react'
import { apiRequest, downloadFile, formatDate } from './documentApi'
import './EditorVersionsView.css'

function VersionIcon({ name, size = 18 }) {
  const content = name === 'download' ? <><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 18v3h16v-3" /></> : name === 'compare' ? <><path d="M7 4v16M17 4v16M3 8h8M13 16h8" /><path d="m4 8 3-3 3 3m4 8 3 3 3-3" /></> : <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 12h7M9 16h5" /></>
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function EditorVersionsView({ onAction }) {
  const [document, setDocument] = useState(null)
  const [versions, setVersions] = useState([])
  const [previousId, setPreviousId] = useState('')
  const [currentId, setCurrentId] = useState('')
  const [comparison, setComparison] = useState(null)
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
        setDocument(detail.document); setVersions(loadedVersions); setCurrentId(loadedVersions[0]?.id || ''); setPreviousId(loadedVersions[1]?.id || '')
      } catch (requestError) { if (active) setError(requestError.message) }
    }
    load()
    return () => { active = false }
  }, [])

  async function compare() {
    if (!document?.id || !previousId || !currentId) return
    try { setComparison(await apiRequest(`/api/documents/${document.id}/versions/compare/?from_version=${previousId}&to_version=${currentId}`)) } catch (requestError) { setError(requestError.message) }
  }

  if (error) return <div className="editor-versions-view"><p className="editor-error" role="alert">{error}</p></div>
  if (!document) return <div className="editor-versions-view"><p>Cargando versiones...</p></div>
  return <div className="editor-versions-view"><header className="editor-versions-heading"><div><h1>Mis versiones</h1><p>Consulta y gestiona el historial de versiones del documento seleccionado.</p></div></header><section className="editor-versions-document"><span className="editor-versions-document-icon"><VersionIcon size={42} /></span><div className="editor-versions-document-info"><h2>{document.title}</h2><dl><div><dt>Código</dt><dd>{document.code}</dd></div><div><dt>Área</dt><dd>{document.area?.name}</dd></div><div><dt>Estado</dt><dd>{document.status?.name || '—'}</dd></div><div><dt>Última actualización</dt><dd>{formatDate(document.updated_at)}</dd></div></dl></div><div className="editor-versions-document-actions"><button type="button" onClick={() => onAction?.('La carga de una nueva versión requiere seleccionar un archivo.')}>Subir nueva versión</button></div></section><div className="editor-versions-layout"><main><section className="editor-versions-panel editor-versions-history"><header><h2>Historial de versiones</h2></header><div className="editor-versions-table-scroll"><table><thead><tr><th>Versión</th><th>Fecha</th><th>Estado</th><th>Tamaño</th><th>Comentario</th><th>Acciones</th></tr></thead><tbody>{versions.map((version) => <tr key={version.id}><td><strong>{version.version}</strong></td><td>{formatDate(version.created_at)}</td><td>{version.status?.name || '—'}</td><td>{version.size ? `${Math.round(version.size / 1024)} KB` : '—'}</td><td>{version.comment || '—'}</td><td><button type="button" onClick={() => version.download_url && downloadFile(version.download_url)}><VersionIcon name="download" size={16} /> Descargar</button></td></tr>)}</tbody></table>{!versions.length && <p>No hay versiones registradas.</p>}</div><footer><span>Mostrando {versions.length} versiones</span></footer></section><section className="editor-versions-panel editor-versions-compare"><header><h2>Comparar versiones</h2></header><div className="editor-versions-compare-controls"><label><span>Versión anterior</span><select value={previousId} onChange={(event) => setPreviousId(event.target.value)}>{versions.map((version) => <option key={version.id} value={version.id}>{version.version}</option>)}</select></label><VersionIcon name="compare" size={20} /><label><span>Versión actual</span><select value={currentId} onChange={(event) => setCurrentId(event.target.value)}>{versions.map((version) => <option key={version.id} value={version.id}>{version.version}</option>)}</select></label><button type="button" onClick={compare}>Comparar</button></div>{comparison && <div className="editor-versions-compare-result"><strong>{comparison.same_content ? 'El contenido es igual.' : 'Se detectaron cambios.'}</strong>{comparison.changed_fields?.map((field) => <p key={field.field}>{field.field}: {String(field.from)} -&gt; {String(field.to)}</p>)}</div>}</section></main></div></div>
}

export default EditorVersionsView
