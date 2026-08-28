import { useEffect, useState } from 'react'
import { apiRequest, formatDate, reviewPriorityName, reviewStatusName } from './documentApi'
import './ReviewerDocumentReviewView.css'

function ReviewIcon({ name, size = 18 }) {
  const content = name === 'check' ? <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.7 2.7L16.5 9" /></> : name === 'pending' ? <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> : name === 'close' ? <><path d="m6 6 12 12M18 6 6 18" /></> : name === 'comment' ? <><path d="M4 5h16v11H8l-4 4V5Z" /><path d="M8 9h8m-8 3h5" /></> : name === 'paperclip' ? <path d="m20.5 11.5-8.9 8.9a5 5 0 0 1-7.1-7.1l9.6-9.6a3.5 3.5 0 0 1 5 5l-9.6 9.6a2 2 0 1 1-2.8-2.8l8.9-8.9" /> : name === 'layers' ? <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></> : name === 'download' ? <><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 20h16" /></> : name === 'eye' ? <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></> : name === 'calendar' ? <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></> : <><path d="M6 2.8h8.6L19 7.2V21H6z" /><path d="M14.5 3v4.5H19M9 12h7M9 16h7" /></>
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function daysRemaining(deadline, statusCode) {
  if (statusCode !== 'PENDIENTE') return 'Revisión resuelta'
  if (!deadline) return 'Sin fecha límite'
  const days = Math.ceil((new Date(deadline) - new Date()) / 86400000)
  if (days < 0) return `Vencida hace ${Math.abs(days)} ${Math.abs(days) === 1 ? 'día' : 'días'}`
  return `${days} ${days === 1 ? 'día' : 'días'} restantes`
}

function statusTone(code) {
  return code?.toLowerCase().replaceAll('-', '_') || 'unknown'
}

function fileLabel(file) {
  return `${file.name || 'Archivo'} · Versión ${file.version || '—'}`
}

function ReviewerDocumentReviewView({ reviewId, onAction, onNavigate }) {
  const [review, setReview] = useState(null)
  const [activeTab, setActiveTab] = useState('Contenido')
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        let selectedId = reviewId
        if (!selectedId) {
          const list = await apiRequest('/api/reviews/inbox/?limit=1')
          selectedId = list.results?.[0]?.id
        }
        if (!selectedId) throw new Error('No hay revisiones asignadas.')
        const reviewData = await apiRequest(`/api/reviews/${selectedId}/`)
        const documentData = await apiRequest(`/api/documents/${reviewData.review.document.id}/`)
        if (active) setReview({ ...reviewData.review, document: { ...reviewData.review.document, ...documentData.document }, files: documentData.document.files || [] })
      } catch (requestError) {
        if (active) setError(requestError.message)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [reviewId])

  async function updateChecklist(item) {
    try {
      const data = await apiRequest(`/api/reviews/checklist/${item.id}/`, { method: 'PATCH', body: { completed: !item.completed } })
      setReview((current) => ({ ...current, ...data.review, document: current.document, files: current.files }))
    } catch (requestError) { setError(requestError.message) }
  }

  async function decide(action) {
    if (!review || review.status?.code !== 'PENDIENTE') return
    try {
      const data = await apiRequest(`/api/reviews/${review.id}/${action}/`, { method: 'POST', body: { comment } })
      setReview((current) => ({ ...current, ...data.review, document: current.document, files: current.files }))
      setComment('')
      onAction(`Revisión ${action === 'approve' ? 'aprobada' : action === 'reject' ? 'rechazada' : 'devuelta'}.`)
    } catch (requestError) { setError(requestError.message) }
  }

  async function addComment(event) {
    event.preventDefault()
    if (!comment.trim() || !review) return
    try {
      const data = await apiRequest(`/api/reviews/${review.id}/comments/`, { method: 'POST', body: { content: comment, type: 'OBSERVACION' } })
      setReview((current) => ({ ...current, comments: [...current.comments, data.comment] }))
      setComment('')
    } catch (requestError) { setError(requestError.message) }
  }

  if (loading) return <div className="reviewer-document-review"><p className="reviewer-review-loading">Cargando revisión...</p></div>
  if (error) return <div className="reviewer-document-review"><p className="editor-error" role="alert">{error}</p></div>
  if (!review) return null

  const statusCode = review.status?.code
  const currentFile = review.files.find((file) => file.is_current) || review.files[0]
  const canDecide = statusCode === 'PENDIENTE'
  const comments = review.comments || []

  return <div className="reviewer-document-review">
    <header className="reviewer-review-heading"><div><h1>Revisar documento</h1><p>Analiza el contenido, registra observaciones y emite una decisión.</p></div><time><ReviewIcon name="calendar" size={18} />{new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(new Date())}</time></header>
    <section className="reviewer-document-summary">
      <span className="reviewer-document-icon"><ReviewIcon size={39} /></span>
      <div className="reviewer-document-title"><h2>{review.document.code} {review.document.title}</h2><dl><div><dt>Código</dt><dd>{review.document.code || '—'}</dd></div><div><dt>Área</dt><dd>{review.document.area?.name || '—'}</dd></div><div><dt>Tipo</dt><dd>{review.document.type?.name || '—'}</dd></div><div><dt>Versión</dt><dd>{review.document.version || '—'}</dd></div><div><dt>Estado</dt><dd><b className={`is-${statusTone(statusCode)}`}>{reviewStatusName(review)}</b></dd></div><div><dt>Autor</dt><dd>{review.document.responsible?.name || review.requested_by?.name || '—'}</dd></div></dl></div>
      <dl className="reviewer-document-extra"><div><dt>Enviado por</dt><dd>{review.requested_by?.name || '—'}</dd></div><div><dt>Fecha de envío</dt><dd>{formatDate(review.requested_at, 'Sin fecha')}</dd></div><div><dt>Fecha límite</dt><dd>{formatDate(review.deadline, 'Sin fecha')}</dd></div><div><dt>Revisor asignado</dt><dd>{review.reviewer?.name || '—'}</dd></div></dl>
    </section>
    <div className="reviewer-review-body">
      <main>
        <nav className="reviewer-review-tabs" aria-label="Secciones de la revisión">{['Vista general', 'Contenido', ...(review.files.length ? ['Anexos'] : []), 'Observaciones'].map((tab) => <button className={activeTab === tab ? 'is-active' : ''} type="button" key={tab} onClick={() => setActiveTab(tab)}><ReviewIcon name={tab === 'Observaciones' ? 'comment' : tab === 'Anexos' ? 'paperclip' : tab === 'Contenido' ? 'document' : 'layers'} size={17} />{tab}</button>)}</nav>
        {activeTab === 'Contenido' && <article className="reviewer-document-content reviewer-document-content--file">{currentFile?.preview_url ? <iframe title={`Contenido de ${review.document.title}`} src={currentFile.preview_url} /> : <p className="reviewer-review-empty">No hay un archivo disponible para previsualizar.</p>}</article>}
        {activeTab === 'Vista general' && <article className="reviewer-document-content"><h3>Vista general</h3><p>{review.document.description || 'Este documento no tiene una descripción registrada.'}</p><dl className="reviewer-overview-data"><div><dt>Solicitud de revisión</dt><dd>{review.request_comment || 'Sin instrucciones adicionales.'}</dd></div><div><dt>Tiempo restante</dt><dd>{daysRemaining(review.deadline, statusCode)}</dd></div></dl></article>}
        {activeTab === 'Anexos' && <article className="reviewer-document-content"><h3>Anexos y archivos</h3><div className="reviewer-file-list">{review.files.map((file) => <div key={file.id}><span><ReviewIcon name="paperclip" size={18} /></span><div><strong>{fileLabel(file)}</strong><small>{file.comment || 'Sin comentario de carga'}</small></div><div className="reviewer-file-actions">{file.preview_url && <button type="button" onClick={() => window.open(file.preview_url, '_blank', 'noopener,noreferrer')}><ReviewIcon name="eye" size={16} />Ver</button>}{file.download_url && <button type="button" onClick={() => window.open(file.download_url, '_blank', 'noopener,noreferrer')}><ReviewIcon name="download" size={16} />Descargar</button>}</div></div>)}</div></article>}
        {activeTab === 'Observaciones' && <article className="reviewer-document-content"><h3>Observaciones y comentarios</h3><div className="reviewer-observation-list">{comments.length ? comments.map((item) => <div key={item.id}><strong>{item.author?.name || 'Usuario'}</strong><time>{formatDate(item.created_at, 'Sin fecha')}</time><p>{item.content}</p></div>) : <p className="reviewer-review-empty">No hay observaciones registradas.</p>}</div><form className="reviewer-comment-form" onSubmit={addComment}><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Escribe una observación..." /><button type="submit"><ReviewIcon name="comment" size={17} />Guardar observación</button></form></article>}
      </main>
      <aside className="reviewer-review-sidebar">
        <section><h2><ReviewIcon name="pending" size={20} />Estado de revisión</h2><dl className="reviewer-status-data"><div><dt>Etapa actual</dt><dd><b className={`is-${statusTone(statusCode)}`}>{reviewStatusName(review)}</b></dd></div><div><dt>Tiempo restante</dt><dd>{daysRemaining(review.deadline, statusCode)}</dd></div><div><dt>Nivel de prioridad</dt><dd><i className={`reviewer-priority-dot is-${review.priority?.toLowerCase() || 'media'}`} />{reviewPriorityName(review.priority)}</dd></div><div><dt>Asignado a</dt><dd>{review.reviewer?.name || '—'}</dd></div></dl></section>
        <section><h2><ReviewIcon name="check" size={20} />Checklist de revisión</h2><ul className="reviewer-checklist">{review.checklist.length ? review.checklist.map((item) => <li key={item.id}><button type="button" className={item.completed ? 'is-complete' : ''} onClick={() => updateChecklist(item)}><ReviewIcon name={item.completed ? 'check' : 'pending'} size={16} /></button><span>{item.title}</span></li>) : <li className="reviewer-side-empty">No hay checklist asociado.</li>}</ul></section>
        <section><h2><ReviewIcon name="comment" size={20} />Observaciones del revisor</h2><div className="reviewer-side-comments">{comments.length ? comments.slice(-3).map((item) => <article key={item.id}><span>{item.author?.name || 'Usuario'}</span><time>{formatDate(item.created_at, 'Sin fecha')}</time><p>{item.content}</p></article>) : <p className="reviewer-side-empty">No hay observaciones registradas.</p>}</div></section>
      </aside>
    </div>
    <footer className="reviewer-review-actions"><button type="button" onClick={() => setActiveTab('Observaciones')}><ReviewIcon name="comment" size={18} />Guardar observación</button><button type="button" onClick={() => onNavigate?.('compare')}><ReviewIcon name="layers" size={18} />Comparar versiones</button><button type="button" className="is-return" disabled={!canDecide} onClick={() => decide('return')}><ReviewIcon name="close" size={18} />Devolver con observaciones</button><button type="button" className="is-approve" disabled={!canDecide} onClick={() => decide('approve')}><ReviewIcon name="check" size={18} />Aprobar documento</button></footer>
  </div>
}

export default ReviewerDocumentReviewView
