import { useEffect, useMemo, useState } from 'react'
import { apiRequest } from './api'
import './RolesView.css'

function RoleIcon({ name, size = 18 }) {
  let content
  switch (name) {
    case 'roles': content = <><circle cx="8" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M2.5 20v-2a5 5 0 0 1 5-5h1a5 5 0 0 1 5 5v2m1-6h1a4 4 0 0 1 4 4v2" /></>; break
    case 'key': content = <><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8m-3 3 2 2m-5 1 2 2" /></>; break
    case 'shield': content = <path d="M12 3 20 6v5c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V6l8-3Z" />; break
    case 'plus': content = <path d="M12 5v14M5 12h14" />; break
    case 'save': content = <><path d="M5 3h12l3 3v15H4V4a1 1 0 0 1 1-1Z" /><path d="M8 3v6h8V3M8 21v-7h8v7" /></>; break
    case 'refresh': content = <><path d="M20 7v5h-5" /><path d="M18.5 16a8 8 0 1 1 1.2-8.5L20 12" /></>; break
    case 'edit': content = <><path d="m4 20 4.2-1 10.4-10.4-3.2-3.2L5 15.8 4 20Z" /><path d="m13.8 7 3.2 3.2" /></>; break
    case 'check': content = <path d="m7 12 3 3 7-7" />; break
    default: content = <circle cx="12" cy="12" r="8" />
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

const initialForm = { code: '', name: '', description: '' }
const initialPermissionForm = { code: '', name: '', module: '', description: '' }
const actionLabels = { consultar: 'Consultar', crear: 'Crear', gestionar: 'Gestionar', aprobar: 'Aprobar', eliminar: 'Eliminar', exportar: 'Exportar', enviar: 'Enviar' }

function RolesView({ globalQuery = '' }) {
  const [roles, setRoles] = useState([])
  const [permissions, setPermissions] = useState([])
  const [selectedRoleId, setSelectedRoleId] = useState(null)
  const [grants, setGrants] = useState(new Set())
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [showPermissionForm, setShowPermissionForm] = useState(false)
  const [permissionForm, setPermissionForm] = useState(initialPermissionForm)
  const [editingPermissionId, setEditingPermissionId] = useState(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function loadRoles() {
    try {
      const result = await apiRequest('/api/admin/roles/?limit=100')
      const nextRoles = result.roles || []
      setRoles(nextRoles)
      setSelectedRoleId((current) => current && nextRoles.some((role) => role.id === current) ? current : nextRoles[0]?.id || null)
    } catch (requestError) { setError(requestError.message) } finally { setLoading(false) }
  }

  async function loadPermissions() {
    try {
      const result = await apiRequest('/api/admin/permissions/?limit=100')
      setPermissions(result.permissions || [])
    } catch (requestError) { setError(requestError.message) }
  }

  useEffect(() => {
    loadRoles()
    loadPermissions()
  }, [])

  useEffect(() => {
    if (!selectedRoleId) return
    apiRequest(`/api/admin/roles/${selectedRoleId}/permissions/`).then((result) => setGrants(new Set((result.permissions || []).filter((item) => item.granted).map((item) => item.id)))).catch((requestError) => setError(requestError.message))
  }, [selectedRoleId])

  const selectedRole = roles.find((role) => role.id === selectedRoleId)
  const visibleRoles = roles.filter((role) => !globalQuery.trim() || `${role.nombre || role.name} ${role.descripcion || role.description}`.toLowerCase().includes(globalQuery.trim().toLowerCase()))
  const activePermissions = permissions.filter((permission) => permission.active !== false)
  const modules = useMemo(() => [...new Set(activePermissions.map((permission) => permission.module || permission.modulo))], [activePermissions])
  const actions = useMemo(() => [...new Set(activePermissions.map((permission) => permission.action || permission.code?.split('.').pop()))], [activePermissions])

  async function createRole(event) {
    event.preventDefault()
    try {
      await apiRequest('/api/admin/roles/', { method: 'POST', body: form })
      setForm(initialForm)
      setShowCreate(false)
      setNotice('Rol creado correctamente.')
      await loadRoles()
    } catch (requestError) { setError(requestError.message) }
  }

  function openPermissionForm(permission = null) {
    setEditingPermissionId(permission?.id || null)
    setPermissionForm(permission ? {
      code: permission.code || permission.codigo || '',
      name: permission.name || permission.nombre || '',
      module: permission.module || permission.modulo || '',
      description: permission.description || permission.descripcion || '',
    } : initialPermissionForm)
    setShowPermissionForm(true)
  }

  async function savePermission(event) {
    event.preventDefault()
    try {
      const body = editingPermissionId ? { name: permissionForm.name, module: permissionForm.module, description: permissionForm.description } : permissionForm
      const path = editingPermissionId ? `/api/admin/permissions/${editingPermissionId}/` : '/api/admin/permissions/'
      await apiRequest(path, { method: editingPermissionId ? 'PATCH' : 'POST', body })
      setPermissionForm(initialPermissionForm)
      setEditingPermissionId(null)
      setShowPermissionForm(false)
      setNotice(editingPermissionId ? 'Permiso actualizado correctamente.' : 'Permiso creado correctamente.')
      await loadPermissions()
    } catch (requestError) { setError(requestError.message) }
  }

  async function togglePermissionStatus(permission) {
    const label = permission.active === false ? 'activar' : 'desactivar'
    if (!window.confirm(`¿Desea ${label} el permiso ${permission.code || permission.codigo}?`)) return
    try {
      await apiRequest(`/api/admin/permissions/${permission.id}/`, { method: 'PATCH', body: { active: permission.active === false } })
      setNotice(`Permiso ${permission.active === false ? 'activado' : 'desactivado'} correctamente.`)
      await loadPermissions()
    } catch (requestError) { setError(requestError.message) }
  }

  function togglePermission(permission) {
    setGrants((current) => {
      const next = new Set(current)
      if (next.has(permission.id)) next.delete(permission.id)
      else next.add(permission.id)
      return next
    })
  }

  async function saveChanges() {
    if (!selectedRoleId) return
    try {
      await apiRequest(`/api/admin/roles/${selectedRoleId}/permissions/`, { method: 'PUT', body: { permission_ids: [...grants] } })
      setNotice('Los permisos se guardaron correctamente.')
      await loadRoles()
    } catch (requestError) { setError(requestError.message) }
  }

  async function resetPermissions() {
    if (!selectedRoleId) return
    try {
      const result = await apiRequest(`/api/admin/roles/${selectedRoleId}/permissions/`)
      setGrants(new Set((result.permissions || []).filter((item) => item.granted).map((item) => item.id)))
      setNotice('Los permisos se restablecieron al estado guardado.')
    } catch (requestError) { setError(requestError.message) }
  }

  return <div className="roles-view">
    <header className="roles-heading"><div><h1>Roles y permisos</h1><p>Administre perfiles y autorizaciones reales de la organización.</p></div><div className="roles-heading__actions"><button type="button" onClick={() => setShowCreate(true)}><RoleIcon name="plus" /> Nuevo rol</button><button className="is-primary" type="button" onClick={saveChanges}><RoleIcon name="save" /> Guardar cambios</button></div></header>
    {error && <p className="roles-error" role="alert">{error}</p>}{notice && <p className="roles-notice" role="status">{notice}</p>}
    {showCreate && <form className="roles-create-panel" onSubmit={createRole}><h2>Crear rol</h2><label>Código<input required pattern="[A-Za-z0-9_-]+" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} /></label><label>Nombre<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>Descripción<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label><button type="submit">Crear rol</button><button type="button" onClick={() => setShowCreate(false)}>Cancelar</button></form>}
     <section className="roles-metrics" aria-label="Indicadores de roles y permisos"><article><span className="roles-metric-icon roles-metric-icon--blue"><RoleIcon name="roles" size={27} /></span><div><p>Total de roles</p><strong>{roles.length}</strong><small>roles activos</small></div></article><article><span className="roles-metric-icon roles-metric-icon--green"><RoleIcon name="key" size={27} /></span><div><p>Permisos definidos</p><strong>{activePermissions.length}</strong><small>{permissions.length} en catálogo</small></div></article><article><span className="roles-metric-icon roles-metric-icon--orange"><RoleIcon name="shield" size={27} /></span><div><p>Rol seleccionado</p><strong>{selectedRole ? selectedRole.nombre || selectedRole.name : '—'}</strong><small>configuración actual</small></div></article><article><span className="roles-metric-icon roles-metric-icon--violet"><RoleIcon name="check" size={27} /></span><div><p>Permisos otorgados</p><strong>{grants.size}</strong><small>en el rol seleccionado</small></div></article></section>
    <div className="roles-main-grid"><section className="roles-panel roles-list-panel"><h2>Lista de roles</h2><div className="roles-table-scroll"><table><thead><tr><th>Rol</th><th>Descripción</th><th>Usuarios asignados</th><th>Estado</th></tr></thead><tbody>{visibleRoles.map((role) => <tr className={role.id === selectedRoleId ? 'is-selected' : ''} key={role.id} onClick={() => setSelectedRoleId(role.id)}><td><span className="roles-avatar roles-avatar--blue">{(role.nombre || role.name || 'R').slice(0, 2).toUpperCase()}</span><strong>{role.nombre || role.name}</strong></td><td>{role.descripcion || role.description || 'Sin descripción'}</td><td>{role.users_count ?? '—'}</td><td><span className="roles-state">{role.activo === false ? 'Inactivo' : 'Activo'}</span></td></tr>)}</tbody></table>{loading && <p className="roles-empty">Cargando roles...</p>}{!loading && !visibleRoles.length && <p className="roles-empty">No se encontraron roles.</p>}</div><footer><span>{visibleRoles.length} roles</span></footer></section>
       <section className="roles-panel roles-matrix-panel"><header><h2>Matriz de permisos{selectedRole && <>: <strong>{selectedRole.nombre || selectedRole.name}</strong></>}</h2><button type="button" onClick={resetPermissions}><RoleIcon name="refresh" size={15} /> Recargar permisos</button></header><div className="roles-matrix-scroll"><table><thead><tr><th>Módulo</th>{actions.map((action) => <th key={action}>{actionLabels[action] || action}</th>)}</tr></thead><tbody>{modules.map((module) => <tr key={module}><td>{module}</td>{actions.map((action) => { const permission = activePermissions.find((item) => (item.module || item.modulo) === module && (item.action || item.code?.split('.').pop()) === action); return <td key={action}>{permission && <input type="checkbox" aria-label={`${actionLabels[action] || action} ${module}`} checked={grants.has(permission.id)} onChange={() => togglePermission(permission)} />}</td> })}</tr>)}</tbody></table>{!activePermissions.length && <p className="roles-empty">No hay permisos activos disponibles.</p>}</div></section></div>
     <section className="roles-panel roles-permission-catalog"><header><div><h2>Catálogo de permisos</h2><p>Defina las autorizaciones disponibles para asignarlas a los roles.</p></div><button type="button" onClick={() => openPermissionForm()}><RoleIcon name="plus" size={15} /> Nuevo permiso</button></header>{showPermissionForm && <form className="roles-permission-form" onSubmit={savePermission}><label>Código técnico<input required disabled={Boolean(editingPermissionId)} pattern="[A-Za-z0-9_.-]+" value={permissionForm.code} onChange={(event) => setPermissionForm({ ...permissionForm, code: event.target.value.toLowerCase() })} /></label><label>Nombre<input required value={permissionForm.name} onChange={(event) => setPermissionForm({ ...permissionForm, name: event.target.value })} /></label><label>Módulo<input required value={permissionForm.module} onChange={(event) => setPermissionForm({ ...permissionForm, module: event.target.value.toLowerCase() })} /></label><label>Descripción<input value={permissionForm.description} onChange={(event) => setPermissionForm({ ...permissionForm, description: event.target.value })} /></label><button type="submit">{editingPermissionId ? 'Guardar cambios' : 'Crear permiso'}</button><button type="button" onClick={() => { setShowPermissionForm(false); setEditingPermissionId(null) }}>Cancelar</button></form>}<div className="roles-permission-table-scroll"><table><thead><tr><th>Código</th><th>Nombre</th><th>Módulo</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{permissions.map((permission) => <tr key={permission.id}><td><code>{permission.code || permission.codigo}</code></td><td><strong>{permission.name || permission.nombre}</strong><small>{permission.description || permission.descripcion || 'Sin descripción'}</small></td><td>{permission.module || permission.modulo}</td><td><span className={`roles-state ${permission.active === false ? 'roles-state--inactive' : ''}`}>{permission.active === false ? 'Inactivo' : 'Activo'}</span></td><td><div className="roles-permission-actions"><button type="button" aria-label={`Editar permiso ${permission.code || permission.codigo}`} onClick={() => openPermissionForm(permission)}><RoleIcon name="edit" size={14} /></button><button type="button" onClick={() => togglePermissionStatus(permission)}>{permission.active === false ? 'Activar' : 'Desactivar'}</button></div></td></tr>)}</tbody></table>{!permissions.length && <p className="roles-empty">No hay permisos en el catálogo.</p>}</div></section>
  </div>
}

export default RolesView
