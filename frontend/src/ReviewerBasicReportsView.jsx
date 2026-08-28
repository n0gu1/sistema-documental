import { useEffect, useState } from 'react'
import { apiRequest, formatDate } from './api'
import './ReviewerBasicReportsView.css'

const emptyData = {
  summary: { total: 0, completed: 0, overdue: 0, by_status: [], by_area: [], by_type: [], by_responsible: [] },
  options: { areas: [], statuses: [], responsibles: [] },
  rows: [],
  history: [],
}

const chartColors = ['#1769e8', '#f6a623', '#42b883', '#e85454', '#7445df', '#14a4a1']
const approvedStatuses = new Set(['APROBADA', 'APROBADO', 'COMPLETADA', 'PUBLICADO'])
const rejectedStatuses = new Set(['RECHAZADA', 'RECHAZADO', 'DEVUELTA', 'DEVUELTO'])

function ReportIcon({ name, size = 18 }) {
  const paths = {
    document: <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 12h7M9 16h7" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.7 2.7L16.5 9" /></>,
    comment: <><path d="M4 5h16v11H8l-4 4V5Z" /><path d="M8 9h8m-8 3h5" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></>,
    chart: <><path d="M4 20V10m6 10V4m6 16v-7m6 7H2" /></>,
    filter: <path d="M4 5h16l-6 7v6l-4 2v-8L4 5Z" />,
    download: <><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 17v4h16v-4" /></>,
    schedule: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18M12 13v4l3 1" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.document}</svg>
}

function Metric({ icon, tone, label, value, detail }) {
  return <article className="reviewer-report-metric"><span className={`reviewer-report-metric-icon is-${tone}`}><ReportIcon name={icon} size={28} /></span><div><p>{label}</p><strong>{value}</strong><small>{detail}</small></div></article>
}

function localDateKey(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatDay(value) {
  return new Intl.DateTimeFormat('es-ES', { weekday: 'short' }).format(value).replace('.', '')
}

function StatusDonut({ values }) {
  const total = values.reduce((sum, item) => sum + item.count, 0)
  let start = 0
  const segments = values.map((item, index) => {
    const end = start + (item.count / (total || 1)) * 100
    const segment = `${chartColors[index % chartColors.length]} ${start}% ${end}%`
    start = end
    return segment
  })
  return <div className="reviewer-report-status-layout"><div className="reviewer-report-donut" style={values.length ? { background: `conic-gradient(${segments.join(',')})` } : undefined}><div><strong>{total}</strong><span>Total</span></div></div><ul>{values.slice(0, 5).map((item, index) => <li key={item.code || item.name}><i style={{ background: chartColors[index % chartColors.length] }} /><span>{item.name}</span><b>{item.count} ({Math.round((item.count / (total || 1)) * 100)}%)</b></li>)}</ul></div>
}

function BarChart({ values, label }) {
  const max = Math.max(...values.map((item) => item.count), 1)
  return <div className="reviewer-report-bars" role="img" aria-label={label}>{values.slice(0, 6).map((item, index) => <div key={item.name}><strong>{item.count}</strong><span><i style={{ height: `${item.count / max * 100}%`, background: chartColors[index % chartColors.length] }} /></span><small title={item.name}>{item.name}</small></div>)}</div>
}

function WeeklyChart({ rows }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today)
    date.setDate(today.getDate() - (6 - index))
    const key = localDateKey(date)
    return { date, key, count: rows.filter((row) => localDateKey(row.created_at) === key).length }
  })
  const max = Math.max(...days.map((day) => day.count), 1)
  const points = days.map((day, index) => `${20 + index * 60},${118 - (day.count / max) * 78}`).join(' ')
  return <div className="reviewer-report-weekly-chart"><svg viewBox="0 0 400 155" role="img" aria-label="Actividad de revisiones durante los últimos siete días"><path className="reviewer-report-grid-line" d="M20 40H380M20 79H380M20 118H380" /><polyline points={points} /><path className="reviewer-report-area" d={`M20 118 ${points} 380 118Z`} />{days.map((day, index) => { const x = 20 + index * 60; const y = 118 - (day.count / max) * 78; return <g key={day.key}><circle cx={x} cy={y} r="4" /><text x={x} y="139" textAnchor="middle">{formatDay(day.date)}</text><text className="reviewer-report-point-value" x={x} y={Math.max(y - 10, 12)} textAnchor="middle">{day.count}</text></g> })}</svg></div>
}

function Filter({ label, value, onChange, options, placeholder = 'Todos' }) {
  return <label className="reviewer-report-filter"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">{placeholder}</option>{options.map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}</select></label>
}

function ReviewerBasicReportsView() {
  const [filters, setFilters] = useState({ date_from: '', date_to: '', area_id: '', status_code: '', responsible_id: '' })
  const [data, setData] = useState(emptyData)
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [format, setFormat] = useState('PDF')
  const [showSchedule, setShowSchedule] = useState(false)
  const [frequency, setFrequency] = useState('monthly')

  function queryString() {
    const params = new URLSearchParams({ scope: 'reviewer' })
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value) })
    return params.toString()
  }

  async function loadReports() {
    setLoading(true)
    try {
      const [reportData, scheduleData] = await Promise.all([apiRequest(`/api/reports/?${queryString()}`), apiRequest('/api/reports/schedules/?scope=reviewer')])
      setData({ ...emptyData, ...reportData })
      setSchedules(scheduleData.schedules || [])
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadReports() }, [filters.date_from, filters.date_to, filters.area_id, filters.status_code, filters.responsible_id])

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }))
  }

  function clearFilters() {
    setFilters({ date_from: '', date_to: '', area_id: '', status_code: '', responsible_id: '' })
  }

  async function generateReport() {
    try {
      const result = await apiRequest('/api/reports/generate/', { method: 'POST', body: { scope: 'reviewer', format, filters } })
      setNotice(`Reporte ${format} generado correctamente.`)
      setData((current) => ({ ...current, history: [result.report, ...current.history] }))
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function createSchedule(event) {
    event.preventDefault()
    try {
      await apiRequest('/api/reports/schedules/', { method: 'POST', body: { scope: 'reviewer', format, frequency, filters, name: `Reportes básicos del revisor ${frequency}` } })
      setNotice('Programación guardada correctamente.')
      setShowSchedule(false)
      await loadReports()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  function download(report) {
    const link = document.createElement('a')
    link.href = report.download_url
    link.download = `${report.name}.${report.format.toLowerCase()}`
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const rows = data.rows || []
  const summary = data.summary || emptyData.summary
  const approved = rows.filter((row) => approvedStatuses.has(row.status_code)).length
  const rejected = rows.filter((row) => rejectedStatuses.has(row.status_code)).length
  const history = data.history || []

  return <div className="reviewer-basic-reports"><header className="reviewer-reports-heading"><div><h1>Reportes básicos</h1><p>Visualiza tu desempeño como revisor y el estado general de tus revisiones asignadas.</p></div><time><ReportIcon name="calendar" size={17} />{new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(new Date())}</time></header>
    <section className="reviewer-report-filters" aria-label="Filtros de reportes"><label className="reviewer-report-filter reviewer-report-date-range"><span>Rango de fechas</span><div><input type="date" aria-label="Desde" value={filters.date_from} onChange={(event) => updateFilter('date_from', event.target.value)} /><b>–</b><input type="date" aria-label="Hasta" value={filters.date_to} onChange={(event) => updateFilter('date_to', event.target.value)} /></div></label><Filter label="Área" value={filters.area_id} onChange={(value) => updateFilter('area_id', value)} options={data.options.areas} placeholder="Todas las áreas" /><Filter label="Estado" value={filters.status_code} onChange={(value) => updateFilter('status_code', value)} options={data.options.statuses} placeholder="Todos los estados" /><Filter label="Autor" value={filters.responsible_id} onChange={(value) => updateFilter('responsible_id', value)} options={data.options.responsibles} placeholder="Todos los autores" /><button type="button" onClick={clearFilters}><ReportIcon name="filter" size={15} />Limpiar filtros</button></section>
    {error && <p className="reviewer-reports-message is-error" role="alert">{error}</p>}{notice && <p className="reviewer-reports-message is-notice" role="status">{notice}</p>}
    <section className="reviewer-report-metrics" aria-label="Indicadores de reportes"><Metric icon="document" tone="blue" label="Revisiones completadas" value={loading ? '...' : summary.completed} detail={`${summary.total} revisiones asignadas`} /><Metric icon="check" tone="green" label="Aprobaciones emitidas" value={loading ? '...' : approved} detail="Estados aprobados" /><Metric icon="comment" tone="red" label="Revisiones rechazadas" value={loading ? '...' : rejected} detail="Estados rechazados" /><Metric icon="clock" tone="violet" label="Revisiones vencidas" value={loading ? '...' : summary.overdue} detail="Fuera de fecha límite" /></section>
    <div className="reviewer-report-charts"><section className="reviewer-report-card reviewer-report-status-chart"><h2>Revisiones por estado</h2>{summary.by_status.length ? <StatusDonut values={summary.by_status} /> : <p className="reviewer-report-empty">No hay datos para los filtros seleccionados.</p>}</section><section className="reviewer-report-card"><h2>Documentos por área</h2>{summary.by_area.length ? <BarChart values={summary.by_area} label="Documentos agrupados por área" /> : <p className="reviewer-report-empty">No hay datos para los filtros seleccionados.</p>}</section><section className="reviewer-report-card"><h2>Actividad semanal</h2>{rows.length ? <WeeklyChart rows={rows} /> : <p className="reviewer-report-empty">No hay datos para los filtros seleccionados.</p>}</section><section className="reviewer-report-card"><h2>Documentos por tipo</h2>{summary.by_type.length ? <BarChart values={summary.by_type} label="Documentos agrupados por tipo" /> : <p className="reviewer-report-empty">No hay datos para los filtros seleccionados.</p>}</section></div>
    <section className="reviewer-report-panel reviewer-report-recent"><header><div><h2>Reportes recientes</h2><p>{history.length} reportes generados</p></div></header><div className="reviewer-report-table-scroll"><table><thead><tr><th>Nombre del reporte</th><th>Generado el</th><th>Formato</th><th>Registros</th><th>Acciones</th></tr></thead><tbody>{history.map((report) => <tr key={report.id}><td>{report.name}</td><td>{formatDate(report.created_at)}</td><td>{report.format}</td><td>{report.rows}</td><td><button type="button" onClick={() => download(report)} aria-label={`Descargar ${report.name}`}><ReportIcon name="download" size={16} />Descargar</button></td></tr>)}</tbody></table>{!history.length && <p className="reviewer-report-empty">Aún no hay reportes generados.</p>}</div><footer><div className="reviewer-report-actions"><select value={format} onChange={(event) => setFormat(event.target.value)} aria-label="Formato de reporte"><option value="PDF">PDF</option><option value="XLSX">Excel (XLSX)</option></select><button className="is-primary" type="button" onClick={generateReport}><ReportIcon name="document" size={16} />Generar reporte</button><button type="button" onClick={() => setShowSchedule((current) => !current)}><ReportIcon name="schedule" size={16} />Programar reporte</button></div></footer>{showSchedule && <form className="reviewer-report-schedule" onSubmit={createSchedule}><label>Frecuencia<select value={frequency} onChange={(event) => setFrequency(event.target.value)}><option value="daily">Diaria</option><option value="weekly">Semanal</option><option value="monthly">Mensual</option></select></label><button className="is-primary" type="submit">Guardar programación</button></form>}</section>
    {schedules.length > 0 && <section className="reviewer-report-panel reviewer-report-schedules"><header><h2>Programaciones activas</h2></header>{schedules.map((schedule) => <p key={schedule.id}><strong>{schedule.name}</strong><span>{schedule.frequency} · {schedule.format} · Próxima ejecución: {formatDate(schedule.next_run_at)}</span></p>)}</section>}
  </div>
}

export default ReviewerBasicReportsView
