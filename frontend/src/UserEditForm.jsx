import { useState } from 'react'
import { apiRequest } from './api'
import { PermissionForm } from './Permissions'

export default function UserEditForm({ user, areas, onSaved, onCancel }) {
  const [form, setForm] = useState({ email: user.email || '', first_name: user.first_name || '', last_name: user.last_name || '', area_id: user.area_id || '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function save(event) {
    event.preventDefault()
    if (saving) return
    const changes = Object.fromEntries(Object.entries(form).filter(([field, value]) => value !== (user[field] || '')).map(([field, value]) => [field, field === 'area_id' ? value || null : value]))
    if (!Object.keys(changes).length) { onCancel(); return }
    setSaving(true)
    setError('')
    let saved = false
    try {
      await apiRequest(`/api/admin/users/${user.id}/`, { method: 'PATCH', body: changes })
      saved = true
      const result = await apiRequest(`/api/admin/users/${user.id}/`)
      onSaved(result.user)
    } catch (err) {
      setError(saved ? `Los cambios se guardaron, pero falló la consulta. Recargue la página. ${err.message}` : err.message)
    } finally { setSaving(false) }
  }
  return <PermissionForm permission="usuarios.gestionar" className="users-create-panel users-edit-panel" onSubmit={save}>
    <h2>Editar usuario: {user.username}</h2>
    <div>{[['email', 'Correo', 'email', 254], ['first_name', 'Nombres', 'text', 120], ['last_name', 'Apellidos', 'text', 120]].map(([field, label, type, maxLength]) => <label key={field}>{label}<input required type={type} maxLength={maxLength} disabled={saving} value={form[field]} onChange={(event) => setForm({ ...form, [field]: event.target.value })} /></label>)}
      <label>Área<select aria-label="Área" disabled={saving} value={form.area_id} onChange={(event) => setForm({ ...form, area_id: event.target.value })}><option value="">Sin área</option>{user.area_id && !areas.some((area) => area.id === user.area_id) && <option value={user.area_id} disabled>Área actual no disponible</option>}{areas.map((area) => <option key={area.id} value={area.id}>{area.nombre}</option>)}</select></label>
    </div>
    {error && <p className="users-error" role="alert">{error}</p>}
    <button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>
    <button type="button" disabled={saving} onClick={onCancel}>Cancelar</button>
  </PermissionForm>
}
