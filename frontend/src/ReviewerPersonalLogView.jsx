import { useEffect, useState } from 'react'
import { apiRequest } from './documentApi'
import './ReviewerPersonalLogView.css'

function ReviewerPersonalLogView({ user }) {
  const [events, setEvents] = useState([])
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    apiRequest(`/api/audit/?user_id=${user.id}&limit=100`).then((data) => { if (active) setEvents(data.results || []) }).catch((requestError) => { if (active) setError(requestError.message) })
    return () => { active = false }
  }, [user.id])
  return <div className="reviewer-personal-log"><header className="reviewer-log-heading"><div><h1>Bitácora personal</h1><p>Consulta el historial de tus revisiones, comentarios y dictámenes emitidos.</p></div></header>{error ? <section className="reviewer-log-empty"><strong>La bitácora personal no está disponible</strong><span>{error}. El backend la reserva para administradores.</span></section> : <section className="reviewer-log-table-card"><div className="reviewer-log-table-wrap"><table><thead><tr><th>Fecha y hora</th><th>Acción</th><th>Resultado</th><th>Detalle</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{event.event_at}</td><td>{event.action || event.action_code}</td><td>{event.result || '—'}</td><td>{event.details ? JSON.stringify(event.details) : '—'}</td></tr>)}</tbody></table>{!events.length && <p>No hay eventos registrados.</p>}</div></section>}</div>
}

export default ReviewerPersonalLogView
