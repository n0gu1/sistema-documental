import { useEffect, useState } from 'react'
import { apiRequest, formatDate } from './documentApi'
import './ReviewerPersonalLogView.css'

function LogIcon({ name, size = 18 }) {
  const content = name === 'calendar' ? <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></> : name === 'comment' ? <><path d="M4 5h16v11H8l-4 4V5Z" /><path d="M8 9h8m-8 3h5" /></> : name === 'check' ? <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.7 2.7L16.5 9" /></> : name === 'search' ? <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></> : name === 'filter' ? <path d="M4 5h16l-6.5 7v5l-5 2v-7L4 5Z" /> : name === 'warning' ? <><path d="m12 3 9 17H3L12 3Z" /><path d="M12 9v4m0 3h.01" /></> : name === 'login' ? <><path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H8" /></> : <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function dateKey(value) {
  return value ? new Intl.DateTimeFormat('en-CA').format(new Date(value)) : ''
}

function actionTone(event) {
  const code = event.action_code || ''
  if (code.includes('FALLIDA') || !event.successful) return 'red'
  if (code.includes('APROB') || code.includes('CERRADA')) return 'green'
  if (code.includes('COMENT') || code.includes('DEVUEL')) return 'orange'
  if (code.includes('COMP')) return 'purple'
  return 'blue'
}

function actionIcon(event) {
  const code = event.action_code || ''
  if (code.includes('FALLIDA')) return 'warning'
  if (code.includes('SESION')) return 'login'
  if (code.includes('APROB') || code.includes('CERRADA')) return 'check'
  if (code.includes('COMENT') || code.includes('DEVUEL')) return 'comment'
  return 'calendar'
}

function parseDetails(details) {
  if (!details) return ''
  if (typeof details === 'object') return Object.entries(details).map(([key, value]) => `${key}: ${String(value)}`).join(' · ')
  try { return parseDetails(JSON.parse(details)) } catch { return String(details) }
}

function browserLabel(userAgent) {
  if (!userAgent) return '—'
  if (userAgent.includes('Firefox')) return 'Firefox'
  if (userAgent.includes('Edg/')) return 'Edge'
  if (userAgent.includes('Chrome')) return 'Chrome'
  if (userAgent.includes('Safari')) return 'Safari'
  return 'Navegador'
}

function operatingSystem(userAgent) {
  if (!userAgent) return '—'
  if (userAgent.includes('Windows')) return 'Windows'
  if (userAgent.includes('Mac OS')) return 'macOS'
  if (userAgent.includes('Linux')) return 'Linux'
  if (userAgent.includes('Android')) return 'Android'
  if (userAgent.includes('iPhone')) return 'iOS'
  return 'Dispositivo'
}

function rangeStart(range) {
  if (range === 'all') return null
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - Number(range))
  return start
}

function ReviewerLogMetric({ icon, tone, label, value, detail }) {
  return <article className="reviewer-log-metric"><span className={`reviewer-log-metric-icon is-${tone}`}><LogIcon name={icon} size={29} /></span><div><p>{label}</p><strong>{value}</strong><small>{detail}</small></div></article>
}

function ReviewerPersonalLogView({ user }) {
  const [events, setEvents] = useState([])
  const [total, setTotal] = useState(0)
  const [filters, setFilters] = useState({ range: '7', action: '', result: '', search: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    apiRequest(`/api/audit/?user_id=${user.id}&limit=100`).then((data) => {
      if (!active) return
      setEvents(data.results || [])
      setTotal(data.count || 0)
    }).catch((requestError) => { if (active) setError(requestError.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [user.id])

  const actionOptions = [...new Map(events.map((event) => [event.action_code, event.action || event.action_code]).filter(([value]) => value)).entries()]
  const search = filters.search.trim().toLowerCase()
  const start = rangeStart(filters.range)
  const visibleEvents = events.filter((event) => {
    const eventDate = new Date(event.event_at)
    const details = parseDetails(event.details)
    const matchesRange = !start || eventDate >= start
    const matchesAction = !filters.action || event.action_code === filters.action
    const matchesResult = !filters.result || (filters.result === 'success' ? event.successful : !event.successful)
    const matchesSearch = !search || [event.action, event.action_code, event.result, details, event.ip, event.user_agent, event.resource_code, event.module].join(' ').toLowerCase().includes(search)
    return matchesRange && matchesAction && matchesResult && matchesSearch
  })
  const today = dateKey(new Date())
  const eventsToday = events.filter((event) => dateKey(event.event_at) === today).length
  const completed = events.filter((event) => /APROB|CERRAR|DICTAMEN/.test(event.action_code || '')).length
  const observations = events.filter((event) => /COMENT|OBSERV/.test(event.action_code || '')).length
  const approvals = events.filter((event) => /APROB/.test(event.action_code || '')).length
  const distributionEntries = Object.entries(events.reduce((result, event) => {
    const key = event.action || event.action_code || 'Sin acción'
    result[key] = (result[key] || 0) + 1
    return result
  }, {})).sort((left, right) => right[1] - left[1])
  const chartColors = ['#13a66a', '#ee3d43', '#f1a014', '#7352d7', '#347fe1', '#479b59']
  let chartOffset = 0
  const chartSegments = distributionEntries.map(([, value], index) => {
    const startOffset = chartOffset
    chartOffset += (value / (events.length || 1)) * 100
    return `${chartColors[index % chartColors.length]} ${startOffset}% ${chartOffset}%`
  }).join(', ')

  function updateFilter(name, value) { setFilters((current) => ({ ...current, [name]: value })) }

  if (error) return <div className="reviewer-personal-log"><p className="editor-error" role="alert">{error}</p></div>
  return <div className="reviewer-personal-log">
    <header className="reviewer-log-heading"><div><h1>Bitácora personal</h1><p>Consulta el historial de tus revisiones, comentarios y dictámenes emitidos.</p></div><time><LogIcon name="calendar" size={18} />{new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(new Date())}</time></header>
    <section className="reviewer-log-metrics" aria-label="Resumen de actividad"><ReviewerLogMetric icon="calendar" tone="blue" label="Eventos hoy" value={loading ? '...' : eventsToday} detail="Eventos registrados" /><ReviewerLogMetric icon="check" tone="orange" label="Revisiones completadas" value={loading ? '...' : completed} detail="Acciones registradas" /><ReviewerLogMetric icon="comment" tone="red" label="Observaciones emitidas" value={loading ? '...' : observations} detail="Comentarios registrados" /><ReviewerLogMetric icon="check" tone="green" label="Aprobaciones registradas" value={loading ? '...' : approvals} detail="Acciones de aprobación" /></section>
    <div className="reviewer-log-layout">
      <main>
        <section className="reviewer-log-filters" aria-label="Filtros de bitácora"><label><span>Fecha</span><select value={filters.range} onChange={(event) => updateFilter('range', event.target.value)}><option value="7">Últimos 7 días</option><option value="30">Últimos 30 días</option><option value="all">Todo el historial</option></select></label><label><span>Acción</span><select value={filters.action} onChange={(event) => updateFilter('action', event.target.value)}><option value="">Todas</option>{actionOptions.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label><label><span>Resultado</span><select value={filters.result} onChange={(event) => updateFilter('result', event.target.value)}><option value="">Todos</option><option value="success">Exitoso</option><option value="failure">Fallido</option></select></label><label className="reviewer-log-search"><span>Búsqueda libre</span><div><LogIcon name="search" size={16} /><input type="search" value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} placeholder="Buscar en detalle, acción..." /></div></label><button type="button" onClick={() => setFilters({ range: '7', action: '', result: '', search: '' })}><LogIcon name="filter" size={15} />Limpiar filtros</button></section>
        <section className="reviewer-log-table-card"><div className="reviewer-log-table-wrap"><table><thead><tr><th>Fecha y hora</th><th>Acción</th><th>Detalle</th><th>Resultado</th><th>IP / Dispositivo</th></tr></thead><tbody>{visibleEvents.map((event) => <tr key={event.id}><td>{formatDate(event.event_at)}</td><td><span className={`reviewer-log-action is-${actionTone(event)}`}><LogIcon name={actionIcon(event)} size={17} />{event.action || event.action_code || '—'}</span></td><td>{parseDetails(event.details) || '—'}</td><td><span className={`reviewer-log-result is-${event.successful ? 'success' : 'failure'}`}>{event.result || (event.successful ? 'Éxito' : 'Fallido')}</span></td><td><span className="reviewer-log-device"><strong>{event.ip || '—'}</strong><small>{browserLabel(event.user_agent)} / {operatingSystem(event.user_agent)}</small></span></td></tr>)}</tbody></table>{!loading && !visibleEvents.length && <p className="reviewer-log-empty">No hay eventos para los filtros seleccionados.</p>}</div><footer><span>{loading ? 'Cargando eventos...' : `Mostrando ${visibleEvents.length} de ${total} eventos`}</span><span>Los datos corresponden a la actividad de tu usuario.</span></footer></section>
      </main>
      <aside className="reviewer-log-sidebar"><section className="reviewer-log-chart-card"><header><h2>Distribución por tipo de acción</h2><span title="Calculada con los eventos cargados"><LogIcon name="calendar" size={16} /></span></header><div className="reviewer-log-chart-area"><div className="reviewer-log-donut" style={events.length ? { background: `conic-gradient(${chartSegments})` } : undefined}><div><strong>{events.length}</strong><span>Total</span></div></div><div className="reviewer-log-legend">{distributionEntries.map(([label, value], index) => <div key={label}><i style={{ background: chartColors[index % chartColors.length] }} /><span>{label}</span><strong>{value} ({Math.round((value / (events.length || 1)) * 100)}%)</strong></div>)}</div></div></section></aside>
    </div>
  </div>
}

export default ReviewerPersonalLogView
