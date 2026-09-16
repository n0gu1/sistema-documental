import { useState } from 'react'
import { PermissionButton } from './Permissions'
import { apiRequest } from './documentApi'

function RestoreIcon({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8v5h5" /><path d="M5.5 16A8 8 0 1 0 4.3 7.5L4 13" /></svg>
}

export default function RestoreVersionButton({ documentId, version, onRestored }) {
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  async function restore() {
    if (pending) return
    setPending(true)
    setError('')
    setNotice('')
    try {
      const result = await apiRequest(`/api/documents/${documentId}/versions/${version.id}/restore/`, {
        method: 'POST', body: { version_type: 'minor' },
      })
      setNotice(`Contenido de ${version.version} restaurado como nueva versión ${result.version.version}.`)
      onRestored?.(result.version)
    } catch (requestError) { setError(requestError.message) }
    finally { setPending(false) }
  }

  return <div><PermissionButton permission="versiones.restaurar" className="restore-version-button" type="button" disabled={pending || version.is_current} onClick={restore} aria-label={`Restaurar versión ${version.version}`} title="Crea una versión menor nueva con este contenido; conserva las versiones anteriores."><RestoreIcon /></PermissionButton>{notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}</div>
}
