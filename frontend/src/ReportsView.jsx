import { useEffect, useState } from 'react'
import { apiRequest, formatDate } from './api'
import './ReportsView.css'

const emptyData = {
  summary: { total: 0, published: 0, in_review: 0, completed: 0, overdue: 0, by_status: [], by_area: [], by_type: [], by_responsible: [] },
  options: { areas: [], types: [], statuses: [], responsibles: [] },
  rows: [],
  history: [],
}

function ReportIcon({ name, size = 18 }) {
  const paths = {
    document: <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 12h7M9 16h7" /></>,
    chart: <><path d="M4 20V10m6 10V4m6 16v-7m6 7H2" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></>,
    download: <><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 17v4h16v-4" /></>,
    schedule: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18M12 13v4l3 1" /></>,
    filter: <path d="M4 5h16l-6 7v6l-4 2v-8L4 5Z" />,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.document}</svg>
}

function Filter({ label, value, onChange, options, placeholder = 'Todos' }) {
  return <label className="reports-filter"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">{placeholder}</option>{options.map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}</select></label>
}

function Metric({ label, value, detail, tone }) {
  return <article className={`reports-metric reports-metric--${tone}`}><span><ReportIcon name={tone === 'orange' ? 'calendar' : tone === 'violet' ? 'chart' : 'document'} size={23} /></span><div><p>{label}</p><strong>{value}</strong><small>{detail}</small></div></article>
}

function Breakdown({ title, values }) {
  const max = Math.max(...values.map((item) => item.count), 1)
  return <section className="reports-card"><h2>{title}</h2>{values.length ? <div className="reports-breakdown">{values.map((item) => <div key={item.name}><div><span>{item.name}</span><b>{item.count}</b></div><i><em style={{ width: `${item.count / max * 100}%` }} /></i></div>)}</div> : <p className="reports-empty">No hay datos para los filtros seleccionados.</p>}</section>
}

function ReportsView({ globalQuery = '', scope = 'executive', title = 'Reportes ejecutivos' }) {
  const [filters, setFilters] = useState({ date_from: '', date_to: '', area_id: '', type_id: '', status_code: '', responsible_id: '' })
  const [data, setData] = useState(emptyData)
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [format, setFormat] = useState('PDF')
  const [showSchedule, setShowSchedule] = useState(false)
  const [frequency, setFrequency] = useState('monthly')

  function queryString() {
    const params = new URLSearchParams({ scope })
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value) })
    return params.toString()
  }

  async function loadReports() {
    setLoading(true)
    try {
      const [reportData, scheduleData] = await Promise.all([
        apiRequest(`/api/reports/?${queryString()}`),
        apiRequest(`/api/reports/schedules/?scope=${scope}`),
      ])
      setData({ ...emptyData, ...reportData })
      setSchedules(scheduleData.schedules || [])
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadReports() }, [scope, filters.date_from, filters.date_to, filters.area_id, filters.type_id, filters.status_code, filters.responsible_id])

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }))
  }

  function clearFilters() {
    setFilters({ date_from: '', date_to: '', area_id: '', type_id: '', status_code: '', responsible_id: '' })
  }

  async function generateReport() {
    try {
      const result = await apiRequest('/api/reports/generate/', { method: 'POST', body: { scope, format, filters } })
      setNotice(`Reporte ${format} generado correctamente.`)
      setData((current) => ({ ...current, history: [result.report, ...current.history] }))
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function createSchedule(event) {
    event.preventDefault()
    try {
      await apiRequest('/api/reports/schedules/', { method: 'POST', body: { scope, format, frequency, filters, name: `${title} ${frequency}` } })
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

  const searchableRows = data.rows.filter((row) => !globalQuery.trim() || [row.code, row.title, row.area, row.type, row.responsible, row.status].join(' ').toLowerCase().includes(globalQuery.trim().toLowerCase()))
  const { summary } = data

  return <div className="reports-view">
    <header className="reports-heading"><div><p>Analítica documental</p><h1>{title}</h1><span>Consultas reales de la organización, con filtros y exportación.</span></div><time><ReportIcon name="calendar" size={17} /> Actualizado {formatDate(new Date().toISOString())}</time></header>
    <section className="reports-panel reports-filters" aria-label="Filtros de reportes"><label className="reports-filter"><span>Desde</span><input type="date" value={filters.date_from} onChange={(event) => updateFilter('date_from', event.target.value)} /></label><label className="reports-filter"><span>Hasta</span><input type="date" value={filters.date_to} onChange={(event) => updateFilter('date_to', event.target.value)} /></label><Filter label="Área" value={filters.area_id} onChange={(value) => updateFilter('area_id', value)} options={data.options.areas} placeholder="Todas las áreas" /><Filter label="Tipo" value={filters.type_id} onChange={(value) => updateFilter('type_id', value)} options={data.options.types} placeholder="Todos los tipos" /><Filter label="Estado" value={filters.status_code} onChange={(value) => updateFilter('status_code', value)} options={data.options.statuses} placeholder="Todos los estados" /><Filter label="Responsable" value={filters.responsible_id} onChange={(value) => updateFilter('responsible_id', value)} options={data.options.responsibles} placeholder="Todos" /><button type="button" onClick={clearFilters}><ReportIcon name="filter" size={15} /> Limpiar</button></section>
    {error && <p className="reports-error" role="alert">{error}</p>}
    {notice && <p className="reports-notice" role="status">{notice}</p>}
    <section className="reports-metrics" aria-label="Indicadores de reportes"><Metric label={scope === 'reviewer' ? 'Revisiones asignadas' : 'Documentos procesados'} value={loading ? '...' : summary.total} detail={`${summary.completed} completados`} tone="blue" /><Metric label="Publicados" value={loading ? '...' : summary.published} detail={`${summary.in_review} en revisión`} tone="violet" /><Metric label="Registros vencidos" value={loading ? '...' : summary.overdue} detail="Requieren atención" tone="orange" /><Metric label="Responsables" value={loading ? '...' : summary.by_responsible.length} detail="Con actividad en el período" tone="green" /></section>
    <div className="reports-chart-grid"><Breakdown title="Distribución por estado" values={summary.by_status} /><Breakdown title="Documentos por área" values={summary.by_area} /><Breakdown title="Documentos por tipo" values={summary.by_type} /></div>
    <section className="reports-panel reports-recent"><header><div><h2>Detalle del reporte</h2><p>{searchableRows.length} registros coinciden con los filtros.</p></div><div className="reports-actions"><select value={format} onChange={(event) => setFormat(event.target.value)} aria-label="Formato de reporte"><option value="PDF">PDF</option><option value="XLSX">Excel (XLSX)</option></select><button className="is-primary" type="button" onClick={generateReport}><ReportIcon name="chart" size={15} /> Generar reporte</button><button type="button" onClick={() => setShowSchedule((current) => !current)}><ReportIcon name="schedule" size={15} /> Programar</button></div></header>{showSchedule && <form className="reports-schedule" onSubmit={createSchedule}><label>Frecuencia<select value={frequency} onChange={(event) => setFrequency(event.target.value)}><option value="daily">Diaria</option><option value="weekly">Semanal</option><option value="monthly">Mensual</option></select></label><button className="is-primary" type="submit">Guardar programación</button></form>}<div className="reports-table-scroll"><table><thead><tr><th>Código</th><th>Documento</th><th>Área</th><th>Tipo</th><th>Responsable</th><th>Estado</th><th>Actualización</th></tr></thead><tbody>{searchableRows.map((row) => <tr key={row.id}><td>{row.code}</td><td>{row.title}</td><td>{row.area}</td><td>{row.type}</td><td>{row.responsible}</td><td><b>{row.status}</b></td><td>{formatDate(row.updated_at || row.created_at)}</td></tr>)}</tbody></table>{!loading && !searchableRows.length && <p className="reports-empty">No se encontraron registros.</p>}</div></section>
    <section className="reports-panel reports-history"><header><div><h2>Historial de reportes generados</h2><p>Los reportes se conservan por organización y pueden descargarse nuevamente.</p></div></header><div className="reports-history-list">{data.history.map((report) => <article key={report.id}><span><ReportIcon name={report.format === 'PDF' ? 'document' : 'chart'} size={17} /></span><div><strong>{report.name}</strong><small>{report.format} · {report.rows} registros · {formatDate(report.created_at)}</small></div><button type="button" onClick={() => download(report)} aria-label={`Descargar ${report.name}`}><ReportIcon name="download" size={16} /></button></article>)}{!data.history.length && <p className="reports-empty">Aún no hay reportes generados.</p>}</div></section>
    <section className="reports-panel reports-schedules"><header><div><h2>Programaciones activas</h2><p>El proceso programado genera el reporte en la siguiente ejecución.</p></div></header>{schedules.length ? schedules.map((schedule) => <p key={schedule.id}><strong>{schedule.name}</strong><span>{schedule.frequency} · {schedule.format} · Próxima ejecución: {formatDate(schedule.next_run_at)}</span></p>) : <p className="reports-empty">No hay programaciones activas.</p>}</section>
  </div>
}

export default ReportsView
