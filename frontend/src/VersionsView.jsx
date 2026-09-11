import { PermissionButton, PermissionForm, PermissionInput } from './Permissions'
import { useEffect, useRef, useState } from 'react'
import RestoreVersionButton from './RestoreVersionButton'
import { apiRequest, downloadFile, formatDate } from './documentApi'
import './VersionsView.css'
import VersionStateSummary from './VersionStateSummary'

function VersionIcon({ name, size = 18 }) {
  const content = name === 'back' ? <path d="m15 18-6-6 6-6M9 12h11" /> : name === 'download' ? <><path d="M12 4v12m0 0 5-5m-5 5-5-5" /><path d="M5 20h14" /></> : name === 'compare' ? <><path d="M7 4v16M17 4v16M3 8h8M13 16h8" /><path d="m4 8 3-3 3 3m4 8 3 3 3-3" /></> : name === 'swap' ? <><path d="M7 7h12m0 0-3-3m3 3-3 3M17 17H5m0 0 3 3m-3-3 3-3" /></> : name === 'calendar' ? <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></> : name === 'eye' ? <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></> : <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 12h7M9 16h7" /></>
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function VersionsView({ documentId, onBack }) {
  const fileInput = useRef(null)
  const [document, setDocument] = useState(null)
  const [versions, setVersions] = useState([])
  const [refresh, setRefresh] = useState(0)
  const [timeline, setTimeline] = useState([])
  const [previousId, setPreviousId] = useState('')
  const [selectedVersionId, setSelectedVersionId] = useState('')
  const [currentVersionId, setCurrentVersionId] = useState(null)
  const [comparison, setComparison] = useState(null)
  const [error, setError] = useState('')
  const [publishingVersionId, setPublishingVersionId] = useState('')
  const [publishComment, setPublishComment] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [publishNotice, setPublishNotice] = useState('')
  const [loadingUpload, setLoadingUpload] = useState(false)

  useEffect(() => {
    if (!documentId) return
    let active = true
    async function load() {
      try {
        const [detail, versionData, timelineData] = await Promise.all([apiRequest(`/api/documents/${documentId}/`), apiRequest(`/api/documents/${documentId}/versions/`), apiRequest(`/api/documents/${documentId}/timeline/`)] )
        if (!active) return
        const loadedVersions = versionData.versions || []
        setDocument(detail.document); setVersions(loadedVersions); setTimeline(timelineData.events || []); setCurrentVersionId(versionData.current_version_id || null); setSelectedVersionId(versionData.current_version_id || loadedVersions[0]?.id || ''); setPreviousId(loadedVersions[1]?.id || '')
      } catch (requestError) { if (active) setError(requestError.message) }
    }
    load()
    return () => { active = false }
  }, [documentId, refresh])

  async function compare() {
    if (!document?.id || !previousId || !selectedVersionId) return
    try { setComparison(await apiRequest(`/api/documents/${document.id}/versions/compare/?from_version=${previousId}&to_version=${selectedVersionId}`)) } catch (requestError) { setError(requestError.message) }
  }

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
      setCurrentVersionId(uploaded.is_current ? uploaded.id : null)
      setSelectedVersionId(uploaded.id)
    } catch (requestError) { setError(requestError.message) }
    finally { setLoadingUpload(false) }
  }

  async function publishVersion(event) {
    event.preventDefault()
    if (!document?.id || !publishingVersionId) return setError('Seleccione una versión aprobada para publicar.')
    setError('')
    setPublishNotice('')
    setPublishing(true)
    try {
      const data = await apiRequest(`/api/documents/${document.id}/versions/${publishingVersionId}/publish/`, { method: 'POST', body: { comment: publishComment } })
      setVersions((current) => current.map((version) => version.id === publishingVersionId ? data.version : { ...version, is_current: false }))
      setCurrentVersionId(publishingVersionId)
      setSelectedVersionId(publishingVersionId)
      setDocument((current) => ({ ...current, status: { code: 'PUBLICADO', name: 'Publicado' } }))
      setPublishingVersionId('')
      setPublishComment('')
      setPublishNotice(`Versión ${data.version.version} publicada (ID: ${data.version.id}). Disponible para lectores autorizados.`)
      setRefresh(value => value + 1)
    } catch (requestError) { setError(requestError.message) } finally { setPublishing(false) }
  }

  function swapVersions() { setPreviousId(selectedVersionId); setSelectedVersionId(previousId); setComparison(null) }
  const currentVersion = versions.find((version) => version.id === currentVersionId) || null

  if (!documentId) return <div className="versions-view"><p>Seleccione un documento para consultar su historial.</p><button type="button" onClick={onBack}>Volver a documentos</button></div>
  if (error && !document) return <div className="versions-view"><p className="versions-error" role="alert">{error}</p><button type="button" onClick={onBack}>Volver a documentos</button></div>
  if (!document) return <div className="versions-view"><p>Cargando versiones...</p></div>
  const approvedVersions = versions.filter((version) => version.status?.code === 'APROBADO')
  return <div className="versions-view"><VersionStateSummary version={versions.find(version => version.id === selectedVersionId)} /><header className="versions-heading"><div><p>Control documental</p><h1>Gestión de versiones</h1><span>Administre el historial y la trazabilidad de versiones documentales.</span></div><button type="button" onClick={onBack}><VersionIcon name="back" size={17} /> Volver a documentos</button></header>
     {error && <p className="versions-error" role="alert">{error}</p>}
    <section className="versions-document-card"><div className="versions-document-card__icon"><VersionIcon size={24} /></div><article><span>Código</span><strong>{document.code}</strong></article><article className="versions-document-card__title"><span>Título</span><strong>{document.title}</strong></article><article><span>Área</span><strong>{document.area?.name || '—'}</strong></article><article><span>Versión vigente</span><strong>{currentVersion?.version || 'Sin versión vigente'}</strong></article><article className="versions-document-card__owner"><span>Responsable</span><div><i>{(document.responsible?.name || '—').split(' ').map((part) => part[0]).join('').slice(0, 2)}</i><strong>{document.responsible?.name || '—'}</strong></div></article><article><span>Estado de versión vigente</span><strong className="versions-status"><i /> {currentVersion?.status?.name || '—'}</strong></article><article><span>Última actualización</span><strong>{formatDate(document.updated_at)}</strong></article><VersionIcon name="calendar" size={18} /></section>
     <div className="versions-toolbar"><PermissionInput permission="versiones.crear" ref={fileInput} className="versions-file-input" type="file" onChange={uploadVersion} /><PermissionButton permission="versiones.crear" type="button" disabled={loadingUpload} onClick={() => fileInput.current?.click()}>{loadingUpload ? 'Cargando...' : 'Subir nueva versión'}</PermissionButton><button type="button" onClick={compare}><VersionIcon name="compare" size={18} /> Comparar versiones</button></div>
     {approvedVersions.length > 0 && <PermissionForm permission="revisiones.aprobar" className="versions-publish-panel" onSubmit={publishVersion}><div><p>Publicación autorizada</p><h2>Publicar versión aprobada</h2><span>Seleccione una versión aprobada para hacerla visible como versión vigente.</span></div><label>Versión<select required value={publishingVersionId} onChange={(event) => setPublishingVersionId(event.target.value)} disabled={publishing}><option value="">Seleccione una versión</option>{approvedVersions.map((version) => <option key={version.id} value={version.id}>Versión {version.version} · {version.name}</option>)}</select></label><label>Comentario de publicación<textarea value={publishComment} onChange={(event) => setPublishComment(event.target.value)} placeholder="Agregue una nota para la trazabilidad (opcional)." maxLength={1000} disabled={publishing} /></label><div className="versions-publish-actions"><button type="submit" disabled={publishing || !publishingVersionId}>{publishing ? 'Publicando...' : 'Publicar versión'}</button></div></PermissionForm>}
     {publishNotice && <p className="versions-publish-notice" role="status">{publishNotice}</p>}
    <section className="versions-panel versions-history"><div className="versions-panel__heading"><div><p>Historial documental</p><h2>Historial de versiones</h2></div><span>{versions.length} versiones registradas</span></div><div className="versions-table-scroll"><table><thead><tr><th>Versión</th><th>Fecha</th><th>Estado de versión</th><th>Responsable</th><th>Tamaño</th><th>Comentario</th><th>Acciones</th></tr></thead><tbody>{versions.map((item) => <tr key={item.id}><td><strong>{item.version}</strong>{item.id === currentVersionId && <small> Vigente</small>}</td><td>{formatDate(item.created_at)}</td><td><span className="versions-status"><i /> {item.status?.name || '—'}</span></td><td>{item.author?.name || '—'}</td><td>{item.size ? `${Math.round(item.size / 1024)} KB` : '—'}</td><td>{item.comment || '—'}</td><td><div className="versions-row-actions"><RestoreVersionButton documentId={document.id} version={item} onRestored={() => setRefresh(value => value + 1)} /><button type="button" disabled={!item.preview_url} onClick={() => window.open(item.preview_url, '_blank', 'noopener,noreferrer')} aria-label={`Ver versión ${item.version}`}><VersionIcon name="eye" size={16} /></button><PermissionButton permission="documentos.descargar" type="button" onClick={() => downloadFile(item.download_url)} aria-label={`Descargar versión ${item.version}`}><VersionIcon name="download" size={16} /></PermissionButton></div></td></tr>)}</tbody></table>{!versions.length && <p>No hay versiones registradas.</p>}</div><footer><span>Mostrando {versions.length} versiones</span></footer></section>
    <div className="versions-bottom-grid"><section className="versions-panel versions-compare"><div className="versions-compare__header"><div><p>Análisis de cambios</p><h2>Cambios entre versiones</h2></div></div><div className="versions-compare__controls"><label><span>Versión anterior</span><select value={previousId} onChange={(event) => { setPreviousId(event.target.value); setComparison(null) }}>{versions.map((version) => <option key={version.id} value={version.id}>{version.version} ({formatDate(version.created_at)})</option>)}</select></label><button type="button" aria-label="Intercambiar versiones" onClick={swapVersions}><VersionIcon name="swap" size={18} /></button><label><span>Versión seleccionada</span><select value={selectedVersionId} onChange={(event) => { setSelectedVersionId(event.target.value); setComparison(null) }}>{versions.map((version) => <option key={version.id} value={version.id}>{version.version} ({formatDate(version.created_at)})</option>)}</select></label></div><div className="versions-diff">{comparison ? <><div className="versions-diff__column"><header>{comparison.from.version}</header>{comparison.changed_fields.length ? comparison.changed_fields.map((change) => <p key={change.field}><span>{change.field}</span>{String(change.from ?? '—')}</p>) : <p>Sin cambios registrados.</p>}</div><div className="versions-diff__column"><header>{comparison.to.version}</header>{comparison.changed_fields.length ? comparison.changed_fields.map((change) => <p className="is-modified" key={change.field}><span>{change.field}</span>{String(change.to ?? '—')}</p>) : <p>Sin cambios registrados.</p>}</div></> : <p>Seleccione dos versiones y pulse “Comparar versiones”.</p>}</div></section>
     <section className="versions-panel versions-timeline"><div className="versions-panel__heading"><div><p>Trazabilidad</p><h2>Línea de tiempo documental</h2></div></div><div className="versions-timeline__list">{timeline.map((item) => <article key={item.id} className="versions-timeline__item"><span className="versions-timeline__dot" /><strong>{item.version ? `Versión ${item.version}` : 'Documento'}</strong><div><b>{item.action?.name || item.type || 'Evento documental'}</b><span>{item.author?.name || '—'}</span><small>{item.comment || item.result || '—'}</small></div><time>{formatDate(item.at)}</time></article>)}{!timeline.length && <p>No hay eventos documentales registrados.</p>}</div></section></div>
  </div>
}

export default VersionsView
