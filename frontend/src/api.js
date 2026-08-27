function errorMessage(data) {
  if (typeof data?.detail === 'string') return data.detail
  for (const value of Object.values(data || {})) {
    if (Array.isArray(value) && value.length) return String(value[0])
  }
  return 'No fue posible completar la solicitud.'
}

export async function apiRequest(path, { method = 'GET', body } = {}) {
  const headers = {}
  if (body) headers['Content-Type'] = 'application/json'

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrfResponse = await fetch('/api/auth/csrf/', { credentials: 'include' })
    if (!csrfResponse.ok) throw new Error('No fue posible iniciar la conexión segura.')
    const csrfData = await csrfResponse.json()
    headers['X-CSRFToken'] = csrfData.csrf_token
  }

  const response = await fetch(path, {
    method,
    headers,
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = response.status === 204 ? null : await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(errorMessage(data))
  return data
}

export function formatDate(value, fallback = 'Sin fecha') {
  if (!value) return fallback
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
}
