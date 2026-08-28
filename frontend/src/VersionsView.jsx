import { useEffect, useState } from 'react'
import { apiRequest, downloadFile, formatDate } from './documentApi'
import './VersionsView.css'

function VersionIcon({ name, size = 18 }) {
  const content = name === 'back' ? <path d="m15 18-6-6 6-6M9 12h11" /> : name === 'download' ? <><path d="M12 4v12m0 0 5-5m-5 5-5-5" /><path d="M5 20h14" /></> : name === 'compare' ? <><path d="M7 4v16M17 4v16M3 8h8M13 16h8" /><path d="m4 8 3-3 3 3m4 8 3 3 3-3" /></> : name === 'swap' ? <><path d="M7 7h12m0 0-3-3m3 3-3 3M17 17H5m0 0 3 3m-3-3 3-3" /></> : name === 'calendar' ? <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></> : name === 'eye' ? <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></> : <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 12h7M9 16h7" /></>
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function VersionsView({ onBack }) {
  const [document, setDocument] = useState(null)
  const [versions, setVersions] = useState([])
  const [timeline, setTimeline] = useState([])
  const [previousId, setPreviousId] = useState('')
  const [currentId, setCurrentId] = useState('')
  const [comparison, setComparison] = useState(null)
  const [error, setError] = useState('')
  const [publishingVersionId, setPublishingVersionId] = useState('')
  const [publishComment, setPublishComment] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [publishNotice, setPublishNotice] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const list = await apiRequest('/api/documents/?limit=1')
        const first = list.results?.[0]
        if (!first) throw new Error('No hay documentos disponibles.')
        const [detail, versionData, timelineData] = await Promise.all([apiRequest(`/api/documents/${first.id}/`), apiRequest(`/api/documents/${first.id}/versions/`), apiRequest(`/api/documents/${first.id}/timeline/`)] )
        if (!active) return
        const loadedVersions = versionData.versions || []
        setDocument(detail.document); setVersions(loadedVersions); setTimeline(timelineData.events || []); setCurrentId(loadedVersions[0]?.id || ''); setPreviousId(loadedVersions[1]?.id || '')
      } catch (requestError) { if (active) setError(requestError.message) }
    }
    load()
    return () => { active = false }
  }, [])

  async function compare() {
    if (!document?.id || !previousId || !currentId) return
    try { setComparison(await apiRequest(`/api/documents/${document.id}/versions/compare/?from_version=${previousId}&to_version=${currentId}`)) } catch (requestError) { setError(requestError.message) }
  }

  async function publishVersion(event) {
    event.preventDefault()
    if (!document?.id || !publishingVersionId) return setError('Seleccione una versión aprobada para publicar.')
    setError('')
    setPublishNotice('')
    setPublishing(true)
    try {
      await apiRequest(`/api/documents/${document.id}/versions/${publishingVersionId}/publish/`, { method: 'POST', body: { comment: publishComment } })
      setVersions((current) => current.map((version) => version.id === publishingVersionId ? { ...version, is_current: true, status: { ...version.status, code: 'PUBLICADO', name: 'Publicado' } } : { ...version, is_current: false }))
      setCurrentId(publishingVersionId)
      setDocument((current) => ({ ...current, status: { code: 'PUBLICADO', name: 'Publicado' } }))
      setPublishingVersionId('')
      setPublishComment('')
      setPublishNotice('La versión aprobada se publicó correctamente.')
    } catch (requestError) { setError(requestError.message) } finally { setPublishing(false) }
  }

  function swapVersions() { setPreviousId(currentId); setCurrentId(previousId); setComparison(null) }
  const current = versions.find((version) => version.id === currentId) || versions[0]

  if (error && !document) return <div className="versions-view"><p className="versions-error" role="alert">{error}</p></div>
  if (!document) return <div className="versions-view"><p>Cargando versiones...</p></div>
  const approvedVersions = versions.filter((version) => version.status?.code === 'APROBADO')
  return <div className="versions-view"><header className="versions-heading"><div><p>Control documental</p><h1>Gestión de versiones</h1><span>Administre el historial y la trazabilidad de versiones documentales.</span></div><button type="button" onClick={onBack}><VersionIcon name="back" size={17} /> Volver a documentos</button></header>
     {error && <p className="versions-error" role="alert">{error}</p>}
    <section className="versions-document-card"><div className="versions-document-card__icon"><VersionIcon size={24} /></div><article><span>Código</span><strong>{document.code}</strong></article><article className="versions-document-card__title"><span>Título</span><strong>{document.title}</strong></article><article><span>Área</span><strong>{document.area?.name || '—'}</strong></article><article><span>Versión vigente</span><strong>{current?.version || '—'}</strong></article><article className="versions-document-card__owner"><span>Responsable</span><div><i>{(document.responsible?.name || '—').split(' ').map((part) => part[0]).join('').slice(0, 2)}</i><strong>{document.responsible?.name || '—'}</strong></div></article><article><span>Estado</span><strong className="versions-status"><i /> {document.status?.name || '—'}</strong></article><article><span>Última actualización</span><strong>{formatDate(document.updated_at)}</strong></article><VersionIcon name="calendar" size={18} /></section>
     <div className="versions-toolbar"><button type="button">Subir nueva versión</button><button type="button" onClick={compare}><VersionIcon name="compare" size={18} /> Comparar versiones</button></div>
     {approvedVersions.length > 0 && <form className="versions-publish-panel" onSubmit={publishVersion}><div><p>Publicación autorizada</p><h2>Publicar versión aprobada</h2><span>Seleccione una versión aprobada para hacerla visible como versión vigente.</span></div><label>Versión<select required value={publishingVersionId} onChange={(event) => setPublishingVersionId(event.target.value)} disabled={publishing}><option value="">Seleccione una versión</option>{approvedVersions.map((version) => <option key={version.id} value={version.id}>Versión {version.version} · {version.name}</option>)}</select></label><label>Comentario de publicación<textarea value={publishComment} onChange={(event) => setPublishComment(event.target.value)} placeholder="Agregue una nota para la trazabilidad (opcional)." maxLength={1000} disabled={publishing} /></label><div className="versions-publish-actions"><button type="submit" disabled={publishing || !publishingVersionId}>{publishing ? 'Publicando...' : 'Publicar versión'}</button></div></form>}
     {publishNotice && <p className="versions-publish-notice" role="status">{publishNotice}</p>}
    <section className="versions-panel versions-history"><div className="versions-panel__heading"><div><p>Historial documental</p><h2>Historial de versiones</h2></div><span>{versions.length} versiones registradas</span></div><div className="versions-table-scroll"><table><thead><tr><th>Versión</th><th>Fecha</th><th>Estado</th><th>Responsable</th><th>Tamaño</th><th>Comentario</th><th>Acciones</th></tr></thead><tbody>{versions.map((item) => <tr key={item.id}><td><strong>{item.version}</strong></td><td>{formatDate(item.created_at)}</td><td><span className="versions-status"><i /> {item.status?.name || '—'}</span></td><td>{item.author?.name || '—'}</td><td>{item.size ? `${Math.round(item.size / 1024)} KB` : '—'}</td><td>{item.comment || '—'}</td><td><div className="versions-row-actions"><button type="button" aria-label={`Ver versión ${item.version}`}><VersionIcon name="eye" size={16} /></button><button type="button" onClick={() => downloadFile(item.download_url)} aria-label={`Descargar versión ${item.version}`}><VersionIcon name="download" size={16} /></button></div></td></tr>)}</tbody></table>{!versions.length && <p>No hay versiones registradas.</p>}</div><footer><span>Mostrando {versions.length} versiones</span></footer></section>
    <div className="versions-bottom-grid"><section className="versions-panel versions-compare"><div className="versions-compare__header"><div><p>Análisis de cambios</p><h2>Cambios entre versiones</h2></div></div><div className="versions-compare__controls"><label><span>Versión anterior</span><select value={previousId} onChange={(event) => { setPreviousId(event.target.value); setComparison(null) }}>{versions.map((version) => <option key={version.id} value={version.id}>{version.version} ({formatDate(version.created_at)})</option>)}</select></label><button type="button" aria-label="Intercambiar versiones" onClick={swapVersions}><VersionIcon name="swap" size={18} /></button><label><span>Versión actual</span><select value={currentId} onChange={(event) => { setCurrentId(event.target.value); setComparison(null) }}>{versions.map((version) => <option key={version.id} value={version.id}>{version.version} ({formatDate(version.created_at)})</option>)}</select></label></div><div className="versions-diff">{comparison ? <><div className="versions-diff__column"><header>{comparison.from.version}</header>{comparison.changed_fields.length ? comparison.changed_fields.map((change) => <p key={change.field}><span>{change.field}</span>{String(change.from ?? '—')}</p>) : <p>Sin cambios registrados.</p>}</div><div className="versions-diff__column"><header>{comparison.to.version}</header>{comparison.changed_fields.length ? comparison.changed_fields.map((change) => <p className="is-modified" key={change.field}><span>{change.field}</span>{String(change.to ?? '—')}</p>) : <p>Sin cambios registrados.</p>}</div></> : <p>Seleccione dos versiones y pulse “Comparar versiones”.</p>}</div></section>
     <section className="versions-panel versions-timeline"><div className="versions-panel__heading"><div><p>Trazabilidad</p><h2>Línea de tiempo documental</h2></div></div><div className="versions-timeline__list">{timeline.map((item) => <article key={item.id} className="versions-timeline__item"><span className="versions-timeline__dot" /><strong>{item.version ? `Versión ${item.version}` : 'Documento'}</strong><div><b>{item.action?.name || item.type || 'Evento documental'}</b><span>{item.author?.name || '—'}</span><small>{item.comment || item.result || '—'}</small></div><time>{formatDate(item.at)}</time></article>)}{!timeline.length && <p>No hay eventos documentales registrados.</p>}</div></section></div>
  </div>
}

export default VersionsView
