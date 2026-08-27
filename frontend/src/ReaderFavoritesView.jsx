import { useDeferredValue, useEffect, useState } from 'react'
import { apiRequest, downloadFile, formatDate } from './documentApi'
import './ReaderFavoritesView.css'

function FavoriteIcon({ name, size = 19 }) {
  const content = name === 'download' ? <><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 18v3h16v-3" /></> : name === 'eye' ? <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></> : <path d="m12 3 2.8 5.8 6.2.9-4.5 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.7l6.2-.9L12 3Z" />
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={name === 'star' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function ReaderFavoritesView({ onAction }) {
  const [items, setItems] = useState([])
  const [area, setArea] = useState('Todas')
  const [type, setType] = useState('Todos')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())

  useEffect(() => {
    let active = true
    apiRequest('/api/reader/favorites/?limit=100')
      .then((data) => { if (active) setItems(data.results || []) })
      .catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const visible = items.filter((item) => {
    const document = item.document
    return (!deferredQuery || [document.code, document.title, document.area?.name, document.type?.name].join(' ').toLowerCase().includes(deferredQuery)) && (area === 'Todas' || document.area?.name === area) && (type === 'Todos' || document.type?.name === type)
  })
  const areas = [...new Set(items.map((item) => item.document.area?.name).filter(Boolean))]
  const types = [...new Set(items.map((item) => item.document.type?.name).filter(Boolean))]

  async function removeFavorite(item) {
    try {
      await apiRequest(`/api/reader/documents/${item.document.id}/favorite/`, { method: 'DELETE' })
      setItems((current) => current.filter((candidate) => candidate.document.id !== item.document.id))
      onAction('Documento retirado de favoritos.')
    } catch (requestError) { setError(requestError.message) }
  }

  return <div className="reader-favorites"><header className="reader-favorites-heading"><div><h1>Mis favoritos</h1><p>Accede rápidamente a los documentos que marcaste como favoritos.</p></div></header>{error && <p className="editor-error" role="alert">{error}</p>}<section className="reader-favorite-metrics"><article className="reader-favorite-metric"><span className="reader-favorite-metric-icon is-blue"><FavoriteIcon name="star" size={30} /></span><div><span>Total de favoritos</span><strong>{items.length}</strong><em>Documentos</em></div></article></section><section className="reader-favorites-filters"><label><span>Área</span><select value={area} onChange={(event) => setArea(event.target.value)}><option>Todas</option>{areas.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Tipo</span><select value={type} onChange={(event) => setType(event.target.value)}><option>Todos</option>{types.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Búsqueda libre</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar favoritos..." /></label><button type="button" onClick={() => { setArea('Todas'); setType('Todos'); setQuery('') }}>Limpiar filtros</button></section><section className="reader-favorites-content"><main className="reader-favorites-table-card"><div className="reader-favorites-table-wrap"><table><thead><tr><th>Código</th><th>Documento</th><th>Área</th><th>Tipo</th><th>Versión</th><th>Actualizado</th><th>Acciones</th></tr></thead><tbody>{visible.map((item) => <tr key={item.id}><td>{item.document.code}</td><td><strong>{item.document.title}</strong></td><td>{item.document.area?.name}</td><td>{item.document.type?.name}</td><td>{item.document.version?.version || '—'}</td><td>{formatDate(item.document.updated_at)}</td><td><button type="button" aria-label={`Ver ${item.document.title}`} onClick={() => window.dispatchEvent(new CustomEvent('reader-document-open', { detail: { documentId: item.document.id } }))}><FavoriteIcon name="eye" size={16} /></button>{item.document.version?.download_url && <button type="button" aria-label={`Descargar ${item.document.title}`} onClick={() => downloadFile(item.document.version.download_url)}><FavoriteIcon name="download" size={16} /></button>}<button type="button" aria-label={`Quitar ${item.document.title}`} onClick={() => removeFavorite(item)}><FavoriteIcon name="star" size={16} /></button></td></tr>)}</tbody></table>{!loading && !visible.length && <p>No tienes favoritos que coincidan con los filtros.</p>}</div><footer><span>Mostrando {visible.length} de {items.length} favoritos</span></footer></main></section></div>
}

export default ReaderFavoritesView
