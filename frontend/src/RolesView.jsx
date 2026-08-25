import { useDeferredValue, useState } from 'react'
import './RolesView.css'

const roles = [
  { id: 'administrator', initials: 'AD', name: 'Administrador', description: 'Acceso completo a todos los módulos y configuraciones.', users: 2, tone: 'blue' },
  { id: 'editor', initials: 'ED', name: 'Editor', description: 'Puede crear, editar y gestionar contenidos y documentos.', users: 6, tone: 'green' },
  { id: 'reviewer', initials: 'RV', name: 'Revisor', description: 'Puede revisar y aprobar documentos y versiones.', users: 4, tone: 'violet' },
  { id: 'reader', initials: 'CO', name: 'Consulta', description: 'Acceso de solo lectura a la información disponible.', users: 12, tone: 'orange' },
  { id: 'auditor', initials: 'AU', name: 'Auditor', description: 'Acceso de lectura y revisión para auditorías internas.', users: 3, tone: 'teal' },
  { id: 'support', initials: 'SO', name: 'Soporte', description: 'Acceso limitado para soporte técnico y mantenimiento.', users: 2, tone: 'cyan' },
]

const modules = [
  ['document', 'Documentos'],
  ['layers', 'Versiones'],
  ['users', 'Usuarios'],
  ['clipboard', 'Bitácora'],
  ['chart', 'Reportes'],
  ['cloud', 'Respaldos'],
  ['settings', 'Configuración'],
]
const actions = ['Ver', 'Crear', 'Editar', 'Aprobar', 'Eliminar', 'Exportar', 'Administrar']
const permissionProfiles = {
  administrator: modules.map(() => actions.map(() => true)),
  editor: [[1, 1, 1, 1, 0, 1, 0], [1, 1, 1, 1, 0, 1, 0], [1, 0, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 1, 0], [1, 0, 0, 0, 0, 1, 0], [1, 0, 0, 0, 0, 1, 0], [0, 0, 0, 0, 0, 0, 0]].map((row) => row.map(Boolean)),
  reviewer: [[1, 0, 0, 1, 0, 1, 0], [1, 0, 0, 1, 0, 1, 0], [0, 0, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 1, 0], [0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0]].map((row) => row.map(Boolean)),
  reader: modules.map((_, index) => actions.map((__, actionIndex) => index < 5 && actionIndex === 0)),
  auditor: modules.map((_, index) => actions.map((__, actionIndex) => index < 6 && (actionIndex === 0 || actionIndex === 5))),
  support: modules.map((_, index) => actions.map((__, actionIndex) => (index === 2 || index === 6) && (actionIndex === 0 || actionIndex === 6))),
}

const history = [
  ['23/05/2024 10:35:21', 'AR', 'Ana Rodríguez', 'Actualización de permisos', 'Se actualizaron permisos en módulos: Documentos, Versiones, Reportes'],
  ['22/05/2024 16:22:08', 'JM', 'Juan Martínez', 'Creación de rol', 'Rol “Editor” creado con permisos base'],
  ['22/05/2024 15:10:45', 'AR', 'Ana Rodríguez', 'Actualización de descripción', 'Se actualizó la descripción del rol'],
]
const policies = [
  'Autenticación multifactor requerida para roles privilegiados',
  'Sesión expira después de 30 minutos de inactividad',
  'Registro de auditoría habilitado para todos los módulos',
  'Principio de mínimo privilegio aplicado',
  'Revisión de accesos cada 90 días',
]

function RoleIcon({ name, size = 18 }) {
  let content
  switch (name) {
    case 'roles': content = <><circle cx="8" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M2.5 20v-2a5 5 0 0 1 5-5h1a5 5 0 0 1 5 5v2m1-6h1a4 4 0 0 1 4 4v2" /></>; break
    case 'key': content = <><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8m-3 3 2 2m-5 1 2 2" /></>; break
    case 'shield': content = <path d="M12 3 20 6v5c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V6l8-3Z" />; break
    case 'clock': content = <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>; break
    case 'plus': content = <path d="M12 5v14M5 12h14" />; break
    case 'clone': content = <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>; break
    case 'save': content = <><path d="M5 3h12l3 3v15H4V4a1 1 0 0 1 1-1Z" /><path d="M8 3v6h8V3M8 21v-7h8v7" /></>; break
    case 'refresh': content = <><path d="M20 7v5h-5" /><path d="M18.5 16a8 8 0 1 1 1.2-8.5L20 12" /></>; break
    case 'document': content = <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 12h7M9 16h7" /></>; break
    case 'layers': content = <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>; break
    case 'users': content = <><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-1.5A4.5 4.5 0 0 1 8 14h2a4.5 4.5 0 0 1 4.5 4.5V20M16 6a3 3 0 0 1 0 5m1 3a4 4 0 0 1 4 4v2" /></>; break
    case 'clipboard': content = <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V2h6v2M9 9h6M9 13h6M9 17h4" /></>; break
    case 'chart': content = <path d="M4 20V10m5 10V5m5 15v-7m5 7V8M2 20h20" />; break
    case 'cloud': content = <><path d="M6.5 18H18a4 4 0 0 0 .6-8A6.5 6.5 0 0 0 6.3 8.2 5 5 0 0 0 6.5 18Z" /><path d="M12 11v7m0-7-3 3m3-3 3 3" /></>; break
    case 'settings': content = <><circle cx="12" cy="12" r="3" /><path d="M19 14.5 21 16l-2 3-2.4-1a8 8 0 0 1-2.1 1.2L14 22h-4l-.5-2.8A8 8 0 0 1 7.4 18L5 19l-2-3 2-1.5a8 8 0 0 1 0-5L3 8l2-3 2.4 1a8 8 0 0 1 2.1-1.2L10 2h4l.5 2.8A8 8 0 0 1 16.6 6L19 5l2 3-2 1.5a8 8 0 0 1 0 5Z" /></>; break
    case 'user': content = <><circle cx="12" cy="8" r="3" /><path d="M5 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2" /></>; break
    case 'more': content = <><circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" /></>; break
    case 'info': content = <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v.5" /></>; break
    case 'check': content = <path d="m7 12 3 3 7-7" />; break
    default: content = <circle cx="12" cy="12" r="8" />
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function RolesView({ globalQuery }) {
  const [selectedRoleId, setSelectedRoleId] = useState('editor')
  const [permissions, setPermissions] = useState(permissionProfiles)
  const [pendingChanges, setPendingChanges] = useState(3)
  const [notice, setNotice] = useState('')
  const deferredQuery = useDeferredValue(globalQuery.trim().toLowerCase())
  const selectedRole = roles.find((role) => role.id === selectedRoleId) || roles[1]
  const visibleRoles = roles.filter((role) => !deferredQuery || [role.name, role.description].join(' ').toLowerCase().includes(deferredQuery))

  function togglePermission(moduleIndex, actionIndex) {
    setPermissions((current) => ({
      ...current,
      [selectedRoleId]: current[selectedRoleId].map((row, rowIndex) => rowIndex === moduleIndex
        ? row.map((enabled, columnIndex) => columnIndex === actionIndex ? !enabled : enabled)
        : row),
    }))
    setPendingChanges((count) => count + 1)
    setNotice('Hay cambios pendientes de publicación.')
  }

  function resetPermissions() {
    setPermissions((current) => ({ ...current, [selectedRoleId]: permissionProfiles[selectedRoleId] }))
    setPendingChanges(0)
    setNotice(`Se restablecieron los permisos de ${selectedRole.name}.`)
  }

  function saveChanges() {
    setPendingChanges(0)
    setNotice('Los cambios se guardaron correctamente.')
  }

  return (
    <div className="roles-view">
      <header className="roles-heading">
        <div><h1>Roles y permisos</h1><p>Define perfiles de acceso y políticas de autorización para garantizar la seguridad de la información.</p></div>
        <div className="roles-heading__actions">
          <button type="button" onClick={() => setNotice('El formulario para crear un rol está listo para conectarse al backend.')}><RoleIcon name="plus" /> Nuevo rol</button>
          <button type="button" onClick={() => setNotice(`Se preparó una copia del rol ${selectedRole.name}.`)}><RoleIcon name="clone" /> Clonar rol</button>
          <button className="is-primary" type="button" onClick={saveChanges}><RoleIcon name="save" /> Guardar cambios</button>
        </div>
        <span className="roles-live-notice" role="status">{notice}</span>
      </header>

      <section className="roles-metrics" aria-label="Indicadores de roles y permisos">
        <article><span className="roles-metric-icon roles-metric-icon--blue"><RoleIcon name="roles" size={27} /></span><div><p>Total de roles</p><strong>6</strong><small>roles definidos</small></div></article>
        <article><span className="roles-metric-icon roles-metric-icon--green"><RoleIcon name="key" size={27} /></span><div><p>Permisos definidos</p><strong>42</strong><small>permisos configurados</small></div></article>
        <article><span className="roles-metric-icon roles-metric-icon--orange"><RoleIcon name="shield" size={27} /></span><div><p>Roles críticos</p><strong>2</strong><small>requieren mayor control</small></div></article>
        <article><span className="roles-metric-icon roles-metric-icon--violet"><RoleIcon name="clock" size={27} /></span><div><p>Cambios pendientes</p><strong>{pendingChanges}</strong><small>{pendingChanges ? 'sin publicar' : 'todo actualizado'}</small></div></article>
      </section>

      <div className="roles-main-grid">
        <section className="roles-panel roles-list-panel">
          <h2>Lista de roles</h2>
          <div className="roles-table-scroll">
            <table>
              <thead><tr><th>Rol</th><th>Descripción</th><th>Usuarios asignados</th><th>Estado</th><th aria-label="Acciones" /></tr></thead>
              <tbody>{visibleRoles.map((role) => <tr className={role.id === selectedRoleId ? 'is-selected' : ''} key={role.id} onClick={() => setSelectedRoleId(role.id)}><td><span className={`roles-avatar roles-avatar--${role.tone}`}>{role.initials}</span><strong>{role.name}</strong></td><td>{role.description}</td><td><RoleIcon name="user" size={15} /> {role.users}</td><td><span className="roles-state">Activo</span></td><td><button type="button" aria-label={`Opciones de ${role.name}`} onClick={(event) => event.stopPropagation()}><RoleIcon name="more" size={16} /></button></td></tr>)}</tbody>
            </table>
            {!visibleRoles.length && <p className="roles-empty">No se encontraron roles para “{globalQuery}”.</p>}
          </div>
          <footer><span>Mostrando 1 a {visibleRoles.length} de 6 roles</span><div><button type="button" disabled>‹</button><button className="is-current" type="button">1</button><button type="button" disabled>›</button></div></footer>
        </section>

        <section className="roles-panel roles-matrix-panel">
          <header><h2>Matriz de permisos del rol: <strong>{selectedRole.name}</strong> <RoleIcon name="info" size={15} /></h2><button type="button" onClick={resetPermissions}><RoleIcon name="refresh" size={15} /> Restablecer a predeterminado</button></header>
          <div className="roles-matrix-scroll"><table><thead><tr><th>Módulo</th>{actions.map((action) => <th key={action}>{action}</th>)}</tr></thead><tbody>{modules.map(([icon, module], moduleIndex) => <tr key={module}><td><RoleIcon name={icon} size={17} /> {module}</td>{actions.map((action, actionIndex) => <td key={action}><input type="checkbox" aria-label={`${action} ${module}`} checked={permissions[selectedRoleId][moduleIndex][actionIndex]} onChange={() => togglePermission(moduleIndex, actionIndex)} /></td>)}</tr>)}</tbody></table></div>
        </section>
      </div>

      <div className="roles-lower-grid">
        <section className="roles-panel roles-history">
          <h2>Historial de cambios del rol: <strong>{selectedRole.name}</strong></h2>
          <div className="roles-history-scroll"><table><thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Acción</th><th>Detalle</th><th>Estado</th></tr></thead><tbody>{history.map(([date, initials, user, action, detail]) => <tr key={`${date}-${action}`}><td>{date}</td><td><span>{initials}</span>{user}</td><td>{action}</td><td>{detail}</td><td><b>Publicado</b></td></tr>)}</tbody></table></div>
        </section>

        <aside className="roles-panel roles-policies">
          <header><h2>Políticas de seguridad aplicadas</h2><RoleIcon name="shield" size={18} /></header>
          <ul>{policies.map((policy) => <li key={policy}><span><RoleIcon name="check" size={12} /></span>{policy}</li>)}</ul>
        </aside>
      </div>
    </div>
  )
}

export default RolesView
