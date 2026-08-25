import { useDeferredValue, useState } from 'react'
import './AuditView.css'

const events = [
  { id: 1, date: '23/05/2024 10:25:41', initials: 'JM', user: 'Juan Martínez', role: 'Administrador', module: 'Usuarios', action: 'Inicio de sesión', detail: 'Inicio de sesión exitoso en la plataforma', ip: '190.15.23.45', result: 'Exitoso', tone: 'blue' },
  { id: 2, date: '23/05/2024 09:58:12', initials: 'LR', user: 'Laura Ramírez', role: 'Editor', module: 'Documentos', action: 'Creación de documento', detail: 'Documento “Política de Seguridad v2.0” creado', ip: '190.15.23.46', result: 'Exitoso', tone: 'green' },
  { id: 3, date: '23/05/2024 09:31:07', initials: 'CP', user: 'Carlos Pérez', role: 'Revisor', module: 'Versiones', action: 'Aprobación de versión', detail: 'Versión 1.3 del documento aprobada', ip: '190.15.23.47', result: 'Exitoso', tone: 'violet' },
  { id: 4, date: '23/05/2024 08:47:33', initials: 'MG', user: 'María Gómez', role: 'Administrador', module: 'Usuarios', action: 'Cambio de permisos', detail: 'Permisos actualizados para usuario Laura Ramírez', ip: '190.15.23.48', result: 'Advertencia', tone: 'orange' },
  { id: 5, date: '23/05/2024 08:12:19', initials: 'DL', user: 'Diego López', role: 'Administrador', module: 'Respaldos', action: 'Respaldo ejecutado', detail: 'Respaldo programado ejecutado correctamente', ip: '190.15.23.49', result: 'Exitoso', tone: 'teal' },
  { id: 6, date: '23/05/2024 07:51:02', initials: 'JV', user: 'Julia Vargas', role: 'Editor', module: 'Documentos', action: 'Edición de documento', detail: 'Documento “Manual de Procedimientos” editado', ip: '190.15.23.50', result: 'Exitoso', tone: 'cyan' },
  { id: 7, date: '23/05/2024 07:22:14', initials: 'AA', user: 'Andrés Aguilar', role: 'Usuario', module: 'Usuarios', action: 'Inicio de sesión', detail: 'Intento de inicio de sesión con contraseña incorrecta', ip: '190.15.23.51', result: 'Fallido', tone: 'pink' },
  { id: 8, date: '23/05/2024 06:58:33', initials: 'SM', user: 'Sofía Mendoza', role: 'Editor', module: 'Versiones', action: 'Rechazo de versión', detail: 'Versión 1.2 del documento rechazada', ip: '190.15.23.52', result: 'Advertencia', tone: 'orange' },
  { id: 9, date: '23/05/2024 06:10:05', initials: 'JM', user: 'Juan Martínez', role: 'Administrador', module: 'Respaldos', action: 'Respaldo ejecutado', detail: 'Respaldo manual ejecutado por el administrador', ip: '190.15.23.45', result: 'Exitoso', tone: 'blue' },
  { id: 10, date: '23/05/2024 05:45:21', initials: 'LR', user: 'Laura Ramírez', role: 'Editor', module: 'Exportaciones', action: 'Exportación de bitácora', detail: 'Bitácora exportada en formato CSV', ip: '190.15.23.46', result: 'Exitoso', tone: 'green' },
]

const criticalEvents = [
  ['23/05/2024 04:12:11', 'Múltiples intentos de inicio de sesión fallidos', 'IP: 190.15.23.99'],
  ['23/05/2024 03:47:28', 'Acceso no autorizado detectado', 'Usuario: desconocido · IP: 190.15.23.98'],
  ['23/05/2024 02:15:09', 'Error en respaldo programado', 'Servidor Secundario · DC01'],
]

const moduleDistribution = [
  ['Documentos', '40% (500)', '#0869e8'],
  ['Usuarios', '20% (250)', '#287fdc'],
  ['Versiones', '15% (188)', '#35a66d'],
  ['Respaldos', '10% (125)', '#49bd87'],
  ['Exportaciones', '8% (100)', '#12aaa5'],
  ['Otros', '7% (87)', '#91abc8'],
]

function AuditIcon({ name, size = 18 }) {
  let content
  switch (name) {
    case 'calendar': content = <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18M7 14h3m4 0h3m-10 4h3" /></>; break
    case 'alert': content = <><path d="M12 3 20 6v5c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V6l8-3Z" /><path d="M12 7v6m0 3v.2" /></>; break
    case 'lock': content = <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>; break
    case 'exportFile': content = <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M12 11v7m0 0-3-3m3 3 3-3M8 11h2" /></>; break
    case 'download': content = <><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 17v4h16v-4" /></>; break
    case 'report': content = <path d="M4 20V10m5 10V5m5 15v-7m5 7V8M2 20h20" />; break
    case 'search': content = <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></>; break
    case 'refresh': content = <><path d="M20 7v5h-5" /><path d="M18.5 16a8 8 0 1 1 1.2-8.5L20 12" /></>; break
    case 'chevron': content = <path d="m8 10 4 4 4-4" />; break
    case 'more': content = <><circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" /></>; break
    case 'arrow': content = <path d="m9 18 6-6-6-6" />; break
    default: content = <circle cx="12" cy="12" r="8" />
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function FilterSelect({ label, value, options, onChange }) {
  return <label className="audit-filter"><span>{label}</span><div><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">{`Seleccionar ${label.toLowerCase()}`}</option>{options.map((option) => <option key={option}>{option}</option>)}</select><AuditIcon name="chevron" size={14} /></div></label>
}

function AuditView({ globalQuery }) {
  const [date, setDate] = useState('')
  const [user, setUser] = useState('')
  const [module, setModule] = useState('')
  const [action, setAction] = useState('')
  const [result, setResult] = useState('')
  const [ip, setIp] = useState('')
  const [draftSearch, setDraftSearch] = useState('')
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  const deferredSearch = useDeferredValue(search.trim().toLowerCase())
  const deferredGlobalQuery = useDeferredValue(globalQuery.trim().toLowerCase())
  const visibleEvents = events.filter((event) => {
    const searchable = [event.date, event.user, event.role, event.module, event.action, event.detail, event.ip, event.result].join(' ').toLowerCase()
    return (!date || event.date.includes(date))
      && (!user || event.user === user)
      && (!module || event.module === module)
      && (!action || event.action === action)
      && (!result || event.result === result)
      && (!ip || event.ip.includes(ip.trim()))
      && (!deferredSearch || searchable.includes(deferredSearch))
      && (!deferredGlobalQuery || searchable.includes(deferredGlobalQuery))
  })

  function clearFilters() {
    setDate('')
    setUser('')
    setModule('')
    setAction('')
    setResult('')
    setIp('')
    setDraftSearch('')
    setSearch('')
  }

  function exportAudit() {
    const rows = [['Fecha y hora', 'Usuario', 'Rol', 'Módulo', 'Acción', 'Detalle', 'IP', 'Resultado'], ...visibleEvents.map((event) => [event.date, event.user, event.role, event.module, event.action, event.detail, event.ip, event.result])]
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'bitacora-sistema.csv'
    link.click()
    URL.revokeObjectURL(url)
    setNotice('La bitácora se exportó en formato CSV.')
  }

  return (
    <div className="audit-view">
      <header className="audit-heading"><div><h1>Bitácora del sistema</h1><p>Monitorea eventos, auditoría y trazabilidad de acciones realizadas en la plataforma.</p></div><span><time>23 de mayo de 2024</time><AuditIcon name="calendar" size={18} /></span></header>

      <section className="audit-metrics" aria-label="Indicadores de bitácora">
        <article><span className="audit-metric-icon audit-metric-icon--blue"><AuditIcon name="calendar" size={26} /></span><div><p>Eventos hoy</p><strong>1,248</strong><small>↑ <b>8.3%</b> vs. ayer</small></div></article>
        <article><span className="audit-metric-icon audit-metric-icon--red"><AuditIcon name="alert" size={26} /></span><div><p>Alertas críticas</p><strong>12</strong><small>↑ <b>20.0%</b> vs. ayer</small></div></article>
        <article><span className="audit-metric-icon audit-metric-icon--orange"><AuditIcon name="lock" size={26} /></span><div><p>Accesos fallidos</p><strong>38</strong><small>↑ <b>11.8%</b> vs. ayer</small></div></article>
        <article><span className="audit-metric-icon audit-metric-icon--green"><AuditIcon name="exportFile" size={26} /></span><div><p>Exportaciones realizadas</p><strong>27</strong><small>↑ <b>3.7%</b> vs. ayer</small></div></article>
      </section>

      <div className="audit-layout">
        <div className="audit-primary">
          <section className="audit-panel audit-filters">
            <label className="audit-filter"><span>Fecha</span><div><input value={date} onChange={(event) => setDate(event.target.value)} placeholder="Seleccionar rango" /><AuditIcon name="calendar" size={15} /></div></label>
            <FilterSelect label="Usuario" value={user} onChange={setUser} options={[...new Set(events.map((event) => event.user))]} />
            <FilterSelect label="Módulo" value={module} onChange={setModule} options={[...new Set(events.map((event) => event.module))]} />
            <FilterSelect label="Acción" value={action} onChange={setAction} options={[...new Set(events.map((event) => event.action))]} />
            <FilterSelect label="Resultado" value={result} onChange={setResult} options={['Exitoso', 'Advertencia', 'Fallido']} />
            <label className="audit-filter"><span>Dirección IP</span><div><input value={ip} onChange={(event) => setIp(event.target.value)} placeholder="Buscar IP" /></div></label>
            <label className="audit-filter audit-filter--search"><span>Búsqueda libre</span><div><AuditIcon name="search" size={16} /><input value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') setSearch(draftSearch) }} placeholder="Buscar en detalle, documento, IP, etc." /></div></label>
            <div className="audit-filter-actions"><button type="button" onClick={clearFilters}><AuditIcon name="refresh" size={15} /> Limpiar filtros</button><button className="is-primary" type="button" onClick={() => setSearch(draftSearch)}><AuditIcon name="search" size={15} /> Buscar</button></div>
          </section>

          <section className="audit-panel audit-table-panel">
            <div className="audit-table-scroll"><table><thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Rol</th><th>Módulo</th><th>Acción</th><th>Detalle</th><th>IP</th><th>Resultado</th><th aria-label="Acciones" /></tr></thead><tbody>{visibleEvents.map((event) => <tr key={event.id}><td>{event.date}</td><td><span className={`audit-avatar audit-avatar--${event.tone}`}>{event.initials}</span>{event.user}</td><td>{event.role}</td><td>{event.module}</td><td>{event.action}</td><td>{event.detail}</td><td>{event.ip}</td><td><span className={`audit-result audit-result--${event.result.toLowerCase()}`}>{event.result}</span></td><td><button type="button" aria-label={`Opciones del evento ${event.id}`}><AuditIcon name="more" size={15} /></button></td></tr>)}</tbody></table>{!visibleEvents.length && <div className="audit-empty"><AuditIcon name="search" size={24} /><strong>No se encontraron eventos</strong><span>Modifique los filtros o la búsqueda para continuar.</span></div>}</div>
            <footer><span>Mostrando 1 a {visibleEvents.length} de 250 eventos</span><div className="audit-pages"><button type="button">«</button><button className="is-current" type="button">1</button><button type="button">2</button><button type="button">3</button><button type="button">4</button><button type="button">5</button><button type="button">…</button><button type="button">25</button><button type="button">»</button></div><select defaultValue="10"><option value="10">10 por página</option><option value="25">25 por página</option></select></footer>
          </section>
        </div>

        <aside className="audit-aside">
          <section className="audit-panel audit-actions"><button type="button" onClick={exportAudit}><AuditIcon name="download" size={17} /> Exportar bitácora</button><button className="is-primary" type="button" onClick={() => setNotice('El informe de auditoría está listo para conectarse al backend.')}><AuditIcon name="report" size={17} /> Generar informe</button></section>
          <section className="audit-panel audit-distribution"><h2>Distribución por módulo</h2><div><div className="audit-donut"><span><strong>1,248</strong><small>Total eventos</small></span></div><ul>{moduleDistribution.map(([label, value, color]) => <li key={label}><i style={{ backgroundColor: color }} /><span>{label}</span><b>{value}</b></li>)}</ul></div></section>
          <section className="audit-panel audit-critical"><h2>Últimos eventos críticos</h2>{criticalEvents.map(([dateValue, detail, source]) => <article key={dateValue}><i /><div><time>{dateValue}</time><p>{detail}</p><span>{source}</span></div><b>Crítico</b></article>)}<button type="button" onClick={() => setNotice('Se abrió el listado completo de eventos críticos.')}><span>Ver todos los eventos críticos</span><AuditIcon name="arrow" size={16} /></button></section>
        </aside>
      </div>
      <span className="audit-live-notice" role="status">{notice}</span>
    </div>
  )
}

export default AuditView
