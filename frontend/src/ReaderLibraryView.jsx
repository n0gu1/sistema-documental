import { useDeferredValue, useState } from 'react'
import './ReaderLibraryView.css'

const documents = [
  ['POL-002', 'Política de Seguridad de la Información', 'Seguridad de la Información', 'Política', 'Confidencial', '1.2', '23/05/2024'],
  ['INS-007', 'Instructivo de Auditoría Interna', 'Auditoría Interna', 'Instructivo', 'Interno', '1.0', '22/05/2024'],
  ['PRO-005', 'Proceso de Compras', 'Administrativa', 'Procedimiento', 'Interno', '2.0', '23/05/2024'],
  ['FOR-012', 'Formato de Solicitud', 'Administrativa', 'Formato', 'Pública', '1.1', '20/05/2024'],
  ['POL-001', 'Política de Calidad', 'Calidad', 'Política', 'Pública', '1.2', '23/05/2024'],
  ['PROC-008', 'Control de Registros', 'Administrativa', 'Procedimiento', 'Interno', '1.3', '17/05/2024'],
  ['INS-010', 'Instructivo para Gestión de No Conformidades', 'Calidad', 'Instructivo', 'Interno', '1.1', '16/05/2024'],
  ['FOR-015', 'Formato de Evaluación de Proveedores', 'Compras', 'Formato', 'Pública', '0.1', '15/05/2024'],
  ['GUI-003', 'Guía de Buenas Prácticas en Seguridad', 'Seguridad de la Información', 'Guía', 'Confidencial', '1.0', '10/05/2024'],
  ['PLA-004', 'Plan Anual de Auditoría Interna 2024', 'Auditoría Interna', 'Plan', 'Confidencial', '1.0', '08/05/2024'],
]

const categories = [['Políticas', '10', 'shield'], ['Procedimientos', '12', 'workflow'], ['Instructivos', '9', 'document'], ['Formatos', '7', 'form'], ['Guías', '5', 'book'], ['Planes', '3', 'calendar'], ['Registros', '2', 'database']]
const recent = documents.slice(0, 5)

function LibraryIcon({ name, size = 18 }) {
  let content
  switch (name) {
    case 'document': content = <><path d="M6 2.8h8.6L19 7.2V21H6z" /><path d="M14.5 3v4.5H19M9 12h7M9 16h7" /></>; break
    case 'search': content = <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>; break
    case 'download': content = <><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 18v3h16v-3" /></>; break
    case 'eye': content = <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>; break
    case 'star': content = <path d="m12 3 2.8 5.8 6.2.9-4.5 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.7l6.2-.9L12 3Z" />; break
    case 'calendar': content = <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></>; break
    case 'clock': content = <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></>; break
    case 'shield': content = <><path d="M12 2.5 20 6v5.5c0 4.8-3.2 8-8 10-4.8-2-8-5.2-8-10V6l8-3.5Z" /><path d="m9 12 2 2 4-4" /></>; break
    case 'workflow': content = <><circle cx="6" cy="7" r="2" /><circle cx="18" cy="7" r="2" /><circle cx="12" cy="17" r="2" /><path d="M8 7h8M7 9l4 6m6-6-4 6" /></>; break
    case 'form': content = <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>; break
    case 'book': content = <><path d="M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4zM20 5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z" /></>; break
    case 'database': content = <><ellipse cx="12" cy="5" rx="7" ry="3" /><path d="M5 5v7c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 12v7c0 1.7 3.1 3 7 3s7-1.3 7-3v-7" /></>; break
    case 'more': content = <><circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" /></>; break
    default: content = <circle cx="12" cy="12" r="8" />
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function ReaderLibraryView({ onAction }) {
  const [query, setQuery] = useState('')
  const [area, setArea] = useState('Todas las áreas')
  const [type, setType] = useState('Todos los tipos')
  const [classification, setClassification] = useState('Todas las clasificaciones')
  const [status, setStatus] = useState('Todos los estados')
  const [keywords, setKeywords] = useState('')
  const [favorites, setFavorites] = useState(new Set(['POL-001']))
  const deferredQuery = useDeferredValue(`${query} ${keywords}`.trim().toLowerCase())
  const visibleDocuments = documents.filter((item) => (!deferredQuery || item.join(' ').toLowerCase().includes(deferredQuery)) && (area === 'Todas las áreas' || item[2] === area) && (type === 'Todos los tipos' || item[3] === type) && (classification === 'Todas las clasificaciones' || item[4] === classification))

  function toggleFavorite(code) {
    setFavorites((current) => { const next = new Set(current); if (next.has(code)) next.delete(code); else next.add(code); return next })
    onAction('Se actualizó tu lista de favoritos.')
  }

  function clearFilters() {
    setQuery(''); setArea('Todas las áreas'); setType('Todos los tipos'); setClassification('Todas las clasificaciones'); setStatus('Todos los estados'); setKeywords(''); onAction('Se limpiaron los filtros.')
  }

  return <div className="reader-library"><header className="reader-library-heading"><div><h1>Biblioteca documental</h1><p>Explora y consulta los documentos institucionales disponibles.</p></div></header><div className="reader-library-layout"><main><section className="reader-library-filters"><label className="reader-library-free-search"><span>Búsqueda libre</span><div><LibraryIcon name="search" size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por código, documento o palabra clave..." /></div></label><label><span>Área</span><select value={area} onChange={(event) => setArea(event.target.value)}><option>Todas las áreas</option><option>Administrativa</option><option>Auditoría Interna</option><option>Calidad</option><option>Compras</option><option>Seguridad de la Información</option></select></label><label><span>Tipo de documento</span><select value={type} onChange={(event) => setType(event.target.value)}><option>Todos los tipos</option><option>Política</option><option>Procedimiento</option><option>Instructivo</option><option>Formato</option><option>Guía</option><option>Plan</option></select></label><label><span>Clasificación</span><select value={classification} onChange={(event) => setClassification(event.target.value)}><option>Todas las clasificaciones</option><option>Pública</option><option>Interno</option><option>Confidencial</option></select></label><label><span>Estado</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option>Todos los estados</option><option>Publicado</option><option>En revisión</option></select></label><label><span>Fecha</span><div className="reader-library-date"><input type="date" aria-label="Fecha desde" /><i>–</i><input type="date" aria-label="Fecha hasta" /></div></label><label className="reader-library-keywords"><span>Palabras clave</span><input value={keywords} onChange={(event) => setKeywords(event.target.value)} placeholder="Ej. auditoría, políticas, procesos, seguridad..." /></label><div className="reader-library-filter-actions"><button className="is-primary" type="button" onClick={() => onAction('Ver documento seleccionado')}><LibraryIcon name="eye" size={16} /> Ver documento</button><button type="button" onClick={() => onAction('Descargar listado')}><LibraryIcon name="download" size={16} /> Descargar listado</button><button type="button" onClick={clearFilters}>Limpiar filtros</button></div></section><section className="reader-library-table-card"><header><span><LibraryIcon name="document" size={17} /> <strong>{visibleDocuments.length === documents.length ? 48 : visibleDocuments.length}</strong> documentos encontrados</span></header><div className="reader-library-table-wrap"><table><thead><tr><th>Código</th><th>Documento</th><th>Área</th><th>Tipo</th><th>Clasificación</th><th>Versión vigente</th><th>Fecha de publicación</th><th>Acciones</th></tr></thead><tbody>{visibleDocuments.map((item) => <tr key={item[0]}><td><strong>{item[0]}</strong></td><td>{item[1]}</td><td>{item[2]}</td><td>{item[3]}</td><td><span className={`reader-classification is-${item[4].toLowerCase()}`}>{item[4]}</span></td><td>{item[5]}</td><td>{item[6]}</td><td><div className="reader-library-row-actions"><button type="button" aria-label={`Ver ${item[1]}`} onClick={() => onAction(`Ver ${item[1]}`)}><LibraryIcon name="eye" size={16} /></button><button type="button" aria-label={`Descargar ${item[1]}`} onClick={() => onAction(`Descargar ${item[1]}`)}><LibraryIcon name="download" size={16} /></button><button className={favorites.has(item[0]) ? 'is-favorite' : ''} type="button" aria-label={`Favorito ${item[1]}`} onClick={() => toggleFavorite(item[0])}><LibraryIcon name="star" size={16} /></button></div></td></tr>)}</tbody></table>{!visibleDocuments.length && <p className="reader-library-empty">No se encontraron documentos con estos filtros.</p>}</div><footer><span>Mostrando 1 a {visibleDocuments.length} de {visibleDocuments.length === documents.length ? 48 : visibleDocuments.length} documentos</span><div><button type="button" disabled>«</button><button type="button" disabled>‹</button><button className="is-current" type="button">1</button><button type="button">2</button><button type="button">3</button><button type="button">4</button><button type="button">5</button><button type="button">›</button><button type="button">»</button></div><label>Filas por página <select><option>10</option><option>25</option></select></label></footer></section></main><aside className="reader-library-sidebar"><section className="reader-library-side-card"><header><h2><LibraryIcon name="star" size={18} /> Categorías destacadas</h2></header><ul>{categories.map((item) => <li key={item[0]}><LibraryIcon name={item[2]} size={16} /><span>{item[0]}</span><b>{item[1]}</b></li>)}</ul></section><section className="reader-library-side-card reader-library-recent"><header><h2><LibraryIcon name="clock" size={18} /> Documentos recientes</h2><button type="button" onClick={() => onAction('Todos los documentos recientes')}>Ver todos</button></header><div>{recent.map((item) => <article key={item[0]}><span className="reader-library-recent-icon"><LibraryIcon name="document" size={17} /></span><div><strong>{item[0]}</strong><span>{item[1]}</span><time>{item[6]}</time></div></article>)}</div></section></aside></div><footer className="editor-footer"><span>© 2024 Consultoría Alexandria. Todos los derechos reservados.</span><span>Versión 2.1.0</span></footer></div>
}

export default ReaderLibraryView
