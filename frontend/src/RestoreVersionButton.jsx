import { useState } from 'react'
import { PermissionButton } from './Permissions'
import { apiRequest } from './documentApi'

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

  return <div><PermissionButton permission="versiones.restaurar" type="button" disabled={pending || version.is_current} onClick={restore} aria-label={`Restaurar versión ${version.version}`} title="Crea una versión menor nueva con este contenido; conserva las versiones anteriores.">{pending ? 'Restaurando…' : 'Restaurar como nueva versión'}</PermissionButton>{notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}</div>
}
