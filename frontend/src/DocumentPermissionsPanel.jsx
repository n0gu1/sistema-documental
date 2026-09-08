import { PermissionGate } from './Permissions'
import { PermissionButton } from './Permissions'
import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from './documentApi'
import './DocumentPermissionsPanel.css'

function grantsFromAssignments(assignments) {
  return Object.fromEntries((assignments || []).map((assignment) => [assignment.role_id, new Set(assignment.permission_ids || [])]))
}

function DocumentPermissionsPanel({ documentId, onAction }) {
  const [catalog, setCatalog] = useState({ roles: [], permissions: [] })
  const [grants, setGrants] = useState({})
  const [policies, setPolicies] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const loadPermissions = useCallback(async () => {
    setError('')
    try {
      const data = await apiRequest(`/api/documents/${documentId}/permissions/`)
      setCatalog({ roles: data.roles || [], permissions: data.permissions || [] })
      setGrants(grantsFromAssignments(data.assignments))
      setPolicies(Object.fromEntries((data.policies || []).map((item) => [item.permission_id, item.mode])))
    } catch (requestError) { setError(requestError.message) } finally { setLoading(false) }
  }, [documentId])

  useEffect(() => { loadPermissions() }, [loadPermissions])

  function reloadPermissions() {
    setLoading(true)
    loadPermissions()
  }

  function togglePermission(roleId, permissionId) {
    setGrants((current) => {
      const next = { ...current }
      const roleGrants = new Set(next[roleId] || [])
      if (roleGrants.has(permissionId)) roleGrants.delete(permissionId)
      else roleGrants.add(permissionId)
      next[roleId] = roleGrants
      return next
    })
  }

  async function savePermissions() {
    setSaving(true)
    setError('')
    try {
      const data = await apiRequest(`/api/documents/${documentId}/permissions/`, {
        method: 'PUT',
        body: {
          policies: catalog.permissions.map((permission) => ({ permission_id: permission.id, mode: policies[permission.id] || 'HEREDAR' })),
          assignments: catalog.roles.map((role) => ({
            role_id: role.id,
            permission_ids: [...(grants[role.id] || [])],
          })),
        },
      })
      setGrants(grantsFromAssignments(data.assignments))
      setPolicies(Object.fromEntries((data.policies || []).map((item) => [item.permission_id, item.mode])))
      onAction('Los permisos explícitos se guardaron correctamente.')
    } catch (requestError) { setError(requestError.message) } finally { setSaving(false) }
  }

  const assignedCount = Object.values(grants).reduce((total, roleGrants) => total + roleGrants.size, 0)

  return <section className="editor-permissions-panel" aria-labelledby="document-permissions-title">
    <header><div><p>Control de acceso</p><h2 id="document-permissions-title">Permisos explícitos del documento</h2><span>Asigne permisos específicos a los roles activos de la organización.</span></div><div className="editor-permissions-panel__actions"><button type="button" onClick={reloadPermissions} disabled={loading}>Recargar</button><PermissionButton permission="roles.gestionar" className="is-primary" type="button" onClick={savePermissions} disabled={loading || saving || !catalog.roles.length}>{saving ? 'Guardando...' : 'Guardar permisos'}</PermissionButton></div></header>
    {error && <p className="editor-error" role="alert">{error}</p>}
    {!loading && !error && <div><p>HEREDAR: permisos globales y área. PERMITIR: sólo los roles marcados; sin marcas se bloquea. DENEGAR: bloquear. Se conserva la excepción de Administrador. Las concesiones explícitas prevalecen sobre el área.</p>{catalog.permissions.map((permission) => <label key={permission.id}>{permission.name}<select aria-label={`Política ${permission.code}`} value={policies[permission.id] || 'HEREDAR'} onChange={(event) => {
      const mode = event.target.value
      setPolicies((current) => ({ ...current, [permission.id]: mode }))
      if (mode !== 'PERMITIR') setGrants((current) => Object.fromEntries(Object.entries(current).map(([roleId, values]) => [roleId, new Set([...values].filter((id) => id !== permission.id))])))
    }}><option value="HEREDAR">HEREDAR</option><option value="PERMITIR">PERMITIR</option><option value="DENEGAR">DENEGAR</option></select></label>)}</div>}
    {!loading && !error && <p className="editor-permissions-panel__summary">{assignedCount} asignaciones activas</p>}
    {loading && <p className="editor-empty">Cargando catálogo de permisos...</p>}
    {!loading && !error && !catalog.roles.length && <p className="editor-empty">No hay roles activos disponibles.</p>}
    {!loading && !error && catalog.roles.map((role) => <article className="editor-permission-role" key={role.id}><header><div><h3>{role.name}</h3><small>{role.code}</small></div><span>{(grants[role.id] || new Set()).size} asignados</span></header><div className="editor-permission-grid">{catalog.permissions.map((permission) => <label key={permission.id}><input type="checkbox" disabled={policies[permission.id] !== 'PERMITIR'} checked={grants[role.id]?.has(permission.id) || false} onChange={() => togglePermission(role.id, permission.id)} /><span><b>{permission.name}</b><small>{permission.code}</small></span></label>)}</div></article>)}
  </section>
}

export default function AuthorizedDocumentPermissionsPanel(props) {
  return <PermissionGate permission="roles.gestionar"><DocumentPermissionsPanel {...props} /></PermissionGate>
}
