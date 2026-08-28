import { useDeferredValue, useEffect, useState } from 'react'
import { apiRequest, buildDocumentQuery, normalizeDocument } from './documentApi'
import './DocumentsView.css'

const typeTones = { Política: 'blue', Manual: 'green', Código: 'violet', Plan: 'blue', Informe: 'orange', Procedimiento: 'green', Lineamiento: 'blue', Acta: 'orange', Presupuesto: 'green' }

function DocumentViewIcon({ name, size = 18 }) {
  const paths = {
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></>,
    filter: <path d="M4 5h16l-6.2 7v5.5l-3.6 1.8V12L4 5Z" />,
    sliders: <><path d="M4 7h5M15 7h5M4 17h8M18 17h2" /><circle cx="12" cy="7" r="2" /><circle cx="15" cy="17" r="2" /></>,
    plus: <path d="M12 5v14M5 12h14" />, upload: <><path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M5 14v6h14v-6" /></>,
    download: <><path d="M12 4v12m0 0 5-5m-5 5-5-5" /><path d="M5 20h14" /></>, document: <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 12h7M9 16h7" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>, check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.7 2.7L16.5 9" /></>,
    archive: <><path d="M4 8h16v12H4zM3 4h18v4H3z" /><path d="M9 12h6" /></>, refresh: <><path d="M20 7v5h-5" /><path d="M18.5 16a8 8 0 1 1 1.2-8.5L20 12" /></>,
    eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>,
    edit: <><path d="m4 20 4.2-1 10.4-10.4-3.2-3.2L5 15.8 4 20Z" /><path d="m13.8 7 3.2 3.2" /></>, copy: <><rect x="8" y="8" width="11" height="12" rx="1" /><path d="M16 8V4H5v12h3" /></>,
    share: <><circle cx="18" cy="5" r="2" /><circle cx="6" cy="12" r="2" /><circle cx="18" cy="19" r="2" /><path d="m8 11 8-5M8 13l8 5" /></>,
    more: <><circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" /></>,
    chevron: <path d="m8 10 4 4 4-4" />, sort: <><path d="M8 5v14m0-14L5 8m3-3 3 3M16 19V5m0 14-3-3m3 3 3-3" /></>, star: <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || <circle cx="12" cy="12" r="8" />}</svg>
}

function SelectFilter({ label, value, onChange, options }) {
  return <label className="documents-filter"><span>{label}</span><div><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select><DocumentViewIcon name="chevron" size={15} /></div></label>
}

function DocumentsView({ globalQuery, today, onOpenVersions }) {
  const [documents, setDocuments] = useState([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [type, setType] = useState('Todas')
  const [area, setArea] = useState('Todas')
  const [status, setStatus] = useState('Todos')
  const [owner, setOwner] = useState('Todos')
  const [from, setFrom] = useState('')
  const [until, setUntil] = useState('')
  const [classification, setClassification] = useState('Todas')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState('')
  const [catalogs, setCatalogs] = useState({ areas: [], types: [], statuses: [], responsibles: [] })
  const [form, setForm] = useState({ code: '', title: '', description: '', area_id: '', type_id: '', file: null })
  const [saving, setSaving] = useState(false)
  const deferredSearch = useDeferredValue(`${globalQuery} ${search}`.trim().toLowerCase())

  useEffect(() => {
    let active = true
    apiRequest('/api/documents/catalogs/')
      .then((data) => { if (active) setCatalogs(data) })
      .catch((requestError) => { if (active) setError(requestError.message) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    const query = buildDocumentQuery({ search: deferredSearch, type: type === 'Todas' ? '' : type, area: area === 'Todas' ? '' : area, status: status === 'Todos' ? '' : status, responsible: owner === 'Todos' ? '' : owner, from, until, catalogs })
    apiRequest(`/api/documents/?${query}`)
      .then((data) => { if (active) { setDocuments((data.results || []).map(normalizeDocument)); setTotal(data.count || 0) } })
      .catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [deferredSearch, type, area, status, owner, from, until, catalogs])

  const visibleDocuments = documents
  const options = (key) => key === 'type'
    ? ['Todas', ...(catalogs.types || []).map((item) => item.name)]
    : ['Todas', ...(catalogs.areas || []).map((item) => item.name)]
  const statusOptions = ['Todos', ...(catalogs.statuses || []).map((item) => item.name)]
  const counts = statusOptions.slice(1).map((item) => [item, documents.filter((document) => document.status === item).length])

  function clearFilters() {
    setSearch(''); setType('Todas'); setArea('Todas'); setStatus('Todos'); setOwner('Todos'); setFrom(''); setUntil(''); setClassification('Todas'); setAdvancedOpen(false)
  }

  function exportList() {
    window.open('/api/documents/export/', '_blank', 'noopener,noreferrer')
  }

  async function openCreate(mode) {
    setModal(mode)
    setError('')
    if (catalogs.areas.length || catalogs.types.length) return
    try { setCatalogs(await apiRequest('/api/documents/catalogs/')) } catch (requestError) { setError(requestError.message) }
  }

  async function createDocument(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    const body = new FormData()
    Object.entries(form).forEach(([key, value]) => { if (value) body.append(key, value) })
    try {
      const data = await apiRequest('/api/documents/', { method: 'POST', body })
      const created = normalizeDocument(data.document)
      setDocuments((current) => [created, ...current])
      setTotal((current) => current + 1)
      setModal('')
      setForm({ code: '', title: '', description: '', area_id: '', type_id: '', file: null })
    } catch (requestError) { setError(requestError.message) } finally { setSaving(false) }
  }

  return <div className="documents-view">
    <div className="documents-hero"><div className="documents-title"><div><p>Repositorio institucional</p><h1>Gestión documental</h1><span>Administre, clasifique y controle los documentos institucionales de la organización.</span></div><div className="documents-date"><DocumentViewIcon name="calendar" size={18} />{today}</div><div className="documents-toolbar"><button className="documents-button documents-button--primary" type="button" onClick={() => openCreate('create')}><DocumentViewIcon name="plus" size={19} /> Nuevo documento</button><button className="documents-button" type="button" onClick={() => openCreate('upload')}><DocumentViewIcon name="upload" size={19} /> Subir documento</button><button className="documents-button" type="button" onClick={exportList}><DocumentViewIcon name="download" size={19} /> Exportar listado</button></div></div>
      <section className="documents-summary" aria-label="Resumen documental"><div className="documents-summary__items">{counts.map(([label, count], index) => <article key={label}><span className={`documents-summary__icon documents-summary__icon--${['blue', 'orange', 'green', 'violet'][index % 4]}`}><DocumentViewIcon name={index === 0 ? 'document' : index === 1 ? 'clock' : index === 2 ? 'check' : 'archive'} size={21} /></span><div><small>{label}</small><strong>{count}</strong></div></article>)}</div><footer><span>Total documentos <strong>{total}</strong></span><span>Datos de la organización <DocumentViewIcon name="refresh" size={17} /></span></footer></section>
    </div>
     <section className="documents-filters"><label className="documents-filter documents-filter--search"><span>Búsqueda</span><div><DocumentViewIcon name="search" size={17} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por código, título o palabras clave..." /></div></label><SelectFilter label="Tipo" value={type} onChange={setType} options={options('type')} /><SelectFilter label="Área" value={area} onChange={setArea} options={options('area')} /><SelectFilter label="Estado" value={status} onChange={setStatus} options={statusOptions} /><SelectFilter label="Responsable" value={owner} onChange={setOwner} options={['Todos', ...(catalogs.responsibles || []).map((item) => item.name)]} /><label className="documents-filter documents-filter--date"><span>Desde</span><div><DocumentViewIcon name="calendar" size={17} /><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div></label><label className="documents-filter documents-filter--date"><span>Hasta</span><div><DocumentViewIcon name="calendar" size={17} /><input type="date" value={until} onChange={(event) => setUntil(event.target.value)} /></div></label><SelectFilter label="Clasificación" value={classification} onChange={setClassification} options={['Todas']} /><div className="documents-filter-actions"><button type="button" onClick={clearFilters}><DocumentViewIcon name="filter" size={17} /> Limpiar filtros</button><button className={advancedOpen ? 'is-active' : ''} type="button" onClick={() => setAdvancedOpen((open) => !open)}><DocumentViewIcon name="sliders" size={17} /> Filtros avanzados <DocumentViewIcon name="chevron" size={14} /></button></div>{advancedOpen && <p className="documents-advanced-message">Los filtros se aplican remotamente sobre el catálogo documental.</p>}</section>
    {error && <p className="documents-error" role="alert">{error}</p>}
    <section className="documents-table-panel"><div className="documents-table-scroll"><table><thead><tr><th>Código</th><th>Documento</th><th>Tipo</th><th>Área</th><th>Responsable</th><th>Estado</th><th>Versión actual</th><th>Última actualización</th><th>Acciones</th></tr></thead><tbody>{visibleDocuments.map((document) => { const ownerName = document.responsible?.name || '—'; const initials = ownerName.split(' ').map((part) => part[0]).join('').slice(0, 2) || '—'; return <tr key={document.id}><td className="documents-code">{document.code}</td><td><span className="documents-name">{document.title}{document.favorite && <span className="documents-favorite"><DocumentViewIcon name="star" size={13} /></span>}</span></td><td><span className={`documents-type documents-type--${typeTones[document.type] || 'blue'}`}>{document.type}</span></td><td>{document.area}</td><td><span className="documents-owner"><i className="documents-owner__avatar documents-owner__avatar--blue">{initials}</i>{ownerName}</span></td><td><span className="documents-state">{document.status}</span></td><td>{document.version}</td><td><span className="documents-updated"><strong>{document.updated}</strong><small>por {ownerName}</small></span></td><td><div className="documents-row-actions"><button type="button" aria-label={`Ver ${document.title}`} onClick={() => onOpenVersions?.(document.id)}><DocumentViewIcon name="eye" size={16} /></button><button type="button" aria-label={`Editar ${document.title}`} onClick={() => onOpenVersions?.(document.id)}><DocumentViewIcon name="edit" size={16} /></button><button type="button" title="Ver historial de versiones" aria-label={`Ver versiones de ${document.title}`} onClick={() => onOpenVersions?.(document.id)}><DocumentViewIcon name="copy" size={16} /></button><button type="button" aria-label={`Compartir ${document.title}`} onClick={() => window.navigator.clipboard?.writeText(`${document.title} (${document.code})`)}><DocumentViewIcon name="share" size={16} /></button><button type="button" aria-label={`Más acciones para ${document.title}`} onClick={() => onOpenVersions?.(document.id)}><DocumentViewIcon name="more" size={16} /></button></div></td></tr> })}</tbody></table>{loading && <div className="documents-empty">Cargando documentos...</div>}{!loading && !visibleDocuments.length && <div className="documents-empty"><DocumentViewIcon name="search" size={23} /><strong>Sin resultados</strong><span>Pruebe con otros términos o limpie los filtros seleccionados.</span></div>}</div><footer className="documents-pagination"><span>Mostrando {visibleDocuments.length} de {total} documentos</span></footer></section>
    {modal && <div className="documents-modal" role="dialog" aria-modal="true" aria-labelledby="documents-modal-title"><form onSubmit={createDocument}><header><h2 id="documents-modal-title">{modal === 'upload' ? 'Subir documento' : 'Nuevo documento'}</h2><button type="button" onClick={() => setModal('')}>×</button></header><label>Código<input required value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} /></label><label>Título<input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label>Descripción<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label><label>Área<select required value={form.area_id} onChange={(event) => setForm({ ...form, area_id: event.target.value })}><option value="">Seleccione un área</option>{catalogs.areas.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Tipo de documento<select required value={form.type_id} onChange={(event) => setForm({ ...form, type_id: event.target.value })}><option value="">Seleccione un tipo</option>{catalogs.types.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Archivo {modal === 'upload' && <em>*</em>}<input type="file" required={modal === 'upload'} onChange={(event) => setForm({ ...form, file: event.target.files?.[0] || null })} /></label><footer><button type="button" onClick={() => setModal('')}>Cancelar</button><button className="is-primary" type="submit" disabled={saving || !catalogs.areas.length || !catalogs.types.length}>{saving ? 'Guardando...' : 'Guardar'}</button></footer></form></div>}
  </div>
}

export default DocumentsView
