import { useDeferredValue, useEffect, useState } from 'react'
import ReviewerDocumentReviewView from './ReviewerDocumentReviewView'
import ReviewerBasicReportsView from './ReviewerBasicReportsView'
import ReviewerPersonalLogView from './ReviewerPersonalLogView'
import ReviewerReviewInboxView from './ReviewerReviewInboxView'
import ReviewerVersionComparisonView from './ReviewerVersionComparisonView'
import { apiRequest, formatDate, reviewPriorityName, reviewStatusName } from './documentApi'
import './EditorDashboard.css'
import './ReviewerDashboard.css'

export function ReviewerIcon({ name, size = 20 }) {
  const content = name === 'inbox' ? <><path d="M4 4h16l2 10v6H2v-6L4 4Z" /><path d="M2 14h5l2 3h6l2-3h5" /></> : name === 'check' ? <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.7 2.7L16.5 9" /></> : name === 'clock' ? <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></> : name === 'calendar' ? <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></> : name === 'comment' ? <><path d="M4 5h16v11H8l-4 4V5Z" /><path d="M8 9h8m-8 3h5" /></> : name === 'layers' ? <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></> : name === 'history' ? <><path d="M4 12a8 8 0 1 0 2-5.7" /><path d="M4 4v5h5M12 7v5l3 2" /></> : name === 'chart' ? <path d="M4 20V10M10 20V4m6 16v-7M22 20H2" /> : name === 'search' ? <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></> : name === 'bell' ? <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7M10 20h4" /></> : name === 'menu' ? <path d="M4 7h16M4 12h16M4 17h16" /> : name === 'document' ? <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 12h7M9 16h5" /></> : <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function ReviewerMetric({ icon, tone, label, value, detail }) {
  return <article className="reviewer-metric"><span className={`reviewer-metric-icon is-${tone}`}><ReviewerIcon name={icon} size={30} /></span><div><p>{label}</p><strong>{value}</strong><small>{detail}</small></div></article>
}

function shortDate(value) {
  return value ? new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value)) : 'Sin fecha'
}

function initials(name) {
  return (name || 'Usuario').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

function activityDetail(event) {
  if (event.details && typeof event.details === 'object') return Object.values(event.details).join(' · ') || event.result || 'Sin detalle'
  return event.result || 'Sin detalle'
}

function ReviewerDashboard({ user, onLogout, logoutPending, error: initialError }) {
  const [activeView, setActiveView] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [reviews, setReviews] = useState([])
  const [activity, setActivity] = useState([])
  const [selectedReviewId, setSelectedReviewId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState('')
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())
  const visibleError = loadError || initialError

  useEffect(() => {
    let active = true
    const openReviewEvent = (event) => { setSelectedReviewId(event.detail?.reviewId || null); setActiveView('review-document') }
    window.addEventListener('review-document-open', openReviewEvent)
    Promise.allSettled([
      apiRequest('/api/reviews/inbox/?limit=100'),
      apiRequest(`/api/audit/?user_id=${user.id}&limit=10`),
    ]).then(([reviewsResult, activityResult]) => {
      if (!active) return
      if (reviewsResult.status === 'fulfilled') setReviews(reviewsResult.value.results || [])
      if (activityResult.status === 'fulfilled') setActivity(activityResult.value.results || [])
      const failures = [reviewsResult, activityResult].filter((item) => item.status === 'rejected')
      if (failures.length === 2) setLoadError(failures[0].reason.message)
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false; window.removeEventListener('review-document-open', openReviewEvent) }
  }, [user.id])

  const role = user.roles?.find((item) => ['REVISOR', 'REVIEWER'].includes(item.code))?.name || 'Revisor'
  const displayName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || 'Usuario'
  const pendingReviews = reviews.filter((review) => review.status?.code === 'PENDIENTE')
  const approvedReviews = reviews.filter((review) => ['APROBADA', 'COMPLETADA'].includes(review.status?.code))
  const comments = reviews.flatMap((review) => (review.comments || []).map((comment) => ({ ...comment, document: review.document, reviewId: review.id }))).sort((left, right) => new Date(right.created_at) - new Date(left.created_at)).slice(0, 3)
  const dueReviews = pendingReviews.filter((review) => review.deadline).sort((left, right) => new Date(left.deadline) - new Date(right.deadline)).slice(0, 5)
  const visibleReviews = pendingReviews.filter((review) => !deferredQuery || [review.document?.code, review.document?.title, review.priority, reviewStatusName(review)].join(' ').toLowerCase().includes(deferredQuery))
  const observationCount = comments.length + activity.filter((event) => event.action_code === 'REVISION_COMENTADA').length

  function navigate(view) { setActiveView(view); setSidebarOpen(false); setNotice('') }
  function openReview(reviewId) { setSelectedReviewId(reviewId || pendingReviews[0]?.id || reviews[0]?.id); setActiveView('review-document'); setSidebarOpen(false) }
  function action(message) { setNotice(message) }

  function dashboardView() {
    return <div className="reviewer-content"><header className="reviewer-heading"><div><h1>Dashboard del Revisor</h1><p>Supervisa documentos asignados, revisa versiones y emite observaciones o aprobaciones.</p></div><time><ReviewerIcon name="calendar" size={18} />{new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(new Date())}</time></header>{notice && <p className="reviewer-notice" role="status">{notice}</p>}{visibleError && <p className="editor-error" role="alert">{visibleError}</p>}<section className="reviewer-metrics"><ReviewerMetric icon="document" tone="blue" label="Documentos asignados" value={reviews.length} detail="Revisiones en tu bandeja" /><ReviewerMetric icon="clock" tone="orange" label="Pendientes por revisar" value={pendingReviews.length} detail="Estado pendiente" /><ReviewerMetric icon="comment" tone="red" label="Observaciones emitidas" value={observationCount} detail="Comentarios registrados" /><ReviewerMetric icon="check" tone="green" label="Documentos aprobados" value={approvedReviews.length} detail="Revisiones aprobadas" /></section><div className="reviewer-upper-grid"><section className="reviewer-card reviewer-activity"><div className="reviewer-card-heading"><h2><ReviewerIcon name="clock" size={18} />Actividad reciente</h2><button type="button" onClick={() => navigate('personal-log')}>Ver todo</button></div><div className="reviewer-activity-list">{activity.slice(0, 5).map((event) => <article key={event.id}><span className={`reviewer-activity-icon ${event.successful ? 'is-green' : 'is-red'}`}><ReviewerIcon name={event.successful ? 'check' : 'comment'} size={15} /></span><div><strong>{event.action || event.action_code}</strong><span>{activityDetail(event)}</span></div><time>{formatDate(event.event_at)}</time></article>)}{!loading && !activity.length && <p className="reviewer-empty">No hay actividad reciente.</p>}</div></section><section className="reviewer-card reviewer-tasks"><div className="reviewer-card-heading"><h2><ReviewerIcon name="inbox" size={18} />Tareas pendientes</h2><button type="button" onClick={() => navigate('review-inbox')}>Ver todas</button></div><div className="reviewer-task-list">{visibleReviews.slice(0, 5).map((review) => <article key={review.id}><button className="reviewer-task-check" type="button" aria-label={`Abrir revisión ${review.document.code}`} onClick={() => openReview(review.id)}><ReviewerIcon name="document" size={14} /></button><div><strong>{review.document.code}</strong><span>{review.document.title}</span></div><b className={`reviewer-priority is-${reviewPriorityName(review.priority).toLowerCase()}`}>{reviewPriorityName(review.priority)}</b><time>Vence<strong>{shortDate(review.deadline)}</strong></time></article>)}{!loading && !visibleReviews.length && <p className="reviewer-empty">No hay tareas pendientes.</p>}</div><button className="reviewer-card-link" type="button" onClick={() => navigate('review-inbox')}>Ir a bandeja de revisión <span>→</span></button></section><section className="reviewer-card reviewer-comments"><div className="reviewer-card-heading"><h2><ReviewerIcon name="comment" size={18} />Comentarios recientes</h2><button type="button" onClick={() => openReview(comments[0]?.reviewId)}>Ver todos</button></div><div>{comments.map((comment) => <article key={comment.id}><span className="reviewer-comment-avatar">{initials(comment.author?.name)}</span><div><strong>{comment.author?.name || 'Usuario'}</strong><time>{formatDate(comment.created_at)}</time><span>En {comment.document?.code} · {comment.document?.title}</span><p>{comment.content}</p></div></article>)}{!loading && !comments.length && <p className="reviewer-empty">No hay comentarios recientes.</p>}</div></section></div><div className="reviewer-lower-grid"><section className="reviewer-card reviewer-documents"><div className="reviewer-card-heading"><h2><ReviewerIcon name="calendar" size={18} />Documentos próximos a vencer</h2><button type="button" onClick={() => navigate('review-inbox')}>Ver todos</button></div><div className="reviewer-table-wrap"><table><thead><tr><th>Código</th><th>Documento</th><th>Estado</th><th>Fecha límite</th><th>Responsable</th><th /></tr></thead><tbody>{dueReviews.map((review) => <tr key={review.id}><td><strong>{review.document.code}</strong></td><td>{review.document.title}</td><td><span className={`reviewer-document-status ${review.status?.code === 'PENDIENTE' ? 'is-review' : 'is-draft'}`}>{reviewStatusName(review)}</span></td><td className="reviewer-due-date">{shortDate(review.deadline)}</td><td>{review.requested_by?.name || '—'}</td><td><button type="button" aria-label={`Abrir ${review.document.code}`} onClick={() => openReview(review.id)}><ReviewerIcon name="document" size={15} /></button></td></tr>)}</tbody></table>{!loading && !dueReviews.length && <p className="reviewer-empty">No hay documentos con fecha límite.</p>}</div></section><section className="reviewer-card reviewer-quick"><div className="reviewer-card-heading"><h2><ReviewerIcon name="chart" size={18} />Acciones rápidas</h2></div><div className="reviewer-quick-grid"><button type="button" onClick={() => openReview()}><ReviewerIcon name="document" size={29} />Abrir revisión</button><button type="button" onClick={() => navigate('compare')}><ReviewerIcon name="layers" size={29} />Comparar versiones</button><button type="button" onClick={() => navigate('reports')}><ReviewerIcon name="chart" size={29} />Generar reporte básico</button></div></section></div></div>
  }

  let content = dashboardView()
  if (activeView === 'review-inbox') content = <ReviewerReviewInboxView onOpenReview={openReview} />
  if (activeView === 'review-document') content = <ReviewerDocumentReviewView reviewId={selectedReviewId} onAction={action} onNavigate={navigate} />
  if (activeView === 'compare') content = <ReviewerVersionComparisonView />
  if (activeView === 'personal-log') content = <ReviewerPersonalLogView user={user} />
  if (activeView === 'reports') content = <ReviewerBasicReportsView />

  return <main className="editor-shell reviewer-shell"><aside className={`editor-sidebar${sidebarOpen ? ' is-open' : ''}`}><div className="editor-brand" aria-label="Consultoría Alexandria"><div><span>Consultoría</span><strong>Alexandria</strong></div></div><nav className="editor-nav reviewer-nav" aria-label="Navegación del revisor"><button className={activeView === 'dashboard' ? 'is-active' : ''} type="button" onClick={() => navigate('dashboard')}><ReviewerIcon size={22} />Dashboard</button><button className={activeView === 'review-inbox' ? 'is-active' : ''} type="button" onClick={() => navigate('review-inbox')}><ReviewerIcon name="inbox" size={22} />Bandeja de revisión</button><button className={activeView === 'review-document' ? 'is-active' : ''} type="button" onClick={() => navigate('review-document')}><ReviewerIcon name="document" size={22} />Documentos asignados</button><button className={activeView === 'compare' ? 'is-active' : ''} type="button" onClick={() => navigate('compare')}><ReviewerIcon name="layers" size={22} />Comparación de versiones</button><button className={activeView === 'personal-log' ? 'is-active' : ''} type="button" onClick={() => navigate('personal-log')}><ReviewerIcon name="history" size={22} />Bitácora personal</button><button className={activeView === 'reports' ? 'is-active' : ''} type="button" onClick={() => navigate('reports')}><ReviewerIcon name="chart" size={22} />Reportes básicos</button></nav><div className="editor-sidebar__illustration" aria-hidden="true">♜</div></aside>{sidebarOpen && <button className="editor-overlay" type="button" aria-label="Cerrar menú" onClick={() => setSidebarOpen(false)} />}<section className="editor-workspace"><header className="editor-topbar"><button className="editor-menu" type="button" aria-label="Abrir menú" onClick={() => setSidebarOpen(true)}><ReviewerIcon name="menu" size={25} /></button><label className="editor-search"><ReviewerIcon name="search" size={20} /><input type="search" aria-label="Buscar" placeholder="Buscar documentos..." value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="editor-topbar__actions"><button className="editor-notification" type="button" aria-label="Notificaciones"><ReviewerIcon name="bell" size={22} /></button><button className="editor-profile" type="button" onClick={() => setProfileOpen((current) => !current)}><span>{initials(displayName)}</span><div><strong>{displayName}</strong><small>{role}</small></div><b>⌄</b></button>{profileOpen && <div className="editor-profile-menu"><span>{user.email}</span><button type="button" disabled={logoutPending} onClick={onLogout}>{logoutPending ? 'Cerrando...' : 'Cerrar sesión'}</button></div>}</div></header><div className="reviewer-page-content">{content}</div><footer className="editor-footer"><span>© {new Date().getFullYear()} Consultoría Alexandria. Todos los derechos reservados.</span><span>Versión 2.1.0</span></footer></section></main>
}

export default ReviewerDashboard
