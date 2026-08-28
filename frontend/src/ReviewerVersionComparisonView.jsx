import { useEffect, useRef, useState } from 'react'
import { apiRequest, downloadFile, formatDate, reviewStatusName } from './documentApi'
import './ReviewerVersionComparisonView.css'

function CompareIcon({ name, size = 18 }) {
  const content = name === 'download' ? <><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 18v3h16v-3" /></> : name === 'comment' ? <><path d="M4 5h16v11H8l-4 4V5Z" /><path d="M8 9h8m-8 3h5" /></> : name === 'check' ? <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.7 2.7L16.5 9" /></> : <><path d="M6 2.8h8.6L19 7.2V21H6z" /><path d="M14.5 3v4.5H19M9 12h7M9 16h7" /></>
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

const changedFieldLabels = {
  name: 'Nombre del archivo',
  mime_type: 'Tipo de archivo',
  size: 'Tamaño',
  sha256: 'Hash SHA-256',
  comment: 'Comentario de cambio',
  status: 'Estado de la versión',
}

function formatBytes(value) {
  if (!value) return '—'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function formatChangedValue(value, field) {
  if (value === null || value === undefined || value === '') return '—'
  if (field === 'size') return formatBytes(value)
  if (field === 'status' && typeof value === 'object') return value.name || value.code || '—'
  return String(value)
}

function versionFields(version) {
  return [
    ['name', 'Archivo', version?.name],
    ['mime_type', 'Tipo', version?.mime_type],
    ['size', 'Tamaño', formatBytes(version?.size)],
    ['sha256', 'Hash SHA-256', version?.sha256],
    ['comment', 'Comentario de cambio', version?.comment],
    ['status', 'Estado', version?.status?.name],
  ]
}

function isChanged(comparison, field) {
  return Boolean(comparison?.changed_fields?.some((change) => change.field === field))
}

function ReviewerVersionComparisonView({ onAction }) {
  const [review, setReview] = useState(null)
  const [versions, setVersions] = useState([])
  const [comparison, setComparison] = useState(null)
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [loadingComparison, setLoadingComparison] = useState(false)
  const [commentOpen, setCommentOpen] = useState(false)
  const commentInput = useRef(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const inbox = await apiRequest('/api/reviews/inbox/?limit=1')
        const selected = inbox.results?.[0]
        if (!selected) throw new Error('No hay revisiones asignadas.')
        const [detail, versionData, documentData] = await Promise.all([
          apiRequest(`/api/reviews/${selected.id}/`),
          apiRequest(`/api/documents/${selected.document.id}/versions/`),
          apiRequest(`/api/documents/${selected.document.id}/`),
        ])
        const loadedVersions = versionData.versions || []
        const loadedReview = { ...detail.review, document: { ...detail.review.document, ...documentData.document } }
        if (active) {
          setReview(loadedReview)
          setVersions(loadedVersions)
          requestComparison(loadedReview, loadedVersions)
        }
      } catch (requestError) { if (active) setError(requestError.message) }
    }
    load()
    return () => { active = false }
  }, [])

  const current = versions.find((version) => version.is_current) || versions[0]
  const previous = versions.find((version) => version.id !== current?.id) || versions[1]

  async function requestComparison(selectedReview, availableVersions) {
    const selectedCurrent = availableVersions.find((version) => version.is_current) || availableVersions[0]
    const selectedPrevious = availableVersions.find((version) => version.id !== selectedCurrent?.id) || availableVersions[1]
    if (!selectedReview || !selectedCurrent || !selectedPrevious) return
    setLoadingComparison(true)
    try {
      const result = await apiRequest(`/api/documents/${selectedReview.document.id}/versions/compare/?from_version=${selectedPrevious.id}&to_version=${selectedCurrent.id}`)
      setComparison(result)
    } catch (requestError) { setError(requestError.message) } finally { setLoadingComparison(false) }
  }

  function loadComparison() { requestComparison(review, versions) }

  function openCommentComposer() {
    setCommentOpen(true)
    requestAnimationFrame(() => commentInput.current?.focus())
  }

  async function addComment(event) {
    event.preventDefault()
    if (!comment.trim() || !review) return
    try {
      const data = await apiRequest(`/api/reviews/${review.id}/comments/`, { method: 'POST', body: { content: comment, type: 'OBSERVACION' } })
      setReview((currentReview) => ({ ...currentReview, comments: [...(currentReview.comments || []), data.comment] }))
      setComment('')
      onAction?.('Observación emitida.')
    } catch (requestError) { setError(requestError.message) }
  }

  async function approve() {
    if (!review || review.status?.code !== 'PENDIENTE') return
    try {
      const data = await apiRequest(`/api/reviews/${review.id}/approve/`, { method: 'POST', body: { comment } })
      setReview((currentReview) => ({ ...data.review, document: currentReview.document }))
      setComment('')
      onAction?.('Cambios aprobados.')
    } catch (requestError) { setError(requestError.message) }
  }

  if (error && !review) return <div className="reviewer-comparison"><p className="editor-error" role="alert">{error}</p></div>
  if (!review) return <div className="reviewer-comparison"><p>Cargando comparación...</p></div>

  const comments = review.comments || []
  const canApprove = review.status?.code === 'PENDIENTE'
  const author = current?.author?.name || review.document.responsible?.name || '—'
  const changeCount = comparison?.changed_fields?.length || 0

  return <div className="reviewer-comparison">
    <header className="reviewer-comparison-heading"><div><h1>Comparación de versiones</h1><p>Contrasta cambios entre versiones, valida ajustes y deja hallazgos.</p></div></header>
    {error && <p className="editor-error" role="alert">{error}</p>}
    <section className="reviewer-comparison-summary">
      <span className="reviewer-comparison-document-icon"><CompareIcon size={35} /></span>
      <div className="reviewer-comparison-summary-info">
        <h2>{review.document.code} {review.document.title}</h2>
        <dl>
          <div><dt>Área</dt><dd>{review.document.area?.name || '—'}</dd></div>
          <div><dt>Versión anterior</dt><dd>{previous?.version || '—'}</dd></div>
          <div><dt>Versión actual</dt><dd>{current?.version || review.document.version || '—'}</dd></div>
          <div><dt>Estado</dt><dd>{reviewStatusName(review)}</dd></div>
          <div><dt>Autor</dt><dd>{author}</dd></div>
          <div><dt>Fecha de actualización</dt><dd>{formatDate(current?.created_at || review.document.updated_at, 'Sin fecha')}</dd></div>
        </dl>
      </div>
      <div className="reviewer-comparison-summary-actions">
        {current?.download_url && <button type="button" onClick={() => downloadFile(current.download_url)}><CompareIcon name="download" size={17} />Descargar</button>}
        <button type="button" onClick={openCommentComposer}><CompareIcon name="comment" size={17} />Emitir observación</button>
        <button className="is-primary" type="button" disabled={!canApprove} onClick={approve}><CompareIcon name="check" size={17} />Aprobar cambios</button>
      </div>
    </section>
    <div className="reviewer-comparison-layout">
      <main>
        <section className="reviewer-comparison-card reviewer-comparison-history">
          <header><h2>Historial de versiones</h2><span>{versions.length} versiones registradas</span></header>
          <div className="reviewer-comparison-history-table"><table><thead><tr><th>Versión</th><th>Fecha</th><th>Autor</th><th>Descripción de cambios</th><th>Estado</th></tr></thead><tbody>{versions.map((version) => <tr key={version.id}><td><strong>{version.version}</strong>{version.is_current && <small>Actual</small>}</td><td>{formatDate(version.created_at)}</td><td>{version.author?.name || '—'}</td><td>{version.comment || '—'}</td><td>{version.status?.name || '—'}</td></tr>)}</tbody></table>{!versions.length && <p className="reviewer-comparison-empty">No hay versiones registradas.</p>}</div>
        </section>
        <section className="reviewer-comparison-card reviewer-comparison-diff">
          <header><div><h2>Comparación de archivos</h2><p>{loadingComparison ? 'Consultando diferencias registradas...' : comparison ? `${changeCount} ${changeCount === 1 ? 'campo modificado' : 'campos modificados'}` : 'No hay dos versiones disponibles para comparar.'}</p></div><button type="button" disabled={loadingComparison || !previous || !current} onClick={loadComparison}>Actualizar comparación</button></header>
          {comparison && <div className="reviewer-comparison-columns"><article className="reviewer-version-column is-previous"><h3>Versión {comparison.from.version}</h3>{versionFields(comparison.from).map(([field, label, value]) => <div key={field} className={isChanged(comparison, field) ? 'is-changed' : ''}><span>{label}</span><p>{formatChangedValue(value, field)}</p></div>)}</article><div className="reviewer-comparison-flow" aria-hidden="true">→</div><article className="reviewer-version-column is-current"><h3>Versión {comparison.to.version}</h3>{versionFields(comparison.to).map(([field, label, value]) => <div key={field} className={isChanged(comparison, field) ? 'is-changed' : ''}><span>{label}</span><p>{formatChangedValue(value, field)}</p></div>)}</article></div>}
          {!comparison && !loadingComparison && <p className="reviewer-comparison-empty">No hay una comparación disponible.</p>}
          <footer className="reviewer-comparison-legend"><span><i className="is-modified" />Modificación</span><span>Los valores se obtienen del archivo registrado.</span></footer>
        </section>
      </main>
      <aside className="reviewer-comparison-sidebar">
        <section className="reviewer-comparison-card reviewer-comparison-findings"><header><h2>Hallazgos del revisor</h2><span>{changeCount}</span></header>{comparison?.changed_fields?.length ? <div className="reviewer-findings-list">{comparison.changed_fields.map((change) => <article key={change.field}><b>Cambio</b><div><strong>{changedFieldLabels[change.field] || change.field}</strong><p>{formatChangedValue(change.from, change.field)} → {formatChangedValue(change.to, change.field)}</p></div></article>)}</div> : <p className="reviewer-comparison-empty">No hay cambios registrados entre estas versiones.</p>}</section>
        <section className="reviewer-comparison-card reviewer-comparison-comments"><header><h2>Comentarios y notas</h2><span>{comments.length}</span></header><div className="reviewer-comments-list">{comments.length ? comments.map((item) => <article key={item.id}><div className="reviewer-comment-avatar">{(item.author?.name || 'U').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</div><div><strong>{item.author?.name || 'Usuario'}</strong><time>{formatDate(item.created_at, 'Sin fecha')}</time><p>{item.content}</p></div></article>) : <p className="reviewer-comparison-empty">No hay comentarios registrados.</p>}</div>{commentOpen && <form className="reviewer-comparison-comment-form" onSubmit={addComment}><textarea ref={commentInput} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Escribe una observación..." /><button type="submit">Enviar observación</button></form>}</section>
      </aside>
    </div>
  </div>
}

export default ReviewerVersionComparisonView
