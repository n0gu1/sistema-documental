import { useDeferredValue, useEffect, useState } from 'react'
import { apiRequest, formatDate, reviewPriorityName, reviewStatusName } from './documentApi'
import './ReviewerReviewInboxView.css'

function InboxIcon({ name, size = 18 }) {
  const content = name === 'search' ? <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></> : name === 'eye' ? <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></> : name === 'calendar' ? <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></> : name === 'download' ? <><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 20h16" /></> : name === 'folder' ? <><path d="M3 7.5h7l2 2h9v9.5H3z" /><path d="M3 7.5V5h6l2 2.5" /></> : name === 'comment' ? <><path d="M4 5h16v11H8l-4 4V5Z" /><path d="M8 9h8m-8 3h5" /></> : name === 'bell' ? <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7M10 20h4" /></> : name === 'flow' ? <><circle cx="6" cy="6" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="12" cy="18" r="2" /><path d="M8 6h8M7.5 7.5 11 16M16.5 7.5 13 16" /></> : <><path d="M6 2.8h8.6L19 7.2V21H6z" /><path d="M14.5 3v4.5H19M9 12h7M9 16h7" /></>
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function sameDay(left, right) {
  if (!left || !right) return false
  return new Intl.DateTimeFormat('en-CA').format(new Date(left)) === new Intl.DateTimeFormat('en-CA').format(right)
}

function toDateInput(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('en-CA').format(new Date(value))
}

function isOverdue(review) {
  return review.status?.code === 'PENDIENTE' && review.deadline && new Date(review.deadline) < new Date()
}

function csvValue(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

function ReviewerReviewInboxView({ onOpenReview }) {
  const [reviews, setReviews] = useState([])
  const [notifications, setNotifications] = useState([])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [author, setAuthor] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())

  useEffect(() => {
    let active = true
    Promise.allSettled([
      apiRequest('/api/reviews/inbox/?limit=100'),
      apiRequest('/api/notifications/?limit=4'),
    ]).then(([reviewsResult, notificationsResult]) => {
      if (!active) return
      if (reviewsResult.status === 'fulfilled') setReviews(reviewsResult.value.results || [])
      if (notificationsResult.status === 'fulfilled') setNotifications(notificationsResult.value.results || [])
      const failure = [reviewsResult, notificationsResult].find((item) => item.status === 'rejected')
      if (failure && reviewsResult.status === 'rejected') setError(failure.reason.message)
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const pendingReviews = reviews.filter((review) => review.status?.code === 'PENDIENTE')
  const activeReviews = reviews.filter((review) => review.status?.code === 'EN_REVISION')
  const completedReviews = reviews.filter((review) => ['APROBADA', 'RECHAZADA', 'CANCELADA', 'COMPLETADA'].includes(review.status?.code))
  const overdueReviews = pendingReviews.filter(isOverdue)
  const assignedToday = reviews.filter((review) => sameDay(review.requested_at, new Date()))
  const currentMonth = new Date().toISOString().slice(0, 7)
  const completedThisMonth = completedReviews.filter((review) => review.resolved_at?.startsWith(currentMonth))
  const authors = [...new Map(reviews.map((review) => [review.requested_by?.name, review.requested_by?.name]).filter(([key]) => key)).values()].sort()
  const statuses = [...new Set(reviews.map((review) => reviewStatusName(review)))].sort()
  const visibleReviews = reviews.filter((review) => {
    const searchable = [review.document?.code, review.document?.title, review.requested_by?.name, reviewStatusName(review), reviewPriorityName(review.priority)].join(' ').toLowerCase()
    const deadline = toDateInput(review.deadline)
    return (!deferredQuery || searchable.includes(deferredQuery)) &&
      (!status || reviewStatusName(review) === status) &&
      (!priority || reviewPriorityName(review.priority) === priority) &&
      (!author || review.requested_by?.name === author) &&
      (!dateFrom || (deadline && deadline >= dateFrom)) &&
      (!dateTo || (deadline && deadline <= dateTo))
  })

  function clearFilters() {
    setQuery('')
    setStatus('')
    setPriority('')
    setAuthor('')
    setDateFrom('')
    setDateTo('')
  }

  function exportList() {
    const rows = [
      ['Código', 'Documento', 'Autor', 'Estado', 'Prioridad', 'Fecha límite', 'Versión'],
      ...visibleReviews.map((review) => [review.document?.code, review.document?.title, review.requested_by?.name, reviewStatusName(review), reviewPriorityName(review.priority), formatDate(review.deadline, 'Sin fecha'), review.document?.version]),
    ]
    const blob = new Blob([rows.map((row) => row.map(csvValue).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'bandeja-de-revision.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  function openReview(review) {
    if (review) onOpenReview(review.id)
  }

  return <div className="reviewer-inbox-view">
    <header className="reviewer-inbox-heading">
      <div><h1>Bandeja de revisión</h1><p>Gestiona los documentos pendientes, prioriza revisiones y emite dictámenes.</p></div>
      <time><InboxIcon name="calendar" size={18} />{new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(new Date())}</time>
    </header>
    {error && <p className="editor-error" role="alert">{error}</p>}
    <section className="reviewer-inbox-metrics" aria-label="Resumen de revisiones">
      <article className="reviewer-inbox-metric"><span className="reviewer-inbox-metric-icon is-blue"><InboxIcon size={30} /></span><div><p>Asignados hoy</p><strong>{assignedToday.length}</strong><small>{reviews.length} revisiones en total</small></div></article>
      <article className="reviewer-inbox-metric"><span className="reviewer-inbox-metric-icon is-orange"><InboxIcon name="calendar" size={30} /></span><div><p>Pendientes por revisar</p><strong>{pendingReviews.length}</strong><small>Estado pendiente</small></div></article>
      <article className="reviewer-inbox-metric"><span className="reviewer-inbox-metric-icon is-red"><InboxIcon name="bell" size={30} /></span><div><p>Vencidos</p><strong>{overdueReviews.length}</strong><small>Requieren atención</small></div></article>
      <article className="reviewer-inbox-metric"><span className="reviewer-inbox-metric-icon is-green"><InboxIcon name="flow" size={30} /></span><div><p>En revisión activa</p><strong>{activeReviews.length}</strong><small>{completedReviews.length} revisiones resueltas</small></div></article>
    </section>
    <div className="reviewer-inbox-layout">
      <main>
        <section className="reviewer-inbox-filters" aria-label="Filtros de revisiones">
          <label className="reviewer-inbox-search"><span>Búsqueda libre</span><div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por código, documento o autor..." /><InboxIcon name="search" size={18} /></div></label>
          <label><span>Estado</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todos los estados</option>{statuses.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label><span>Prioridad</span><select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">Todas las prioridades</option>{['Alta', 'Media', 'Baja'].map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="reviewer-inbox-date"><span>Fecha límite</span><div><input type="date" aria-label="Fecha límite desde" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /><span>–</span><input type="date" aria-label="Fecha límite hasta" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /><InboxIcon name="calendar" size={16} /></div></label>
          <label><span>Autor</span><select value={author} onChange={(event) => setAuthor(event.target.value)}><option value="">Todos los autores</option>{authors.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <div className="reviewer-inbox-filter-actions"><button className="is-primary" type="button" disabled={!visibleReviews.length} onClick={() => openReview(visibleReviews[0])}><InboxIcon name="folder" size={17} />Abrir revisión</button><button type="button" disabled={!visibleReviews.length} onClick={exportList}><InboxIcon name="download" size={17} />Exportar listado</button><button className="is-clear" type="button" onClick={clearFilters}>Limpiar filtros</button></div>
        </section>
        <section className="reviewer-inbox-table-card">
          <div className="reviewer-inbox-table-wrap"><table><thead><tr><th>Código</th><th>Documento</th><th>Autor</th><th>Estado</th><th>Prioridad</th><th>Fecha límite</th><th>Versión</th><th>Acciones</th></tr></thead><tbody>{visibleReviews.map((review) => <tr key={review.id}><td><strong>{review.document?.code || '—'}</strong></td><td>{review.document?.title || 'Documento sin título'}</td><td>{review.requested_by?.name || '—'}</td><td><span className={`reviewer-inbox-status is-${review.status?.code?.toLowerCase() || 'unknown'}`}>{reviewStatusName(review)}</span></td><td><span className={`reviewer-inbox-priority is-${review.priority?.toLowerCase() || 'media'}`}>{reviewPriorityName(review.priority)}</span></td><td className={isOverdue(review) ? 'is-overdue' : ''}>{formatDate(review.deadline, 'Sin fecha')}</td><td>{review.document?.version || '—'}</td><td><button type="button" aria-label={`Revisar ${review.document?.title || review.document?.code || 'documento'}`} onClick={() => openReview(review)}><InboxIcon name="eye" size={17} /></button></td></tr>)}</tbody></table>{loading && <p className="reviewer-inbox-empty">Cargando revisiones...</p>}{!loading && !visibleReviews.length && <p className="reviewer-inbox-empty">No hay revisiones que coincidan con los filtros.</p>}</div>
          <footer><span>Mostrando {visibleReviews.length} de {reviews.length} revisiones</span><span>{visibleReviews.length ? `Página 1 de 1` : ''}</span></footer>
        </section>
      </main>
      <aside className="reviewer-inbox-sidebar">
        <section className="reviewer-inbox-side-card reviewer-inbox-alerts"><h2><InboxIcon name="bell" size={18} />Alertas de revisión</h2>{notifications.length ? notifications.map((notification) => <article key={notification.id}><i /><div><strong>{notification.title}</strong><p>{notification.message}</p>{notification.review_id && <button type="button" onClick={() => onOpenReview(notification.review_id)}>Ver</button>}</div><time>{formatDate(notification.created_at, '—')}</time></article>) : <p className="reviewer-inbox-empty">No hay alertas registradas.</p>}</section>
        <section className="reviewer-inbox-side-card reviewer-inbox-load"><h2><InboxIcon name="flow" size={18} />Resumen de carga</h2><dl><div><dt><i className="is-green" />Al día</dt><dd>{pendingReviews.length - overdueReviews.length}</dd></div><div><dt><i className="is-red" />Vencidas</dt><dd>{overdueReviews.length}</dd></div><div><dt><i className="is-orange" />En revisión</dt><dd>{activeReviews.length}</dd></div><div><dt><i className="is-blue" />Completadas (mes)</dt><dd>{completedThisMonth.length}</dd></div></dl></section>
      </aside>
    </div>
  </div>
}

export default ReviewerReviewInboxView
