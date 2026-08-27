import { useDeferredValue, useEffect, useState } from 'react'
import { apiRequest, formatDate, normalizeDocument } from './documentApi'
import './EditorDocumentsView.css'

function DocumentsIcon({ name, size = 18 }) {
  let content
  switch (name) {
    case 'document': content = <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 12h7M9 16h7" /></>; break
    case 'search': content = <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></>; break
    case 'calendar': content = <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></>; break
    case 'filter': content = <path d="M4 5h16l-6.2 7v5.5l-3.6 1.8V12L4 5Z" />; break
    case 'plus': content = <path d="M12 5v14M5 12h14" />; break
    case 'upload': content = <><path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M5 14v6h14v-6" /></>; break
    case 'download': content = <><path d="M12 4v12m0 0 5-5m-5 5-5-5" /><path d="M5 20h14" /></>; break
    case 'clock': content = <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>; break
    case 'check': content = <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.7 2.7L16.5 9" /></>; break
    case 'comment': content = <><path d="M4 5h16v11H8l-4 4V5Z" /><path d="M8 9h8m-8 3h5" /></>; break
    case 'eye': content = <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>; break
    case 'edit': content = <><path d="m4 20 4.2-1 10.4-10.4-3.2-3.2L5 15.8 4 20Z" /><path d="m13.8 7 3.2 3.2" /></>; break
    case 'downloadSmall': content = <><path d="M12 4v11m0 0 4-4m-4 4-4-4" /><path d="M5 20h14" /></>; break
    case 'more': content = <><circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" /></>; break
    case 'chevron': content = <path d="m8 10 4 4 4-4" />; break
    default: content = <circle cx="12" cy="12" r="8" />
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function FilterSelect({ label, value, onChange, options }) {
  return <label className="editor-doc-filter"><span>{label}</span><div><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select><DocumentsIcon name="chevron" size={15} /></div></label>
}

function EditorDocumentsView({ globalQuery, onAction, onEditDocument }) {
  const [documents, setDocuments] = useState([])
  const [search, setSearch] = useState('')
  const [type, setType] = useState('Todos')
  const [area, setArea] = useState('Todas')
  const [status, setStatus] = useState('Todos')
  const [classification, setClassification] = useState('Todas')
  const [from, setFrom] = useState('')
  const [until, setUntil] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const deferredSearch = useDeferredValue(`${globalQuery} ${search}`.trim().toLowerCase())

  useEffect(() => {
    let active = true
    apiRequest('/api/documents/?limit=100')
      .then((data) => { if (active) setDocuments((data.results || []).map(normalizeDocument)) })
      .catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  const visibleDocuments = documents.filter((document) => {
    const searchable = [document.code, document.title, document.type, document.area, document.status, document.reviewer].join(' ').toLowerCase()
    return (!deferredSearch || searchable.includes(deferredSearch)) && (type === 'Todos' || document.type === type) && (area === 'Todas' || document.area === area) && (status === 'Todos' || document.status === status)
  })

  function clearFilters() {
    setSearch(''); setType('Todos'); setArea('Todas'); setStatus('Todos'); setClassification('Todas'); setFrom(''); setUntil('')
    onAction('Los filtros se limpiaron correctamente.')
  }

  function exportList() {
    const csv = ['Código,Documento,Tipo,Estado,Versión,Actualización,Revisor', ...visibleDocuments.map((item) => [item.code, item.title, item.type, item.status, item.version, item.updated, item.reviewer].map((value) => `"${value}"`).join(','))].join('\n')
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); link.download = 'mis-documentos.csv'; link.click(); URL.revokeObjectURL(link.href)
    onAction('El listado se exportó correctamente.')
  }

  return <div className="editor-documents-view">
     <header className="editor-documents-heading"><div><h1>Mis documentos</h1><p>Crea, actualiza y envía tus documentos personales para revisión.</p></div><section className="editor-documents-summary"><div><DocumentsIcon name="document" size={25} /><span>Total de documentos<strong>{documents.length}</strong></span></div><div><DocumentsIcon name="clock" size={25} /><span>Última actualización<strong>{documents[0]?.updated || 'Sin registros'}</strong></span></div></section></header>
     {error && <p className="editor-error" role="alert">{error}</p>}
    <div className="editor-documents-toolbar"><button className="is-primary" type="button" onClick={() => onAction('Crear un nuevo documento')}><DocumentsIcon name="plus" size={19} /> Nuevo documento</button><button type="button" onClick={() => onAction('Subir documento')}><DocumentsIcon name="upload" size={19} /> Subir documento</button><button type="button" onClick={exportList}><DocumentsIcon name="download" size={19} /> Exportar listado</button></div>
     <section className="editor-document-stats" aria-label="Resumen de documentos">{['Borrador', 'En revisión', 'Aprobado', 'Devuelto con observaciones'].map((item, index) => <article key={item}><span className={['is-draft', 'is-review', 'is-approved', 'is-returned'][index]}><DocumentsIcon name={index === 0 ? 'edit' : index === 1 ? 'clock' : index === 2 ? 'check' : 'comment'} size={25} /></span><div><small>{item}</small><strong>{documents.filter((document) => document.status === item).length}</strong><span>{documents.length ? `${Math.round((documents.filter((document) => document.status === item).length / documents.length) * 100)}% del total` : '0% del total'}</span></div></article>)}</section>
    <section className="editor-documents-panel"><div className="editor-doc-filters"><label className="editor-doc-filter editor-doc-filter--search"><span>Buscar documento</span><div><DocumentsIcon name="search" size={17} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por código o título..." /></div></label><FilterSelect label="Tipo" value={type} onChange={setType} options={['Todos', 'Política', 'Procedimiento', 'Instructivo', 'Formato']} /><FilterSelect label="Área" value={area} onChange={setArea} options={['Todas', 'Calidad', 'Compras', 'Auditoría', 'Administración', 'Seguridad']} /><FilterSelect label="Estado" value={status} onChange={setStatus} options={['Todos', 'Borrador', 'En revisión', 'Aprobado', 'Devuelto con observaciones']} /><label className="editor-doc-filter editor-doc-filter--date"><span>Fecha</span><div><DocumentsIcon name="calendar" size={16} /><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /><em>Hasta</em><input type="date" value={until} onChange={(event) => setUntil(event.target.value)} /></div></label><FilterSelect label="Clasificación" value={classification} onChange={setClassification} options={['Todas', 'Pública', 'Uso interno', 'Confidencial']} /><button className="editor-clear-filters" type="button" onClick={clearFilters}><DocumentsIcon name="filter" size={16} /> Limpiar filtros</button></div>
       <div className="editor-doc-table-wrap"><table><thead><tr><th>Código</th><th>Documento</th><th>Tipo</th><th>Estado</th><th>Versión actual</th><th>Última actualización</th><th>Revisor asignado</th><th>Acciones</th></tr></thead><tbody>{visibleDocuments.map((document) => <tr key={document.id}><td className="editor-doc-code">{document.code}</td><td>{document.title}</td><td>{document.type}</td><td><span className={`editor-doc-status editor-doc-status--${document.status.toLowerCase().replaceAll(' ', '-')}`}>{document.status}</span></td><td>{document.version}</td><td><strong>{document.updated}</strong><small>{formatDate(document.created_at, 'Sin fecha')}</small></td><td>{document.reviewer}</td><td><div className="editor-doc-actions"><button type="button" aria-label={`Ver ${document.title}`} onClick={() => onAction(`Ver ${document.title}`)}><DocumentsIcon name="eye" size={16} /></button><button type="button" aria-label={`Editar ${document.title}`} onClick={() => onEditDocument(document)}><DocumentsIcon name="edit" size={16} /></button><button type="button" aria-label={`Descargar ${document.title}`} onClick={() => document.downloadUrl ? window.open(document.downloadUrl, '_blank', 'noopener,noreferrer') : onAction('No hay versión descargable.')}><DocumentsIcon name="downloadSmall" size={16} /></button><button type="button" aria-label={`Más acciones de ${document.title}`} onClick={() => onAction(`Más acciones de ${document.title}`)}><DocumentsIcon name="more" size={16} /></button></div></td></tr>)}</tbody></table>{loading && <div className="editor-doc-empty">Cargando documentos...</div>}{!loading && !visibleDocuments.length && <div className="editor-doc-empty"><DocumentsIcon name="search" size={25} /><strong>Sin resultados</strong><span>Prueba con otros términos o limpia los filtros.</span></div>}</div>
       <footer className="editor-doc-pagination"><span>Mostrando {visibleDocuments.length} de {documents.length} documentos</span></footer></section>
  </div>
}

export default EditorDocumentsView
