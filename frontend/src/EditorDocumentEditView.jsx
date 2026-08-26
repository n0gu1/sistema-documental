import { useState } from 'react'
import './EditorDocumentEditView.css'

const initialChecklist = [
  ['Estructura del documento', true],
  ['Contenido y redacción', true],
  ['Referencias y normativas', true],
  ['Anexos y registros', true],
  ['Aprobación del responsable', false],
]

function EditIcon({ name, size = 18 }) {
  let content
  switch (name) {
    case 'arrow': content = <path d="M19 12H5m6-6-6 6 6 6" />; break
    case 'document': content = <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 12h7M9 16h7" /></>; break
    case 'calendar': content = <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></>; break
    case 'file': content = <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4" /></>; break
    case 'content': content = <><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 9h6m-6 4h6m-6 4h4" /></>; break
    case 'clip': content = <path d="m8 12 6.5-6.5a3 3 0 0 1 4 4L10 18a4 4 0 0 1-5.7-5.7l8-8" />; break
    case 'comment': content = <><path d="M4 5h16v11H8l-4 4V5Z" /><path d="M8 9h8m-8 3h5" /></>; break
    case 'flow': content = <><circle cx="6" cy="6" r="2" /><circle cx="18" cy="18" r="2" /><path d="M8 6h5a5 5 0 0 1 5 5v5" /></>; break
    case 'check': content = <path d="m7 12 3 3 7-7" />; break
    case 'eye': content = <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>; break
    case 'save': content = <><path d="M4 4h13l3 3v13H4z" /><path d="M8 4v6h8V4m-7 12h6" /></>; break
    case 'upload': content = <><path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M5 14v6h14v-6" /></>; break
    case 'send': content = <><path d="m21 3-7.5 18-3.5-7-7-3.5L21 3Z" /><path d="M10 14 21 3" /></>; break
    case 'paper': content = <path d="m21 3-7.5 18-3.5-7-7-3.5L21 3Z" />; break
    case 'chevron': content = <path d="m8 10 4 4 4-4" />; break
    case 'bold': content = <path d="M8 4h5a3 3 0 0 1 0 6H8zm0 6h6a3 3 0 0 1 0 6H8z" />; break
    case 'italic': content = <><path d="M10 4h8M6 20h8M14 4 10 20" /></>; break
    case 'underline': content = <><path d="M7 4v6a5 5 0 0 0 10 0V4M5 20h14" /></>; break
    case 'list': content = <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" /></>; break
    case 'undo': content = <><path d="M9 8 4 12l5 4" /><path d="M4 12h9a6 6 0 0 1 6 6" /></>; break
    default: content = <circle cx="12" cy="12" r="8" />
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function EditorDocumentEditView({ document, onBack, onAction }) {
  const [tab, setTab] = useState('Información general')
  const [title, setTitle] = useState(document.title)
  const [description, setDescription] = useState('Establece los principios y compromisos de la organización con la calidad, alcance del sistema y mejora continua.')
  const [classification, setClassification] = useState('Interna')
  const [area, setArea] = useState('Dirección de Calidad')
  const [keywords, setKeywords] = useState('calidad, política, compromiso, mejora continua')
  const [scope, setScope] = useState('Aplica a todos los procesos y colaboradores de Consultoría Alexandria.')
  const [content, setContent] = useState('La presente política establece el compromiso de Consultoría Alexandria con la calidad como eje fundamental para la generación de valor a nuestros clientes y partes interesadas.\n\nNos comprometemos a:\n\n• Cumplir con los requisitos aplicables.\n• Promover la mejora continua de nuestros procesos.\n• Fomentar una cultura de calidad en toda la organización.\n• Asignar los recursos necesarios para cumplir nuestros objetivos de calidad.')
  const [checklist, setChecklist] = useState(initialChecklist)
  const [comments, setComments] = useState([{ author: 'María González', text: 'Buen trabajo, por favor revisar el alcance del apartado 4.2 y ajustar la redacción final.', date: '24/05/2024 09:47', initials: 'MG' }])
  const [comment, setComment] = useState('')
  const completed = checklist.filter((item) => item[1]).length

  function updateChecklist(index) {
    setChecklist((current) => current.map((item, itemIndex) => itemIndex === index ? [item[0], !item[1]] : item))
  }

  function addComment(event) {
    event.preventDefault()
    if (!comment.trim()) return
    setComments((current) => [...current, { author: 'Carlos Méndez', text: comment.trim(), date: 'Ahora', initials: 'CM' }])
    setComment('')
    onAction('Comentario agregado correctamente.')
  }

  function saveDraft() {
    onAction('El borrador se guardó correctamente.')
  }

  return <div className="editor-edit-view">
    <header className="editor-edit-heading"><div><h1>Editar documento</h1><button type="button" onClick={onBack}><EditIcon name="arrow" size={17} /> Volver a documentos</button></div></header>
    <section className="editor-edit-summary"><span className="editor-edit-summary__icon"><EditIcon name="document" size={37} /></span><div className="editor-edit-summary__title"><h2>{title}</h2><span>Versión 3.0</span></div><dl><div><dt>Código</dt><dd>{document.code}</dd></div><div><dt>Área</dt><dd>{area}</dd></div><div><dt>Tipo</dt><dd>{document.type}</dd></div><div><dt>Versión</dt><dd>3.0</dd></div><div><dt>Estado</dt><dd><b>En revisión</b></dd></div><div><dt>Última actualización</dt><dd>23/05/2024 10:32<br />por Carlos Méndez</dd></div><div><dt>Revisor asignado</dt><dd><i>MG</i> María González</dd></div></dl></section>
    <div className="editor-edit-layout"><main className="editor-edit-main"><nav className="editor-edit-tabs" aria-label="Secciones del documento">{['Información general', 'Contenido', 'Anexos', 'Observaciones'].map((item) => <button className={tab === item ? 'is-active' : ''} type="button" key={item} onClick={() => setTab(item)}><EditIcon name={item === 'Información general' ? 'file' : item === 'Contenido' ? 'content' : item === 'Anexos' ? 'clip' : 'comment'} size={17} /> {item}</button>)}</nav>{tab === 'Información general' ? <section className="editor-edit-form"><div className="editor-edit-fields"><div><label>Título del documento <em>*</em><input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Descripción<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} /><small>{description.length}/500</small></label><label>Área responsable <em>*</em><select value={area} onChange={(event) => setArea(event.target.value)}><option>Dirección de Calidad</option><option>Dirección General</option><option>Administración</option><option>Auditoría</option></select></label><label>Responsable del documento <em>*</em><span className="editor-responsible"><i>CM</i><b>Carlos Méndez<small>Editor</small></b><EditIcon name="chevron" size={15} /></span></label></div><div><label>Código <em>*</em><input value={document.code} readOnly /></label><label>Clasificación<select value={classification} onChange={(event) => setClassification(event.target.value)}><option>Interna</option><option>Pública</option><option>Confidencial</option></select></label><label>Tipo de documento<select value={document.type} readOnly><option>{document.type}</option></select></label><label>Palabras clave<input value={keywords} onChange={(event) => setKeywords(event.target.value)} /></label><label>Alcance<textarea value={scope} onChange={(event) => setScope(event.target.value)} maxLength={300} /><small>{scope.length}/300</small></label></div></div><label className="editor-content-label">Resumen / contenido principal <em>*</em><div className="editor-rich-toolbar">{['bold', 'italic', 'underline', 'list'].map((item) => <button type="button" key={item} onClick={() => onAction(`Formato ${item} seleccionado.`)}><EditIcon name={item} size={16} /></button>)}<span /><button type="button" onClick={() => setContent('')}><EditIcon name="undo" size={16} /></button></div><textarea className="editor-content-area" value={content} onChange={(event) => setContent(event.target.value)} /><small className="editor-word-count">{content.trim().split(/\s+/).filter(Boolean).length} palabras</small></label></section> : <section className="editor-edit-placeholder"><span>{tab === 'Contenido' ? 'C' : tab === 'Anexos' ? 'A' : 'O'}</span><h2>{tab}</h2><p>Esta sección queda lista para completar el contenido del documento desde el frontend.</p><button type="button" onClick={() => setTab('Información general')}>Volver a información general</button></section>}</main>
      <aside className="editor-edit-sidebar"><section className="editor-edit-side-card"><h2>Estado del documento</h2><dl><div><dt>Estado actual</dt><dd><b>En revisión</b></dd></div><div><dt>Etapa</dt><dd>Revisión interna</dd></div><div><dt>Desde</dt><dd>24/05/2024 09:15</dd></div><div><dt>Próximo paso</dt><dd>Revisión de Calidad</dd></div></dl><button type="button" onClick={() => onAction('El flujo del documento está disponible.')}> <EditIcon name="flow" size={16} /> Ver flujo del documento</button></section><section className="editor-edit-side-card"><header><h2>Checklist de revisión interna</h2><span>{completed} de {checklist.length} completados</span></header><div className="editor-check-progress"><i style={{ width: `${(completed / checklist.length) * 100}%` }} /></div><ul>{checklist.map((item, index) => <li key={item[0]}><button className={item[1] ? 'is-done' : 'is-pending'} type="button" aria-label={`${item[1] ? 'Marcar pendiente' : 'Completar'} ${item[0]}`} onClick={() => updateChecklist(index)}><EditIcon name="check" size={13} /></button><span>{item[0]}</span><b>{item[1] ? 'Cumple' : 'Pendiente'}</b></li>)}</ul></section><section className="editor-edit-side-card editor-edit-comments"><h2>Comentarios del revisor</h2>{comments.map((item, index) => <article key={`${item.author}-${index}`}><i>{item.initials}</i><div><strong>{item.author}</strong><time>{item.date}</time><p>{item.text}</p>{index === 0 && <button type="button" onClick={() => onAction('Respuesta lista para enviar.')}>Responder</button>}</div></article>)}<form onSubmit={addComment}><input aria-label="Escribe un comentario" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Escribe un comentario..." /><button type="submit" aria-label="Enviar comentario"><EditIcon name="paper" size={17} /></button></form></section></aside></div>
    <footer className="editor-edit-actions"><span><EditIcon name="check" size={21} /><b>Borrador guardado<small>Hoy, 10:32</small></b></span><div><button type="button" onClick={() => onAction('La vista previa está disponible.')}><EditIcon name="eye" size={17} /> Vista previa</button><button type="button" onClick={saveDraft}><EditIcon name="save" size={17} /> Guardar borrador</button><button type="button" onClick={() => onAction('Se inició la carga de una nueva versión.')}><EditIcon name="upload" size={17} /> Subir nueva versión</button><button className="is-primary" type="button" onClick={() => onAction('El documento fue enviado a revisión.')}><EditIcon name="send" size={17} /> Enviar a revisión <EditIcon name="chevron" size={15} /></button></div></footer>
  </div>
}

export default EditorDocumentEditView
