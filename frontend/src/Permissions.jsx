import { createContext, useContext } from 'react'
import { hasPermission } from './permissionPolicy'
import './Permissions.css'

const PermissionContext = createContext(null)

export function PermissionProvider({ user, children }) {
  return <PermissionContext.Provider value={user}>{children}</PermissionContext.Provider>
}

export function usePermissions() {
  const user = useContext(PermissionContext)
  return { user, can: (permission) => hasPermission(user, permission) }
}

export function PermissionGate({ permission, children, fallback = null }) {
  const { can } = usePermissions()
  return can(permission) ? children : fallback
}

export function PermissionButton({ permission, disabled, onClick, className = '', title, ...props }) {
  const { can } = usePermissions()
  const allowed = can(permission)
  return <button {...props} className={`${className}${allowed ? '' : ' permission-denied'}`} title={allowed ? title : 'No tiene permiso para esta función.'} disabled={!allowed || disabled} onClick={allowed ? onClick : undefined} />
}

export function PermissionForm({ permission, onSubmit, children, ...props }) {
  const { can } = usePermissions()
  if (!can(permission)) return null
  return <form {...props} onSubmit={onSubmit}>{children}</form>
}

export function PermissionInput({ permission, disabled, onChange, ...props }) {
  const { can } = usePermissions()
  const allowed = can(permission)
  return <input {...props} disabled={!allowed || disabled} onChange={allowed ? onChange : undefined} />
}
