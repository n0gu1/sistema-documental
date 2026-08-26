import { useDeferredValue, useState } from 'react'
import './EditorActivityLogView.css'

const personalEvents = [
  { id: 1, date: '23/05/2024 10:32', code: 'POL-001', title: 'Política de Calidad', action: 'Crear documento', detail: 'Documento creado desde plantilla “Política Corporativa”', result: 'Éxito', tone: 'blue', ip: '190.15.24.12', device: 'Chrome / Windows', icon: 'document' },
  { id: 2, date: '23/05/2024 09:41', code: 'POL-001', title: 'Política de Calidad', action: 'Editar contenido', detail: 'Secciones 4.2 y 4.3: objetivos y responsabilidades', result: 'Éxito', tone: 'green', ip: '190.15.24.12', device: 'Chrome / Windows', icon: 'edit' },
  { id: 3, date: '23/05/2024 09:15', code: 'INS-005', title: 'Proceso de Compras', action: 'Subir nueva versión', detail: 'Versión 2.0.0 · Cambios en flujo de aprobación', result: 'Éxito', tone: 'violet', ip: '190.15.24.12', device: 'Chrome / Windows', icon: 'layers' },
  { id: 4, date: '22/05/2024 16:20', code: 'PROC-003', title: 'Proceso de Ventas', action: 'Enviar a revisión', detail: 'Enviado a: María González y Jorge Ramírez', result: 'En revisión', tone: 'orange', ip: '190.15.24.12', device: 'Chrome / Windows', icon: 'send' },
  { id: 5, date: '22/05/2024 15:05', code: 'MAN-003', title: 'Manual de Organización', action: 'Descargar versión', detail: 'Descargada versión 1.3.0', result: 'Éxito', tone: 'teal', ip: '190.15.24.12', device: 'Chrome / Windows', icon: 'download' },
  { id: 6, date: '22/05/2024 11:26', code: 'INS-007', title: 'Instructivo de Auditoría Interna', action: 'Responder comentarios', detail: 'Respondido a comentario de María González (pág. 12)', result: 'Éxito', tone: 'purple', ip: '190.15.24.12', device: 'Chrome / Windows', icon: 'comment' },
  { id: 7, date: '21/05/2024 17:48', code: 'FOR-012', title: 'Formato de Solicitud', action: 'Editar contenido', detail: 'Actualización de campos y validaciones', result: 'Éxito', tone: 'green', ip: '190.15.24.12', device: 'Edge / Windows', icon: 'edit' },
  { id: 8, date: '21/05/2024 14:07', code: 'FOR-012', title: 'Formato de Solicitud', action: 'Enviar a revisión', detail: 'Enviado a: Lucía Fernández', result: 'Aprobado', tone: 'orange', ip: '190.15.24.12', device: 'Edge / Windows', icon: 'send' },
  { id: 9, date: '20/05/2024 10:22', code: 'MAN-001', title: 'Manual de Calidad', action: 'Crear documento', detail: 'Documento creado desde plantilla “Manual Corporativo”', result: 'Éxito', tone: 'blue', ip: '190.15.24.12', device: 'Chrome / Windows', icon: 'document' },
  { id: 10, date: '20/05/2024 09:18', code: 'INS-007', title: 'Instructivo de Auditoría Interna', action: 'Subir nueva versión', detail: 'Versión 0.9.0 · Borrador inicial', result: 'Borrador', tone: 'violet', ip: '190.15.24.12', device: 'Chrome / Windows', icon: 'layers' },
]

const actionDistribution = [
  ['Editar contenido', '31 (35%)', '#0d66d8'],
  ['Subir versión', '17 (20%)', '#1dab70'],
  ['Enviar a revisión', '14 (16%)', '#f0a000'],
  ['Responder comentarios', '9 (10%)', '#7350d8'],
  ['Crear documento', '8 (9%)', '#3bb6bd'],
  ['Descargar versión', '5 (6%)', '#f0b316'],
  ['Otros', '3 (4%)', '#98a9bd'],
]

const alerts = [
  ['alert', 'Documento en revisión vencida', 'PROC-003 Proceso de Ventas', 'Revisión asignada a Jorge Ramírez venció el 21/05/2024.', 'Hace 2 horas'],
  ['info', 'Nueva versión pendiente de aprobación', 'INS-005 Proceso de Compras (v2.0.0)', 'En espera de aprobación de 2 revisor(es).', 'Hace 4 horas'],
  ['alert', 'Comentario sin responder', 'POL-001 Política de Calidad', 'María González hizo un comentario en la pág. 4.', 'Hace 6 horas'],
  ['check', 'Documento aprobado', 'FOR-012 Formato de Solicitud (v1.1.0)', 'Aprobado por Lucía Fernández.', 'Hace 1 día'],
]

function LogIcon({ name, size = 18 }) {
  let content
  switch (name) {
    case 'calendar': content = <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></>; break
    case 'document': content = <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 12h7M9 16h5" /></>; break
    case 'edit': content = <><path d="m4 16-.8 4.8L8 20l11-11-4-4L4 16Z" /><path d="m13.5 6.5 4 4" /></>; break
    case 'layers': content = <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>; break
    case 'send': content = <><path d="m21 3-7.5 18-3.5-7-7-3.5L21 3Z" /><path d="M10 14 21 3" /></>; break
    case 'download': content = <><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 17v4h16v-4" /></>; break
    case 'comment': content = <><path d="M4 5h16v11H8l-4 4V5Z" /><path d="M8 9h8m-8 3h5" /></>; break
    case 'search': content = <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></>; break
    case 'filter': content = <path d="M4 5h16l-6 7v6l-4 2v-8L4 5Z" />; break
    case 'chevron': content = <path d="m8 10 4 4 4-4" />; break
    case 'alert': content = <><path d="m12 3 9 17H3L12 3Z" /><path d="M12 9v4m0 3v.2" /></>; break
    case 'info': content = <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8v.2" /></>; break
    case 'check': content = <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>; break
    default: content = <circle cx="12" cy="12" r="8" />
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function LogSelect({ label, value, options, onChange }) {
  return <label className="editor-log-filter"><span>{label}</span><div><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">{label === 'Fecha' ? 'Últimos 7 días' : label === 'Documento' ? 'Todos' : 'Todas'}</option>{options.map((option) => <option key={option}>{option}</option>)}</select><LogIcon name="chevron" size={14} /></div></label>
}

function EditorActivityLogView({ globalQuery, onAction }) {
  const [documentFilter, setDocumentFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [resultFilter, setResultFilter] = useState('')
  const [freeSearch, setFreeSearch] = useState('')
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(`${globalQuery} ${search}`.trim().toLowerCase())
  const documents = [...new Set(personalEvents.map((event) => `${event.code} ${event.title}`))]
  const actions = [...new Set(personalEvents.map((event) => event.action))]
  const visibleEvents = personalEvents.filter((event) => {
    const searchable = [event.date, event.code, event.title, event.action, event.detail, event.result, event.ip, event.device].join(' ').toLowerCase()
    return (!documentFilter || `${event.code} ${event.title}` === documentFilter)
      && (!actionFilter || event.action === actionFilter)
      && (!resultFilter || event.result === resultFilter)
      && (!deferredSearch || searchable.includes(deferredSearch))
  })

  function clearFilters() {
    setDocumentFilter('')
    setActionFilter('')
    setResultFilter('')
    setFreeSearch('')
    setSearch('')
  }

  return <div className="editor-log-view">
    <header className="editor-log-heading"><div><h1>Bitácora personal</h1><p>Consulta la trazabilidad de tus acciones realizadas en el sistema.</p></div><time><LogIcon name="calendar" size={17} /> 23 de mayo de 2024</time></header>
    <section className="editor-log-metrics" aria-label="Resumen de actividad personal">
      <article><span className="editor-log-metric-icon editor-log-tone--blue"><LogIcon name="calendar" size={27} /></span><div><p>Eventos hoy</p><strong>18</strong><small>↑ <b>38%</b> vs. ayer</small></div></article>
      <article><span className="editor-log-metric-icon editor-log-tone--green"><LogIcon name="document" size={27} /></span><div><p>Documentos editados</p><strong>7</strong><small>↑ <b>16%</b> vs. ayer</small></div></article>
      <article><span className="editor-log-metric-icon editor-log-tone--violet"><LogIcon name="layers" size={27} /></span><div><p>Versiones subidas</p><strong>3</strong><small>↑ <b>50%</b> vs. ayer</small></div></article>
      <article><span className="editor-log-metric-icon editor-log-tone--orange"><LogIcon name="calendar" size={27} /></span><div><p>Acciones en revisión</p><strong>4</strong><small className="is-neutral">→ <b>0%</b> vs. ayer</small></div></article>
    </section>
    <div className="editor-log-layout">
      <main className="editor-log-main">
        <section className="editor-log-filters" aria-label="Filtros de bitácora">
          <LogSelect label="Fecha" value="" options={[]} onChange={() => {}} />
          <LogSelect label="Documento" value={documentFilter} options={documents} onChange={setDocumentFilter} />
          <LogSelect label="Acción" value={actionFilter} options={actions} onChange={setActionFilter} />
          <LogSelect label="Resultado" value={resultFilter} options={['Éxito', 'En revisión', 'Aprobado', 'Borrador']} onChange={setResultFilter} />
          <label className="editor-log-filter editor-log-filter--search"><span>Búsqueda libre</span><div><LogIcon name="search" size={16} /><input value={freeSearch} onChange={(event) => { setFreeSearch(event.target.value); setSearch(event.target.value) }} placeholder="Buscar en detalle..." /></div></label>
          <button className="editor-log-clear" type="button" onClick={clearFilters}><LogIcon name="filter" size={15} /> Limpiar filtros</button>
        </section>
        <section className="editor-log-table-panel"><div className="editor-log-table-scroll"><table><thead><tr><th>Fecha y hora</th><th>Documento</th><th>Acción</th><th>Detalle</th><th>Resultado</th><th>IP / Dispositivo</th></tr></thead><tbody>{visibleEvents.map((event) => <tr key={event.id}><td>{event.date}</td><td><a href="#documento" onClick={(e) => { e.preventDefault(); onAction(`${event.code} ${event.title}`) }}><strong>{event.code}</strong><span>{event.title}</span></a></td><td><i className={`editor-log-row-icon editor-log-row-icon--${event.tone}`}><LogIcon name={event.icon} size={17} /></i>{event.action}</td><td>{event.detail}</td><td><span className={`editor-log-result editor-log-result--${event.result.toLowerCase().replaceAll(' ', '-')}`}>{event.result}</span></td><td><span>{event.ip}</span><small>{event.device}</small></td></tr>)}</tbody></table>{!visibleEvents.length && <div className="editor-log-empty"><LogIcon name="search" size={24} /><strong>No se encontraron eventos</strong><span>Prueba con otros términos o limpia los filtros.</span></div>}</div><footer><span>Mostrando 1 a {visibleEvents.length} de 87 eventos</span><div className="editor-log-pages"><button type="button">‹</button><button className="is-current" type="button">1</button><button type="button">2</button><button type="button">3</button><button type="button">…</button><button type="button">9</button><button type="button">›</button></div><select defaultValue="10"><option>10 por página</option><option>25 por página</option></select></footer></section>
      </main>
      <aside className="editor-log-aside">
        <section className="editor-log-side-card editor-log-distribution"><h2>Distribución por tipo de acción</h2><p>Últimos 7 días</p><div><div className="editor-log-donut"><span><strong>87</strong><small>eventos</small></span></div><ul>{actionDistribution.map(([label, value, color]) => <li key={label}><i style={{ backgroundColor: color }} /><span>{label}</span><b>{value}</b></li>)}</ul></div></section>
        <section className="editor-log-side-card editor-log-alerts"><h2>Últimas alertas o eventos relevantes</h2>{alerts.map(([icon, title, source, detail, date]) => <article key={title}><i className={`editor-log-alert-icon is-${icon}`}><LogIcon name={icon} size={17} /></i><div><strong>{title}</strong><time>{date}</time><span>{source}</span><p>{detail}</p></div></article>)}</section>
      </aside>
    </div>
    <footer className="editor-log-footer"><span>© 2024 Consultoría Alexandria. Todos los derechos reservados.</span><span>Versión 2.1.0</span></footer>
  </div>
}

export default EditorActivityLogView
