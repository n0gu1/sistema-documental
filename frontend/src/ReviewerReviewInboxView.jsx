import { useDeferredValue, useState } from 'react'
import './ReviewerReviewInboxView.css'

const reviewDocuments = [
  { code: 'PRO-005', document: 'Proceso de Compras', area: 'Compras', author: 'Jorge Ramírez', status: 'Pendiente', priority: 'Alta', due: '24/05/2024', version: '1.2' },
  { code: 'INS-010', document: 'Instructivo de Gestión de No Conformidades', area: 'Calidad', author: 'Lucía Fernández', status: 'Pendiente', priority: 'Alta', due: '27/05/2024', version: '1.1' },
  { code: 'POL-004', document: 'Política de Protección de Datos', area: 'Tecnologías', author: 'Carlos Méndez', status: 'En revisión', priority: 'Media', due: '28/05/2024', version: '1.0' },
  { code: 'FOR-015', document: 'Formato de Evaluación de Proveedores', area: 'Compras', author: 'Lucía Fernández', status: 'Pendiente', priority: 'Media', due: '30/05/2024', version: '1.3' },
  { code: 'PRO-008', document: 'Control de Registros', area: 'Administración', author: 'Jorge Ramírez', status: 'Vencido', priority: 'Alta', due: '21/05/2024', version: '1.0' },
  { code: 'INS-007', document: 'Instructivo de Auditoría Interna', area: 'Auditoría', author: 'María González', status: 'En revisión', priority: 'Media', due: '31/05/2024', version: '1.2' },
  { code: 'POL-002', document: 'Política de Seguridad de la Información', area: 'Tecnologías', author: 'Carlos Méndez', status: 'Devuelto', priority: 'Alta', due: '01/06/2024', version: '0.9' },
  { code: 'FOR-012', document: 'Formato de Solicitud', area: 'Administración', author: 'Lucía Fernández', status: 'Pendiente', priority: 'Baja', due: '04/06/2024', version: '1.1' },
  { code: 'PRO-003', document: 'Gestión de Proveedores', area: 'Compras', author: 'Jorge Ramírez', status: 'Pendiente', priority: 'Media', due: '05/06/2024', version: '1.4' },
  { code: 'INS-012', document: 'Instructivo de Gestión de Cambios', area: 'Tecnologías', author: 'María González', status: 'En revisión', priority: 'Baja', due: '07/06/2024', version: '1.0' },
]

const areas = ['Todas las áreas', 'Compras', 'Calidad', 'Tecnologías', 'Administración', 'Auditoría']
const statuses = ['Todos los estados', 'Pendiente', 'En revisión', 'Vencido', 'Devuelto']
const priorities = ['Todas las prioridades', 'Alta', 'Media', 'Baja']
const authors = ['Todos los autores', 'Jorge Ramírez', 'Lucía Fernández', 'Carlos Méndez', 'María González']

function InboxIcon({ name, size = 18 }) {
  let content
  switch (name) {
    case 'document': content = <><path d="M6 2.8h8.6L19 7.2V21H6z" /><path d="M14.5 3v4.5H19M9 12h7M9 16h7" /></>; break
    case 'clock': content = <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>; break
    case 'alert': content = <><path d="m12 3 9 17H3L12 3Z" /><path d="M12 9v5m0 3h.01" /></>; break
    case 'refresh': content = <><path d="M20 7v5h-5" /><path d="M18.5 16a8 8 0 1 1 1.2-8.5L20 12" /></>; break
    case 'search': content = <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>; break
    case 'calendar': content = <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></>; break
    case 'folder': content = <path d="M3 6h7l2 2h9v11H3V6Z" />; break
    case 'download': content = <><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 18v3h16v-3" /></>; break
    case 'eye': content = <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>; break
    case 'compare': content = <><path d="M7 4v16M17 4v16M3 8h8M13 16h8" /><path d="m4 8 3-3 3 3m4 8 3 3 3-3" /></>; break
    case 'comment': content = <><path d="M4 5h16v11H8l-4 4V5Z" /><path d="M8 9h8m-8 3h5" /></>; break
    case 'approve': content = <><path d="M4 6h16v12H4z" /><path d="m8 12 2.5 2.5L16 9" /></>; break
    case 'bell': content = <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7M10 20h4" /></>; break
    case 'arrow': content = <path d="m9 18 6-6-6-6" />; break
    default: content = <circle cx="12" cy="12" r="8" />
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function InboxMetric({ icon, tone, label, value, detail, negative = false }) {
  return <article className="reviewer-inbox-metric"><span className={`reviewer-inbox-metric-icon is-${tone}`}><InboxIcon name={icon} size={30} /></span><div><p>{label}</p><strong>{value}</strong><small className={negative ? 'is-negative' : ''}>↑ <b>{detail}</b> vs. ayer</small></div></article>
}

function ReviewerReviewInboxView({ onAction }) {
  const [query, setQuery] = useState('')
  const [area, setArea] = useState(areas[0])
  const [status, setStatus] = useState(statuses[0])
  const [priority, setPriority] = useState(priorities[0])
  const [author, setAuthor] = useState(authors[0])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())
  const visibleDocuments = reviewDocuments.filter((item) => { const due = item.due.split('/').reverse().join('-'); return (!deferredQuery || [item.code, item.document, item.area, item.author].join(' ').toLowerCase().includes(deferredQuery)) && (area === areas[0] || item.area === area) && (status === statuses[0] || item.status === status) && (priority === priorities[0] || item.priority === priority) && (author === authors[0] || item.author === author) && (!dateFrom || due >= dateFrom) && (!dateTo || due <= dateTo) })

  function exportList() {
    const csv = ['Código,Documento,Área,Autor,Estado,Prioridad,Fecha límite,Versión', ...visibleDocuments.map((item) => [item.code, item.document, item.area, item.author, item.status, item.priority, item.due, item.version].map((value) => `"${value}"`).join(','))].join('\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    link.download = 'bandeja-de-revision.csv'
    link.click()
    URL.revokeObjectURL(link.href)
    onAction('Se exportó el listado de revisión.')
  }

  return <div className="reviewer-inbox-view"><header className="reviewer-inbox-heading"><div><h1>Bandeja de revisión</h1><p>Gestiona los documentos pendientes, prioriza revisiones y emite dictámenes.</p></div><time><InboxIcon name="calendar" size={18} /> 23 de mayo de 2024</time></header><section className="reviewer-inbox-metrics"><InboxMetric icon="document" tone="blue" label="Asignados hoy" value="6" detail="20%" /><InboxMetric icon="clock" tone="orange" label="Pendientes por revisar" value="9" detail="5%" negative /><InboxMetric icon="alert" tone="red" label="Vencidos" value="3" detail="50%" negative /><InboxMetric icon="refresh" tone="green" label="En revisión activa" value="5" detail="25%" /></section><div className="reviewer-inbox-layout"><main><section className="reviewer-inbox-filters"><label className="reviewer-inbox-search"><span>Búsqueda libre</span><div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por código, documento, autor..." /><InboxIcon name="search" size={18} /></div></label><label><span>Área</span><select value={area} onChange={(event) => setArea(event.target.value)}>{areas.map((option) => <option key={option}>{option}</option>)}</select></label><label><span>Estado</span><select value={status} onChange={(event) => setStatus(event.target.value)}>{statuses.map((option) => <option key={option}>{option}</option>)}</select></label><label><span>Prioridad</span><select value={priority} onChange={(event) => setPriority(event.target.value)}>{priorities.map((option) => <option key={option}>{option}</option>)}</select></label><label className="reviewer-inbox-date"><span>Fecha límite</span><div><input type="date" aria-label="Fecha desde" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /><i>–</i><input type="date" aria-label="Fecha hasta" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></div></label><label><span>Autor</span><select value={author} onChange={(event) => setAuthor(event.target.value)}>{authors.map((option) => <option key={option}>{option}</option>)}</select></label><button className="is-primary" type="button" onClick={() => onAction('Abrir revisión')}><InboxIcon name="folder" size={17} /> Abrir revisión</button><button type="button" onClick={exportList}><InboxIcon name="download" size={17} /> Exportar listado</button></section><section className="reviewer-inbox-table-card"><div className="reviewer-inbox-table-wrap"><table><thead><tr><th>Código</th><th>Documento</th><th>Área</th><th>Autor</th><th>Estado</th><th>Prioridad</th><th>Fecha límite</th><th>Versión</th><th>Acciones</th></tr></thead><tbody>{visibleDocuments.map((item) => <tr key={item.code}><td><strong>{item.code}</strong></td><td>{item.document}</td><td>{item.area}</td><td>{item.author}</td><td><span className={`reviewer-inbox-status is-${item.status.toLowerCase().replace(' ', '-')}`}>{item.status}</span></td><td><span className={`reviewer-inbox-priority is-${item.priority.toLowerCase()}`}>{item.priority}</span></td><td className={item.status === 'Vencido' ? 'is-overdue' : ''}>{item.due}</td><td>{item.version}</td><td><div className="reviewer-inbox-row-actions"><button type="button" aria-label={`Ver ${item.code}`} onClick={() => onAction(`Ver ${item.document}`)}><InboxIcon name="eye" size={17} /></button><button type="button" aria-label={`Comparar ${item.code}`} onClick={() => onAction(`Comparar versiones de ${item.code}`)}><InboxIcon name="compare" size={17} /></button><button type="button" aria-label={`Comentar ${item.code}`} onClick={() => onAction(`Agregar observación a ${item.code}`)}><InboxIcon name="comment" size={17} /></button><button type="button" aria-label={`Aprobar ${item.code}`} onClick={() => onAction(`Aprobar ${item.code}`)}><InboxIcon name="approve" size={17} /></button></div></td></tr>)}</tbody></table>{!visibleDocuments.length && <p className="reviewer-inbox-empty">No se encontraron documentos con los filtros seleccionados.</p>}</div><footer><span>Mostrando 1 a {visibleDocuments.length} de {reviewDocuments.length} documentos</span><div><button type="button" disabled>‹</button><button type="button" className="is-current">1</button><button type="button" disabled>›</button></div></footer></section></main><aside className="reviewer-inbox-sidebar"><section className="reviewer-inbox-side-card reviewer-inbox-alerts"><header><h2><InboxIcon name="bell" size={18} /> Alertas de revisión</h2></header><article><i /> <p><strong>3 documentos vencidos</strong> requieren atención inmediata.<button type="button" onClick={() => onAction('Ver documentos vencidos')}>Ver</button></p><time>Hoy</time></article><article><i /> <p>El documento <strong>PRO-005</strong> vence mañana.<button type="button" onClick={() => onAction('Ver PRO-005')}>Ver</button></p><time>Mañana</time></article><article><i /> <p>Tienes <strong>2 documentos devueltos</strong> por ajustes.<button type="button" onClick={() => onAction('Ver documentos devueltos')}>Ver</button></p><time>Hoy</time></article><article><i /> <p>Recordatorio: 4 documentos vencen en los próximos 7 días.<button type="button" onClick={() => onAction('Ver próximos vencimientos')}>Ver</button></p><time>2 días</time></article><button className="reviewer-inbox-side-link" type="button" onClick={() => onAction('Todas las alertas')}>Ver todas las alertas <InboxIcon name="arrow" size={16} /></button></section><section className="reviewer-inbox-side-card reviewer-inbox-summary"><header><h2><span className="reviewer-inbox-pie" /> Resumen de carga</h2></header><ul><li><i className="is-green" /><span>Al día</span><strong>7</strong></li><li><i className="is-red" /><span>Vencidas</span><strong>3</strong></li><li><i className="is-orange" /><span>En revisión</span><strong>5</strong></li><li><i className="is-blue" /><span>Completadas (mes)</span><strong>12</strong></li></ul><button className="reviewer-inbox-side-link" type="button" onClick={() => onAction('Reporte completo de carga')}>Ver reporte completo <InboxIcon name="arrow" size={16} /></button></section></aside></div><footer className="editor-footer"><span>© 2024 Consultoría Alexandria. Todos los derechos reservados.</span><span>Versión 2.1.0</span></footer></div>
}

export default ReviewerReviewInboxView
