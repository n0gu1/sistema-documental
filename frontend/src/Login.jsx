import { useState } from 'react'
import './Login.css'

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    console.log('Login:', { email, password, rememberMe })
  }

  return (
    <div className="login-container">
      {/* Panel izquierdo */}
      <div className="login-left">
        <div className="login-left-content">
          <div className="login-logo-left">
            <span className="logo-consultoria">Consultoría</span>
            <span className="logo-alexandria">Alexandria</span>
          </div>
          
          <div className="login-feature">
            <div className="feature-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
            </div>
            <div className="feature-text">
              <h3>Gestión Documental</h3>
              <p>Control, trazabilidad y seguridad para la gestión de documentos institucionales.</p>
            </div>
          </div>
        </div>
        
        <div className="login-left-footer">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <span>Plataforma segura y confiable</span>
        </div>
        
        {/* Decoración de ondas */}
        <svg className="wave-decoration" viewBox="0 0 400 200" preserveAspectRatio="none">
          <path d="M0,100 Q100,150 200,100 T400,100" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2"/>
          <path d="M0,120 Q100,170 200,120 T400,120" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2"/>
          <path d="M0,140 Q100,190 200,140 T400,140" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2"/>
        </svg>
      </div>

      {/* Formulario central */}
      <div className="login-center">
        <div className="login-card">
          <div className="login-logo-center">
            <span className="logo-consultoria">Consultoría</span>
            <span className="logo-alexandria">Alexandria</span>
          </div>
          
          <h1 className="login-title">Inicio de Sesión</h1>
          <p className="login-subtitle">Acceda de forma segura a la plataforma de gestión documental.</p>
          
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="email">Correo o usuario</label>
              <div className="input-wrapper">
                <svg className="input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
                <input
                  type="text"
                  id="email"
                  placeholder="Ingrese su correo o usuario"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            
            <div className="form-group">
              <label htmlFor="password">Contraseña</label>
              <div className="input-wrapper">
                <svg className="input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  placeholder="Ingrese su contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button 
                  type="button" 
                  className="toggle-password"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>
            
            <div className="form-options">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span className="checkmark"></span>
                Recordarme
              </label>
              <a href="#" className="forgot-password">¿Olvidó su contraseña?</a>
            </div>
            
            <button type="submit" className="login-button">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              Iniciar sesión
            </button>
          </form>
          
          <div className="login-footer">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <p>Acceso seguro a la plataforma de gestión documental con control de versiones y trazabilidad.</p>
          </div>
        </div>
      </div>

      {/* Panel derecho - ilustración */}
      <div className="login-right">
        <div className="illustration">
          {/* Carpeta principal */}
          <div className="folder-main">
            <div className="folder-tab"></div>
            <div className="folder-body">
              <div className="folder-line"></div>
              <div className="folder-line short"></div>
            </div>
          </div>
          
          {/* Documentos */}
          <div className="documents">
            <div className="doc doc-1">
              <div className="doc-line"></div>
              <div className="doc-line short"></div>
            </div>
            <div className="doc doc-2">
              <div className="doc-line"></div>
              <div className="doc-line short"></div>
            </div>
          </div>
          
          {/* Control de versiones */}
          <div className="version-card">
            <h4>Control de versiones</h4>
            <div className="version-item">
              <span className="version-badge">Versión 2.1</span>
              <span className="version-status actual">Actual</span>
            </div>
            <div className="version-item">
              <span className="version-badge">Versión 2.0</span>
              <span className="version-date">15/06/2024 10:30</span>
            </div>
            <div className="version-item">
              <span className="version-badge">Versión 1.0</span>
              <span className="version-date">02/05/2024 09:15</span>
            </div>
          </div>
          
          {/* Iconos decorativos */}
          <div className="cloud-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5">
              <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
            </svg>
          </div>
          
          <div className="shield-icon">
            <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="M9 12l2 2 4-4" stroke="#10b981" strokeWidth="2"/>
            </svg>
          </div>
          
          <div className="dots-decoration">
            {[...Array(9)].map((_, i) => (
              <div key={i} className="dot"></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login
