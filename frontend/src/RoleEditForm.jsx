import { useState } from 'react'
import { PermissionForm } from './Permissions'
import { apiRequest } from './api'

export default function RoleEditForm({ role, onSaved, onCancel }) {
  const [form, setForm] = useState({ name: role.nombre, description: role.descripcion || '', active: role.activo })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function save(event) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    try {
      await apiRequest(`/api/admin/roles/${role.id}/`, { method: 'PATCH', body: form })
      onSaved()
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }
  return <PermissionForm permission="roles.gestionar" className="roles-create-panel roles-edit-panel" onSubmit={save}>
    <h2>Editar rol: {role.codigo}</h2>
    <label>Nombre<input required maxLength={120} disabled={saving} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
    <label>Descripción<textarea aria-label="Descripción" disabled={saving} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
    <label>Estado<select aria-label="Estado del rol" disabled={saving} value={String(form.active)} onChange={(event) => setForm({ ...form, active: event.target.value === 'true' })}><option value="true">Activo</option><option value="false">Inactivo</option></select></label>
    {error && <p className="roles-error" role="alert">{error}</p>}
    <button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar rol'}</button>
    <button type="button" disabled={saving} onClick={onCancel}>Cancelar</button>
  </PermissionForm>
}
