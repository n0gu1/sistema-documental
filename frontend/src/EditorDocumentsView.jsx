import { useDeferredValue, useEffect, useState } from 'react'
import { apiRequest, buildDocumentQuery, downloadFile, formatDate, normalizeDocument } from './documentApi'
import './EditorDocumentsView.css'

const PAGE_SIZE = 10

function DocumentsIcon({ name, size = 18 }) {
  const content = name === 'search'
    ? <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></>
    : name === 'calendar'
      ? <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></>
      : name === 'filter'
        ? <path d="M4 5h16l-6.2 7v5.5l-3.6 1.8V12L4 5Z" />
        : name === 'plus'
          ? <path d="M12 5v14M5 12h14" />
          : name === 'download'
            ? <><path d="M12 4v12m0 0 5-5m-5 5-5-5" /><path d="M5 20h14" /></>
            : name === 'clock'
              ? <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>
              : name === 'check'
                ? <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.7 2.7L16.5 9" /></>
                : name === 'comment'
                  ? <><path d="M4 5h16v11H8l-4 4V5Z" /><path d="M8 9h8m-8 3h5" /></>
                  : name === 'eye'
                    ? <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>
                    : name === 'edit'
                      ? <><path d="m4 20 4.2-1 10.4-10.4-3.2-3.2L5 15.8 4 20Z" /><path d="m13.8 7 3.2 3.2" /></>
                      : name === 'more'
                        ? <><circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" /></>
                        : name === 'upload'
                          ? <><path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M5 14v6h14v-6" /></>
                          : name === 'chevron'
                            ? <path d="m8 10 4 4 4-4" />
                            : <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 12h7M9 16h7" /></>
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function FilterSelect({ label, value, onChange, options, placeholder }) {
  return <label className="editor-doc-filter"><span>{label}</span><div><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">{placeholder}</option>{options.map((option) => <option key={option.id || option.code || option.name} value={option.name}>{option.name}</option>)}</select><DocumentsIcon name="chevron" size={15} /></div></label>
}

function statusTone(status) {
  const value = status.toLowerCase()
  if (value.includes('revisión') || value.includes('revision')) return 'review'
  if (value.includes('aprob') || value.includes('public') || value.includes('activo')) return 'approved'
  if (value.includes('devuelto') || value.includes('observ')) return 'returned'
  return 'draft'
}

function EditorDocumentsView({ globalQuery, onAction, onEditDocument }) {
  const [documents, setDocuments] = useState([])
  const [catalogs, setCatalogs] = useState({ areas: [], types: [], statuses: [] })
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [area, setArea] = useState('')
  const [status, setStatus] = useState('')
  const [from, setFrom] = useState('')
  const [until, setUntil] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const deferredSearch = useDeferredValue(`${globalQuery} ${search}`.trim().toLowerCase())

  useEffect(() => {
    let active = true
    apiRequest('/api/documents/catalogs/')
      .then((catalogData) => { if (active) setCatalogs(catalogData) })
      .catch((requestError) => { if (active) setError(requestError.message) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    const query = buildDocumentQuery({ search: deferredSearch, type, area, status, from, until, catalogs })
    apiRequest(`/api/documents/?${query}`)
      .then((data) => { if (active) setDocuments((data.results || []).map(normalizeDocument)) })
      .catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [deferredSearch, type, area, status, from, until, catalogs])

  const statuses = catalogs.statuses?.length
    ? catalogs.statuses.map((item) => ({ id: item.code, name: item.name }))
    : [...new Map(documents.map((document) => [document.status, { id: document.status, name: document.status }]).filter((item) => item[0])).values()]
  const visibleDocuments = documents
  const totalPages = Math.max(1, Math.ceil(visibleDocuments.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageDocuments = visibleDocuments.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const statusSummary = statuses.map((item) => ({ ...item, count: documents.filter((document) => document.status === item.name).length }))
  const latestDocument = documents[0]

  function updateFilter(setter) {
    return (value) => { setter(value); setPage(1) }
  }

  function clearFilters() {
    setSearch(''); setType(''); setArea(''); setStatus(''); setFrom(''); setUntil(''); setPage(1)
  }

  function exportList() {
    const csv = ['Código,Documento,Tipo,Área,Estado,Versión,Actualización,Responsable', ...visibleDocuments.map((item) => [item.code, item.title, item.type, item.area, item.status, item.version, item.updated, item.reviewer].map((value) => `"${value}"`).join(','))].join('\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    link.download = 'mis-documentos.csv'
    link.click()
    URL.revokeObjectURL(link.href)
    onAction('El listado se exportó correctamente.')
  }

  return <div className="editor-documents-view"><header className="editor-documents-heading"><div><h1>Mis documentos</h1><p>Crea, actualiza y envía tus documentos personales para revisión.</p></div><section className="editor-documents-summary"><div><DocumentsIcon name="document" size={25} /><span>Total de documentos<strong>{documents.length}</strong></span></div><div><DocumentsIcon name="clock" size={25} /><span>Última actualización<strong>{latestDocument?.updated || 'Sin registros'}</strong></span></div></section></header>{error && <p className="editor-error" role="alert">{error}</p>}<div className="editor-documents-toolbar"><button type="button" onClick={exportList}><DocumentsIcon name="download" size={19} /> Exportar listado</button></div><section className="editor-document-stats" aria-label="Resumen de documentos">{statusSummary.map((item) => <article key={item.id}><span className={`is-${statusTone(item.name)}`}><DocumentsIcon name={statusTone(item.name) === 'review' ? 'clock' : statusTone(item.name) === 'approved' ? 'check' : statusTone(item.name) === 'returned' ? 'comment' : 'edit'} size={25} /></span><div><small>{item.name}</small><strong>{item.count}</strong><span>{documents.length ? `${Math.round((item.count / documents.length) * 100)}% del total` : '0% del total'}</span></div></article>)}{!loading && !statusSummary.length && <p className="editor-doc-empty">No hay estados documentales.</p>}</section><section className="editor-documents-panel"><div className="editor-doc-filters"><label className="editor-doc-filter editor-doc-filter--search"><span>Buscar documento</span><div><DocumentsIcon name="search" size={17} /><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Buscar por código o título..." /></div></label><FilterSelect label="Tipo" value={type} onChange={updateFilter(setType)} options={catalogs.types || []} placeholder="Todos" /><FilterSelect label="Área" value={area} onChange={updateFilter(setArea)} options={catalogs.areas || []} placeholder="Todas" /><FilterSelect label="Estado" value={status} onChange={updateFilter(setStatus)} options={statuses} placeholder="Todos" /><label className="editor-doc-filter editor-doc-filter--date"><span>Fecha</span><div><DocumentsIcon name="calendar" size={16} /><input aria-label="Fecha desde" type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1) }} /><em>Hasta</em><input aria-label="Fecha hasta" type="date" value={until} onChange={(event) => { setUntil(event.target.value); setPage(1) }} /></div></label><button className="editor-clear-filters" type="button" onClick={clearFilters}><DocumentsIcon name="filter" size={16} /> Limpiar filtros</button></div><div className="editor-doc-table-wrap"><table><thead><tr><th>Código</th><th>Documento</th><th>Tipo</th><th>Estado</th><th>Versión actual</th><th>Última actualización</th><th>Revisor asignado</th><th>Acciones</th></tr></thead><tbody>{pageDocuments.map((document) => <tr key={document.id}><td className="editor-doc-code">{document.code}</td><td>{document.title}</td><td>{document.type}</td><td><span className={`editor-doc-status editor-doc-status--${statusTone(document.status)}`}>{document.status}</span></td><td>{document.version}</td><td><strong>{document.updated}</strong><small>{formatDate(document.created_at, 'Sin fecha')}</small></td><td>{document.reviewer}</td><td><div className="editor-doc-actions"><button type="button" aria-label={`Ver ${document.title}`} onClick={() => onEditDocument(document)}><DocumentsIcon name="eye" size={16} /></button><button type="button" aria-label={`Editar ${document.title}`} onClick={() => onEditDocument(document)}><DocumentsIcon name="edit" size={16} /></button><button type="button" aria-label={`Descargar ${document.title}`} onClick={() => document.downloadUrl ? downloadFile(document.downloadUrl) : onAction('No hay versión descargable.')}><DocumentsIcon name="download" size={16} /></button><button type="button" aria-label={`Más acciones de ${document.title}`} onClick={() => onAction(`Más acciones de ${document.title}`)}><DocumentsIcon name="more" size={16} /></button></div></td></tr>)}</tbody></table>{loading && <div className="editor-doc-empty">Cargando documentos...</div>}{!loading && !pageDocuments.length && <div className="editor-doc-empty"><DocumentsIcon name="search" size={25} /><strong>Sin resultados</strong><span>Prueba con otros términos o limpia los filtros.</span></div>}</div><footer className="editor-doc-pagination"><span>Mostrando {visibleDocuments.length ? ((currentPage - 1) * PAGE_SIZE) + 1 : 0} a {Math.min(currentPage * PAGE_SIZE, visibleDocuments.length)} de {visibleDocuments.length} documentos</span><div><button type="button" aria-label="Primera página" disabled={currentPage === 1} onClick={() => setPage(1)}>«</button><button type="button" aria-label="Página anterior" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>‹</button>{Array.from({ length: totalPages }, (_, index) => index + 1).slice(Math.max(0, currentPage - 3), currentPage + 2).map((item) => <button className={item === currentPage ? 'is-current' : ''} type="button" key={item} onClick={() => setPage(item)}>{item}</button>)}<button type="button" aria-label="Página siguiente" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>›</button><button type="button" aria-label="Última página" disabled={currentPage === totalPages} onClick={() => setPage(totalPages)}>»</button></div><label>Filas por página <select value={PAGE_SIZE} disabled><option>{PAGE_SIZE}</option></select></label></footer></section></div>
}

export default EditorDocumentsView
