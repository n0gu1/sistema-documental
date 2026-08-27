import { useEffect, useState } from 'react'
import { apiRequest, downloadFile, formatDate } from './documentApi'
import './ReaderFavoritesView.css'

const PAGE_SIZE = 8

function FavoriteIcon({ name, size = 19 }) {
  const content = name === 'download'
    ? <><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 18v3h16v-3" /></>
    : name === 'eye'
      ? <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>
      : name === 'calendar'
        ? <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 9h16" /></>
        : name === 'filter'
          ? <path d="M4 5h16l-6 7v5l-4 2v-7L4 5Z" />
          : name === 'clock'
            ? <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></>
            : name === 'chart'
              ? <><path d="M5 20V10M12 20V4M19 20v-7" /><path d="M3 20h18" /></>
              : name === 'document'
                ? <><path d="M6 2.8h8.6L19 7.2V21H6z" /><path d="M14.5 3v4.5H19M9 12h7M9 16h7" /></>
                : <path d="m12 3 2.8 5.8 6.2.9-4.5 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.7l6.2-.9L12 3Z" />
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={name === 'star' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function localDateKey(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function isWithinDays(value, days) {
  const date = new Date(value)
  return !Number.isNaN(date.getTime()) && Date.now() - date.getTime() <= days * 24 * 60 * 60 * 1000
}

function currentMonth(value) {
  const date = new Date(value)
  const today = new Date()
  return !Number.isNaN(date.getTime()) && date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth()
}

function formatHeaderDate() {
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())
}

function ReaderFavoritesView() {
  const [items, setItems] = useState([])
  const [events, setEvents] = useState([])
  const [area, setArea] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([
      apiRequest('/api/reader/favorites/?limit=100'),
      apiRequest('/api/reader/history/?limit=100'),
    ]).then(([favoriteData, historyData]) => {
      if (!active) return
      setItems(favoriteData.results || [])
      setEvents(historyData.results || [])
    }).catch((requestError) => { if (active) setError(requestError.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const areas = [...new Map(items.map((item) => [item.document.area?.id, item.document.area])).values()].filter(Boolean).sort((first, second) => first.name.localeCompare(second.name))
  const types = [...new Map(items.map((item) => [item.document.type?.id, item.document.type])).values()].filter(Boolean).sort((first, second) => first.name.localeCompare(second.name))
  const statuses = [...new Map(items.map((item) => [item.document.status?.code, item.document.status])).values()].filter(Boolean).sort((first, second) => first.name.localeCompare(second.name))
  const favoriteIds = new Set(items.map((item) => item.document.id))
  const latestAccess = new Map()
  events.filter((event) => favoriteIds.has(event.document.id)).forEach((event) => {
    if (!latestAccess.has(event.document.id)) latestAccess.set(event.document.id, event)
  })
  const consultedEvents = events.filter((event) => favoriteIds.has(event.document.id))
  const recentFavorites = items.filter((item) => isWithinDays(item.created_at, 7)).length
  const consultedCount = new Set(consultedEvents.map((event) => event.document.id)).size
  const monthlyDownloads = consultedEvents.filter((event) => event.type === 'DESCARGA' && currentMonth(event.registered_at)).length
  const filteredItems = items.filter((item) => {
    const document = item.document
    const favoriteDate = localDateKey(item.created_at)
    return (!area || document.area?.id === area) && (!type || document.type?.id === type) && (!status || document.status?.code === status) && (!dateFrom || favoriteDate >= dateFrom) && (!dateTo || favoriteDate <= dateTo)
  }).sort((first, second) => new Date(latestAccess.get(second.document.id)?.registered_at || second.created_at) - new Date(latestAccess.get(first.document.id)?.registered_at || first.created_at))
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const visibleItems = filteredItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const updateFilter = (setter) => (event) => { setter(event.target.value); setPage(1) }
  const clearFilters = () => { setArea(''); setType(''); setStatus(''); setDateFrom(''); setDateTo(''); setPage(1) }

  async function removeFavorite(item) {
    try {
      await apiRequest(`/api/reader/documents/${item.document.id}/favorite/`, { method: 'DELETE' })
      setItems((current) => current.filter((candidate) => candidate.document.id !== item.document.id))
    } catch (requestError) { setError(requestError.message) }
  }

  function openDocument(item) {
    window.dispatchEvent(new CustomEvent('reader-document-open', { detail: { documentId: item.document.id } }))
  }

  if (loading) return <div className="reader-favorites"><p>Cargando favoritos...</p></div>
  return <div className="reader-favorites"><header className="reader-favorites-heading"><div><h1>Mis favoritos</h1><p>Accede rápidamente a los documentos que marcaste como favoritos.</p></div><time><FavoriteIcon name="calendar" size={18} />{formatHeaderDate()}</time></header>{error && <p className="editor-error" role="alert">{error}</p>}<section className="reader-favorite-metrics"><article className="reader-favorite-metric"><span className="reader-favorite-metric-icon is-blue"><FavoriteIcon name="star" size={30} /></span><div><span>Total de favoritos</span><strong>{items.length}</strong><em>Documentos</em></div></article><article className="reader-favorite-metric"><span className="reader-favorite-metric-icon is-orange"><FavoriteIcon name="clock" size={30} /></span><div><span>Favoritos recientes</span><strong>{recentFavorites}</strong><em>Últimos 7 días</em></div></article><article className="reader-favorite-metric"><span className="reader-favorite-metric-icon is-purple"><FavoriteIcon name="chart" size={30} /></span><div><span>Documentos consultados</span><strong>{consultedCount}</strong><em>Consultas registradas</em></div></article><article className="reader-favorite-metric"><span className="reader-favorite-metric-icon is-green"><FavoriteIcon name="download" size={30} /></span><div><span>Descargas</span><strong>{monthlyDownloads}</strong><em>Este mes</em></div></article></section><section className="reader-favorites-filters"><label><span>Área</span><select value={area} onChange={updateFilter(setArea)}><option value="">Todas</option>{areas.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>Tipo</span><select value={type} onChange={updateFilter(setType)}><option value="">Todos</option>{types.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>Estado</span><select value={status} onChange={updateFilter(setStatus)}><option value="">Todos</option>{statuses.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label><label className="reader-favorites-date"><span>Fecha</span><div className="reader-favorites-date-range"><FavoriteIcon name="calendar" size={16} /><input aria-label="Fecha desde" type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1) }} /><span>–</span><input aria-label="Fecha hasta" type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1) }} /></div></label><button type="button" onClick={clearFilters}><FavoriteIcon name="filter" size={15} /> Limpiar filtros</button></section><section className="reader-favorites-table-card"><div className="reader-favorites-table-wrap"><table><thead><tr><th>☆</th><th>Código</th><th>Nombre del documento</th><th>Área</th><th>Versión</th><th>Última consulta</th><th>Acciones</th></tr></thead><tbody>{visibleItems.map((item) => { const document = item.document; const access = latestAccess.get(document.id); return <tr key={item.id}><td><FavoriteIcon name="star" size={18} /></td><td><strong>{document.code}</strong></td><td><button className="reader-favorites-document-link" type="button" onClick={() => openDocument(item)}>{document.title}</button></td><td>{document.area?.name || '—'}</td><td><span className="reader-favorites-version">{document.version?.version || '—'}</span></td><td>{access ? <><strong>{formatDate(access.registered_at)}</strong><span>{access.type === 'DESCARGA' ? 'Descarga' : 'Acceso registrado'}</span></> : <span>Sin consultas</span>}</td><td><div className="reader-favorites-actions"><button type="button" aria-label={`Ver ${document.title}`} onClick={() => openDocument(item)}><FavoriteIcon name="eye" size={17} /></button>{document.version?.download_url && <button type="button" aria-label={`Descargar ${document.title}`} onClick={() => downloadFile(document.version.download_url)}><FavoriteIcon name="download" size={17} /></button>}<button className="is-favorite" type="button" aria-label={`Quitar ${document.title} de favoritos`} onClick={() => removeFavorite(item)}><FavoriteIcon name="star" size={17} /></button></div></td></tr> })}</tbody></table>{!visibleItems.length && <div className="reader-favorites-empty"><FavoriteIcon name="star" size={25} /><strong>No hay favoritos que coincidan</strong><span>Prueba con otros filtros.</span></div>}</div><footer><span>Mostrando {filteredItems.length ? ((currentPage - 1) * PAGE_SIZE) + 1 : 0} a {Math.min(currentPage * PAGE_SIZE, filteredItems.length)} de {filteredItems.length} documentos</span><div className="reader-favorites-pagination"><button type="button" aria-label="Primera página" disabled={currentPage === 1} onClick={() => setPage(1)}>«</button><button type="button" aria-label="Página anterior" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>‹</button>{Array.from({ length: totalPages }, (_, index) => index + 1).slice(Math.max(0, currentPage - 3), currentPage + 2).map((item) => <button className={item === currentPage ? 'is-active' : ''} type="button" key={item} onClick={() => setPage(item)}>{item}</button>)}<button type="button" aria-label="Página siguiente" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>›</button><button type="button" aria-label="Última página" disabled={currentPage === totalPages} onClick={() => setPage(totalPages)}>»</button></div><label>Filas por página <select value={PAGE_SIZE} disabled><option>{PAGE_SIZE}</option></select></label></footer></section></div>
}

export default ReaderFavoritesView
