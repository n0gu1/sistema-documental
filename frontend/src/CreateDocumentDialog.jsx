import { useState } from 'react'
import { PermissionForm } from './Permissions'
import { apiRequest } from './api'
import './DocumentsView.css'
import DocumentMetadataFields from './DocumentMetadataFields'

export default function CreateDocumentDialog({ catalogs, onClose, onCreated }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    if (saving) return
    const body = new FormData(event.currentTarget)
    if (!body.get('file')?.name) body.delete('file')
    if (!body.get('date')) body.delete('date')
    body.set('metadata', JSON.stringify({ classification: body.get('classification'), observations: body.get('observations') }))
    body.delete('classification')
    body.delete('observations')
    body.set('code', String(body.get('code')).trim().toUpperCase())
    setSaving(true)
    setError('')
    try {
      const data = await apiRequest('/api/documents/', { method: 'POST', body })
      onCreated(data.document)
    } catch (requestError) {
      setError(requestError.message)
      setSaving(false)
    }
  }

  return <div className="documents-modal" role="dialog" aria-modal="true" aria-labelledby="create-document-title">
    <PermissionForm permission="documentos.crear" onSubmit={submit}>
      <header><h2 id="create-document-title">Crear documento</h2><button type="button" aria-label="Cerrar" disabled={saving} onClick={onClose}>×</button></header>
      {error && <p role="alert">{error}</p>}
      <label>Código<input name="code" required maxLength={64} pattern="[A-Za-z0-9_-]+" autoFocus /></label>
      <label>Título<input name="title" required maxLength={200} /></label>
      <label>Descripción<textarea name="description" /></label>
      <DocumentMetadataFields />
      <label>Área<select name="area_id" required defaultValue=""><option value="">Seleccione un área</option>{catalogs.areas.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Tipo de documento<select name="type_id" required defaultValue=""><option value="">Seleccione un tipo</option>{catalogs.types.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Archivo inicial (opcional)<input name="file" type="file" /></label>
      <p>El archivo se valida según los tipos y el tamaño permitidos por la organización.</p>
      <footer><button type="button" disabled={saving} onClick={onClose}>Cancelar</button><button className="is-primary" type="submit" disabled={saving || !catalogs.areas.length || !catalogs.types.length}>{saving ? 'Guardando...' : 'Guardar'}</button></footer>
    </PermissionForm>
  </div>
}
