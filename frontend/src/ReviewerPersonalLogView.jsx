import { useDeferredValue, useState } from 'react'
import './ReviewerPersonalLogView.css'

const events = [
  ['23/05/2024 10:15', 'PRO-005', 'Proceso de Compras', 'Aprobar documento', 'Aprobación final del documento versión 1.2', 'Éxito', 'check', 'green', '187.168.10.24', 'Chrome / Windows 11'],
  ['23/05/2024 09:42', 'INS-010', 'Instructivo de Gestión de No Conformidades', 'Devolver con observaciones', 'Se requieren ajustes en el apartado 4.2', 'Devuelto', 'undo', 'red', '187.168.10.24', 'Chrome / Windows 11'],
  ['22/05/2024 16:30', 'POL-004', 'Política de Protección de Datos', 'Comparar versión', 'Comparación entre v1.1 y v1.2', 'Éxito', 'compare', 'violet', '187.168.10.24', 'Chrome / Windows 11'],
  ['22/05/2024 14:05', 'FOR-015', 'Formato de Evaluación de Proveedores', 'Comentar apartado', 'Comentario en apartado 3.1 (Criterios de evaluación)', 'Pendiente', 'comment', 'orange', '187.168.10.24', 'Edge / Windows 11'],
  ['21/05/2024 11:20', 'PRO-008', 'Control de Registros', 'Abrir revisión', 'Se inicia revisión de la versión 1.0', 'Éxito', 'folder', 'blue', '187.168.10.24', 'Chrome / Windows 11'],
  ['20/05/2024 17:45', 'PRO-001', 'Política de Calidad', 'Aprobar documento', 'Aprobación de dictamen final v2.0', 'Aprobado', 'check', 'green', '187.168.10.24', 'Chrome / Windows 11'],
  ['20/05/2024 16:10', 'INS-007', 'Instructivo de Auditoría Interna', 'Devolver con observaciones', 'Ajustes solicitados en el apartado 2.4', 'Devuelto', 'undo', 'red', '187.168.10.24', 'Edge / Windows 11'],
  ['20/05/2024 09:35', 'FOR-012', 'Formato de Solicitud', 'Cerrar dictamen', 'Cierre de dictamen con observaciones atendidas', 'Aprobado', 'check', 'green', '187.168.10.24', 'Chrome / Windows 11'],
]

const actions = ['Todas', 'Aprobar documento', 'Devolver con observaciones', 'Comparar versión', 'Comentar apartado', 'Abrir revisión', 'Cerrar dictamen']
const results = ['Todos', 'Éxito', 'Devuelto', 'Pendiente', 'Aprobado']

function LogIcon({ name, size = 18 }) {
  let content
  switch (name) {
    case 'calendar': content = <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></>; break
    case 'clipboard': content = <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V2h6v2M9 9h6M9 13h6M9 17h4" /></>; break
    case 'comment': content = <><path d="M4 5h16v11H8l-4 4V5Z" /><path d="M8 9h8m-8 3h5" /></>; break
    case 'check': content = <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.7 2.7L16.5 9" /></>; break
    case 'undo': content = <><path d="M9 7 4 12l5 5" /><path d="M4 12h10a6 6 0 0 1 6 6" /></>; break
    case 'compare': content = <><path d="M7 4v16M17 4v16M3 8h8M13 16h8" /><path d="m4 8 3-3 3 3m4 8 3 3 3-3" /></>; break
    case 'folder': content = <path d="M3 6h7l2 2h9v11H3V6Z" />; break
    case 'search': content = <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>; break
    case 'alert': content = <><path d="m12 3 9 17H3L12 3Z" /><path d="M12 9v5m0 3h.01" /></>; break
    case 'info': content = <><circle cx="12" cy="12" r="9" /><path d="M12 10v6m0-9h.01" /></>; break
    case 'document': content = <><path d="M6 2.8h8.6L19 7.2V21H6z" /><path d="M14.5 3v4.5H19M9 12h7M9 16h7" /></>; break
    case 'arrow': content = <path d="m9 18 6-6-6-6" />; break
    default: content = <circle cx="12" cy="12" r="8" />
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function LogMetric({ icon, tone, label, value, detail }) {
  return <article className="reviewer-log-metric"><span className={`reviewer-log-metric-icon is-${tone}`}><LogIcon name={icon} size={29} /></span><div><p>{label}</p><strong>{value}</strong><small>↑ <b>{detail}</b> vs. semana anterior</small></div></article>
}

function ReviewerPersonalLogView({ onAction }) {
  const [dateRange, setDateRange] = useState('Últimos 7 días')
  const [documentFilter, setDocumentFilter] = useState('Todos')
  const [actionFilter, setActionFilter] = useState('Todas')
  const [resultFilter, setResultFilter] = useState('Todos')
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())
  const documentOptions = ['Todos', ...new Set(events.map((event) => event[1]))]
  const visibleEvents = events.filter((event) => (!deferredQuery || event.slice(0, 6).join(' ').toLowerCase().includes(deferredQuery)) && (documentFilter === 'Todos' || event[1] === documentFilter) && (actionFilter === 'Todas' || event[3] === actionFilter) && (resultFilter === 'Todos' || event[5] === resultFilter))

  return <div className="reviewer-personal-log"><header className="reviewer-log-heading"><div><h1>Bitácora personal</h1><p>Consulta el historial de tus revisiones, comentarios y dictámenes emitidos.</p></div><time><LogIcon name="calendar" size={18} /> 23 de mayo de 2024</time></header><section className="reviewer-log-metrics"><LogMetric icon="calendar" tone="blue" label="Eventos hoy" value="14" detail="27%" /><LogMetric icon="clipboard" tone="orange" label="Revisiones completadas" value="5" detail="25%" /><LogMetric icon="comment" tone="red" label="Observaciones emitidas" value="8" detail="33%" /><LogMetric icon="check" tone="green" label="Aprobaciones registradas" value="3" detail="20%" /></section><div className="reviewer-log-layout"><main><section className="reviewer-log-filters"><label><span>Fecha</span><select value={dateRange} onChange={(event) => setDateRange(event.target.value)}><option>Últimos 7 días</option><option>Últimos 30 días</option><option>Este mes</option></select></label><label><span>Documento</span><select value={documentFilter} onChange={(event) => setDocumentFilter(event.target.value)}>{documentOptions.map((option) => <option key={option}>{option}</option>)}</select></label><label><span>Acción</span><select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>{actions.map((option) => <option key={option}>{option}</option>)}</select></label><label><span>Resultado</span><select value={resultFilter} onChange={(event) => setResultFilter(event.target.value)}>{results.map((option) => <option key={option}>{option}</option>)}</select></label><label className="reviewer-log-search"><span>Búsqueda libre</span><div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar en detalle, documento..." /><LogIcon name="search" size={17} /></div></label></section><section className="reviewer-log-table-card"><div className="reviewer-log-table-wrap"><table><thead><tr><th>Fecha y hora</th><th>Documento</th><th>Acción</th><th>Detalle</th><th>Resultado</th><th>IP / Dispositivo</th></tr></thead><tbody>{visibleEvents.map((event) => <tr key={`${event[0]}-${event[1]}`}><td>{event[0]}</td><td><strong>{event[1]}</strong><span>{event[2]}</span></td><td><span className={`reviewer-log-action-icon is-${event[7]}`}><LogIcon name={event[6]} size={15} /></span>{event[3]}</td><td>{event[4]}</td><td><span className={`reviewer-log-result is-${event[5].toLowerCase()}`}>{event[5]}</span></td><td>{event[8]}<br /><small>{event[9]}</small></td></tr>)}</tbody></table>{!visibleEvents.length && <p className="reviewer-log-empty">No se encontraron eventos con los filtros seleccionados.</p>}</div><footer><span>Mostrando 1 a {visibleEvents.length} de {events.length} eventos</span><div><button type="button" disabled>‹</button><button type="button" className="is-current">1</button><button type="button" disabled>›</button></div></footer></section></main><aside className="reviewer-log-sidebar"><section className="reviewer-log-card reviewer-log-distribution"><header><h2>Distribución por tipo de acción</h2><button type="button" aria-label="Información" onClick={() => onAction('Información de distribución')}><LogIcon name="info" size={17} /></button></header><div className="reviewer-log-chart-area"><div className="reviewer-log-donut"><span>Total<strong>34</strong></span></div><ul><li><i className="is-green" /><span>Aprobar documento</span><b>11 (32%)</b></li><li><i className="is-red" /><span>Devolver con observaciones</span><b>9 (26%)</b></li><li><i className="is-orange" /><span>Comentar apartado</span><b>6 (18%)</b></li><li><i className="is-violet" /><span>Comparar versión</span><b>4 (12%)</b></li><li><i className="is-blue" /><span>Abrir revisión</span><b>3 (9%)</b></li><li><i className="is-darkgreen" /><span>Cerrar dictamen</span><b>1 (3%)</b></li></ul></div></section><section className="reviewer-log-card reviewer-log-alerts"><header><h2>Últimas alertas o eventos relevantes</h2></header><article><span className="is-red"><LogIcon name="alert" size={18} /></span><div><strong>Documento devuelto</strong><p>INS-010 Instructivo de Gestión de No Conformidades devuelto con observaciones.</p></div><time>09:42</time></article><article><span className="is-orange"><LogIcon name="comment" size={18} /></span><div><strong>Nuevo comentario pendiente</strong><p>Tienes un comentario pendiente de revisar en POL-004 Política de Protección de Datos.</p></div><time>16:30</time></article><article><span className="is-green"><LogIcon name="check" size={18} /></span><div><strong>Documento aprobado</strong><p>PRO-005 Proceso de Compras fue aprobado exitosamente.</p></div><time>10:15</time></article><article><span className="is-blue"><LogIcon name="document" size={18} /></span><div><strong>Nueva versión disponible</strong><p>INS-007 Instructivo de Auditoría Interna versión 1.3 ya está disponible para revisión.</p></div><time>08:20</time></article><button type="button" onClick={() => onAction('Todas las alertas')}>Ver todas <LogIcon name="arrow" size={16} /></button></section></aside></div><footer className="editor-footer"><span>© 2024 Consultoría Alexandria. Todos los derechos reservados.</span><span>Versión 2.1.0</span></footer></div>
}

export default ReviewerPersonalLogView
