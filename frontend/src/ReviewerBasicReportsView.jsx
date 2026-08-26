import { useState } from 'react'
import './ReviewerBasicReportsView.css'

const recentReports = [
  ['Desempeño de revisiones - Mayo 2024', 'Resumen del desempeño de revisiones por estado y área.', '23/05/2024 09:15', 'PDF'],
  ['Cumplimiento de SLA - Mayo 2024', 'Cumplimiento de acuerdos de nivel de servicio (SLA).', '22/05/2024 18:30', 'PDF'],
  ['Devoluciones con observaciones - Mayo 2024', 'Detalle de documentos devueltos con observaciones.', '21/05/2024 16:45', 'Excel'],
  ['Actividad semanal de revisiones', 'Actividad de revisiones por día de la semana.', '20/05/2024 10:20', 'PDF'],
  ['Documentos por área - Mayo 2024', 'Cantidad de documentos revisados agrupados por área.', '20/05/2024 09:05', 'Excel'],
]

function ReportIcon({ name, size = 18 }) {
  let content
  switch (name) {
    case 'document': content = <><path d="M6 2.8h8.6L19 7.2V21H6z" /><path d="M14.5 3v4.5H19M9 12h7M9 16h7" /></>; break
    case 'check': content = <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.7 2.7L16.5 9" /></>; break
    case 'comment': content = <><path d="M4 5h16v11H8l-4 4V5Z" /><path d="M8 9h8m-8 3h5" /></>; break
    case 'clock': content = <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>; break
    case 'calendar': content = <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></>; break
    case 'refresh': content = <><path d="M20 7v5h-5" /><path d="M18.5 16a8 8 0 1 1 1.2-8.5L20 12" /></>; break
    case 'download': content = <><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 18v3h16v-3" /></>; break
    case 'schedule': content = <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16M12 13v3l2 1" /></>; break
    case 'plus': content = <path d="M12 5v14M5 12h14" />; break
    case 'more': content = <><circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" /></>; break
    case 'file': content = <><path d="M6 2.8h8.6L19 7.2V21H6z" /><path d="M14.5 3v4.5H19" /></>; break
    case 'undo': content = <><path d="M9 7 4 12l5 5" /><path d="M4 12h10a6 6 0 0 1 6 6" /></>; break
    default: content = <circle cx="12" cy="12" r="8" />
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function ReportMetric({ icon, tone, label, value, detail, down = false }) {
  return <article className="reviewer-report-metric"><span className={`reviewer-report-metric-icon is-${tone}`}><ReportIcon name={icon} size={29} /></span><div><p>{label}</p><strong>{value}</strong><small className={down ? 'is-down' : ''}>{down ? '↓' : '↑'} <b>{detail}</b> vs. período anterior</small></div></article>
}

function ReviewerBasicReportsView({ onAction }) {
  const [dateRange, setDateRange] = useState('01/05/2024 - 23/05/2024')
  const [area, setArea] = useState('Todas las áreas')
  const [status, setStatus] = useState('Todos los estados')
  const [author, setAuthor] = useState('Todos los autores')

  function clearFilters() {
    setDateRange('01/05/2024 - 23/05/2024')
    setArea('Todas las áreas')
    setStatus('Todos los estados')
    setAuthor('Todos los autores')
    onAction('Se limpiaron los filtros.')
  }

  return <div className="reviewer-basic-reports"><header className="reviewer-reports-heading"><div><h1>Reportes básicos</h1><p>Visualiza tu desempeño como revisor y el estado general de las revisiones asignadas.</p></div><time><ReportIcon name="calendar" size={18} /> 23 de mayo de 2024</time></header><section className="reviewer-report-filters"><label><span>Rango de fechas</span><select value={dateRange} onChange={(event) => setDateRange(event.target.value)}><option>01/05/2024 - 23/05/2024</option><option>01/04/2024 - 30/04/2024</option><option>01/01/2024 - 23/05/2024</option></select></label><label><span>Área</span><select value={area} onChange={(event) => setArea(event.target.value)}><option>Todas las áreas</option><option>Compras</option><option>Calidad</option><option>Tecnologías</option><option>Auditoría Interna</option></select></label><label><span>Estado</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option>Todos los estados</option><option>Aprobadas</option><option>En revisión</option><option>Devueltas</option><option>Vencidas</option></select></label><label><span>Autor</span><select value={author} onChange={(event) => setAuthor(event.target.value)}><option>Todos los autores</option><option>Jorge Ramírez</option><option>Lucía Fernández</option><option>Carlos Méndez</option><option>María González</option></select></label><button type="button" onClick={clearFilters}><ReportIcon name="undo" size={16} /> Limpiar filtros</button></section><section className="reviewer-report-metrics"><ReportMetric icon="document" tone="blue" label="Revisiones completadas" value="37" detail="23%" /><ReportMetric icon="check" tone="green" label="Aprobaciones emitidas" value="18" detail="20%" /><ReportMetric icon="comment" tone="red" label="Devoluciones con observaciones" value="11" detail="10%" /><ReportMetric icon="clock" tone="violet" label="Tiempo promedio de revisión" value="1.6 días" detail="0.4 días" down /></section><div className="reviewer-report-charts"><section className="reviewer-report-card reviewer-report-status-chart"><header><h2>Revisiones por estado</h2></header><div className="reviewer-report-donut"><span>Total<strong>37</strong></span></div><ul><li><i className="is-blue" />Aprobadas <b>18 (48.6%)</b></li><li><i className="is-orange" />En revisión <b>11 (29.7%)</b></li><li><i className="is-red" />Devueltas <b>6 (16.2%)</b></li><li><i className="is-violet" />Vencidas <b>2 (5.4%)</b></li></ul></section><section className="reviewer-report-card reviewer-report-bars"><header><h2>Documentos por área</h2></header><div className="reviewer-report-bar-chart"><div><b>18</b><i style={{ height: '90%' }} /><span>Procesos de<br />Compras</span></div><div><b>12</b><i style={{ height: '60%' }} /><span>Seguridad de la<br />Información</span></div><div><b>7</b><i style={{ height: '35%' }} /><span>Auditoría<br />Interna</span></div><div><b>5</b><i style={{ height: '25%' }} /><span>Talento<br />Humano</span></div><div><b>3</b><i style={{ height: '15%' }} /><span>Finanzas</span></div></div></section><section className="reviewer-report-card reviewer-report-line"><header><h2>Actividad semanal</h2></header><svg viewBox="0 0 330 150" role="img" aria-label="Actividad semanal de revisiones"><path className="reviewer-report-grid-line" d="M24 27h290M24 57h290M24 87h290M24 117h290" /><polyline points="24,102 72,84 120,58 168,82 216,38 264,70 314,83" /><g><circle cx="24" cy="102" r="4" /><circle cx="72" cy="84" r="4" /><circle cx="120" cy="58" r="4" /><circle cx="168" cy="82" r="4" /><circle cx="216" cy="38" r="4" /><circle cx="264" cy="70" r="4" /><circle cx="314" cy="83" r="4" /></g><g className="reviewer-report-line-labels"><text x="24" y="96">5</text><text x="72" y="78">8</text><text x="120" y="52">12</text><text x="168" y="76">9</text><text x="216" y="32">15</text><text x="264" y="64">10</text><text x="314" y="77">7</text></g><g className="reviewer-report-line-days"><text x="24" y="138">Lun</text><text x="72" y="138">Mar</text><text x="120" y="138">Mié</text><text x="168" y="138">Jue</text><text x="216" y="138">Vie</text><text x="264" y="138">Sáb</text><text x="314" y="138">Dom</text></g></svg></section><section className="reviewer-report-card reviewer-report-sla"><header><h2>Cumplimiento de SLA</h2></header><div className="reviewer-report-sla-ring"><span><strong>94%</strong> Cumple</span></div><p>Meta: ≥ 90%</p><small>↑ <b>4%</b> vs. período anterior</small></section></div><section className="reviewer-report-card reviewer-report-recent"><header><h2><ReportIcon name="file" size={17} /> Reportes recientes</h2></header><div className="reviewer-report-table-wrap"><table><thead><tr><th>Nombre del reporte</th><th>Descripción</th><th>Generado el</th><th>Formato</th><th>Estado</th><th>Generado por</th><th>Acciones</th></tr></thead><tbody>{recentReports.map((report) => <tr key={report[0]}><td>{report[0]}</td><td>{report[1]}</td><td>{report[2]}</td><td><span className={`reviewer-report-format is-${report[3].toLowerCase()}`}><ReportIcon name="file" size={15} /> {report[3]}</span></td><td><span className="reviewer-report-complete">Completado</span></td><td>María González</td><td><div><button type="button" aria-label={`Descargar ${report[0]}`} onClick={() => onAction(`Descargar ${report[0]}`)}><ReportIcon name="download" size={16} /></button><button type="button" aria-label={`Más acciones de ${report[0]}`} onClick={() => onAction(`Más acciones de ${report[0]}`)}><ReportIcon name="more" size={16} /></button></div></td></tr>)}</tbody></table></div></section><div className="reviewer-report-actions"><button className="is-primary" type="button" onClick={() => onAction('Generar reporte')}><ReportIcon name="document" size={18} /> Generar reporte</button><button type="button" onClick={() => onAction('Programar reporte')}><ReportIcon name="schedule" size={18} /> Programar reporte</button><button type="button" onClick={() => onAction('Descargar reportes')}><ReportIcon name="download" size={18} /> Descargar</button></div><footer className="editor-footer"><span>© 2024 Consultoría Alexandria. Todos los derechos reservados.</span><span>Versión 2.1.0</span></footer></div>
}

export default ReviewerBasicReportsView
