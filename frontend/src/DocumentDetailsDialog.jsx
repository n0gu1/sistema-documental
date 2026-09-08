import { useEffect, useState } from 'react'
import { apiRequest } from './api'
import { PermissionButton } from './Permissions'
import './DocumentsView.css'

export default function DocumentDetailsDialog({ documentId, onClose, onEdit, onHistory }) {
  const [document, setDocument] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    apiRequest(`/api/documents/${documentId}/`)
      .then(data => { if (active) setDocument(data.document) })
      .catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [documentId])

  return <div className="documents-modal" role="dialog" aria-modal="true" aria-labelledby="document-fields-title" data-document-id={documentId}>
    <form onSubmit={event => { event.preventDefault(); onClose() }}>
      <header><h2 id="document-fields-title">Campos documentales</h2><button type="button" aria-label="Cerrar" onClick={onClose}>×</button></header>
      {error ? <p role="alert">{error}</p> : !document ? <p>Cargando documento...</p> : <>
        <p>{document.code} · {document.title}</p>
        <label>Fecha documental<input type="date" value={document.date || ''} readOnly /></label>
        <label>Clasificación<input value={document.metadata?.classification || ''} readOnly /></label>
        <label>Observaciones<textarea value={document.metadata?.observations || ''} readOnly /></label>
      </>}
      <footer>
        <PermissionButton permission="documentos.modificar" type="button" disabled={!document} onClick={onEdit}>Editar documento</PermissionButton>
        <PermissionButton permission="versiones.consultar" type="button" disabled={!document} onClick={onHistory}>Ver historial</PermissionButton>
        <button type="submit">Cerrar</button>
      </footer>
    </form>
  </div>
}
