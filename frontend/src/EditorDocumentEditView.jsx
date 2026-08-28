import { useEffect, useState } from 'react'
import { apiRequest, formatDate } from './documentApi'
import DocumentPermissionsPanel from './DocumentPermissionsPanel'
import './EditorDocumentEditView.css'

function EditIcon({ name, size = 18 }) {
  const content = name === 'arrow' ? <path d="M19 12H5m6-6-6 6 6 6" /> : name === 'document' ? <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 12h7M9 16h7" /></> : name === 'calendar' ? <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></> : name === 'save' ? <><path d="M4 4h13l3 3v13H4z" /><path d="M8 4v6h8V4m-7 12h6" /></> : name === 'eye' ? <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></> : name === 'flow' ? <><circle cx="6" cy="6" r="2" /><circle cx="18" cy="18" r="2" /><path d="M8 6h5a5 5 0 0 1 5 5v5" /></> : name === 'chevron' ? <path d="m8 10 4 4 4-4" /> : name === 'file' ? <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4" /></> : <circle cx="12" cy="12" r="8" />
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function LegacyEditorDocumentEditView({ document, onBack, onAction }) {
  const [loadedDocument, setLoadedDocument] = useState(document || {})
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [title, setTitle] = useState(document?.title || '')
  const [description, setDescription] = useState(document?.description || '')
  const [classification, setClassification] = useState('')
  const [keywords, setKeywords] = useState('')
  const [scope, setScope] = useState('')
  const [tab, setTab] = useState('Información general')

  useEffect(() => {
    if (!document?.id) return undefined
    let active = true
    apiRequest(`/api/documents/${document.id}/`)
      .then((data) => {
        if (!active) return
        const value = data.document || {}
        setLoadedDocument(value)
        setTitle(value.title || '')
        setDescription(value.description || '')
        setClassification(value.metadata?.classification || '')
        setKeywords(value.metadata?.keywords || '')
        setScope(value.metadata?.scope || '')
      })
      .catch((requestError) => { if (active) setLoadError(requestError.message) })
    return () => { active = false }
  }, [document?.id])

  async function saveDraft() {
    if (!document?.id) return onAction('No se encontró el documento seleccionado.')
    setSaveError('')
    try {
      const data = await apiRequest(`/api/documents/${document.id}/`, { method: 'PATCH', body: { title, description, metadata: { ...(loadedDocument.metadata || {}), classification, keywords, scope } } })
      setLoadedDocument(data.document || loadedDocument)
      onAction('El borrador se guardó correctamente.')
    } catch (requestError) { setSaveError(requestError.message) }
  }

  if (!document?.id) return <div className="editor-edit-view"><p className="editor-empty">Selecciona un documento para editarlo.</p></div>
  const currentVersion = loadedDocument.files?.find((file) => file.is_current) || loadedDocument.version
  const currentVersionLabel = typeof currentVersion === 'string' ? currentVersion : currentVersion?.version || '—'
  const responsible = loadedDocument.responsible?.name || '—'
  const status = loadedDocument.status?.name || '—'

  return <div className="editor-edit-view"><header className="editor-edit-heading"><div><h1>Editar documento</h1><button type="button" onClick={onBack}><EditIcon name="arrow" size={17} /> Volver a documentos</button></div></header>{(loadError || saveError) && <p className="editor-error" role="alert">{loadError || saveError}</p>}
    <section className="editor-edit-summary"><span className="editor-edit-summary__icon"><EditIcon name="document" size={37} /></span><div className="editor-edit-summary__title"><h2>{title || 'Sin título'}</h2><span>Versión {currentVersionLabel}</span></div><dl><div><dt>Código</dt><dd>{loadedDocument.code || '—'}</dd></div><div><dt>Área</dt><dd>{loadedDocument.area?.name || '—'}</dd></div><div><dt>Tipo</dt><dd>{loadedDocument.type?.name || '—'}</dd></div><div><dt>Versión</dt><dd>{currentVersionLabel}</dd></div><div><dt>Estado</dt><dd><b>{status}</b></dd></div><div><dt>Última actualización</dt><dd>{formatDate(loadedDocument.updated_at)}<br />por {responsible}</dd></div><div><dt>Revisor asignado</dt><dd>{loadedDocument.reviewer?.name || '—'}</dd></div></dl></section>
    <div className="editor-edit-layout"><main className="editor-edit-main"><nav className="editor-edit-tabs" aria-label="Secciones del documento">{['Información general', 'Contenido', 'Anexos', 'Observaciones'].map((item) => <button className={tab === item ? 'is-active' : ''} type="button" key={item} onClick={() => setTab(item)}><EditIcon name={item === 'Información general' ? 'file' : item === 'Contenido' ? 'document' : item === 'Anexos' ? 'document' : 'flow'} size={17} /> {item}</button>)}</nav>{tab === 'Información general' ? <section className="editor-edit-form"><div className="editor-edit-fields"><div><label>Título del documento <em>*</em><input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Descripción<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} /><small>{description.length}/500</small></label><label>Área responsable<span className="editor-responsible"><i>{(loadedDocument.area?.name || '—').slice(0, 2).toUpperCase()}</i><b>{loadedDocument.area?.name || '—'}</b></span></label><label>Responsable del documento<span className="editor-responsible"><i>{responsible.split(' ').map((part) => part[0]).join('').slice(0, 2) || '—'}</i><b>{responsible}</b></span></label></div><div><label>Código <input value={loadedDocument.code || ''} readOnly /></label><label>Clasificación<input value={classification} onChange={(event) => setClassification(event.target.value)} placeholder="Sin clasificación registrada" /></label><label>Tipo de documento<input value={loadedDocument.type?.name || ''} readOnly /></label><label>Palabras clave<input value={keywords} onChange={(event) => setKeywords(event.target.value)} placeholder="Sin palabras clave registradas" /></label><label>Alcance<textarea value={scope} onChange={(event) => setScope(event.target.value)} maxLength={300} placeholder="Sin alcance registrado" /><small>{scope.length}/300</small></label></div></div></section> : <section className="editor-edit-form"><p className="editor-empty">Esta sección no tiene datos disponibles en el backend.</p></section>}</main>
      <aside className="editor-edit-sidebar"><section className="editor-edit-side-card"><h2>Estado del documento</h2><dl><div><dt>Estado actual</dt><dd><b>{status}</b></dd></div><div><dt>Última actualización</dt><dd>{formatDate(loadedDocument.updated_at)}</dd></div><div><dt>Responsable</dt><dd>{responsible}</dd></div><div><dt>Revisor asignado</dt><dd>{loadedDocument.reviewer?.name || '—'}</dd></div></dl><button type="button" onClick={() => onAction('El flujo del documento no está disponible en el backend actual.')}><EditIcon name="flow" size={16} /> Ver flujo del documento</button></section><section className="editor-edit-side-card"><header><h2>Checklist de revisión interna</h2><span>Sin datos registrados</span></header><div className="editor-check-progress"><i style={{ width: '0%' }} /></div><p className="editor-empty">No hay checklist asociado a este documento.</p></section><section className="editor-edit-side-card editor-edit-comments"><h2>Comentarios del revisor</h2><p className="editor-empty">No hay comentarios registrados.</p></section></aside></div>
    <footer className="editor-edit-actions"><span><EditIcon name="check" size={21} /><b>Estado sincronizado<small>{formatDate(loadedDocument.updated_at)}</small></b></span><div><button type="button" onClick={() => loadedDocument.files?.find((file) => file.is_current)?.preview_url && window.open(loadedDocument.files.find((file) => file.is_current).preview_url, '_blank', 'noopener,noreferrer')}><EditIcon name="eye" size={17} /> Vista previa</button><button type="button" onClick={saveDraft}><EditIcon name="save" size={17} /> Guardar borrador</button><button type="button" onClick={() => onAction('La carga de una nueva versión requiere seleccionar un archivo.')}><EditIcon name="document" size={17} /> Subir nueva versión</button><button className="is-primary" type="button" onClick={() => onAction('El envío a revisión requiere el flujo documental del backend.')}><EditIcon name="flow" size={17} /> Enviar a revisión</button></div></footer>
  </div>
}

function EditorDocumentEditView(props) {
  if (!props.document?.id) return <LegacyEditorDocumentEditView {...props} />
  return <><LegacyEditorDocumentEditView {...props} /><section className="editor-permissions-shell"><DocumentPermissionsPanel documentId={props.document.id} onAction={props.onAction} /></section></>
}

export default EditorDocumentEditView
