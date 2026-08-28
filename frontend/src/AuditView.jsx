import { useDeferredValue, useEffect, useState } from 'react'
import { apiRequest, formatDate } from './api'
import './AuditView.css'

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
  return <label className="audit-filter"><span>{label}</span><div><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">{`Seleccionar ${label.toLowerCase()}`}</option>{options.map((option) => <option key={option.value || option} value={option.value || option}>{option.label || option}</option>)}</select><AuditIcon name="chevron" size={14} /></div></label>
}

function AuditView({ globalQuery }) {
  const [events, setEvents] = useState([])
  const [total, setTotal] = useState(0)
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
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

  useEffect(() => {
    let active = true
    const params = new URLSearchParams({ limit: '100' })
    if (date) { params.set('date_from', date); params.set('date_to', date) }
    if (user) params.set('user_id', user)
    if (module) params.set('module', module)
    if (action) params.set('action', action)
    if (result) params.set('result', result)
    if (ip.trim()) params.set('ip', ip.trim())
    if (search.trim() || globalQuery.trim()) params.set('search', search.trim() || globalQuery.trim())
    Promise.all([apiRequest(`/api/audit/?${params}`), apiRequest('/api/audit/alerts/')])
      .then(([auditData, alertData]) => {
        if (!active) return
        setTotal(auditData.count || 0)
        setEvents((auditData.results || []).map((event) => ({
          ...event,
          date: formatDate(event.event_at),
          user: event.user_name || event.username || 'Desconocido',
          role: '—',
          module: event.module || event.resource_code || '—',
          action: event.action || event.action_code || '—',
          detail: event.details ? JSON.stringify(event.details) : event.result || '—',
          ip: event.ip || '—',
          result: event.successful ? 'Exitoso' : 'Fallido',
          tone: event.successful ? 'green' : 'pink',
        })))
        setAlerts(alertData.alerts || [])
        setError('')
      })
      .catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [action, date, globalQuery, ip, module, result, search, user])

  const visibleEvents = events.filter((event) => {
    const searchable = [event.date, event.user, event.role, event.module, event.action, event.detail, event.ip, event.result].join(' ').toLowerCase()
    return (!deferredSearch || searchable.includes(deferredSearch)) && (!deferredGlobalQuery || searchable.includes(deferredGlobalQuery))
  })
  const moduleCounts = Object.entries(events.reduce((counts, event) => ({ ...counts, [event.module]: (counts[event.module] || 0) + 1 }), {}))
  const moduleDistribution = moduleCounts.sort((left, right) => right[1] - left[1]).slice(0, 6).map(([label, count], index) => [label, `${Math.round((count / (events.length || 1)) * 100)}% (${count})`, ['#0869e8', '#287fdc', '#35a66d', '#49bd87', '#12aaa5', '#91abc8'][index]])
  const criticalEvents = alerts.slice(0, 3).map((alert) => [formatDate(alert.last_event_at), alert.title, alert.message, alert.source, alert.severity])

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
    const params = new URLSearchParams({ limit: '10000' })
    if (date) { params.set('date_from', date); params.set('date_to', date) }
    if (user) params.set('user_id', user)
    if (module) params.set('module', module)
    if (action) params.set('action', action)
    if (result) params.set('result', result)
    if (ip.trim()) params.set('ip', ip.trim())
    if (search.trim()) params.set('search', search.trim())
    window.open(`/api/audit/export/?${params}`, '_blank', 'noopener,noreferrer')
    setNotice('La bitácora se exportará en formato CSV.')
  }

  return (
    <div className="audit-view">
      <header className="audit-heading"><div><h1>Bitácora del sistema</h1><p>Monitorea eventos, auditoría y trazabilidad de acciones realizadas en la plataforma.</p></div><span><time>{new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(new Date())}</time><AuditIcon name="calendar" size={18} /></span></header>

      <section className="audit-metrics" aria-label="Indicadores de bitácora">
        <article><span className="audit-metric-icon audit-metric-icon--blue"><AuditIcon name="calendar" size={26} /></span><div><p>Eventos registrados</p><strong>{total}</strong><small>Datos de la bitácora</small></div></article>
        <article><span className="audit-metric-icon audit-metric-icon--red"><AuditIcon name="alert" size={26} /></span><div><p>Alertas críticas</p><strong>{alerts.length}</strong><small>Últimas 24 horas</small></div></article>
        <article><span className="audit-metric-icon audit-metric-icon--orange"><AuditIcon name="lock" size={26} /></span><div><p>Accesos fallidos</p><strong>{events.filter((event) => !event.successful).length}</strong><small>En los resultados cargados</small></div></article>
        <article><span className="audit-metric-icon audit-metric-icon--green"><AuditIcon name="exportFile" size={26} /></span><div><p>Exportaciones</p><strong>{events.filter((event) => event.action_code === 'BITACORA_EXPORTADA').length}</strong><small>En los resultados cargados</small></div></article>
      </section>

      <div className="audit-layout">
        <div className="audit-primary">
          {error && <p className="editor-error" role="alert">{error}</p>}
          <section className="audit-panel audit-filters">
             <label className="audit-filter"><span>Fecha</span><div><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /><AuditIcon name="calendar" size={15} /></div></label>
             <FilterSelect label="Usuario" value={user} onChange={setUser} options={[...new Map(events.map((event) => [event.user_id, { value: event.user_id || '', label: event.user }])).values()].filter((option) => option.value)} />
             <FilterSelect label="Módulo" value={module} onChange={setModule} options={[...new Map(events.map((event) => [event.resource_code, { value: event.resource_code || '', label: event.module }])).values()].filter((option) => option.value)} />
             <FilterSelect label="Acción" value={action} onChange={setAction} options={[...new Map(events.map((event) => [event.action_code, { value: event.action_code || '', label: event.action }])).values()].filter((option) => option.value)} />
             <FilterSelect label="Resultado" value={result} onChange={setResult} options={[{ value: 'true', label: 'Exitoso' }, { value: 'false', label: 'Fallido' }]} />
            <label className="audit-filter"><span>Dirección IP</span><div><input value={ip} onChange={(event) => setIp(event.target.value)} placeholder="Buscar IP" /></div></label>
            <label className="audit-filter audit-filter--search"><span>Búsqueda libre</span><div><AuditIcon name="search" size={16} /><input value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') setSearch(draftSearch) }} placeholder="Buscar en detalle, documento, IP, etc." /></div></label>
            <div className="audit-filter-actions"><button type="button" onClick={clearFilters}><AuditIcon name="refresh" size={15} /> Limpiar filtros</button><button className="is-primary" type="button" onClick={() => setSearch(draftSearch)}><AuditIcon name="search" size={15} /> Buscar</button></div>
          </section>

          <section className="audit-panel audit-table-panel">
             <div className="audit-table-scroll"><table><thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Rol</th><th>Módulo</th><th>Acción</th><th>Detalle</th><th>IP</th><th>Resultado</th><th aria-label="Acciones" /></tr></thead><tbody>{visibleEvents.map((event) => <tr key={event.id}><td>{event.date}</td><td><span className={`audit-avatar audit-avatar--${event.tone}`}>{event.user.slice(0, 2).toUpperCase()}</span>{event.user}</td><td>{event.role}</td><td>{event.module}</td><td>{event.action}</td><td>{event.detail}</td><td>{event.ip}</td><td><span className={`audit-result audit-result--${event.result.toLowerCase()}`}>{event.result}</span></td><td><button type="button" aria-label={`Opciones del evento ${event.id}`}><AuditIcon name="more" size={15} /></button></td></tr>)}</tbody></table>{loading && <div className="audit-empty"><strong>Cargando eventos...</strong></div>}{!loading && !visibleEvents.length && <div className="audit-empty"><AuditIcon name="search" size={24} /><strong>No se encontraron eventos</strong><span>Modifique los filtros o la búsqueda para continuar.</span></div>}</div>
             <footer><span>{loading ? 'Cargando eventos...' : `Mostrando ${visibleEvents.length} de ${total} eventos`}</span><span>Máximo 100 resultados por consulta</span></footer>
          </section>
        </div>

        <aside className="audit-aside">
           <section className="audit-panel audit-actions"><button type="button" onClick={exportAudit}><AuditIcon name="download" size={17} /> Exportar bitácora</button><button className="is-primary" type="button" onClick={() => setNotice('El informe básico requiere un endpoint de reportes específico.')}><AuditIcon name="report" size={17} /> Generar informe</button></section>
           <section className="audit-panel audit-distribution"><h2>Distribución por módulo</h2><div><div className="audit-donut"><span><strong>{events.length}</strong><small>Resultados cargados</small></span></div><ul>{moduleDistribution.map(([label, value, color]) => <li key={label}><i style={{ backgroundColor: color }} /><span>{label}</span><b>{value}</b></li>)}</ul>{!moduleDistribution.length && <p className="audit-empty">No hay distribución disponible.</p>}</div></section>
            <section className="audit-panel audit-critical"><h2>Últimos eventos críticos</h2>{criticalEvents.map(([dateValue, title, message, source, severity]) => <article key={`${dateValue}-${source}`}><i /><div><time>{dateValue}</time><p>{title}</p><span>{message} · {source}</span></div><b>{severity === 'critico' ? 'Crítico' : 'Alto'}</b></article>)}{!criticalEvents.length && <p className="audit-empty">No hay alertas críticas.</p>}<button type="button" onClick={() => setNotice(criticalEvents.length ? 'Se muestran las alertas críticas de las últimas 24 horas.' : 'No hay eventos críticos registrados.')}><span>Ver todos los eventos críticos</span><AuditIcon name="arrow" size={16} /></button></section>
        </aside>
      </div>
      <span className="audit-live-notice" role="status">{notice}</span>
    </div>
  )
}

export default AuditView
