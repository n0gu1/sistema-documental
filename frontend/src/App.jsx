import { useState, useEffect } from 'react'

function App() {
  const [mensaje, setMensaje] = useState('')
  const [estado, setEstado] = useState('')

  useEffect(() => {
    fetch('/api/hola-mundo/')
      .then(res => res.json())
      .then(data => {
        setMensaje(data.mensaje)
        setEstado(data.estado)
      })
      .catch(err => console.error('Error:', err))
  }, [])

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      backgroundColor: '#1a1a2e',
      color: '#e94560',
      fontFamily: 'Arial, sans-serif'
    }}>
      <div style={{
        textAlign: 'center',
        padding: '40px',
        borderRadius: '10px',
        backgroundColor: '#16213e',
        boxShadow: '0 0 20px rgba(233, 69, 96, 0.3)'
      }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '20px' }}>
          Sistema Documental
        </h1>
        <p style={{ fontSize: '1.5rem', color: '#0f3460' }}>
          {mensaje || 'Conectando al backend...'}
        </p>
        {estado && (
          <p style={{ color: '#53d769', fontSize: '1rem' }}>
            Estado: {estado}
          </p>
        )}
      </div>
    </div>
  )
}

export default App
