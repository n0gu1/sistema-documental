import { useEffect, useState } from 'react'
import { apiRequest, formatDate, reviewStatusName } from './documentApi'
import './ReviewerDocumentReviewView.css'

function ReviewIcon({ name, size = 18 }) {
  const content = name === 'check' ? <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.7 2.7L16.5 9" /></> : name === 'close' ? <><path d="m6 6 12 12M18 6 6 18" /></> : <><path d="M6 2.8h8.6L19 7.2V21H6z" /><path d="M14.5 3v4.5H19M9 12h7M9 16h7" /></>
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function ReviewerDocumentReviewView({ reviewId, onAction }) {
  const [review, setReview] = useState(null)
  const [activeTab, setActiveTab] = useState('Contenido')
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      try {
        let id = reviewId
        if (!id) { const list = await apiRequest('/api/reviews/inbox/?limit=1'); id = list.results?.[0]?.id }
        if (!id) throw new Error('No hay revisiones asignadas.')
        const data = await apiRequest(`/api/reviews/${id}/`)
        if (active) setReview(data.review)
      } catch (requestError) { if (active) setError(requestError.message) }
    }
    load()
    return () => { active = false }
  }, [reviewId])

  async function updateChecklist(item) {
    try {
      const data = await apiRequest(`/api/reviews/checklist/${item.id}/`, { method: 'PATCH', body: { completed: !item.completed } })
      setReview(data.review)
    } catch (requestError) { setError(requestError.message) }
  }

  async function decide(action) {
    try {
      const data = await apiRequest(`/api/reviews/${review.id}/${action}/`, { method: 'POST', body: { comment } })
      setReview(data.review); setComment(''); onAction(`Revisión ${action === 'approve' ? 'aprobada' : action === 'reject' ? 'rechazada' : 'devuelta'}.`)
    } catch (requestError) { setError(requestError.message) }
  }

  async function addComment(event) {
    event.preventDefault()
    if (!comment.trim()) return
    try {
      const data = await apiRequest(`/api/reviews/${review.id}/comments/`, { method: 'POST', body: { content: comment, type: 'OBSERVACION' } })
      setReview((current) => ({ ...current, comments: [...current.comments, data.comment] })); setComment('')
    } catch (requestError) { setError(requestError.message) }
  }

  if (error) return <div className="reviewer-document-review"><p className="editor-error" role="alert">{error}</p></div>
  if (!review) return <div className="reviewer-document-review"><p>Cargando revisión...</p></div>
  return <div className="reviewer-document-review"><header className="reviewer-review-heading"><div><h1>Revisar documento</h1><p>Analiza el contenido, registra observaciones y emite una decisión.</p></div></header><section className="reviewer-document-summary"><span className="reviewer-document-icon"><ReviewIcon size={39} /></span><div className="reviewer-document-title"><h2>{review.document.code} {review.document.title}</h2><dl><div><dt>Versión</dt><dd>{review.document.version}</dd></div><div><dt>Estado</dt><dd><b>{reviewStatusName(review)}</b></dd></div><div><dt>Solicitado por</dt><dd>{review.requested_by.name}</dd></div><div><dt>Fecha límite</dt><dd>{formatDate(review.deadline, 'Sin fecha')}</dd></div></dl></div></section><div className="reviewer-review-body"><main><nav className="reviewer-review-tabs" aria-label="Secciones de la revisión">{['Vista general', 'Contenido', 'Observaciones'].map((tab) => <button className={activeTab === tab ? 'is-active' : ''} type="button" key={tab} onClick={() => setActiveTab(tab)}><ReviewIcon size={17} /> {tab}</button>)}</nav>{activeTab !== 'Observaciones' ? <article className="reviewer-document-content"><h3>{activeTab}</h3><p>{review.request_comment || 'No hay instrucciones adicionales para esta revisión.'}</p><p>Documento: {review.document.title}. Versión {review.document.version}.</p></article> : <article className="reviewer-document-content"><h3>Observaciones y comentarios</h3>{review.comments.map((item) => <p key={item.id}><strong>{item.author.name}:</strong> {item.content}</p>)}<form onSubmit={addComment}><input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Escribe una observación..." /><button type="submit">Agregar</button></form></article>}</main><aside className="reviewer-review-sidebar"><section><h2>Checklist de revisión</h2><ul>{review.checklist.map((item) => <li key={item.id}><button type="button" onClick={() => updateChecklist(item)}><ReviewIcon name={item.completed ? 'check' : 'pending'} size={16} /></button><span>{item.title}</span></li>)}</ul></section><section><h2>Decisión</h2><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Comentario de la decisión..." /><div><button type="button" onClick={() => decide('return')}>Devolver</button><button type="button" onClick={() => decide('reject')}><ReviewIcon name="close" size={15} /> Rechazar</button><button type="button" onClick={() => decide('approve')}><ReviewIcon name="check" size={15} /> Aprobar</button></div></section></aside></div></div>
}

export default ReviewerDocumentReviewView
