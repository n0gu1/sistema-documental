import { useDeferredValue, useEffect, useState } from 'react'
import { apiRequest, formatDate, reviewPriorityName, reviewStatusName } from './documentApi'
import './ReviewerReviewInboxView.css'

function InboxIcon({ name, size = 18 }) {
  const content = name === 'search' ? <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></> : name === 'eye' ? <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></> : name === 'calendar' ? <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></> : <><path d="M6 2.8h8.6L19 7.2V21H6z" /><path d="M14.5 3v4.5H19M9 12h7M9 16h7" /></>
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function ReviewerReviewInboxView() {
  const [reviews, setReviews] = useState([])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('Todos los estados')
  const [priority, setPriority] = useState('Todas las prioridades')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())

  useEffect(() => {
    let active = true
    apiRequest('/api/reviews/inbox/?limit=100')
      .then((data) => {
        if (!active) return
        setReviews((data.results || []).map((review) => ({ ...review, statusName: reviewStatusName(review), priorityName: reviewPriorityName(review.priority), due: formatDate(review.deadline, 'Sin fecha') })))
      })
      .catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const visibleReviews = reviews.filter((review) => (!deferredQuery || [review.document.code, review.document.title, review.requested_by.name, review.statusName].join(' ').toLowerCase().includes(deferredQuery)) && (status === 'Todos los estados' || review.statusName === status) && (priority === 'Todas las prioridades' || review.priorityName === priority))
  function openReview(review) { window.dispatchEvent(new CustomEvent('review-document-open', { detail: { reviewId: review.id } })) }

  return <div className="reviewer-inbox-view"><header className="reviewer-inbox-heading"><div><h1>Bandeja de revisión</h1><p>Gestiona los documentos pendientes, prioriza revisiones y emite dictámenes.</p></div><time><InboxIcon name="calendar" size={18} /> {new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(new Date())}</time></header>{error && <p className="editor-error" role="alert">{error}</p>}<section className="reviewer-inbox-metrics"><article className="reviewer-inbox-metric"><span className="reviewer-inbox-metric-icon is-blue"><InboxIcon size={30} /></span><div><p>Total asignados</p><strong>{reviews.length}</strong><small>Datos registrados</small></div></article><article className="reviewer-inbox-metric"><span className="reviewer-inbox-metric-icon is-orange"><InboxIcon size={30} /></span><div><p>Pendientes</p><strong>{reviews.filter((review) => review.status?.code === 'PENDIENTE').length}</strong><small>Revisiones abiertas</small></div></article><article className="reviewer-inbox-metric"><span className="reviewer-inbox-metric-icon is-green"><InboxIcon size={30} /></span><div><p>Aprobadas</p><strong>{reviews.filter((review) => review.status?.code === 'APROBADA').length}</strong><small>Decisiones registradas</small></div></article></section><div className="reviewer-inbox-layout"><main><section className="reviewer-inbox-filters"><label className="reviewer-inbox-search"><span>Búsqueda libre</span><div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por código, documento o autor..." /><InboxIcon name="search" size={18} /></div></label><label><span>Estado</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option>Todos los estados</option>{[...new Set(reviews.map((review) => review.statusName))].map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Prioridad</span><select value={priority} onChange={(event) => setPriority(event.target.value)}><option>Todas las prioridades</option><option>Alta</option><option>Media</option><option>Baja</option></select></label></section><section className="reviewer-inbox-table-card"><div className="reviewer-inbox-table-wrap"><table><thead><tr><th>Documento</th><th>Autor</th><th>Estado</th><th>Prioridad</th><th>Fecha límite</th><th>Versión</th><th>Acciones</th></tr></thead><tbody>{visibleReviews.map((review) => <tr key={review.id}><td><strong>{review.document.code}</strong><span>{review.document.title}</span></td><td>{review.requested_by.name}</td><td>{review.statusName}</td><td>{review.priorityName}</td><td>{review.due}</td><td>{review.document.version}</td><td><button type="button" aria-label={`Revisar ${review.document.title}`} onClick={() => openReview(review)}><InboxIcon name="eye" size={16} /></button></td></tr>)}</tbody></table>{loading && <p>Cargando revisiones...</p>}{!loading && !visibleReviews.length && <p>No hay revisiones que coincidan con los filtros.</p>}</div><footer><span>Mostrando {visibleReviews.length} de {reviews.length} revisiones</span></footer></section></main></div></div>
}

export default ReviewerReviewInboxView
