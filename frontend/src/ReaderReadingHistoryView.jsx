import { useEffect, useState } from 'react'
import { apiRequest, formatDate } from './documentApi'
import './ReaderReadingHistoryView.css'

const PAGE_SIZE = 7

const actionLabels = {
  CONSULTA: 'Acceso',
  LECTURA: 'Lectura',
  VISTA_PREVIA: 'Visualización',
  DESCARGA: 'Descarga',
}

const actionTones = {
  CONSULTA: 'blue',
  LECTURA: 'purple',
  VISTA_PREVIA: 'blue',
  DESCARGA: 'green',
}

function ReadingIcon({ name, size = 18 }) {
  const content = name === 'download'
    ? <><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 18v3h16v-3" /></>
    : name === 'clock'
      ? <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></>
      : name === 'filter'
        ? <path d="M4 5h16l-6 7v5l-4 2v-7L4 5Z" />
        : name === 'calendar'
          ? <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 9h16" /></>
          : name === 'document'
            ? <><path d="M6 2.8h8.6L19 7.2V21H6z" /><path d="M14.5 3v4.5H19M9 12h7M9 16h7" /></>
            : name === 'bolt'
              ? <path d="m13 2-8 12h6l-1 8 8-12h-6l1-8Z" />
              : name === 'eye'
                ? <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>
                : <path d="m8 10 4 4 4-4" />
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function Metric({ icon, tone, label, value }) {
  return <article className="reader-reading-metric"><span className={`reader-reading-metric-icon is-${tone}`}><ReadingIcon name={icon} size={30} /></span><div><span>{label}</span><strong>{value}</strong><small>Datos registrados</small></div></article>
}

function localDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function displayAction(type) {
  return actionLabels[type] || type || 'Acceso'
}

function displayAgent(agent) {
  if (!agent) return '—'
  const browser = agent.match(/(Edg|Chrome|Firefox|Safari)\/?[\d.]*/i)?.[1]
  const operatingSystem = agent.match(/Windows|Mac OS|Android|iPhone|Linux/i)?.[0]
  return [browser, operatingSystem].filter(Boolean).join(' · ') || agent.slice(0, 30)
}

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return '—'
  const rounded = Math.round(Number(seconds))
  if (rounded >= 60) return `${Math.round(rounded / 60)} min`
  return `${rounded} s`
}

function DateRange({ dateFrom, dateTo, onChange }) {
  return <div className="reader-reading-date-range"><input aria-label="Fecha desde" type="date" value={dateFrom} onChange={(event) => onChange('dateFrom', event.target.value)} /><span>–</span><input aria-label="Fecha hasta" type="date" value={dateTo} onChange={(event) => onChange('dateTo', event.target.value)} /><ReadingIcon name="calendar" size={16} /></div>
}

function Distribution({ events }) {
  const counts = Object.entries(actionLabels).map(([type, label]) => ({ type, label, count: events.filter((event) => event.type === type).length })).filter((item) => item.count)
  const total = events.length
  let cursor = 0
  const colors = { CONSULTA: '#9caac0', LECTURA: '#8b49df', VISTA_PREVIA: '#216bea', DESCARGA: '#13b77a' }
  const stops = counts.map((item) => { const start = cursor; cursor += item.count / total * 100; return `${colors[item.type]} ${start}% ${cursor}%` }).join(', ')
  return <section className="reader-reading-card reader-reading-distribution"><header><h2><ReadingIcon name="filter" size={17} /> Distribución por tipo de acción</h2></header>{total ? <div className="reader-reading-distribution-body"><div className="reader-reading-donut" style={{ background: `conic-gradient(${stops})` }}><span><strong>{total}</strong>Total</span></div><div className="reader-reading-legend">{counts.map((item) => <div key={item.type}><i style={{ background: colors[item.type] }} /><span>{item.label}</span><b>{item.count} ({Math.round(item.count / total * 100)}%)</b></div>)}</div></div> : <p className="reader-reading-empty">No hay acciones registradas.</p>}</section>
}

function ReaderReadingHistoryView() {
  const [events, setEvents] = useState([])
  const [documents, setDocuments] = useState([])
  const [query, setQuery] = useState('')
  const [documentId, setDocumentId] = useState('')
  const [area, setArea] = useState('')
  const [action, setAction] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([
      apiRequest('/api/reader/history/?limit=100'),
      apiRequest('/api/reader/documents/?limit=100'),
    ]).then(([historyData, documentsData]) => {
      if (!active) return
      setEvents(historyData.results || [])
      setDocuments(documentsData.results || [])
    }).catch((requestError) => { if (active) setError(requestError.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const documentById = new Map(documents.map((document) => [document.id, document]))
  const areas = [...new Map(documents.map((document) => [document.area?.id, document.area])).values()].filter(Boolean).sort((first, second) => first.name.localeCompare(second.name))
  const filteredEvents = events.filter((event) => {
    const relatedDocument = documentById.get(event.document.id)
    const eventDate = event.registered_at ? new Date(event.registered_at) : null
    const eventDateKey = eventDate ? localDateKey(eventDate) : ''
    const searchable = [event.document.code, event.document.title, event.detail, displayAction(event.type), event.ip_address].join(' ').toLowerCase()
    return (!query || searchable.includes(query.trim().toLowerCase())) && (!documentId || event.document.id === documentId) && (!area || relatedDocument?.area?.id === area) && (!action || event.type === action) && (!dateFrom || eventDateKey >= dateFrom) && (!dateTo || eventDateKey <= dateTo)
  })
  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageEvents = filteredEvents.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const today = localDateKey(new Date())
  const todayEvents = events.filter((event) => event.registered_at && localDateKey(new Date(event.registered_at)) === today).length
  const downloads = events.filter((event) => event.type === 'DESCARGA').length
  const durations = events.map((event) => event.duration_seconds).filter((duration) => duration !== null && duration !== undefined)
  const averageDuration = durations.length ? formatDuration(durations.reduce((sum, duration) => sum + Number(duration), 0) / durations.length) : '—'
  const clearFilters = () => { setQuery(''); setDocumentId(''); setArea(''); setAction(''); setDateFrom(''); setDateTo(''); setPage(1) }
  const updateDateFilter = (name, value) => { if (name === 'dateFrom') setDateFrom(value); else setDateTo(value); setPage(1) }
  const updateFilter = (setter) => (event) => { setter(event.target.value); setPage(1) }

  if (loading) return <div className="reader-reading-history"><p>Cargando historial...</p></div>
  return <div className="reader-reading-history"><header className="reader-reading-heading"><h1>Historial de lectura</h1><p>Consulta el registro de tus documentos leídos, descargas y accesos recientes.</p></header>{error && <p className="editor-error" role="alert">{error}</p>}<section className="reader-reading-metrics"><Metric icon="document" tone="blue" label="Eventos hoy" value={todayEvents} /><Metric icon="document" tone="green" label="Documentos consultados" value={new Set(events.map((event) => event.document.id)).size} /><Metric icon="download" tone="orange" label="Descargas realizadas" value={downloads} /><Metric icon="clock" tone="purple" label="Tiempo promedio de lectura" value={averageDuration} /></section><section className="reader-reading-filters"><label className="reader-reading-date-filter"><span>Fecha</span><DateRange dateFrom={dateFrom} dateTo={dateTo} onChange={updateDateFilter} /></label><label><span>Documento</span><select value={documentId} onChange={updateFilter(setDocumentId)}><option value="">Todos</option>{documents.map((document) => <option key={document.id} value={document.id}>{document.code} · {document.title}</option>)}</select></label><label><span>Área</span><select value={area} onChange={updateFilter(setArea)}><option value="">Todas</option>{areas.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>Tipo de acción</span><select value={action} onChange={updateFilter(setAction)}><option value="">Todas</option>{Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="reader-reading-filter-search"><span>Búsqueda libre</span><div><ReadingIcon size={16} /><input value={query} onChange={updateFilter(setQuery)} placeholder="Buscar por documento, acción, detalle..." /></div></label><button type="button" onClick={clearFilters}><ReadingIcon name="filter" size={15} /> Limpiar filtros</button></section><section className="reader-reading-main-grid"><section className="reader-reading-card reader-reading-log"><header><h2><ReadingIcon name="document" size={17} /> Registro de lectura</h2></header><div className="reader-reading-log-table"><table><thead><tr><th>Fecha y hora</th><th>Documento</th><th>Acción</th><th>Detalle</th><th>Resultado</th><th>IP / Dispositivo</th></tr></thead><tbody>{pageEvents.map((event) => <tr key={event.id}><td>{formatDate(event.registered_at)}</td><td><strong>{event.document.code}</strong><span>{event.document.title}</span></td><td><span className={`reader-reading-action is-${actionTones[event.type] || 'blue'}`}><ReadingIcon name={event.type === 'DESCARGA' ? 'download' : event.type === 'CONSULTA' ? 'bolt' : 'eye'} size={13} />{displayAction(event.type)}</span></td><td>{event.detail || '—'}{event.last_page ? <small>Página {event.last_page}</small> : null}</td><td><span className="reader-reading-result">{event.result || 'Exitoso'}</span></td><td><strong>{event.ip_address || '—'}</strong><span>{displayAgent(event.user_agent)}</span></td></tr>)}</tbody></table>{!pageEvents.length && <p className="reader-reading-empty">No hay registros que coincidan con los filtros.</p>}</div><footer><span>Mostrando {filteredEvents.length ? ((currentPage - 1) * PAGE_SIZE) + 1 : 0} a {Math.min(currentPage * PAGE_SIZE, filteredEvents.length)} de {filteredEvents.length} registros</span><div className="reader-reading-pagination"><button type="button" aria-label="Primera página" disabled={currentPage === 1} onClick={() => setPage(1)}>«</button><button type="button" aria-label="Página anterior" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>‹</button>{Array.from({ length: totalPages }, (_, index) => index + 1).slice(Math.max(0, currentPage - 3), currentPage + 2).map((item) => <button className={item === currentPage ? 'is-active' : ''} type="button" key={item} onClick={() => setPage(item)}>{item}</button>)}<button type="button" aria-label="Página siguiente" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>›</button><button type="button" aria-label="Última página" disabled={currentPage === totalPages} onClick={() => setPage(totalPages)}>»</button></div><label>Filas por página <select value={PAGE_SIZE} disabled><option>{PAGE_SIZE}</option></select></label></footer></section><aside className="reader-reading-aside"><Distribution events={events} /><section className="reader-reading-card reader-reading-recent"><header><h2><ReadingIcon name="document" size={17} /> Eventos recientes</h2><span>{events.length ? `Últimos ${Math.min(events.length, 5)}` : ''}</span></header>{events.slice(0, 5).map((event) => <div className="reader-reading-recent-event" key={event.id}><span className={`reader-reading-recent-icon is-${actionTones[event.type] || 'blue'}`}><ReadingIcon name={event.type === 'DESCARGA' ? 'download' : 'eye'} size={15} /></span><div><strong>{displayAction(event.type)} de {event.document.code}</strong><small>{formatDate(event.registered_at)}</small></div><i>{event.result || 'Exitoso'}</i></div>)}{!events.length && <p className="reader-reading-empty">No hay eventos recientes.</p>}</section></aside></section></div>
}

export default ReaderReadingHistoryView
