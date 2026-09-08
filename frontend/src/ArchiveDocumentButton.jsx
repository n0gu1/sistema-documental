import { useRef, useState } from 'react'
import { PermissionButton } from './Permissions'
import { apiRequest } from './documentApi'
import './ArchiveDocumentButton.css'

export default function ArchiveDocumentButton({ document, onArchived }) {
  const dialog = useRef(null)
  const busy = useRef(false)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function archive(event) {
    event.preventDefault()
    if (busy.current || !reason.trim()) return
    busy.current = true
    setSaving(true)
    setError('')
    try {
      await apiRequest(`/api/documents/${document.id}/archive/`, { method: 'POST', body: { reason: reason.trim() } })
      dialog.current.close()
      onArchived(document)
    } catch (failure) {
      setError(failure.message)
    } finally {
      busy.current = false
      setSaving(false)
    }
  }
  return <>
    <PermissionButton permission="documentos.eliminar" type="button" title="Archivar documento" aria-label={`Archivar ${document.title}`} onClick={() => { setError(''); dialog.current.showModal() }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 8h16v12H4zM3 4h18v4H3zM9 12h6" /></svg></PermissionButton>
    <dialog className="archive-document-dialog" ref={dialog} aria-label={`Archivar documento ${document.code}`} onCancel={event => { if (busy.current) event.preventDefault() }}>
      <form onSubmit={archive}>
        <h2>Archivar documento</h2>
        <p>{document.code} — {document.title}</p>
        <p>Dejará de aparecer en el listado normal. Sus archivos e historial se conservarán.</p>
        <label>Motivo del archivo<textarea required value={reason} disabled={saving} onChange={event => setReason(event.target.value)} /></label>
        {error && <p role="alert">{error}</p>}
        <footer>
          <button type="button" disabled={saving} onClick={() => dialog.current.close()}>Cancelar</button>
          <PermissionButton permission="documentos.eliminar" type="submit" disabled={saving || !reason.trim()}>{saving ? 'Archivando...' : 'Confirmar archivo'}</PermissionButton>
        </footer>
      </form>
    </dialog>
  </>
}
