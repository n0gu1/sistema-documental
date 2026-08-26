import { useDeferredValue, useState } from 'react'
import './ReaderFavoritesView.css'

const favorites = [
  ['POL-002', 'Política de Seguridad de la Información', 'Seguridad de la Información', '1.2', '23/05/2024 10:32', true],
  ['PRO-005', 'Proceso de Compras', 'Compras y Contrataciones', '2.0', '23/05/2024 09:18', true],
  ['INS-007', 'Instructivo de Auditoría Interna', 'Auditoría Interna', '1.0', '22/05/2024 16:45', true],
  ['FOR-012', 'Formato de Solicitud', 'Administrativa', '1.1', '20/05/2024 14:07', true],
  ['POL-001', 'Política de Calidad', 'Calidad', 'En revisión', '20/05/2024 11:05', false],
  ['PRO-008', 'Control de Registros', 'Gestión Documental', '1.3', '17/05/2024 09:36', true],
  ['INS-010', 'Instructivo para Gestión de No Conformidades', 'Calidad', '1.1', '16/05/2024 15:20', false],
  ['FOR-015', 'Formato de Evaluación de Proveedores', 'Compras y Contrataciones', '0.1', '15/05/2024 10:08', true],
]

const tags = [['Políticas', '8'], ['Procedimientos', '7'], ['Instructivos', '6'], ['Formatos', '5'], ['Calidad', '4'], ['Seguridad de la Información', '3'], ['Auditoría', '2'], ['Administrativa', '1']]

function FavoriteIcon({ name, size = 19 }) {
  const content = name === 'download' ? <><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 18v3h16v-3" /></> : name === 'share' ? <><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.3 10.8 7.4-4.5M8.3 13.2l7.4 4.5" /></> : name === 'eye' ? <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></> : name === 'filter' ? <path d="M4 5h16l-6 7v6l-4 2v-8L4 5Z" /> : name === 'calendar' ? <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></> : <path d="m12 3 2.8 5.8 6.2.9-4.5 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.7l6.2-.9L12 3Z" />
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={name === 'star' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function FavoriteMetric({ icon, tone, label, value, detail, suffix = '' }) {
  return <article className="reader-favorite-metric"><span className={`reader-favorite-metric-icon is-${tone}`}><FavoriteIcon name={icon} size={30} /></span><div><span>{label}</span><strong>{value} <small>{suffix}</small></strong><em>↑ <b>{detail}</b> vs. mes anterior</em></div></article>
}

function ReaderFavoritesView({ onAction }) {
  const [area, setArea] = useState('Todas')
  const [type, setType] = useState('Todos')
  const [status, setStatus] = useState('Todos')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState(favorites)
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())
  const visible = items.filter((item) => (!deferredQuery || item.join(' ').toLowerCase().includes(deferredQuery)) && (area === 'Todas' || item[2].includes(area)) && (status === 'Todos' || (status === 'Vigente' ? item[5] : item[3] === status)))
  function removeFavorite(code) { setItems((current) => current.filter((item) => item[0] !== code)); onAction('Documento retirado de favoritos.') }
  function clearFilters() { setArea('Todas'); setType('Todos'); setStatus('Todos'); setQuery(''); onAction('Filtros limpiados') }
  return <div className="reader-favorites"><header className="reader-favorites-heading"><div><h1>Mis favoritos</h1><p>Accede rápidamente a los documentos que marcaste como favoritos.</p></div><time><FavoriteIcon name="calendar" size={20} /> 23 de mayo de 2024</time></header><section className="reader-favorite-metrics"><FavoriteMetric icon="star" tone="blue" label="Total de favoritos" value="36" suffix="Documentos" detail="12%" /><FavoriteMetric icon="clock" tone="orange" label="Favoritos recientes" value="8" suffix="Últimos 7 días" detail="14%" /><FavoriteMetric icon="chart" tone="purple" label="Documentos más consultados" value="15" suffix="Veces consultados" detail="18%" /><FavoriteMetric icon="download" tone="green" label="Descargas" value="22" suffix="Este mes" detail="22%" /></section><section className="reader-favorites-filters"><label><span>Área</span><select value={area} onChange={(event) => setArea(event.target.value)}><option>Todas</option><option>Seguridad</option><option>Compras</option><option>Auditoría</option><option>Calidad</option><option>Administrativa</option></select></label><label><span>Tipo</span><select value={type} onChange={(event) => setType(event.target.value)}><option>Todos</option><option>Política</option><option>Procedimiento</option><option>Instructivo</option><option>Formato</option></select></label><label><span>Estado</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option>Todos</option><option>Vigente</option><option>En revisión</option></select></label><label className="reader-favorites-date"><span>Fecha</span><div><FavoriteIcon name="calendar" size={16} /><input type="text" placeholder="Desde    –    Hasta" /></div></label><button type="button" onClick={clearFilters}><FavoriteIcon name="filter" size={16} /> Limpiar filtros</button></section><section className="reader-favorites-content"><main className="reader-favorites-table-card"><div className="reader-favorites-table-wrap"><table><thead><tr><th></th><th>Código</th><th>Nombre del documento</th><th>Área</th><th>Versión</th><th>Última consulta ↓</th><th>Acciones</th></tr></thead><tbody>{visible.map((item) => <tr key={item[0]}><td><button className="reader-favorite-star" type="button" aria-label={`Quitar ${item[1]} de favoritos`} onClick={() => removeFavorite(item[0])}><FavoriteIcon name="star" size={19} /></button></td><td><b>{item[0]}</b></td><td>{item[1]}</td><td>{item[2]}</td><td><span className={item[5] ? 'reader-favorite-version' : 'reader-favorite-review'}>{item[3]}</span></td><td>{item[4]}<br /><small>por Ana López</small></td><td><div><button type="button" aria-label={`Ver ${item[1]}`} onClick={() => onAction(`Ver ${item[1]}`)}><FavoriteIcon name="eye" size={17} /></button><button type="button" aria-label={`Descargar ${item[1]}`} onClick={() => onAction(`Descargar ${item[1]}`)}><FavoriteIcon name="download" size={17} /></button><button className="is-star" type="button" aria-label={`Favorito ${item[1]}`} onClick={() => removeFavorite(item[0])}><FavoriteIcon name="star" size={17} /></button><button type="button" aria-label={`Compartir ${item[1]}`} onClick={() => onAction(`Compartir ${item[1]}`)}><FavoriteIcon name="share" size={17} /></button></div></td></tr>)}</tbody></table>{!visible.length && <p className="reader-favorites-empty">No hay favoritos que coincidan con los filtros.</p>}</div><footer><span>Mostrando 1 a {visible.length} de 36 documentos</span><div><button type="button">«</button><button type="button">‹</button><button className="is-current" type="button">1</button><button type="button">2</button><button type="button">3</button><button type="button">4</button><button type="button">5</button><button type="button">›</button><button type="button">»</button></div><label>Filas por página <select><option>10</option><option>25</option></select></label></footer></main><aside className="reader-favorites-tags"><h2><FavoriteIcon name="tag" size={21} /> Mis etiquetas favoritas</h2><ul>{tags.map((tag) => <li key={tag[0]}><span>{tag[0]}</span><b>{tag[1]}</b></li>)}</ul><button type="button" onClick={() => onAction('Todas las etiquetas')}>Ver todas las etiquetas&nbsp; →</button></aside></section><footer className="editor-footer"><span>© 2024 Consultoría Alexandria. Todos los derechos reservados.</span><span>Versión 2.1.0</span></footer></div>
}

export default ReaderFavoritesView
