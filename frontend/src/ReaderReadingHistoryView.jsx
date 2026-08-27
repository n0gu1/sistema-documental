import { useDeferredValue, useEffect, useState } from 'react'
import { apiRequest, formatDate } from './documentApi'
import './ReaderReadingHistoryView.css'

function ReadingIcon({ name, size = 18 }) {
  const content = name === 'download' ? <><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 18v3h16v-3" /></> : name === 'clock' ? <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></> : <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function Metric({ icon, tone, label, value }) {
  return <article className="reader-reading-metric"><span className={`reader-reading-metric-icon is-${tone}`}><ReadingIcon name={icon} size={30} /></span><div><span>{label}</span><strong>{value}</strong><small>Datos registrados</small></div></article>
}

function ReaderReadingHistoryView({ onAction }) {
  const [events, setEvents] = useState([])
  const [query, setQuery] = useState('')
  const [action, setAction] = useState('Todas')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())

  useEffect(() => {
    let active = true
    apiRequest('/api/reader/history/?limit=100')
      .then((data) => { if (active) setEvents(data.results || []) })
      .catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const visibleEvents = events.filter((event) => {
    const displayAction = event.type === 'DESCARGA' ? 'Descarga' : 'Visualización'
    return (!deferredQuery || [event.document.code, event.document.title, event.detail, displayAction].join(' ').toLowerCase().includes(deferredQuery)) && (action === 'Todas' || displayAction === action)
  })
  const downloads = events.filter((event) => event.type === 'DESCARGA').length
  const readings = events.filter((event) => event.type === 'LECTURA' || event.type === 'VISTA_PREVIA').length

  return <div className="reader-reading-history"><header className="reader-reading-heading"><h1>Historial de lectura</h1><p>Consulta el registro de tus documentos leídos, descargas y accesos recientes.</p></header>{error && <p className="editor-error" role="alert">{error}</p>}<section className="reader-reading-metrics"><Metric icon="document" tone="blue" label="Eventos registrados" value={events.length} /><Metric icon="document" tone="green" label="Documentos consultados" value={new Set(events.map((event) => event.document.id)).size} /><Metric icon="download" tone="orange" label="Descargas realizadas" value={downloads} /><Metric icon="clock" tone="purple" label="Lecturas registradas" value={readings} /></section><section className="reader-reading-filters"><label className="reader-reading-filter-search"><span>Búsqueda libre</span><div><ReadingIcon size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por documento, acción, detalle..." /></div></label><label><span>Tipo de acción</span><select value={action} onChange={(event) => setAction(event.target.value)}><option>Todas</option><option>Visualización</option><option>Descarga</option></select></label><button type="button" onClick={() => { setQuery(''); setAction('Todas'); onAction('Filtros limpiados.') }}>Limpiar filtros</button></section><section className="reader-reading-main-grid"><section className="reader-reading-log"><header><h2><ReadingIcon size={18} /> Registro de lectura</h2></header><div className="reader-reading-log-table"><table><thead><tr><th>Fecha</th><th>Documento</th><th>Acción</th><th>Detalle</th><th>Versión</th><th>Última página</th></tr></thead><tbody>{visibleEvents.map((event) => <tr key={event.id}><td>{formatDate(event.registered_at)}</td><td><strong>{event.document.code}</strong><span>{event.document.title}</span></td><td>{event.type === 'DESCARGA' ? 'Descarga' : 'Visualización'}</td><td>{event.detail || '—'}</td><td>{event.version || '—'}</td><td>{event.last_page || '—'}</td></tr>)}</tbody></table>{!loading && !visibleEvents.length && <p>No hay registros que coincidan con los filtros.</p>}</div></section></section></div>
}

export default ReaderReadingHistoryView
