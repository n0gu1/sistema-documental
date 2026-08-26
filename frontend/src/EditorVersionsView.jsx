import { useState } from 'react'
import './EditorVersionsView.css'

const versions = [
  { version: '1.4', date: '23/05/2024 10:32', status: 'En revisión', tone: 'review', size: '245 KB', comment: 'Se actualizan objetivos de calidad y responsabilidades.' },
  { version: '1.3', date: '03/05/2024 14:18', status: 'Aprobado', tone: 'approved', size: '238 KB', comment: 'Revisión de indicadores y alcance del SGC.' },
  { version: '1.2', date: '18/04/2024 09:45', status: 'Aprobado', tone: 'approved', size: '220 KB', comment: 'Se ajusta política según hallazgos de auditoría.' },
  { version: '1.1', date: '05/04/2024 11:20', status: 'Borrador', tone: 'draft', size: '210 KB', comment: 'Primera revisión del contenido y estructura.' },
  { version: '1.0', date: '20/03/2024 16:05', status: 'Publicado', tone: 'published', size: '198 KB', comment: 'Versión inicial del documento.' },
]

const compareOptions = ['1.4 (23/05/2024)', '1.3 (03/05/2024)', '1.2 (18/04/2024)', '1.1 (05/04/2024)', '1.0 (20/03/2024)']

const initialComments = [
  { author: 'María González', role: 'Revisor de Calidad', date: '23/05/2024 11:15', initials: 'MG', tone: 'pink', text: 'Se ve bien el ajuste de los objetivos.', detail: 'Sugerencia: agregar referencia al mapa de procesos.', state: 'Nuevo', stateTone: 'new' },
  { author: 'Jorge Ramírez', role: 'Compras', date: '23/05/2024 10:50', initials: 'JR', tone: 'navy', text: 'Confirmo que los cambios relacionados con compras están correctos.', detail: '', state: 'Resuelto', stateTone: 'resolved' },
  { author: 'Lucía Fernández', role: 'Auditor Interno', date: '22/05/2024 16:30', initials: 'LF', tone: 'pink', text: 'En la sección 7.2 se elimina una actividad que aún está en ejecución.', detail: 'Validar antes de enviar a revisión.', state: 'Pendiente', stateTone: 'pending' },
]

function VersionIcon({ name, size = 18 }) {
  let content
  switch (name) {
    case 'document': content = <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 12h7M9 16h5" /></>; break
    case 'upload': content = <><path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M5 14v6h14v-6" /></>; break
    case 'compare': content = <><path d="M7 4v16M17 4v16M3 8h8M13 16h8" /><path d="m4 8 3-3 3 3m4 8 3 3 3-3" /></>; break
    case 'download': content = <><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 18v3h16v-3" /></>; break
    case 'more': content = <><circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" /></>; break
    case 'calendar': content = <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></>; break
    case 'eye': content = <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>; break
    case 'swap': content = <><path d="M7 7h12m0 0-3-3m3 3-3 3M17 17H5m0 0 3 3m-3-3 3-3" /></>; break
    case 'comment': content = <><path d="M4 5h16v11H8l-4 4V5Z" /><path d="M8 9h8m-8 3h5" /></>; break
    case 'paperclip': content = <path d="m8 12 6.5-6.5a3 3 0 0 1 4 4L10 18a4 4 0 0 1-5.7-5.7l8-8" />; break
    case 'send': content = <><path d="m21 3-7.5 18-3.5-7-7-3.5L21 3Z" /><path d="M10 14 21 3" /></>; break
    case 'chevron': content = <path d="m8 10 4 4 4-4" />; break
    default: content = <circle cx="12" cy="12" r="8" />
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function VersionStatus({ tone, children }) {
  return <span className={`editor-versions-status editor-versions-status--${tone}`}><i /> {children}</span>
}

function EditorVersionsView() {
  const [previousVersion, setPreviousVersion] = useState(compareOptions[1])
  const [currentVersion, setCurrentVersion] = useState(compareOptions[0])
  const [comments, setComments] = useState(initialComments)
  const [comment, setComment] = useState('')
  const [commentTab, setCommentTab] = useState('Todos')
  const [notice, setNotice] = useState('')

  function swapVersions() {
    setPreviousVersion(currentVersion)
    setCurrentVersion(previousVersion)
  }

  function publishComment(event) {
    event.preventDefault()
    if (!comment.trim()) return
    setComments((current) => [{ author: 'Carlos Méndez', role: 'Editor', date: 'Ahora', initials: 'CM', tone: 'blue', text: comment.trim(), detail: '', state: 'Nuevo', stateTone: 'new' }, ...current])
    setComment('')
    setNotice('Comentario publicado correctamente.')
  }

  const visibleComments = commentTab === 'Mis comentarios' ? comments.filter((item) => item.author === 'Carlos Méndez') : comments

  return <div className="editor-versions-view">
    <header className="editor-versions-heading"><div><h1>Mis versiones</h1><p>Consulta y gestiona el historial de versiones del documento seleccionado.</p></div><time><VersionIcon name="calendar" size={17} /> 23 de mayo de 2024</time></header>
    <section className="editor-versions-document"><span className="editor-versions-document-icon"><VersionIcon name="document" size={42} /></span><div className="editor-versions-document-info"><h2>Política de Calidad</h2><dl><div><dt>Código</dt><dd>POL-001</dd></div><div><dt>Área</dt><dd>Dirección de Calidad</dd></div><div><dt>Versión actual</dt><dd><b>1.4</b></dd></div><div><dt>Estado</dt><dd><VersionStatus tone="review">En revisión</VersionStatus></dd></div><div><dt>Última actualización</dt><dd>23/05/2024 10:32<br />por Carlos Méndez</dd></div></dl></div><div className="editor-versions-document-actions"><button className="is-primary" type="button" onClick={() => setNotice('La carga de una nueva versión está disponible en esta vista frontend.')}><VersionIcon name="upload" size={17} /> Subir nueva versión</button><button type="button" onClick={() => setNotice('Se actualizó la comparación de versiones.')}><VersionIcon name="compare" size={17} /> Comparar versiones</button><button type="button" onClick={() => setNotice('Se preparó la descarga del documento.')}><VersionIcon name="download" size={17} /> Descargar</button><button type="button" className="editor-versions-more" aria-label="Más acciones" onClick={() => setNotice('Más acciones del documento.') }><VersionIcon name="more" size={17} /></button></div></section>
    <div className="editor-versions-layout"><main><section className="editor-versions-panel editor-versions-history"><header><h2>Historial de versiones</h2></header><div className="editor-versions-table-scroll"><table><thead><tr><th>Versión</th><th>Fecha</th><th>Estado</th><th>Tamaño</th><th>Comentario</th><th>Acciones</th></tr></thead><tbody>{versions.map((item) => <tr key={item.version}><td><button type="button" onClick={() => setNotice(`Se seleccionó la versión ${item.version}.`)}>{item.version}</button></td><td>{item.date}</td><td><VersionStatus tone={item.tone}>{item.status}</VersionStatus></td><td>{item.size}</td><td>{item.comment}</td><td><div className="editor-versions-row-actions"><button type="button" aria-label={`Ver versión ${item.version}`} onClick={() => setNotice(`Vista previa de la versión ${item.version}.`)}><VersionIcon name="eye" size={16} /></button><button type="button" aria-label={`Descargar versión ${item.version}`} onClick={() => setNotice(`Descarga de la versión ${item.version}.`)}><VersionIcon name="download" size={16} /></button><button type="button" aria-label={`Más acciones de versión ${item.version}`} onClick={() => setNotice(`Más acciones de la versión ${item.version}.`)}><VersionIcon name="more" size={16} /></button></div></td></tr>)}</tbody></table></div><footer><span>Mostrando 1 a 5 de 5 versiones</span><div><button type="button" disabled>‹</button><button className="is-current" type="button">1</button><button type="button" disabled>›</button></div></footer></section><section className="editor-versions-panel editor-versions-compare"><header><h2>Comparar versiones</h2><div className="editor-versions-legend"><span className="is-addition">Adición</span><span className="is-modification">Modificación</span><span className="is-deletion">Eliminación</span></div></header><div className="editor-versions-compare-controls"><label><span>Versión anterior</span><select value={previousVersion} onChange={(event) => setPreviousVersion(event.target.value)}>{compareOptions.map((option) => <option key={option}>{option}</option>)}</select></label><button type="button" aria-label="Intercambiar versiones" onClick={swapVersions}><VersionIcon name="swap" size={17} /></button><label><span>Versión actual</span><select value={currentVersion} onChange={(event) => setCurrentVersion(event.target.value)}>{compareOptions.map((option) => <option key={option}>{option}</option>)}</select></label></div><div className="editor-versions-diff"><div><header>Versión {previousVersion}</header><p><strong>5. Responsabilidades</strong></p><p>La Dirección de Calidad es responsable de establecer, implementar y <mark className="is-modification">mantener</mark> el Sistema de Gestión de la Calidad.</p><p className="is-deletion">Los líderes de proceso deben asegurar el cumplimiento de los requisitos del cliente y los legales aplicables.</p><p>Todo el personal debe cumplir con las políticas y procedimientos establecidos.</p></div><div><header>Versión {currentVersion}</header><p><strong>5. Responsabilidades</strong></p><p>La Dirección de Calidad es responsable de establecer, implementar, mantener <mark className="is-addition">y mejorar continuamente</mark> el Sistema de Gestión de la Calidad.</p><p className="is-addition">Los líderes de proceso deben asegurar la eficacia de los procesos, promoviendo la mejora continua.</p><p>Todo el personal debe cumplir con las políticas, procedimientos <mark className="is-addition">y objetivos de calidad</mark> establecidos.</p></div></div></section></main><aside className="editor-versions-comments"><header><h2>Comentarios y notas</h2><nav><button className={commentTab === 'Todos' ? 'is-active' : ''} type="button" onClick={() => setCommentTab('Todos')}>Todos</button><button className={commentTab === 'Mis comentarios' ? 'is-active' : ''} type="button" onClick={() => setCommentTab('Mis comentarios')}>Mis comentarios</button></nav></header><div className="editor-versions-comment-list">{visibleComments.map((item, index) => <article key={`${item.author}-${index}`}><span className={`editor-versions-avatar is-${item.tone}`}>{item.initials}</span><div><header><strong>{item.author}</strong><time>{item.date}</time><small>{item.role}</small></header><p>{item.text}</p>{item.detail && <b>{item.detail}</b>}<em className={`is-${item.stateTone}`}>{item.state}</em></div></article>)}</div><form onSubmit={publishComment}><div><input aria-label="Escribe un comentario" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Escribe un comentario..." /><button type="button" aria-label="Adjuntar archivo" onClick={() => setNotice('Adjuntar archivos está disponible en esta vista frontend.')}><VersionIcon name="paperclip" size={17} /></button></div><button className="is-primary" type="submit"><VersionIcon name="send" size={15} /> Publicar comentario</button></form></aside></div>
    <span className="editor-versions-notice" role="status">{notice}</span><footer className="editor-versions-footer"><span>© 2024 Consultoría Alexandria. Todos los derechos reservados.</span><span>Versión 2.1.0</span></footer>
  </div>
}

export default EditorVersionsView
