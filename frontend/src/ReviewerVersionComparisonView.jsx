import { useEffect, useState } from 'react'
import { apiRequest, downloadFile, formatDate, reviewStatusName } from './documentApi'
import './ReviewerVersionComparisonView.css'

function CompareIcon({ name, size = 18 }) {
  const content = name === 'download' ? <><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 18v3h16v-3" /></> : name === 'comment' ? <><path d="M4 5h16v11H8l-4 4V5Z" /><path d="M8 9h8m-8 3h5" /></> : <><path d="M6 2.8h8.6L19 7.2V21H6z" /><path d="M14.5 3v4.5H19M9 12h7M9 16h7" /></>
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function ReviewerVersionComparisonView({ onAction }) {
  const [review, setReview] = useState(null)
  const [versions, setVersions] = useState([])
  const [comparison, setComparison] = useState(null)
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const inbox = await apiRequest('/api/reviews/inbox/?limit=1')
        const selected = inbox.results?.[0]
        if (!selected) throw new Error('No hay revisiones asignadas.')
        const [detail, versionData] = await Promise.all([apiRequest(`/api/reviews/${selected.id}/`), apiRequest(`/api/documents/${selected.document.id}/versions/`)] )
        if (active) { setReview(detail.review); setVersions(versionData.versions || []) }
      } catch (requestError) { if (active) setError(requestError.message) }
    }
    load()
    return () => { active = false }
  }, [])

  async function compare() {
    const current = versions[0]
    const previous = versions[1]
    if (!review || !current || !previous) return
    try { setComparison(await apiRequest(`/api/documents/${review.document.id}/versions/compare/?from_version=${previous.id}&to_version=${current.id}`)) } catch (requestError) { setError(requestError.message) }
  }

  async function addComment(event) {
    event.preventDefault()
    if (!comment.trim() || !review) return
    try {
      const data = await apiRequest(`/api/reviews/${review.id}/comments/`, { method: 'POST', body: { content: comment, type: 'OBSERVACION' } })
      setReview((current) => ({ ...current, comments: [...current.comments, data.comment] })); setComment(''); onAction('Observación emitida.')
    } catch (requestError) { setError(requestError.message) }
  }

  async function approve() {
    if (!review) return
    try { const data = await apiRequest(`/api/reviews/${review.id}/approve/`, { method: 'POST', body: { comment } }); setReview(data.review); onAction('Cambios aprobados.') } catch (requestError) { setError(requestError.message) }
  }

  if (error) return <div className="reviewer-comparison"><p className="editor-error" role="alert">{error}</p></div>
  if (!review) return <div className="reviewer-comparison"><p>Cargando comparación...</p></div>
  const current = versions[0]
  return <div className="reviewer-comparison"><header className="reviewer-comparison-heading"><div><h1>Comparación de versiones</h1><p>Contrasta cambios entre versiones, valida ajustes y deja hallazgos.</p></div></header><section className="reviewer-comparison-summary"><span className="reviewer-comparison-document-icon"><CompareIcon size={35} /></span><div className="reviewer-comparison-summary-info"><h2>{review.document.code} {review.document.title}</h2><dl><div><dt>Versión anterior</dt><dd>{versions[1]?.version || '—'}</dd></div><div><dt>Versión actual</dt><dd>{versions[0]?.version || review.document.version}</dd></div><div><dt>Estado</dt><dd>{reviewStatusName(review)}</dd></div><div><dt>Solicitado por</dt><dd>{review.requested_by.name}</dd></div><div><dt>Fecha límite</dt><dd>{formatDate(review.deadline, 'Sin fecha')}</dd></div></dl></div><div className="reviewer-comparison-summary-actions">{current?.download_url && <button type="button" onClick={() => downloadFile(current.download_url)}><CompareIcon name="download" size={17} /> Descargar</button>}<button type="button" onClick={approve}>Aprobar cambios</button></div></section><div className="reviewer-comparison-layout"><main><section className="reviewer-comparison-card reviewer-comparison-history"><header><h2>Historial de versiones</h2><button type="button" onClick={compare}>Comparar últimas versiones</button></header><div className="reviewer-comparison-history-table"><table><thead><tr><th>Versión</th><th>Fecha</th><th>Estado</th><th>Comentario</th></tr></thead><tbody>{versions.map((version) => <tr key={version.id}><td><strong>{version.version}</strong></td><td>{formatDate(version.created_at)}</td><td>{version.status?.name}</td><td>{version.comment || '—'}</td></tr>)}</tbody></table></div></section>{comparison && <section className="reviewer-comparison-card"><h2>Resultado de comparación</h2><p>{comparison.same_content ? 'No hay diferencias de contenido registradas.' : 'Se detectaron cambios en la versión seleccionada.'}</p>{comparison.changed_fields?.map((field) => <p key={field.field}><strong>{field.field}:</strong> {String(field.from)} -&gt; {String(field.to)}</p>)}</section>}<section className="reviewer-comparison-card"><h2><CompareIcon name="comment" size={19} /> Comentarios</h2>{review.comments.map((item) => <p key={item.id}><strong>{item.author.name}:</strong> {item.content}</p>)}<form onSubmit={addComment}><input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Emitir observación..." /><button type="submit">Enviar</button></form></section></main></div></div>
}

export default ReviewerVersionComparisonView
