import { useDeferredValue, useState } from 'react'
import './UsersView.css'

const users = [
  { id: 1, initials: 'AR', name: 'Ana Rodríguez', username: 'arodriguez', email: 'ana.rodriguez@consultoriaalexandria.com', area: 'Administración', role: 'Administrador', status: 'Activo', lastAccess: '23/05/2024 10:25', mfa: true, tone: 'blue', title: 'Directora de Administración', phone: '+52 55 1234 5678', mobile: '+52 55 9876 5432', location: 'Ciudad de México, México', created: '12/01/2023 09:34', updated: '23/05/2024 10:25' },
  { id: 2, initials: 'JM', name: 'Juan Martínez', username: 'jmartinez', email: 'juan.martinez@consultoriaalexandria.com', area: 'Seguridad de la Información', role: 'Gestor', status: 'Activo', lastAccess: '23/05/2024 09:58', mfa: true, tone: 'blue', title: 'Jefe de Seguridad de la Información', phone: '+52 55 1122 3344', mobile: '+52 55 6677 8899', location: 'Ciudad de México, México', created: '02/03/2023 11:20', updated: '23/05/2024 09:58' },
  { id: 3, initials: 'LR', name: 'Laura Ramírez', username: 'lramirez', email: 'laura.ramirez@consultoriaalexandria.com', area: 'Administrativos', role: 'Editor', status: 'Activo', lastAccess: '23/05/2024 09:15', mfa: true, tone: 'teal', title: 'Coordinadora Administrativa', phone: '+52 55 2233 4455', mobile: '+52 55 7788 9900', location: 'Puebla, México', created: '18/04/2023 08:40', updated: '23/05/2024 09:15' },
  { id: 4, initials: 'CP', name: 'Carlos Pérez', username: 'cperez', email: 'carlos.perez@consultoriaalexandria.com', area: 'Legal', role: 'Lector', status: 'Suspendido', lastAccess: '15/05/2024 16:42', mfa: false, tone: 'violet', title: 'Asesor Legal', phone: '+52 55 3344 5566', mobile: '+52 55 8899 0011', location: 'Monterrey, México', created: '10/05/2023 14:10', updated: '15/05/2024 16:42' },
  { id: 5, initials: 'MG', name: 'María Gómez', username: 'mgomez', email: 'maria.gomez@consultoriaalexandria.com', area: 'Compras', role: 'Editor', status: 'Pendiente', lastAccess: '—', mfa: false, tone: 'orange', title: 'Analista de Compras', phone: '+52 55 4455 6677', mobile: '+52 55 9900 1122', location: 'Guadalajara, México', created: '21/05/2024 12:05', updated: '21/05/2024 12:05' },
  { id: 6, initials: 'DL', name: 'Diego López', username: 'dlopez', email: 'diego.lopez@consultoriaalexandria.com', area: 'Auditoría', role: 'Revisor', status: 'Activo', lastAccess: '22/05/2024 17:31', mfa: true, tone: 'green', title: 'Auditor Interno', phone: '+52 55 5566 7788', mobile: '+52 55 1010 2233', location: 'Querétaro, México', created: '05/06/2023 10:00', updated: '22/05/2024 17:31' },
]

const permissions = ['Administración de usuarios', 'Gestión de roles y permisos', 'Configuración del sistema', 'Acceso a respaldos']
const recentActivity = [
  ['clock', 'Inicio de sesión exitoso', '23/05/2024 10:25', '190.15.23.45'],
  ['shield', 'Actualizó permisos de usuario', '23/05/2024 09:40', '190.15.23.48'],
  ['document', 'Editó documento “Política de Seguridad.pdf”', '23/05/2024 09:12', '190.15.23.45'],
  ['users', 'Asignó rol “Editor” a Laura Ramírez', '22/05/2024 16:33', '190.15.23.49'],
]

function UserIcon({ name, size = 18 }) {
  let content
  switch (name) {
    case 'users': content = <><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-1.5A4.5 4.5 0 0 1 8 14h2a4.5 4.5 0 0 1 4.5 4.5V20M16 5.5a3 3 0 0 1 0 5.5M17 14a4 4 0 0 1 4 4v2" /></>; break
    case 'plus': content = <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>; break
    case 'upload': content = <><path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M5 14v6h14v-6" /></>; break
    case 'userCheck': content = <><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-1.5A4.5 4.5 0 0 1 8 14h2a4.5 4.5 0 0 1 4.5 4.5V20m2-7 2 2 4-4" /></>; break
    case 'lock': content = <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>; break
    case 'clock': content = <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>; break
    case 'monitor': content = <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>; break
    case 'search': content = <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></>; break
    case 'filter': content = <path d="M4 5h16l-6.2 7v5.5l-3.6 1.8V12L4 5Z" />; break
    case 'chevron': content = <path d="m8 10 4 4 4-4" />; break
    case 'shield': content = <><path d="M12 3 20 6v5c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V6l8-3Z" /><path d="m9 12 2 2 4-4" /></>; break
    case 'shieldOff': content = <><path d="M12 3 20 6v5c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V6l8-3Z" /><path d="m9 9 6 6m0-6-6 6" /></>; break
    case 'edit': content = <><path d="m4 20 4.2-1 10.4-10.4-3.2-3.2L5 15.8 4 20Z" /><path d="m13.8 7 3.2 3.2" /></>; break
    case 'key': content = <><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8m-3 3 2 2m-5 1 2 2" /></>; break
    case 'user': content = <><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2" /></>; break
    case 'mail': content = <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>; break
    case 'phone': content = <path d="M7 3H4.5A1.5 1.5 0 0 0 3 4.5C3 13.6 10.4 21 19.5 21a1.5 1.5 0 0 0 1.5-1.5V17l-4-1-1.3 2.2a15 15 0 0 1-9.9-9.9L8 7 7 3Z" />; break
    case 'mobile': content = <><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></>; break
    case 'pin': content = <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>; break
    case 'document': content = <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 12h7M9 16h7" /></>; break
    case 'check': content = <path d="m6 12 4 4 8-8" />; break
    default: content = <circle cx="12" cy="12" r="8" />
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function UserSelect({ label, value, onChange, options }) {
  return <label className="users-filter"><span>{label}</span><div><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select><UserIcon name="chevron" size={14} /></div></label>
}

function UsersView({ globalQuery }) {
  const [search, setSearch] = useState('')
  const [area, setArea] = useState('Todas')
  const [role, setRole] = useState('Todos')
  const [status, setStatus] = useState('Todos')
  const [lastAccess, setLastAccess] = useState('Todos')
  const [selectedUserId, setSelectedUserId] = useState(1)
  const [selectedUserIds, setSelectedUserIds] = useState([1])
  const [activeTab, setActiveTab] = useState('Detalle del usuario')
  const deferredSearch = useDeferredValue(search.trim().toLowerCase())
  const deferredGlobalQuery = useDeferredValue(globalQuery.trim().toLowerCase())
  const selectedUser = users.find((user) => user.id === selectedUserId) || users[0]
  const visibleUsers = users.filter((user) => {
    const searchable = [user.name, user.username, user.email, user.area, user.role, user.status].join(' ').toLowerCase()
    return (!deferredSearch || searchable.includes(deferredSearch))
      && (!deferredGlobalQuery || searchable.includes(deferredGlobalQuery))
      && (area === 'Todas' || user.area === area)
      && (role === 'Todos' || user.role === role)
      && (status === 'Todos' || user.status === status)
      && (lastAccess === 'Todos' || (lastAccess === 'Con acceso' ? user.lastAccess !== '—' : user.lastAccess === '—'))
  })
  const allVisibleUsersSelected = visibleUsers.length > 0 && visibleUsers.every((user) => selectedUserIds.includes(user.id))

  function clearFilters() {
    setSearch('')
    setArea('Todas')
    setRole('Todos')
    setStatus('Todos')
    setLastAccess('Todos')
  }

  function selectUser(userId) {
    setSelectedUserId(userId)
    setSelectedUserIds([userId])
  }

  function toggleUser(userId) {
    setSelectedUserId(userId)
    setSelectedUserIds((selectedIds) => selectedIds.includes(userId)
      ? selectedIds.filter((id) => id !== userId)
      : [...selectedIds, userId])
  }

  function toggleVisibleUsers() {
    const visibleIds = visibleUsers.map((user) => user.id)
    setSelectedUserIds((selectedIds) => allVisibleUsersSelected
      ? selectedIds.filter((id) => !visibleIds.includes(id))
      : [...new Set([...selectedIds, ...visibleIds])])
  }

  return (
    <div className="users-view">
      <header className="users-heading">
        <div><p>Gestión de accesos</p><h1>Administración de usuarios</h1><span>Cree, edite y controle los accesos del personal a la plataforma.</span></div>
        <div className="users-heading__actions"><button className="is-primary" type="button"><UserIcon name="plus" size={18} /> Nuevo usuario</button><button type="button"><UserIcon name="upload" size={18} /> Importar usuarios</button><button type="button"><UserIcon name="userCheck" size={18} /> Asignar permisos</button></div>
      </header>

      <section className="users-metrics">
        <article><span className="users-metric-icon users-metric-icon--green"><UserIcon name="users" size={24} /></span><div><p>Usuarios activos</p><strong>156</strong><small>↑ <b>5.1%</b> vs. mes anterior</small></div></article>
        <article><span className="users-metric-icon users-metric-icon--orange"><UserIcon name="lock" size={24} /></span><div><p>Bloqueados</p><strong>12</strong><small>↑ <b>9.1%</b> vs. mes anterior</small></div></article>
        <article><span className="users-metric-icon users-metric-icon--yellow"><UserIcon name="clock" size={24} /></span><div><p>Pendientes de activación</p><strong>18</strong><small>↑ <b>12.5%</b> vs. mes anterior</small></div></article>
        <article><span className="users-metric-icon users-metric-icon--violet"><UserIcon name="monitor" size={24} /></span><div><p>Sesiones activas</p><strong>34</strong><small>↑ <b>8.7%</b> vs. mes anterior</small></div></article>
      </section>

      <section className="users-filters">
        <label className="users-filter users-filter--search"><span>Búsqueda</span><div><UserIcon name="search" size={17} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, usuario o correo..." /></div></label>
        <UserSelect label="Área" value={area} onChange={setArea} options={['Todas', 'Administración', 'Seguridad de la Información', 'Administrativos', 'Legal', 'Compras', 'Auditoría']} />
        <UserSelect label="Rol" value={role} onChange={setRole} options={['Todos', 'Administrador', 'Gestor', 'Editor', 'Lector', 'Revisor']} />
        <UserSelect label="Estado" value={status} onChange={setStatus} options={['Todos', 'Activo', 'Suspendido', 'Pendiente']} />
        <UserSelect label="Último acceso" value={lastAccess} onChange={setLastAccess} options={['Todos', 'Con acceso', 'Sin acceso']} />
        <button className="users-clear" type="button" onClick={clearFilters}><UserIcon name="filter" size={16} /> Limpiar filtros</button>
      </section>

      <section className="users-table-panel">
        <div className="users-table-scroll">
          <table>
            <thead><tr><th><input type="checkbox" aria-label="Seleccionar todos" checked={allVisibleUsersSelected} onChange={toggleVisibleUsers} /></th><th>Nombre</th><th>Usuario</th><th>Correo</th><th>Área</th><th>Rol</th><th>Estado</th><th>Último acceso</th><th>MFA</th><th>Acciones</th></tr></thead>
            <tbody>
              {visibleUsers.map((user) => (
                <tr className={selectedUserId === user.id ? 'is-selected' : ''} key={user.id} onClick={() => selectUser(user.id)}>
                  <td><input type="checkbox" aria-label={`Seleccionar ${user.name}`} checked={selectedUserIds.includes(user.id)} onChange={() => toggleUser(user.id)} onClick={(event) => event.stopPropagation()} /></td>
                  <td><span className="users-name"><i className={`users-avatar users-avatar--${user.tone}`}>{user.initials}</i><strong>{user.name}</strong><b /></span></td>
                  <td>{user.username}</td><td>{user.email}</td><td>{user.area}</td><td>{user.role}</td><td><span className={`users-state users-state--${user.status.toLowerCase()}`}>{user.status}</span></td><td>{user.lastAccess}</td><td><span className={user.mfa ? 'users-mfa users-mfa--on' : 'users-mfa'}><UserIcon name={user.mfa ? 'shield' : 'shieldOff'} size={17} /></span></td>
                  <td><div className="users-row-actions"><button type="button" aria-label={`Editar ${user.name}`}><UserIcon name="edit" size={16} /></button><button type="button" aria-label={`Restablecer clave de ${user.name}`}><UserIcon name="key" size={16} /></button><button type="button" aria-label={`Bloquear ${user.name}`}><UserIcon name="lock" size={16} /></button><button type="button" aria-label={`Ver perfil de ${user.name}`}><UserIcon name="user" size={16} /></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visibleUsers.length && <div className="users-empty"><UserIcon name="search" size={24} /><strong>No se encontraron usuarios</strong><span>Pruebe con otros términos o limpie los filtros.</span></div>}
        </div>
        <footer className="users-pagination"><span>Mostrando 1 a {visibleUsers.length} de 186 usuarios</span><div><button type="button" disabled>‹</button><button className="is-current" type="button">1</button><button type="button">2</button><button type="button">3</button><button type="button">4</button><button type="button">5</button><button type="button">…</button><button type="button">19</button><button type="button">›</button><select defaultValue="10"><option value="10">10 por página</option><option value="25">25 por página</option></select></div></footer>
      </section>

      <section className="users-detail-panel">
        <aside className="users-profile-card">
          <div className="users-profile-card__heading"><span className={`users-profile-avatar users-avatar--${selectedUser.tone}`}>{selectedUser.initials}<i /></span><div><h2>{selectedUser.name}</h2><p>{selectedUser.role}</p></div></div>
          <ul><li><UserIcon name="mail" size={15} /><span>{selectedUser.email}</span></li><li><UserIcon name="phone" size={15} /><span>{selectedUser.phone}</span></li><li><UserIcon name="mobile" size={15} /><span>{selectedUser.mobile}</span></li><li><UserIcon name="pin" size={15} /><span>{selectedUser.location}</span></li></ul>
        </aside>

        <div className="users-detail-main">
          <nav className="users-detail-tabs" aria-label="Detalle del usuario">{['Detalle del usuario', 'Actividad reciente', 'Dispositivos y sesiones', 'Documentos compartidos'].map((tab) => <button className={activeTab === tab ? 'is-active' : ''} type="button" key={tab} onClick={() => setActiveTab(tab)}>{tab}</button>)}</nav>
          {activeTab === 'Detalle del usuario' ? <div className="users-detail-content"><dl><div><dt>Cargo</dt><dd>{selectedUser.title}</dd></div><div><dt>Área</dt><dd>{selectedUser.area}</dd></div><div><dt>Usuario</dt><dd>{selectedUser.username}</dd></div><div><dt>Fecha de creación</dt><dd>{selectedUser.created}</dd></div><div><dt>Última actualización</dt><dd>{selectedUser.updated}</dd></div></dl><section className="users-permissions"><h3>Permisos rápidos</h3>{permissions.map((permission) => <p key={permission}><UserIcon name="shield" size={16} /><span>{permission}</span><UserIcon name="check" size={15} /></p>)}<button type="button">Ver todos los permisos (28)</button></section></div> : <div className="users-tab-placeholder"><UserIcon name={activeTab === 'Actividad reciente' ? 'clock' : activeTab === 'Dispositivos y sesiones' ? 'monitor' : 'document'} size={25} /><strong>{activeTab}</strong><span>Contenido demostrativo disponible al conectar el módulo con el backend.</span></div>}
        </div>

        <aside className="users-activity">
          <h3>Actividad reciente</h3>
          {recentActivity.map(([icon, text, date, ip]) => <article key={text}><UserIcon name={icon} size={16} /><span>{text}</span><time>{date}</time><small>IP {ip}</small></article>)}
          <button type="button">Ver toda la actividad</button>
        </aside>
      </section>
    </div>
  )
}

export default UsersView
