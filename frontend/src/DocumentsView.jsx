import { useDeferredValue, useState } from 'react'
import './DocumentsView.css'

const documentRows = [
  { code: 'DOC-2024-00125', title: 'Política de Seguridad de la Información', favorite: true, type: 'Política', area: 'Tecnología', initials: 'JM', owner: 'Juan Martínez', ownerTone: 'blue', status: 'Publicado', version: '2.1', date: '23/05/2024', time: '10:15 a. m.' },
  { code: 'DOC-2024-00124', title: 'Manual de Procedimientos Administrativos', type: 'Manual', area: 'Administración', initials: 'LR', owner: 'Laura Ramírez', ownerTone: 'teal', status: 'En revisión', version: '1.3', date: '23/05/2024', time: '09:58 a. m.' },
  { code: 'DOC-2024-00123', title: 'Código de Ética y Conducta', type: 'Código', area: 'Recursos Humanos', initials: 'CP', owner: 'Carlos Pérez', ownerTone: 'violet', status: 'Publicado', version: '3.0', date: '23/05/2024', time: '09:31 a. m.' },
  { code: 'DOC-2024-00122', title: 'Plan Estratégico 2024-2026', type: 'Plan', area: 'Dirección General', initials: 'MG', owner: 'María Gómez', ownerTone: 'orange', status: 'Borrador', version: '0.4', date: '23/05/2024', time: '08:45 a. m.' },
  { code: 'DOC-2024-00121', title: 'Informe de Riesgos Q1 2024', type: 'Informe', area: 'Auditoría', initials: 'DL', owner: 'Diego López', ownerTone: 'green', status: 'Publicado', version: '1.0', date: '23/05/2024', time: '08:12 a. m.' },
  { code: 'DOC-2024-00120', title: 'Procedimiento de Compras', type: 'Procedimiento', area: 'Administración', initials: 'MG', owner: 'María Gómez', ownerTone: 'orange', status: 'Archivado', version: '2.0', date: '22/05/2024', time: '05:20 p. m.' },
  { code: 'DOC-2024-00119', title: 'Lineamientos de Teletrabajo', type: 'Lineamiento', area: 'Recursos Humanos', initials: 'CP', owner: 'Carlos Pérez', ownerTone: 'violet', status: 'Publicado', version: '1.2', date: '22/05/2024', time: '04:05 p. m.' },
  { code: 'DOC-2024-00118', title: 'Acta de Reunión Directiva 15/05/2024', type: 'Acta', area: 'Dirección General', initials: 'JM', owner: 'Juan Martínez', ownerTone: 'blue', status: 'Publicado', version: '1.0', date: '21/05/2024', time: '03:40 p. m.' },
  { code: 'DOC-2024-00117', title: 'Presupuesto Operativo 2024', type: 'Presupuesto', area: 'Finanzas', initials: 'DL', owner: 'Diego López', ownerTone: 'green', status: 'Borrador', version: '0.6', date: '21/05/2024', time: '11:22 a. m.' },
  { code: 'DOC-2024-00116', title: 'Política de Protección de Datos Personales', type: 'Política', area: 'Legal', initials: 'LR', owner: 'Laura Ramírez', ownerTone: 'teal', status: 'En revisión', version: '1.1', date: '21/05/2024', time: '10:10 a. m.' },
]

const typeTones = {
  Política: 'blue', Manual: 'green', Código: 'violet', Plan: 'blue', Informe: 'orange',
  Procedimiento: 'green', Lineamiento: 'blue', Acta: 'orange', Presupuesto: 'green',
}

function DocumentViewIcon({ name, size = 18 }) {
  let content

  switch (name) {
    case 'search': content = <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></>; break
    case 'calendar': content = <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></>; break
    case 'filter': content = <path d="M4 5h16l-6.2 7v5.5l-3.6 1.8V12L4 5Z" />; break
    case 'sliders': content = <><path d="M4 7h5M15 7h5M4 17h8M18 17h2" /><circle cx="12" cy="7" r="2" /><circle cx="15" cy="17" r="2" /></>; break
    case 'plus': content = <path d="M12 5v14M5 12h14" />; break
    case 'upload': content = <><path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M5 14v6h14v-6" /></>; break
    case 'download': content = <><path d="M12 4v12m0 0 5-5m-5 5-5-5" /><path d="M5 20h14" /></>; break
    case 'document': content = <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 12h7M9 16h7" /></>; break
    case 'clock': content = <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>; break
    case 'check': content = <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.7 2.7L16.5 9" /></>; break
    case 'archive': content = <><path d="M4 8h16v12H4zM3 4h18v4H3z" /><path d="M9 12h6" /></>; break
    case 'refresh': content = <><path d="M20 7v5h-5" /><path d="M18.5 16a8 8 0 1 1 1.2-8.5L20 12" /></>; break
    case 'eye': content = <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>; break
    case 'edit': content = <><path d="m4 20 4.2-1 10.4-10.4-3.2-3.2L5 15.8 4 20Z" /><path d="m13.8 7 3.2 3.2" /></>; break
    case 'copy': content = <><rect x="8" y="8" width="11" height="12" rx="1" /><path d="M16 8V4H5v12h3" /></>; break
    case 'share': content = <><circle cx="18" cy="5" r="2" /><circle cx="6" cy="12" r="2" /><circle cx="18" cy="19" r="2" /><path d="m8 11 8-5M8 13l8 5" /></>; break
    case 'more': content = <><circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" /></>; break
    case 'chevron': content = <path d="m8 10 4 4 4-4" />; break
    case 'sort': content = <><path d="M8 5v14m0-14L5 8m3-3 3 3M16 19V5m0 14-3-3m3 3 3-3" /></>; break
    case 'star': content = <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />; break
    default: content = <circle cx="12" cy="12" r="8" />
  }

  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function SelectFilter({ label, value, onChange, options }) {
  return (
    <label className="documents-filter">
      <span>{label}</span>
      <div><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select><DocumentViewIcon name="chevron" size={15} /></div>
    </label>
  )
}

function DocumentsView({ globalQuery, today }) {
  const [search, setSearch] = useState('')
  const [type, setType] = useState('Todas')
  const [area, setArea] = useState('Todas')
  const [status, setStatus] = useState('Todos')
  const [owner, setOwner] = useState('Todos')
  const [classification, setClassification] = useState('Todas')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const deferredSearch = useDeferredValue(search.trim().toLowerCase())
  const deferredGlobalQuery = useDeferredValue(globalQuery.trim().toLowerCase())
  const visibleDocuments = documentRows.filter((document) => {
    const searchable = [document.code, document.title, document.type, document.area, document.owner, document.status].join(' ').toLowerCase()
    return (!deferredSearch || searchable.includes(deferredSearch))
      && (!deferredGlobalQuery || searchable.includes(deferredGlobalQuery))
      && (type === 'Todas' || document.type === type)
      && (area === 'Todas' || document.area === area)
      && (status === 'Todos' || document.status === status)
      && (owner === 'Todos' || document.owner === owner)
  })

  function clearFilters() {
    setSearch('')
    setType('Todas')
    setArea('Todas')
    setStatus('Todos')
    setOwner('Todos')
    setClassification('Todas')
    setAdvancedOpen(false)
  }

  return (
    <div className="documents-view">
      <div className="documents-hero">
        <div className="documents-title">
          <div><p>Repositorio institucional</p><h1>Gestión documental</h1><span>Administre, clasifique y controle los documentos institucionales de la organización.</span></div>
          <div className="documents-date"><DocumentViewIcon name="calendar" size={18} />{today}</div>
          <div className="documents-toolbar">
            <button className="documents-button documents-button--primary" type="button"><DocumentViewIcon name="plus" size={19} /> Nuevo documento</button>
            <button className="documents-button" type="button"><DocumentViewIcon name="upload" size={19} /> Subir documento</button>
            <button className="documents-button" type="button"><DocumentViewIcon name="download" size={19} /> Exportar listado</button>
          </div>
        </div>

        <section className="documents-summary" aria-label="Resumen documental">
          <div className="documents-summary__items">
            <article><span className="documents-summary__icon documents-summary__icon--blue"><DocumentViewIcon name="document" size={21} /></span><div><small>Borrador</small><strong>124</strong></div></article>
            <article><span className="documents-summary__icon documents-summary__icon--orange"><DocumentViewIcon name="clock" size={21} /></span><div><small>En revisión</small><strong>78</strong></div></article>
            <article><span className="documents-summary__icon documents-summary__icon--green"><DocumentViewIcon name="check" size={21} /></span><div><small>Publicado</small><strong>542</strong></div></article>
            <article><span className="documents-summary__icon documents-summary__icon--violet"><DocumentViewIcon name="archive" size={21} /></span><div><small>Archivado</small><strong>186</strong></div></article>
          </div>
          <footer><span>Total documentos <strong>930</strong></span><span>Actualizado hoy 10:23 a. m. <DocumentViewIcon name="refresh" size={17} /></span></footer>
        </section>
      </div>

      <section className="documents-filters">
        <label className="documents-filter documents-filter--search">
          <span>Búsqueda</span>
          <div><DocumentViewIcon name="search" size={17} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por código, título o palabras clave..." /></div>
        </label>
        <SelectFilter label="Tipo" value={type} onChange={setType} options={['Todas', 'Política', 'Manual', 'Código', 'Plan', 'Informe', 'Procedimiento', 'Lineamiento', 'Acta', 'Presupuesto']} />
        <SelectFilter label="Área" value={area} onChange={setArea} options={['Todas', 'Tecnología', 'Administración', 'Recursos Humanos', 'Dirección General', 'Auditoría', 'Finanzas', 'Legal']} />
        <SelectFilter label="Estado" value={status} onChange={setStatus} options={['Todos', 'Borrador', 'En revisión', 'Publicado', 'Archivado']} />
        <SelectFilter label="Responsable" value={owner} onChange={setOwner} options={['Todos', 'Juan Martínez', 'Laura Ramírez', 'Carlos Pérez', 'María Gómez', 'Diego López']} />
        <label className="documents-filter documents-filter--date"><span>Fecha</span><div><DocumentViewIcon name="calendar" size={17} /><input type="text" placeholder="Rango de fechas" readOnly /></div></label>
        <SelectFilter label="Clasificación" value={classification} onChange={setClassification} options={['Todas', 'Pública', 'Uso interno', 'Confidencial', 'Restringida']} />
        <div className="documents-filter-actions">
          <button type="button" onClick={clearFilters}><DocumentViewIcon name="filter" size={17} /> Limpiar filtros</button>
          <button className={advancedOpen ? 'is-active' : ''} type="button" onClick={() => setAdvancedOpen((open) => !open)}><DocumentViewIcon name="sliders" size={17} /> Filtros avanzados <DocumentViewIcon name="chevron" size={14} /></button>
        </div>
        {advancedOpen && <p className="documents-advanced-message">Los filtros avanzados estarán disponibles al conectar esta vista con el backend documental.</p>}
      </section>

      <section className="documents-table-panel">
        <div className="documents-table-scroll">
          <table>
            <thead>
              <tr><th>Código <DocumentViewIcon name="sort" size={12} /></th><th>Documento <DocumentViewIcon name="sort" size={12} /></th><th>Tipo <DocumentViewIcon name="sort" size={12} /></th><th>Área <DocumentViewIcon name="sort" size={12} /></th><th>Responsable <DocumentViewIcon name="sort" size={12} /></th><th>Estado <DocumentViewIcon name="sort" size={12} /></th><th>Versión actual <DocumentViewIcon name="sort" size={12} /></th><th>Última actualización <DocumentViewIcon name="sort" size={12} /></th><th>Acciones</th></tr>
            </thead>
            <tbody>
              {visibleDocuments.map((document) => (
                <tr key={document.code}>
                  <td className="documents-code">{document.code}</td>
                  <td><span className="documents-name">{document.title}{document.favorite && <span className="documents-favorite"><DocumentViewIcon name="star" size={13} /></span>}</span></td>
                  <td><span className={`documents-type documents-type--${typeTones[document.type]}`}>{document.type}</span></td>
                  <td>{document.area}</td>
                  <td><span className="documents-owner"><i className={`documents-owner__avatar documents-owner__avatar--${document.ownerTone}`}>{document.initials}</i>{document.owner}</span></td>
                  <td><span className={`documents-state documents-state--${document.status.toLowerCase().replace(' ', '-').replace('ó', 'o')}`}>{document.status}</span></td>
                  <td>{document.version}</td>
                  <td><span className="documents-updated"><strong>{document.date} {document.time}</strong><small>por {document.owner}</small></span></td>
                  <td><div className="documents-row-actions"><button type="button" aria-label={`Ver ${document.title}`}><DocumentViewIcon name="eye" size={16} /></button><button type="button" aria-label={`Editar ${document.title}`}><DocumentViewIcon name="edit" size={16} /></button><button type="button" aria-label={`Duplicar ${document.title}`}><DocumentViewIcon name="copy" size={16} /></button><button type="button" aria-label={`Compartir ${document.title}`}><DocumentViewIcon name="share" size={16} /></button><button type="button" aria-label={`Más acciones para ${document.title}`}><DocumentViewIcon name="more" size={16} /></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visibleDocuments.length && <div className="documents-empty"><DocumentViewIcon name="search" size={23} /><strong>Sin resultados</strong><span>Pruebe con otros términos o limpie los filtros seleccionados.</span></div>}
        </div>
        <footer className="documents-pagination">
          <span>Mostrando 1 a {visibleDocuments.length} de 930 documentos</span>
          <div className="documents-pagination__controls"><label>Filas por página <select defaultValue="10"><option>10</option><option>25</option><option>50</option></select></label><button type="button">«</button><button type="button">‹</button><button className="is-current" type="button">1</button><button type="button">2</button><button type="button">3</button><button type="button">…</button><button type="button">93</button><button type="button">›</button><button type="button">»</button></div>
        </footer>
      </section>
    </div>
  )
}

export default DocumentsView
