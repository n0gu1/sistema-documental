import { useDeferredValue, useEffect, useState } from 'react'
import { apiRequest, formatDate } from './api'
import './EditorActivityLogView.css'

function LogIcon({ name, size = 18 }) {
  const content = name === 'calendar'
    ? <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></>
    : name === 'document'
      ? <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 12h7M9 16h5" /></>
      : name === 'layers'
        ? <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>
        : name === 'search'
          ? <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></>
          : name === 'filter'
            ? <path d="M3 5h18l-7 8v5l-4 2v-7L3 5Z" />
            : name === 'check'
              ? <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.7 2.7L16 9.5" /></>
              : name === 'alert'
                ? <><path d="m12 3 9 17H3L12 3Z" /><path d="M12 9v5m0 3v.2" /></>
                : name === 'clock'
                  ? <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>
                  : name === 'arrow'
                    ? <path d="m9 18 6-6-6-6" />
                    : <path d="M4 12h16M12 4v16" />
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function actionText(event) {
  return event.action || event.action_code || 'Sin acción'
}

function detailText(event) {
  if (event.details && typeof event.details === 'object' && Object.keys(event.details).length) {
    return Object.entries(event.details).map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`).join(' · ')
  }
  return event.result || 'Sin detalle'
}

function resourceText(event) {
  const type = event.module || event.resource_code || 'Recurso'
  return event.resource_id ? `${type} · ${String(event.resource_id).slice(0, 8)}` : type
}

function metricResourceCount(events, actionCodes) {
  const matching = events.filter((event) => actionCodes.includes(event.action_code))
  return new Set(matching.map((event) => event.resource_id || event.id)).size
}

function EditorActivityLogView({ user, globalQuery = '' }) {
  const [events, setEvents] = useState([])
  const [total, setTotal] = useState(0)
  const [todayTotal, setTodayTotal] = useState(0)
  const [nextOffset, setNextOffset] = useState(null)
  const [offset, setOffset] = useState(0)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [action, setAction] = useState('')
  const [result, setResult] = useState('')
  const [draftSearch, setDraftSearch] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const deferredGlobalQuery = useDeferredValue(globalQuery.trim().toLowerCase())

  useEffect(() => {
    let active = true
    const params = new URLSearchParams({ user_id: user.id, limit: '10', offset: String(offset) })
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)
    if (action) params.set('action', action)
    if (result) params.set('result', result)
    if (search.trim()) params.set('search', search.trim())
    const today = new Date().toISOString().slice(0, 10)
    const todayParams = new URLSearchParams({ user_id: user.id, date_from: today, date_to: today, limit: '1' })
    setLoading(true)
    Promise.all([apiRequest(`/api/audit/?${params}`), apiRequest(`/api/audit/?${todayParams}`)])
      .then(([auditData, todayData]) => {
        if (!active) return
        setEvents(auditData.results || [])
        setTotal(auditData.count || 0)
        setTodayTotal(todayData.count || 0)
        setNextOffset(auditData.next_offset)
        setError('')
      })
      .catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [action, dateFrom, dateTo, offset, result, search, user.id])

  const visibleEvents = events.filter((event) => {
    if (!deferredGlobalQuery) return true
    return [actionText(event), detailText(event), resourceText(event), event.ip, event.user_agent].join(' ').toLowerCase().includes(deferredGlobalQuery)
  })
  const editedDocuments = metricResourceCount(events, ['DOCUMENTO_MODIFICADO'])
  const uploadedVersions = metricResourceCount(events, ['ARCHIVO_CARGADO'])
  const reviewActions = events.filter((event) => event.action_code?.startsWith('REVISION_')).length
  const actionCounts = Object.entries(events.reduce((counts, event) => { const label = actionText(event); counts[label] = (counts[label] || 0) + 1; return counts }, {})).sort((left, right) => right[1] - left[1]).slice(0, 6)
  const actionTotal = actionCounts.reduce((sum, [, count]) => sum + count, 0)
  const colors = ['#0869e8', '#21a96b', '#f0a000', '#7350d8', '#38afb5', '#9aaabc']
  const distributionGradient = actionCounts.reduce((distribution, [, count], index) => {
    const end = distribution.start + (count / (actionTotal || 1)) * 100
    return { start: end, segments: [...distribution.segments, `${colors[index]} ${distribution.start}% ${end}%`] }
  }, { start: 0, segments: [] }).segments.join(', ')
  const failedEvents = events.filter((event) => !event.successful).slice(0, 4)

  function clearFilters() {
    setDateFrom(''); setDateTo(''); setAction(''); setResult(''); setDraftSearch(''); setSearch(''); setOffset(0)
  }

  return <div className="editor-log-view"><header className="editor-log-heading"><div><h1>Bitácora personal</h1><p>Consulta la trazabilidad de tus acciones realizadas en el sistema.</p></div><time><LogIcon name="calendar" size={17} />{new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(new Date())}</time></header><section className="editor-log-metrics" aria-label="Resumen de actividad"><article><span className="editor-log-metric-icon editor-log-tone--blue"><LogIcon name="calendar" size={28} /></span><div><p>Eventos hoy</p><strong>{todayTotal}</strong><small>Eventos registrados en la fecha actual</small></div></article><article><span className="editor-log-metric-icon editor-log-tone--green"><LogIcon name="document" size={28} /></span><div><p>Documentos editados</p><strong>{editedDocuments}</strong><small>En los resultados cargados</small></div></article><article><span className="editor-log-metric-icon editor-log-tone--violet"><LogIcon name="layers" size={28} /></span><div><p>Versiones cargadas</p><strong>{uploadedVersions}</strong><small>En los resultados cargados</small></div></article><article><span className="editor-log-metric-icon editor-log-tone--orange"><LogIcon name="clock" size={28} /></span><div><p>Acciones de revisión</p><strong>{reviewActions}</strong><small>En los resultados cargados</small></div></article></section>{error && <p className="editor-error" role="alert">{error}</p>}<div className="editor-log-layout"><div className="editor-log-main"><section className="editor-log-filters"><label className="editor-log-filter"><span>Desde</span><div><input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setOffset(0) }} /><LogIcon name="calendar" size={14} /></div></label><label className="editor-log-filter"><span>Hasta</span><div><input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setOffset(0) }} /><LogIcon name="calendar" size={14} /></div></label><label className="editor-log-filter"><span>Acción</span><div><select value={action} onChange={(event) => { setAction(event.target.value); setOffset(0) }}><option value="">Todas</option>{[...new Map(events.map((event) => [event.action_code, { code: event.action_code, name: actionText(event) }])).values()].filter((item) => item.code).map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></div></label><label className="editor-log-filter"><span>Resultado</span><div><select value={result} onChange={(event) => { setResult(event.target.value); setOffset(0) }}><option value="">Todos</option><option value="true">Exitoso</option><option value="false">Fallido</option></select></div></label><label className="editor-log-filter editor-log-filter--search"><span>Búsqueda libre</span><div><LogIcon name="search" size={15} /><input value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { setSearch(draftSearch); setOffset(0) } }} placeholder="Buscar en detalle..." /></div></label><button className="editor-log-clear" type="button" onClick={clearFilters}><LogIcon name="filter" size={14} />Limpiar filtros</button></section><section className="editor-log-table-panel"><div className="editor-log-table-scroll"><table><thead><tr><th>Fecha y hora</th><th>Recurso</th><th>Acción</th><th>Detalle</th><th>Resultado</th><th>IP / Dispositivo</th></tr></thead><tbody>{visibleEvents.map((event) => <tr key={event.id}><td>{formatDate(event.event_at)}</td><td>{resourceText(event)}</td><td><span className="editor-log-row-icon editor-log-row-icon--blue"><LogIcon name={event.action_code?.includes('ARCHIVO') ? 'layers' : 'document'} size={15} /></span>{actionText(event)}</td><td title={detailText(event)}>{detailText(event)}</td><td><span className={`editor-log-result ${event.successful ? 'is-success' : 'is-failure'}`}>{event.successful ? 'Exitoso' : 'Fallido'}</span></td><td><span>{event.ip || '—'}</span><small>{event.user_agent || 'Dispositivo no informado'}</small></td></tr>)}</tbody></table>{loading && <div className="editor-log-empty"><strong>Cargando eventos...</strong></div>}{!loading && !visibleEvents.length && <div className="editor-log-empty"><LogIcon name="search" size={24} /><strong>No hay eventos para mostrar</strong><span>Prueba otros filtros o limpia la búsqueda.</span></div>}</div><footer><span>Mostrando {visibleEvents.length} de {total} eventos</span><div className="editor-log-pages"><button type="button" disabled={!offset} aria-label="Página anterior" onClick={() => setOffset(Math.max(0, offset - 10))}>‹</button><span>{Math.floor(offset / 10) + 1}</span><button type="button" disabled={nextOffset === null} aria-label="Página siguiente" onClick={() => setOffset(nextOffset)}>›</button></div></footer></section></div><aside className="editor-log-aside"><section className="editor-log-side-card editor-log-distribution"><h2>Distribución por acción</h2><p>Resultados de la consulta actual</p><div>{actionCounts.length ? <div className="editor-log-donut" style={{ background: `conic-gradient(${distributionGradient})` }}><span><strong>{total}</strong><small>eventos</small></span></div> : <div className="editor-log-donut editor-log-donut--empty"><span><strong>0</strong><small>eventos</small></span></div>}<ul>{actionCounts.map(([label, count], index) => <li key={label}><i style={{ backgroundColor: colors[index] }} /><span>{label}</span><b>{count}</b></li>)}</ul></div></section><section className="editor-log-side-card editor-log-alerts"><h2>Últimos eventos fallidos</h2><p>Eventos de tu bitácora personal</p>{failedEvents.map((event) => <article key={event.id}><span className="editor-log-alert-icon is-alert"><LogIcon name="alert" size={17} /></span><div><strong>{actionText(event)}</strong><time>{formatDate(event.event_at)}</time><span>{resourceText(event)}</span><p>{detailText(event)}</p></div></article>)}{!failedEvents.length && <div className="editor-log-no-alerts"><LogIcon name="check" size={20} /><span>No hay eventos fallidos.</span></div>}</section></aside></div><footer className="editor-log-footer"><span>Los eventos se registran automáticamente por cada acción realizada.</span><span>Mostrando registros reales de tu usuario</span></footer></div>
}

export default EditorActivityLogView
