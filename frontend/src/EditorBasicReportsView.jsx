import { useDeferredValue, useEffect, useState } from 'react'
import { apiRequest, formatDate } from './api'
import './EditorBasicReportsView.css'

const emptyData = {
  summary: { total: 0, published: 0, in_review: 0, completed: 0, overdue: 0, by_status: [], by_area: [], by_type: [], by_responsible: [] },
  options: { areas: [], types: [], statuses: [], responsibles: [] }, rows: [], history: [],
}

function ReportIcon({ name, size = 18 }) {
  const paths = {
    document: <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 12h7M9 16h5" /></>,
    chart: <><path d="M4 20V10m6 10V4m6 16v-7m6 7H2" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></>,
    download: <><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 17v4h16v-4" /></>,
    schedule: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18M12 13v4l3 1" /></>,
    filter: <path d="M4 5h16l-6 7v6l-4 2v-8L4 5Z" />,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.document}</svg>
}

function Filter({ label, value, onChange, options, placeholder = 'Todos' }) {
  return <label className="editor-reports-filter"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">{placeholder}</option>{options.map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}</select></label>
}

function reportQueryString(filters) {
  const params = new URLSearchParams({ scope: 'editor' })
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value) })
  return params.toString()
}

function Metric({ label, value, detail, tone, icon }) {
  return <article className="editor-reports-metric"><span className={`editor-reports-metric-icon is-${tone}`}><ReportIcon name={icon} size={27} /></span><div><p>{label}</p><strong>{value}</strong><small>{detail}</small></div></article>
}

function Distribution({ title, values, mode = 'bars' }) {
  const max = Math.max(...values.map((item) => item.count), 1)
  const colors = ['#126bd9', '#2aad70', '#f19a18', '#7954d8', '#22a7ad', '#94a8bd']
  const total = values.reduce((sum, item) => sum + item.count, 0)
  const gradient = values.reduce((distribution, item, index) => {
    const end = distribution.start + (item.count / (total || 1)) * 100
    return { start: end, segments: [...distribution.segments, `${colors[index]} ${distribution.start}% ${end}%`] }
  }, { start: 0, segments: [] }).segments.join(', ')
  return <section className="editor-reports-card"><h2>{title}</h2>{values.length ? mode === 'donut' ? <div className="editor-reports-donut-content"><div className="editor-reports-donut" style={{ background: `conic-gradient(${gradient})` }}><span><strong>{total}</strong><small>Total</small></span></div><ul>{values.slice(0, 5).map((item, index) => <li key={item.name}><i style={{ backgroundColor: colors[index] }} /><span>{item.name}</span><b>{item.count}</b></li>)}</ul></div> : <div className="editor-reports-bars">{values.slice(0, 6).map((item, index) => <div key={item.name}><strong>{item.count}</strong><i><b style={{ height: `${item.count / max * 100}%`, backgroundColor: colors[index] }} /></i><span>{item.name}</span></div>)}</div> : <p className="editor-reports-empty">No hay datos para los filtros seleccionados.</p>}<footer>{total ? `Total: ${total} registros` : ''}</footer></section>
}

function EditorBasicReportsView({ globalQuery = '' }) {
  const [filters, setFilters] = useState({ date_from: '', date_to: '', area_id: '', type_id: '', status_code: '', responsible_id: '' })
  const [data, setData] = useState(emptyData)
  const [schedules, setSchedules] = useState([])
  const [format, setFormat] = useState('PDF')
  const [frequency, setFrequency] = useState('monthly')
  const [showSchedule, setShowSchedule] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const deferredGlobalQuery = useDeferredValue(globalQuery.trim().toLowerCase())

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      try {
        const [reportData, scheduleData] = await Promise.all([apiRequest(`/api/reports/?${reportQueryString(filters)}`), apiRequest('/api/reports/schedules/?scope=editor')])
        if (!active) return
        setData({ ...emptyData, ...reportData })
        setSchedules(scheduleData.schedules || [])
        setError('')
      } catch (requestError) { if (active) setError(requestError.message) }
      finally { if (active) setLoading(false) }
    }
    load()
    return () => { active = false }
  }, [filters])

  function updateFilter(name, value) { setFilters((current) => ({ ...current, [name]: value })) }
  function clearFilters() { setFilters({ date_from: '', date_to: '', area_id: '', type_id: '', status_code: '', responsible_id: '' }) }
  async function generateReport() {
    try {
      const result = await apiRequest('/api/reports/generate/', { method: 'POST', body: { scope: 'editor', format, filters } })
      setData((current) => ({ ...current, history: [result.report, ...current.history] }))
      setNotice(`Reporte ${format} generado correctamente.`)
    } catch (requestError) { setError(requestError.message) }
  }
  async function createSchedule(event) {
    event.preventDefault()
    try {
      const result = await apiRequest('/api/reports/schedules/', { method: 'POST', body: { scope: 'editor', format, frequency, filters, name: 'Reporte básico del editor' } })
      setSchedules((current) => [result.schedule, ...current])
      setShowSchedule(false)
      setNotice('Programación guardada correctamente.')
    } catch (requestError) { setError(requestError.message) }
  }
  function download(report) {
    const link = document.createElement('a')
    link.href = report.download_url
    link.download = `${report.name}.${report.format.toLowerCase()}`
    document.body.appendChild(link); link.click(); link.remove()
  }

  const filteredRows = data.rows.filter((row) => !deferredGlobalQuery || [row.code, row.title, row.area, row.type, row.responsible, row.status].join(' ').toLowerCase().includes(deferredGlobalQuery))
  const { summary } = data
  return <div className="editor-reports-view"><header className="editor-reports-heading"><div><h1>Reportes básicos</h1><p>Resumen de tus documentos, versiones y desempeño en revisiones como editor.</p></div><time><ReportIcon name="calendar" size={17} />{new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(new Date())}</time></header><section className="editor-reports-filters" aria-label="Filtros de reportes"><div className="editor-reports-filter-icon"><ReportIcon name="calendar" size={19} /></div><label className="editor-reports-filter"><span>Desde</span><input type="date" value={filters.date_from} onChange={(event) => updateFilter('date_from', event.target.value)} /></label><label className="editor-reports-filter"><span>Hasta</span><input type="date" value={filters.date_to} onChange={(event) => updateFilter('date_to', event.target.value)} /></label><Filter label="Área" value={filters.area_id} onChange={(value) => updateFilter('area_id', value)} options={data.options.areas} placeholder="Todas" /><Filter label="Tipo de documento" value={filters.type_id} onChange={(value) => updateFilter('type_id', value)} options={data.options.types} placeholder="Todos" /><Filter label="Estado" value={filters.status_code} onChange={(value) => updateFilter('status_code', value)} options={data.options.statuses} placeholder="Todos" /><Filter label="Responsable" value={filters.responsible_id} onChange={(value) => updateFilter('responsible_id', value)} options={data.options.responsibles} placeholder="Todos" /><button type="button" onClick={clearFilters}><ReportIcon name="filter" size={15} />Limpiar filtros</button></section>{error && <p className="reports-error" role="alert">{error}</p>}{notice && <p className="reports-notice" role="status">{notice}</p>}<section className="editor-reports-metrics" aria-label="Indicadores de reportes"><Metric label="Documentos procesados" value={loading ? '...' : summary.total} detail={loading ? 'Consultando filtros' : `${filteredRows.length} coinciden con la búsqueda`} tone="blue" icon="document" /><Metric label="Documentos publicados" value={loading ? '...' : summary.published} detail="Según el estado actual" tone="teal" icon="layers" /><Metric label="Pendientes de revisión" value={loading ? '...' : summary.in_review} detail="Requieren seguimiento" tone="orange" icon="calendar" /><Metric label="Responsables activos" value={loading ? '...' : summary.by_responsible.length} detail="En el período consultado" tone="violet" icon="chart" /></section><div className="editor-reports-chart-grid"><Distribution title="Documentos por estado" values={summary.by_status} mode="donut" /><Distribution title="Documentos por área" values={summary.by_area} /><Distribution title="Documentos por tipo" values={summary.by_type} /><Distribution title="Documentos por responsable" values={summary.by_responsible} /></div><section className="editor-reports-recent"><header><div><h2>Reportes recientes</h2><p>Reportes generados desde esta cuenta.</p></div></header><div className="editor-reports-table-scroll"><table><thead><tr><th>Nombre del reporte</th><th>Generado el</th><th>Formato</th><th>Registros</th><th>Acciones</th></tr></thead><tbody>{data.history.map((report) => <tr key={report.id}><td><ReportIcon name="document" size={15} />{report.name}</td><td>{formatDate(report.created_at)}</td><td>{report.format}</td><td>{report.rows}</td><td><button type="button" onClick={() => download(report)} aria-label={`Descargar ${report.name}`}><ReportIcon name="download" size={16} /></button></td></tr>)}</tbody></table>{!data.history.length && <div className="editor-reports-empty"><strong>Aún no hay reportes generados.</strong><span>Genera un reporte con los filtros actuales.</span></div>}</div><footer><span>{data.history.length} reportes generados</span><div className="editor-reports-actions"><select value={format} onChange={(event) => setFormat(event.target.value)} aria-label="Formato de reporte"><option value="PDF">PDF</option><option value="XLSX">Excel (XLSX)</option></select><button type="button" onClick={generateReport}><ReportIcon name="chart" size={15} />Generar reporte</button><button type="button" onClick={() => setShowSchedule((current) => !current)}><ReportIcon name="schedule" size={15} />Programar reporte</button></div></footer></section>{showSchedule && <form className="editor-reports-schedule" onSubmit={createSchedule}><label>Frecuencia<select value={frequency} onChange={(event) => setFrequency(event.target.value)}><option value="daily">Diaria</option><option value="weekly">Semanal</option><option value="monthly">Mensual</option></select></label><button className="is-primary" type="submit">Guardar programación</button></form>}{schedules.length > 0 && <section className="editor-reports-scheduled"><h2>Programaciones activas</h2>{schedules.map((schedule) => <p key={schedule.id}><strong>{schedule.name}</strong><span>{schedule.frequency} · {schedule.format} · Próxima ejecución: {formatDate(schedule.next_run_at)}</span></p>)}</section>}</div>
}

export default EditorBasicReportsView
