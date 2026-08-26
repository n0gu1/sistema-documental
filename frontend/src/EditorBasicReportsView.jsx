import { useDeferredValue, useState } from 'react'
import './EditorBasicReportsView.css'

const reportRows = [
  { id: 1, name: 'Resumen mensual de documentos', description: 'Resumen general de documentos y versiones del mes', date: '23/05/2024 09:30', format: 'PDF', status: 'Completado', author: 'Carlos Méndez', type: 'Política' },
  { id: 2, name: 'Desempeño de revisiones', description: 'Análisis de tiempos y cumplimiento de revisiones', date: '22/05/2024 16:45', format: 'XLSX', status: 'Completado', author: 'Carlos Méndez', type: 'Proceso' },
  { id: 3, name: 'Documentos por estado', description: 'Detalle de documentos agrupados por estado', date: '21/05/2024 11:20', format: 'PDF', status: 'Completado', author: 'Carlos Méndez', type: 'Instructivo' },
  { id: 4, name: 'Actividad semanal del editor', description: 'Actividades realizadas por día de la semana', date: '20/05/2024 08:15', format: 'XLSX', status: 'Completado', author: 'Carlos Méndez', type: 'Formato' },
]

const statusData = [
  ['En revisión', '24 (37%)', '#126bd9'],
  ['Borrador', '14 (22%)', '#f19a18'],
  ['Activos', '20 (31%)', '#31ad70'],
  ['Archivados', '6 (10%)', '#7954d8'],
]

const typeData = [
  ['Política', 24, '#126bd9'],
  ['Proceso', 16, '#31ad70'],
  ['Instructivo', 10, '#f2a51b'],
  ['Formato', 8, '#7954d8'],
  ['Otro', 6, '#32abb4'],
]

const weeklyActivity = [
  ['Vie 17', 8], ['Sáb 18', 5], ['Dom 19', 6], ['Lun 20', 18], ['Mar 21', 24], ['Mié 22', 28], ['Jue 23', 31],
]

function ReportIcon({ name, size = 18 }) {
  let content
  switch (name) {
    case 'calendar': content = <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></>; break
    case 'document': content = <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 12h7M9 16h5" /></>; break
    case 'layers': content = <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>; break
    case 'clock': content = <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>; break
    case 'stopwatch': content = <><circle cx="12" cy="13" r="7" /><path d="M12 6V3m-3 0h6m2 5 2-2M12 10v4l2 1" /></>; break
    case 'sliders': content = <><path d="M4 6h7m4 0h5M4 12h3m4 0h9M4 18h7m4 0h5" /><circle cx="13" cy="6" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="13" cy="18" r="2" /></>; break
    case 'user': content = <><circle cx="12" cy="8" r="3.5" /><path d="M4 21a8 8 0 0 1 16 0" /></>; break
    case 'filter': content = <path d="M4 5h16l-6 7v6l-4 2v-8L4 5Z" />; break
    case 'chevron': content = <path d="m8 10 4 4 4-4" />; break
    case 'download': content = <><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 17v4h16v-4" /></>; break
    case 'external': content = <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>; break
    case 'more': content = <><circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" /></>; break
    case 'pdf': content = <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 15h6M9 11h4" /></>; break
    case 'excel': content = <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 11l6 6m0-6-6 6" /></>; break
    default: content = <circle cx="12" cy="12" r="8" />
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function ReportSelect({ icon, label, value, options, onChange }) {
  return <label className="editor-reports-filter"><span className={`editor-reports-filter-icon editor-reports-filter-icon--${icon}`}><ReportIcon name={icon} size={18} /></span><span className="editor-reports-filter-field"><b>{label}</b><span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([optionValue, optionLabel]) => <option value={optionValue} key={optionValue}>{optionLabel}</option>)}</select><ReportIcon name="chevron" size={14} /></span></span></label>
}

function StatusDonut() {
  return <section className="editor-reports-card"><h2>Documentos por estado</h2><div className="editor-reports-status-content"><div className="editor-reports-status-donut"><span><strong>64</strong><small>Total</small></span></div><ul>{statusData.map(([label, value, color]) => <li key={label}><i style={{ backgroundColor: color }} /><span>{label}</span><b>{value}</b></li>)}</ul></div><footer>Total: 64 documentos</footer></section>
}

function TypeBars() {
  return <section className="editor-reports-card"><h2>Documentos por tipo</h2><div className="editor-reports-bars"><div className="editor-reports-bar-grid"><span>40</span><span>30</span><span>20</span><span>10</span><span>0</span></div><div className="editor-reports-bar-list">{typeData.map(([label, value, color]) => <div key={label}><strong>{value}</strong><i><b style={{ height: `${value / 40 * 100}%`, backgroundColor: color }} /></i><span>{label}</span></div>)}</div></div><footer>Total: 64 documentos</footer></section>
}

function WeeklyChart() {
  const points = weeklyActivity.map(([, value], index) => `${20 + index * 42},${103 - value * 2.3}`).join(' ')
  return <section className="editor-reports-card"><h2>Actividad semanal</h2><div className="editor-reports-line"><svg viewBox="0 0 290 130" preserveAspectRatio="none" aria-label="Actividad semanal"><g><path d="M20 12H280M20 42H280M20 72H280M20 103H280" /></g><polyline points={points} />{weeklyActivity.map(([date, value], index) => <g key={date}><circle cx={20 + index * 42} cy={103 - value * 2.3} r="3.5" /><text x={20 + index * 42} y={96 - value * 2.3}>{value}</text></g>)}</svg><div>{weeklyActivity.map(([date]) => <span key={date}>{date}</span>)}</div></div><footer>Total: 120 actividades</footer></section>
}

function ReviewGauge() {
  return <section className="editor-reports-card"><h2>Cumplimiento de revisiones</h2><div className="editor-reports-review"><div className="editor-reports-gauge"><span><strong>86%</strong><small>Cumplido</small></span></div><dl><div><dt>Revisiones a tiempo</dt><dd>49</dd></div><div><dt>Revisiones vencidas</dt><dd className="is-alert">8</dd></div><div><dt>Total de revisiones</dt><dd>57</dd></div></dl></div><footer><span>Meta: ≥ 85%</span><b>Meta cumplida</b></footer></section>
}

function EditorBasicReportsView({ globalQuery }) {
  const [filters, setFilters] = useState({ date: 'month', type: '', status: '', responsible: '' })
  const [reports, setReports] = useState(reportRows)
  const [notice, setNotice] = useState('')
  const deferredQuery = useDeferredValue(globalQuery.trim().toLowerCase())
  const visibleReports = reports.filter((report) => {
    const searchable = [report.name, report.description, report.date, report.format, report.author, report.status, report.type].join(' ').toLowerCase()
    return (!filters.type || report.type === filters.type)
      && (!filters.status || report.status === filters.status)
      && (!filters.responsible || report.author === filters.responsible)
      && (!deferredQuery || searchable.includes(deferredQuery))
  })

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }))
  }

  function clearFilters() {
    setFilters({ date: 'month', type: '', status: '', responsible: '' })
    setNotice('Los filtros se restablecieron.')
  }

  function generateReport() {
    setReports((current) => [{ id: Date.now(), name: 'Reporte personalizado del editor', description: 'Resumen generado con los filtros actuales', date: '23/05/2024 10:45', format: 'PDF', status: 'Completado', author: 'Carlos Méndez', type: filters.type || 'Política' }, ...current])
    setNotice('El reporte se generó correctamente.')
  }

  function downloadReports() {
    const rows = [['Nombre del reporte', 'Descripción', 'Generado el', 'Formato', 'Estado', 'Generado por'], ...visibleReports.map((report) => [report.name, report.description, report.date, report.format, report.status, report.author])]
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'reportes-basicos.csv'
    link.click()
    URL.revokeObjectURL(url)
    setNotice('Los reportes se descargaron en formato CSV.')
  }

  return <div className="editor-reports-view">
    <header className="editor-reports-heading"><div><h1>Reportes básicos</h1><p>Resumen de tus documentos, versiones y desempeño en revisiones como editor.</p></div><time><ReportIcon name="calendar" size={17} /> 23 de mayo de 2024</time></header>
    <section className="editor-reports-filters" aria-label="Filtros de reportes"><ReportSelect icon="calendar" label="Rango de fechas" value={filters.date} onChange={(value) => updateFilter('date', value)} options={[['month', '01/05/2024 - 23/05/2024'], ['week', '17/05/2024 - 23/05/2024'], ['quarter', '01/03/2024 - 23/05/2024']]} /><ReportSelect icon="document" label="Tipo de documento" value={filters.type} onChange={(value) => updateFilter('type', value)} options={[['', 'Todos'], ['Política', 'Política'], ['Proceso', 'Proceso'], ['Instructivo', 'Instructivo'], ['Formato', 'Formato']]} /><ReportSelect icon="sliders" label="Estado" value={filters.status} onChange={(value) => updateFilter('status', value)} options={[['', 'Todos'], ['Completado', 'Completado']]} /><ReportSelect icon="user" label="Responsable" value={filters.responsible} onChange={(value) => updateFilter('responsible', value)} options={[['', 'Todos'], ['Carlos Méndez', 'Carlos Méndez']]} /><button type="button" onClick={clearFilters}><ReportIcon name="filter" size={15} /> Limpiar filtros</button></section>
    <section className="editor-reports-metrics" aria-label="Indicadores de reportes"><article><span className="editor-reports-metric-icon is-blue"><ReportIcon name="document" size={29} /></span><div><p>Documentos procesados</p><strong>64</strong><small>↗ <b>18%</b> vs. mes anterior</small></div></article><article><span className="editor-reports-metric-icon is-teal"><ReportIcon name="layers" size={29} /></span><div><p>Versiones publicadas</p><strong>42</strong><small>↗ <b>20%</b> vs. mes anterior</small></div></article><article><span className="editor-reports-metric-icon is-orange"><ReportIcon name="clock" size={29} /></span><div><p>Pendientes de revisión</p><strong>16</strong><small className="is-alert">↗ <b>11%</b> vs. mes anterior</small></div></article><article><span className="editor-reports-metric-icon is-violet"><ReportIcon name="stopwatch" size={29} /></span><div><p>Tiempo promedio de atención</p><strong>1.8 <i>días</i></strong><small>↘ <b>12%</b> vs. mes anterior</small></div></article></section>
    <div className="editor-reports-chart-grid"><StatusDonut /><TypeBars /><WeeklyChart /><ReviewGauge /></div>
    <section className="editor-reports-recent"><header><h2>Reportes recientes</h2></header><div className="editor-reports-table-scroll"><table><thead><tr><th>Nombre del reporte</th><th>Descripción</th><th>Generado el</th><th>Formato</th><th>Estado</th><th>Generado por</th><th aria-label="Acciones" /></tr></thead><tbody>{visibleReports.map((report) => <tr key={report.id}><td><ReportIcon name="document" size={15} />{report.name}</td><td>{report.description}</td><td>{report.date}</td><td><span className={`editor-reports-format is-${report.format.toLowerCase()}`}><ReportIcon name={report.format === 'PDF' ? 'pdf' : 'excel'} size={14} /> {report.format}</span></td><td><b className="editor-reports-status">{report.status}</b></td><td>{report.author}</td><td><button type="button" aria-label={`Descargar ${report.name}`} onClick={() => setNotice(`Se preparó la descarga de ${report.name}.`)}><ReportIcon name="download" size={15} /></button><button type="button" aria-label={`Más acciones de ${report.name}`} onClick={() => setNotice(`Más acciones de ${report.name}.`)}><ReportIcon name="more" size={15} /></button></td></tr>)}</tbody></table>{!visibleReports.length && <div className="editor-reports-empty"><strong>No se encontraron reportes</strong><span>Modifica los filtros para continuar.</span></div>}</div><footer><span>Mostrando 1 a {visibleReports.length} de {reports.length} reportes</span><div><button type="button" className="editor-reports-action editor-reports-action--outline" onClick={generateReport}><ReportIcon name="external" size={17} /> Generar reporte</button><button type="button" className="editor-reports-action editor-reports-action--outline" onClick={() => setNotice('El programador de reportes está disponible en esta vista frontend.')}><ReportIcon name="calendar" size={17} /> Programar reporte</button><button type="button" className="editor-reports-action editor-reports-action--primary" onClick={downloadReports}><ReportIcon name="download" size={17} /> Descargar <ReportIcon name="chevron" size={14} /></button></div></footer></section>
    <span className="editor-reports-notice" role="status">{notice}</span>
    <footer className="editor-reports-footer"><span>© 2024 Consultoría Alexandria. Todos los derechos reservados.</span><span>Versión 2.1.0</span></footer>
  </div>
}

export default EditorBasicReportsView
