import { useEffect, useState } from 'react'
import { apiRequest, formatDate } from './documentApi'
import './EditorActivityLogView.css'

function LogIcon({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></svg>
}

function EditorActivityLogView({ user }) {
  const [events, setEvents] = useState([])
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    apiRequest(`/api/audit/?user_id=${user.id}&limit=100`)
      .then((data) => { if (active) setEvents(data.results || []) })
      .catch((requestError) => { if (active) setError(requestError.message) })
    return () => { active = false }
  }, [user.id])
  return <div className="editor-log-view"><header className="editor-log-heading"><div><h1>Bitácora personal</h1><p>Consulta la trazabilidad de tus acciones realizadas en el sistema.</p></div><time><LogIcon size={17} /> {new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(new Date())}</time></header>{error ? <section className="editor-log-empty"><strong>La bitácora personal no está disponible</strong><span>{error}. El backend la reserva para administradores.</span></section> : <section className="editor-log-table-panel"><div className="editor-log-table-scroll"><table><thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Acción</th><th>Resultado</th><th>Detalle</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{formatDate(event.event_at)}</td><td>{event.user_name || event.username}</td><td>{event.action || event.action_code}</td><td>{event.result || '—'}</td><td>{event.details ? JSON.stringify(event.details) : '—'}</td></tr>)}</tbody></table>{!events.length && <div className="editor-log-empty"><strong>No hay eventos registrados.</strong></div>}</div><footer><span>Mostrando {events.length} eventos</span></footer></section>}</div>
}

export default EditorActivityLogView
