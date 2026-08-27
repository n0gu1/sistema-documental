import { useEffect, useState } from 'react'
import { apiRequest, formatDate } from './api'
import './UsersView.css'

function UserIcon({ name, size = 18 }) {
  let content
  switch (name) {
    case 'users': content = <><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-1.5A4.5 4.5 0 0 1 8 14h2a4.5 4.5 0 0 1 4.5 4.5V20m2-14a3 3 0 0 1 0 5m1 3a4 4 0 0 1 4 4v2" /></>; break
    case 'plus': content = <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>; break
    case 'search': content = <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></>; break
    case 'filter': content = <path d="M4 5h16l-6.2 7v5.5l-3.6 1.8V12L4 5Z" />; break
    case 'chevron': content = <path d="m8 10 4 4 4-4" />; break
    case 'shield': content = <><path d="M12 3 20 6v5c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V6l8-3Z" /><path d="m9 12 2 2 4-4" /></>; break
    case 'shieldOff': content = <><path d="M12 3 20 6v5c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V6l8-3Z" /><path d="m9 9 6 6m0-6-6 6" /></>; break
    case 'edit': content = <><path d="m4 20 4.2-1 10.4-10.4-3.2-3.2L5 15.8 4 20Z" /><path d="m13.8 7 3.2 3.2" /></>; break
    case 'key': content = <><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8m-3 3 2 2m-5 1 2 2" /></>; break
    case 'lock': content = <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>; break
    case 'clock': content = <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>; break
    case 'monitor': content = <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>; break
    case 'mail': content = <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>; break
    case 'user': content = <><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2" /></>; break
    default: content = <circle cx="12" cy="12" r="8" />
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

const initialForm = { username: '', email: '', first_name: '', last_name: '', temporary_password: '' }

function mapUser(item) {
  const name = item.full_name || `${item.first_name} ${item.last_name}`.trim()
  return {
    ...item,
    name,
    initials: `${item.first_name?.[0] || ''}${item.last_name?.[0] || ''}` || 'US',
    area: item.area_name || 'Sin área',
    role: item.roles?.[0]?.name || 'Sin rol',
    status: item.active ? 'Activo' : 'Suspendido',
    lastAccess: formatDate(item.last_access_at, 'Sin acceso'),
  }
}

function UsersView({ globalQuery = '', organizationId }) {
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('Todos')
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [activity, setActivity] = useState([])
  const [form, setForm] = useState(initialForm)
  const [showCreate, setShowCreate] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  async function loadUsers() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '100' })
      if (globalQuery.trim()) params.set('search', globalQuery.trim())
      const result = await apiRequest(`/api/admin/users/?${params}`)
      const nextUsers = (result.results || []).map(mapUser)
      setUsers(nextUsers)
      setSelectedUserId((current) => current && nextUsers.some((item) => item.id === current) ? current : nextUsers[0]?.id || null)
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadUsers() }, [globalQuery])

  useEffect(() => {
    apiRequest('/api/admin/roles/?limit=100').then((result) => setRoles(result.roles || [])).catch(() => {})
  }, [])

  const selectedUser = users.find((item) => item.id === selectedUserId) || null
  useEffect(() => {
    if (!selectedUserId) return
    apiRequest(`/api/audit/?user_id=${selectedUserId}&limit=5`).then((result) => setActivity(result.results || [])).catch(() => setActivity([]))
  }, [selectedUserId])

  const visibleUsers = users.filter((user) => {
    const searchable = [user.name, user.username, user.email, user.area, user.role, user.status].join(' ').toLowerCase()
    return (!search || searchable.includes(search.trim().toLowerCase())) && (status === 'Todos' || user.status === status)
  })

  async function createUser(event) {
    event.preventDefault()
    try {
      await apiRequest('/api/admin/users/', { method: 'POST', body: { ...form, organization_id: organizationId, role_ids: roles[0] ? [roles[0].id] : [] } })
      setForm(initialForm)
      setShowCreate(false)
      setNotice('Usuario creado correctamente.')
      await loadUsers()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function toggleStatus(user) {
    try {
      await apiRequest(`/api/admin/users/${user.id}/status/`, { method: 'POST', body: { active: !user.active } })
      setNotice(`El usuario ${user.name} fue ${user.active ? 'suspendido' : 'activado'}.`)
      await loadUsers()
    } catch (requestError) { setError(requestError.message) }
  }

  async function resetPassword(user) {
    try {
      const result = await apiRequest(`/api/admin/users/${user.id}/reset-password/`, { method: 'POST' })
      setNotice(`Contraseña temporal de ${user.username}: ${result.temporary_password}`)
    } catch (requestError) { setError(requestError.message) }
  }

  return <div className="users-view">
    <header className="users-heading"><div><p>Gestión de accesos</p><h1>Administración de usuarios</h1><span>Usuarios reales de la organización, con estado y actividad consultados desde el backend.</span></div><div className="users-heading__actions"><button className="is-primary" type="button" onClick={() => setShowCreate(true)}><UserIcon name="plus" size={18} /> Nuevo usuario</button></div></header>
    <section className="users-metrics"><article><span className="users-metric-icon users-metric-icon--green"><UserIcon name="users" size={24} /></span><div><p>Usuarios activos</p><strong>{users.filter((item) => item.active).length}</strong><small>de {users.length} cargados</small></div></article><article><span className="users-metric-icon users-metric-icon--orange"><UserIcon name="lock" size={24} /></span><div><p>Bloqueados</p><strong>{users.filter((item) => item.locked_until).length}</strong><small>requieren revisión</small></div></article><article><span className="users-metric-icon users-metric-icon--yellow"><UserIcon name="clock" size={24} /></span><div><p>Pendientes de activación</p><strong>{users.filter((item) => item.must_change_password).length}</strong><small>cambio de contraseña</small></div></article><article><span className="users-metric-icon users-metric-icon--violet"><UserIcon name="monitor" size={24} /></span><div><p>Sesiones del usuario</p><strong>{selectedUser ? 'Consultar' : '—'}</strong><small>seleccione un usuario</small></div></article></section>
    <section className="users-filters"><label className="users-filter users-filter--search"><span>Búsqueda</span><div><UserIcon name="search" size={17} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, usuario o correo..." /></div></label><label className="users-filter"><span>Estado</span><div><select value={status} onChange={(event) => setStatus(event.target.value)}><option>Todos</option><option>Activo</option><option>Suspendido</option></select><UserIcon name="chevron" size={14} /></div></label><button className="users-clear" type="button" onClick={() => { setSearch(''); setStatus('Todos') }}><UserIcon name="filter" size={16} /> Limpiar filtros</button></section>
    {error && <p className="users-error" role="alert">{error}</p>}
    {notice && <p className="users-notice" role="status">{notice}</p>}
    {showCreate && <form className="users-create-panel" onSubmit={createUser}><h2>Crear usuario</h2><div><label>Usuario<input required value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></label><label>Correo<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label>Nombres<input required value={form.first_name} onChange={(event) => setForm({ ...form, first_name: event.target.value })} /></label><label>Apellidos<input required value={form.last_name} onChange={(event) => setForm({ ...form, last_name: event.target.value })} /></label><label>Contraseña temporal<input required type="password" value={form.temporary_password} onChange={(event) => setForm({ ...form, temporary_password: event.target.value })} /></label></div><button type="submit">Crear usuario</button><button type="button" onClick={() => setShowCreate(false)}>Cancelar</button></form>}
    <section className="users-table-panel"><div className="users-table-scroll"><table><thead><tr><th>Nombre</th><th>Usuario</th><th>Correo</th><th>Área</th><th>Rol</th><th>Estado</th><th>Último acceso</th><th>Acciones</th></tr></thead><tbody>{visibleUsers.map((user) => <tr className={selectedUserId === user.id ? 'is-selected' : ''} key={user.id} onClick={() => setSelectedUserId(user.id)}><td><span className="users-name"><i className="users-avatar users-avatar--blue">{user.initials}</i><strong>{user.name}</strong></span></td><td>{user.username}</td><td>{user.email}</td><td>{user.area}</td><td>{user.role}</td><td><span className={`users-state users-state--${user.status.toLowerCase()}`}>{user.status}</span></td><td>{user.lastAccess}</td><td><div className="users-row-actions"><button type="button" aria-label={`Cambiar estado de ${user.name}`} onClick={(event) => { event.stopPropagation(); toggleStatus(user) }}><UserIcon name={user.active ? 'lock' : 'shield'} size={16} /></button><button type="button" aria-label={`Restablecer clave de ${user.name}`} onClick={(event) => { event.stopPropagation(); resetPassword(user) }}><UserIcon name="key" size={16} /></button></div></td></tr>)}</tbody></table>{loading && <div className="users-empty">Cargando usuarios...</div>}{!loading && !visibleUsers.length && <div className="users-empty"><UserIcon name="search" size={24} /><strong>No se encontraron usuarios</strong><span>Pruebe con otros términos o filtros.</span></div>}</div><footer className="users-pagination"><span>Mostrando {visibleUsers.length} de {users.length} usuarios</span></footer></section>
    {selectedUser && <section className="users-detail-panel"><aside className="users-profile-card"><div className="users-profile-card__heading"><span className="users-profile-avatar users-avatar--blue">{selectedUser.initials}</span><div><h2>{selectedUser.name}</h2><p>{selectedUser.role}</p></div></div><ul><li><UserIcon name="mail" size={15} /><span>{selectedUser.email}</span></li><li><UserIcon name="user" size={15} /><span>{selectedUser.username}</span></li><li><UserIcon name="clock" size={15} /><span>Último acceso: {selectedUser.lastAccess}</span></li></ul></aside><div className="users-detail-main"><nav className="users-detail-tabs"><button className="is-active" type="button">Actividad reciente</button></nav><div className="users-detail-content"><section className="users-activity"><h3>Actividad de {selectedUser.name}</h3>{activity.map((item) => <article key={item.id}><UserIcon name={item.successful ? 'shield' : 'lock'} size={16} /><span>{item.action || item.action_code}</span><time>{formatDate(item.event_at)}</time><small>{item.result || 'Sin resultado'}</small></article>)}{!activity.length && <p className="users-tab-placeholder">No hay actividad registrada para este usuario.</p>}</section></div></div></section>}
  </div>
}

export default UsersView
