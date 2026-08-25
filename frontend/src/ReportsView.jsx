import { useDeferredValue, useState } from 'react'
import './ReportsView.css'

const areaData = [
  ['Administración', '342 (27.4%)', '#0869e8'],
  ['Operaciones', '287 (23.0%)', '#5d5ce2'],
  ['Finanzas', '218 (17.5%)', '#f4a10b'],
  ['Recursos Humanos', '156 (12.5%)', '#2aa96b'],
  ['Tecnología', '134 (10.7%)', '#ef5643'],
  ['Legal', '111 (8.9%)', '#8ca1bd'],
]
const statusData = [
  ['Vigente', '692 (55.4%)', '#2aa96b'],
  ['En revisión', '241 (19.3%)', '#0869e8'],
  ['Obsoleto', '156 (12.5%)', '#f4a10b'],
  ['Pendiente aprobación', '102 (8.2%)', '#8056c7'],
  ['Archivado', '57 (4.6%)', '#8ca1bd'],
]
const performance = [
  ['Juan Martínez', 186, '1.6 días'],
  ['Laura Ramírez', 157, '2.1 días'],
  ['Carlos Pérez', 132, '2.3 días'],
  ['María Gómez', 119, '2.6 días'],
  ['Diego López', 98, '2.8 días'],
]
const activity = [
  ['17/05', 120], ['18/05', 98], ['19/05', 105], ['20/05', 152], ['21/05', 178], ['22/05', 193], ['23/05', 202],
]
const backups = [
  ['23/05/2024 02:15:34', 'Exitoso'],
  ['22/05/2024 02:00:00', 'Exitoso'],
  ['21/05/2024 02:00:00', 'Exitoso'],
  ['20/05/2024 02:00:00', 'Exitoso'],
]
const initialReports = [
  { id: 1, name: 'Resumen ejecutivo - Mayo 2024', date: '23/05/2024 09:15', format: 'PDF', author: 'Ana Rodríguez', status: 'Completado', area: 'Administración', type: 'Informe', documentStatus: 'Vigente' },
  { id: 2, name: 'Actividad documental por área', date: '22/05/2024 18:30', format: 'Excel', author: 'Ana Rodríguez', status: 'Completado', area: 'Operaciones', type: 'Reporte', documentStatus: 'Vigente' },
  { id: 3, name: 'Rendimiento de responsables', date: '22/05/2024 08:45', format: 'PDF', author: 'Juan Martínez', status: 'Completado', area: 'Administración', type: 'Informe', documentStatus: 'En revisión' },
  { id: 4, name: 'Cumplimiento de respaldos - Semanal', date: '21/05/2024 07:30', format: 'Excel', author: 'Sistema', status: 'Completado', area: 'Tecnología', type: 'Reporte', documentStatus: 'Vigente' },
  { id: 5, name: 'Versiones publicadas - Mayo 2024', date: '20/05/2024 17:20', format: 'PDF', author: 'Laura Ramírez', status: 'Completado', area: 'Operaciones', type: 'Manual', documentStatus: 'Obsoleto' },
]

function ReportIcon({ name, size = 18 }) {
  let content
  switch (name) {
    case 'document': content = <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 12h7M9 16h7" /></>; break
    case 'layers': content = <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>; break
    case 'users': content = <><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-1.5A4.5 4.5 0 0 1 8 14h2a4.5 4.5 0 0 1 4.5 4.5V20M16 6a3 3 0 0 1 0 5m1 3a4 4 0 0 1 4 4v2" /></>; break
    case 'clock': content = <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>; break
    case 'calendar': content = <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></>; break
    case 'filter': content = <path d="M4 5h16l-6.2 7v5.5l-3.6 1.8V12L4 5Z" />; break
    case 'chevron': content = <path d="m8 10 4 4 4-4" />; break
    case 'report': content = <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 17v-3m3 3v-6m3 6v-8" /></>; break
    case 'schedule': content = <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18M12 13v4l3 1" /></>; break
    case 'download': content = <><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 17v4h16v-4" /></>; break
    case 'arrow': content = <path d="m9 18 6-6-6-6" />; break
    case 'pdf': content = <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 15h6M9 11h4" /></>; break
    case 'excel': content = <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 11l6 6m0-6-6 6" /></>; break
    default: content = <circle cx="12" cy="12" r="8" />
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function ReportSelect({ label, value, options, onChange }) {
  return <label className="reports-filter"><span>{label}</span><div><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([optionValue, optionLabel]) => <option value={optionValue} key={optionValue}>{optionLabel}</option>)}</select><ReportIcon name="chevron" size={14} /></div></label>
}

function DonutCard({ title, className, data }) {
  return <section className="reports-panel reports-donut-card"><h2>{title}</h2><div><div className={`reports-donut ${className}`}><span><small>Total</small><strong>1,248</strong></span></div><ul>{data.map(([label, value, color]) => <li key={label}><i style={{ backgroundColor: color }} /><span>{label}</span><b>{value}</b></li>)}</ul></div><footer>Datos del período seleccionado</footer></section>
}

function ReportsView({ globalQuery }) {
  const [filters, setFilters] = useState({ date: 'month', area: '', type: '', status: '', responsible: '' })
  const [reports, setReports] = useState(initialReports)
  const [notice, setNotice] = useState('')
  const deferredQuery = useDeferredValue(globalQuery.trim().toLowerCase())
  const visibleReports = reports.filter((report) => {
    const searchable = [report.name, report.date, report.format, report.author, report.status].join(' ').toLowerCase()
    return (!filters.area || report.area === filters.area)
      && (!filters.type || report.type === filters.type)
      && (!filters.status || report.documentStatus === filters.status)
      && (!filters.responsible || report.author === filters.responsible)
      && (!deferredQuery || searchable.includes(deferredQuery))
  })

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }))
  }

  function clearFilters() {
    setFilters({ date: 'month', area: '', type: '', status: '', responsible: '' })
    setNotice('Los filtros se restablecieron.')
  }

  function generateReport() {
    const report = { id: Date.now(), name: 'Reporte personalizado - Mayo 2024', date: '23/05/2024 10:30', format: 'PDF', author: 'Ana Rodríguez', status: 'Completado', area: filters.area || 'Administración', type: filters.type || 'Informe', documentStatus: filters.status || 'Vigente' }
    setReports((current) => [report, ...current])
    setNotice('El reporte se generó correctamente.')
  }

  function downloadReports() {
    const rows = [['Reporte', 'Fecha', 'Formato', 'Generado por', 'Estado'], ...visibleReports.map((report) => [report.name, report.date, report.format, report.author, report.status])]
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'reportes-ejecutivos.csv'
    link.click()
    URL.revokeObjectURL(url)
    setNotice('El listado de reportes se descargó en formato CSV.')
  }

  return (
    <div className="reports-view">
      <header className="reports-heading"><div><h1>Reportes ejecutivos</h1><p>Analiza los indicadores del sistema y el desempeño documental de la organización.</p></div><span><time>23 de mayo de 2024</time><ReportIcon name="calendar" size={18} /></span></header>

      <section className="reports-panel reports-filters">
        <ReportSelect label="Rango de fechas" value={filters.date} onChange={(value) => updateFilter('date', value)} options={[["month", '01/05/2024 - 23/05/2024'], ['week', '17/05/2024 - 23/05/2024'], ['quarter', '01/03/2024 - 23/05/2024']]} />
        <ReportSelect label="Área" value={filters.area} onChange={(value) => updateFilter('area', value)} options={[['', 'Todas las áreas'], ['Administración', 'Administración'], ['Operaciones', 'Operaciones'], ['Tecnología', 'Tecnología']]} />
        <ReportSelect label="Tipo de documento" value={filters.type} onChange={(value) => updateFilter('type', value)} options={[['', 'Todos los tipos'], ['Informe', 'Informe'], ['Reporte', 'Reporte'], ['Manual', 'Manual']]} />
        <ReportSelect label="Estado" value={filters.status} onChange={(value) => updateFilter('status', value)} options={[['', 'Todos los estados'], ['Vigente', 'Vigente'], ['En revisión', 'En revisión'], ['Obsoleto', 'Obsoleto']]} />
        <ReportSelect label="Responsable" value={filters.responsible} onChange={(value) => updateFilter('responsible', value)} options={[['', 'Todos los responsables'], ['Ana Rodríguez', 'Ana Rodríguez'], ['Juan Martínez', 'Juan Martínez'], ['Laura Ramírez', 'Laura Ramírez']]} />
        <button type="button" onClick={clearFilters}><ReportIcon name="filter" size={15} /> Limpiar filtros</button>
      </section>

      <section className="reports-metrics" aria-label="Indicadores ejecutivos">
        <article><span className="reports-metric-icon reports-metric-icon--blue"><ReportIcon name="document" size={25} /></span><div><p>Documentos procesados</p><strong>1,248</strong><small>▲ <b>8.7%</b> vs. período anterior</small></div></article>
        <article><span className="reports-metric-icon reports-metric-icon--violet"><ReportIcon name="layers" size={25} /></span><div><p>Versiones publicadas</p><strong>3,562</strong><small>▲ <b>12.3%</b> vs. período anterior</small></div></article>
        <article><span className="reports-metric-icon reports-metric-icon--green"><ReportIcon name="users" size={25} /></span><div><p>Usuarios activos</p><strong>156</strong><small>▲ <b>5.1%</b> vs. período anterior</small></div></article>
        <article><span className="reports-metric-icon reports-metric-icon--orange"><ReportIcon name="clock" size={25} /></span><div><p>Tiempo promedio de revisión</p><strong>2.4 <i>días</i></strong><small>▼ <b>-0.6 días</b> vs. período anterior</small></div></article>
      </section>

      <div className="reports-chart-grid">
        <DonutCard title="Documentos por área" className="reports-donut--areas" data={areaData} />
        <DonutCard title="Estados documentales" className="reports-donut--status" data={statusData} />
        <section className="reports-panel reports-performance"><h2>Rendimiento por responsable</h2><header><span>Responsable</span><span>Documentos</span><span>Prom. revisión</span></header>{performance.map(([name, documents, average]) => <div className="reports-performance-row" key={name}><span>{name}</span><i><b style={{ width: `${documents / 2}%` }} /></i><strong>{documents}</strong><small>{average}</small></div>)}<footer><span>0</span><span>50</span><span>100</span><span>150</span><span>200</span><b>Promedio general: 2.4 días</b></footer></section>
      </div>

      <div className="reports-insights-grid">
        <section className="reports-panel reports-activity"><h2>Actividad semanal</h2><div className="reports-line-chart"><svg viewBox="0 0 650 130" preserveAspectRatio="none" aria-label="Documentos procesados por día"><g className="reports-grid-lines"><path d="M40 15H630M40 38H630M40 61H630M40 84H630M40 107H630" /></g><polyline points="75,75 165,86 255,81 345,57 435,42 525,34 615,27" /><g>{activity.map(([date, value], index) => <g key={date}><circle cx={75 + index * 90} cy={[75, 86, 81, 57, 42, 34, 27][index]} r="4" /><text x={75 + index * 90} y={[66, 77, 72, 48, 33, 25, 18][index]}>{value}</text></g>)}</g></svg><div>{activity.map(([date]) => <span key={date}>{date}</span>)}</div></div><footer>Documentos procesados por día</footer></section>

        <section className="reports-panel reports-backups"><h2>Cumplimiento de respaldos</h2><div className="reports-backup-content"><div className="reports-gauge"><span><strong>98.6%</strong><small>Cumplimiento</small></span></div><dl><div><dt><i className="is-green" /> Respaldos exitosos</dt><dd>142</dd></div><div><dt><i className="is-red" /> Respaldos fallidos</dt><dd>2</dd></div><div><dt><i className="is-orange" /> Pendientes</dt><dd>1</dd></div><div><dt>Total programados</dt><dd>145</dd></div></dl><section><h3>Últimos respaldos</h3><header><span>Fecha y hora</span><span>Estado</span></header>{backups.map(([date, status]) => <p key={date}><time>{date}</time><b>{status}</b></p>)}<button type="button">Ver todos los respaldos</button></section></div></section>
      </div>

      <section className="reports-panel reports-recent">
        <header><h2>Reportes recientes</h2><div><button className="is-primary" type="button" onClick={generateReport}><ReportIcon name="report" size={15} /> Generar reporte</button><button type="button" onClick={() => setNotice('El programador de reportes está listo para conectarse al backend.')}><ReportIcon name="schedule" size={15} /> Programar reporte <ReportIcon name="chevron" size={13} /></button><button type="button" onClick={downloadReports}><ReportIcon name="download" size={15} /> Descargar <ReportIcon name="chevron" size={13} /></button></div></header>
        <div className="reports-table-scroll"><table><thead><tr><th>Nombre del reporte</th><th>Fecha de generación</th><th>Formato</th><th>Generado por</th><th>Estado</th><th>Descarga</th></tr></thead><tbody>{visibleReports.map((report) => <tr key={report.id}><td>{report.name}</td><td>{report.date}</td><td><span className={`reports-format reports-format--${report.format.toLowerCase()}`}><ReportIcon name={report.format === 'PDF' ? 'pdf' : 'excel'} size={13} /> {report.format}</span></td><td>{report.author}</td><td><b>{report.status}</b></td><td><button type="button" aria-label={`Descargar ${report.name}`} onClick={() => setNotice(`Se preparó la descarga de ${report.name}.`)}><ReportIcon name="download" size={14} /></button></td></tr>)}</tbody></table>{!visibleReports.length && <div className="reports-empty"><strong>No se encontraron reportes</strong><span>Modifique los filtros o la búsqueda global.</span></div>}</div>
      </section>
      <span className="reports-live-notice" role="status">{notice}</span>
    </div>
  )
}

export default ReportsView
