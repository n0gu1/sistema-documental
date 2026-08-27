import { useEffect, useState } from 'react'
import ReviewerDocumentReviewView from './ReviewerDocumentReviewView'
import ReviewerBasicReportsView from './ReviewerBasicReportsView'
import ReviewerPersonalLogView from './ReviewerPersonalLogView'
import ReviewerReviewInboxView from './ReviewerReviewInboxView'
import ReviewerVersionComparisonView from './ReviewerVersionComparisonView'
import { apiRequest, formatDate, reviewStatusName } from './documentApi'
import './EditorDashboard.css'
import './ReviewerDashboard.css'

export function ReviewerIcon({ name, size = 20 }) {
  const content = name === 'inbox' ? <><path d="M4 4h16l2 10v6H2v-6L4 4Z" /><path d="M2 14h5l2 3h6l2-3h5" /></> : name === 'check' ? <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.7 2.7L16.5 9" /></> : name === 'clock' ? <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></> : name === 'comment' ? <><path d="M4 5h16v11H8l-4 4V5Z" /><path d="M8 9h8m-8 3h5" /></> : name === 'layers' ? <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></> : name === 'history' ? <><path d="M4 12a8 8 0 1 0 2-5.7" /><path d="M4 4v5h5M12 7v5l3 2" /></> : name === 'chart' ? <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /> : name === 'search' ? <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></> : name === 'bell' ? <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7M10 20h4" /></> : <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function ReviewerMetric({ icon, tone, label, value }) {
  return <article className="reviewer-metric"><span className={`reviewer-metric-icon is-${tone}`}><ReviewerIcon name={icon} size={30} /></span><div><p>{label}</p><strong>{value}</strong><small>Datos registrados</small></div></article>
}

function ReviewerDashboard({ user, onLogout, logoutPending, error }) {
  const [activeView, setActiveView] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [reviews, setReviews] = useState([])
  const [selectedReviewId, setSelectedReviewId] = useState(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    apiRequest('/api/reviews/inbox/?limit=100').then((data) => { if (active) setReviews(data.results || []) }).catch(() => {})
    const openReview = (event) => { setSelectedReviewId(event.detail?.reviewId || null); setActiveView('review-document') }
    window.addEventListener('review-document-open', openReview)
    return () => { active = false; window.removeEventListener('review-document-open', openReview) }
  }, [])
  function navigate(view) { setActiveView(view); setSidebarOpen(false) }
  const role = user.roles?.find((item) => ['REVISOR', 'REVIEWER'].includes(item.code))?.name || 'Revisor'
  const initials = `${user.first_name?.[0] || 'M'}${user.last_name?.[0] || 'G'}`
  const pending = reviews.filter((review) => review.status?.code === 'PENDIENTE').length

  return <main className="editor-shell reviewer-shell"><aside className={`editor-sidebar${sidebarOpen ? ' is-open' : ''}`}><div className="editor-brand" aria-label="Consultoría Alexandria"><div><span>Consultoría</span><strong>Alexandria</strong></div></div><nav className="editor-nav reviewer-nav" aria-label="Navegación del revisor"><button className={activeView === 'dashboard' ? 'is-active' : ''} type="button" onClick={() => navigate('dashboard')}><ReviewerIcon size={22} /> Dashboard</button><button className={activeView === 'review-inbox' ? 'is-active' : ''} type="button" onClick={() => navigate('review-inbox')}><ReviewerIcon name="inbox" size={22} /> Bandeja de revisión</button><button className={activeView === 'review-document' ? 'is-active' : ''} type="button" onClick={() => navigate('review-document')}><ReviewerIcon name="document" size={22} /> Documentos asignados</button><button className={activeView === 'compare' ? 'is-active' : ''} type="button" onClick={() => navigate('compare')}><ReviewerIcon name="layers" size={22} /> Comparación de versiones</button><button className={activeView === 'personal-log' ? 'is-active' : ''} type="button" onClick={() => navigate('personal-log')}><ReviewerIcon name="history" size={22} /> Bitácora personal</button><button className={activeView === 'reports' ? 'is-active' : ''} type="button" onClick={() => navigate('reports')}><ReviewerIcon name="chart" size={22} /> Reportes básicos</button></nav><div className="editor-sidebar__illustration" aria-hidden="true">♜</div></aside>{sidebarOpen && <button className="editor-overlay" type="button" aria-label="Cerrar menú" onClick={() => setSidebarOpen(false)} />}<section className="editor-workspace"><header className="editor-topbar"><button className="editor-menu" type="button" aria-label="Abrir menú" onClick={() => setSidebarOpen(true)}>☰</button><label className="editor-search"><ReviewerIcon name="search" size={20} /><input type="search" aria-label="Buscar" placeholder="Buscar documentos, versiones, usuarios..." /></label><div className="editor-topbar__actions"><button className="editor-notification" type="button" aria-label="Notificaciones"><ReviewerIcon name="bell" size={24} /><span>0</span></button><div className="editor-profile"><button className="editor-profile__trigger" type="button" aria-expanded={profileOpen} onClick={() => setProfileOpen((open) => !open)}><span className="editor-avatar">{initials}</span><span><strong>{user.full_name}</strong><small>{role}</small></span></button>{profileOpen && <div className="editor-profile__menu"><span>{user.email}</span><button type="button" onClick={onLogout} disabled={logoutPending}>Cerrar sesión</button></div>}</div></div></header><div className="editor-content">{error && <p className="editor-error" role="alert">{error}</p>}{activeView === 'review-inbox' ? <ReviewerReviewInboxView /> : activeView === 'review-document' ? <ReviewerDocumentReviewView reviewId={selectedReviewId} onAction={setNotice} /> : activeView === 'compare' ? <ReviewerVersionComparisonView onAction={setNotice} /> : activeView === 'personal-log' ? <ReviewerPersonalLogView user={user} /> : activeView === 'reports' ? <ReviewerBasicReportsView /> : <><header className="editor-heading"><div><h1>Dashboard del Revisor</h1><p>Gestiona tus revisiones, observaciones y dictámenes.</p></div></header><section className="reviewer-metrics"><ReviewerMetric icon="inbox" tone="blue" label="Revisiones asignadas" value={reviews.length} /><ReviewerMetric icon="clock" tone="orange" label="Pendientes por revisar" value={pending} /><ReviewerMetric icon="check" tone="green" label="Revisiones aprobadas" value={reviews.filter((review) => review.status?.code === 'APROBADA').length} /><ReviewerMetric icon="comment" tone="violet" label="Comentarios registrados" value={reviews.reduce((total, review) => total + (review.comments?.length || 0), 0)} /></section><section className="editor-card editor-documents"><div className="editor-card__heading"><h2><ReviewerIcon name="inbox" size={20} /> Revisiones asignadas</h2><button type="button" onClick={() => navigate('review-inbox')}>Ver todas</button></div><div className="editor-table-wrap"><table><thead><tr><th>Documento</th><th>Estado</th><th>Prioridad</th><th>Fecha límite</th><th>Acción</th></tr></thead><tbody>{reviews.slice(0, 5).map((review) => <tr key={review.id}><td><strong>{review.document.code}</strong><br />{review.document.title}</td><td>{reviewStatusName(review)}</td><td>{review.priority || 'Media'}</td><td>{formatDate(review.deadline, 'Sin fecha')}</td><td><button type="button" onClick={() => { setSelectedReviewId(review.id); navigate('review-document') }}>Revisar</button></td></tr>)}</tbody></table>{!reviews.length && <p className="editor-empty">No hay revisiones asignadas.</p>}</div></section></>}<span className="editor-live-notice" role="status">{notice}</span></div></section></main>
}

export default ReviewerDashboard
