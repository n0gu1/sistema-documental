import { useEffect, useState } from 'react'
import Dashboard from './Dashboard'
import EditorDashboard from './EditorDashboard'
import ReaderDashboard from './ReaderDashboard'
import ReaderLibraryShell from './ReaderLibraryShell'
import ReaderDocumentShell from './ReaderDocumentShell'
import ReaderVersionHistoryShell from './ReaderVersionHistoryShell'
import ReaderReadingHistoryShell from './ReaderReadingHistoryShell'
import ReaderFavoritesShell from './ReaderFavoritesShell'
import ReviewerDashboard from './ReviewerDashboard'
import { apiRequest } from './api'
import './Login.css'

function Brand({ compact = false }) {
  return (
    <div className={`brand${compact ? ' brand--compact' : ''}`} aria-label="Consultoría Alexandria">
      <span>Consultoría</span>
      <strong>Alexandria</strong>
    </div>
  )
}

function LockIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="10" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.5 10V7.2a3.5 3.5 0 0 1 7 0V10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="15.5" r="1.15" fill="currentColor" />
    </svg>
  )
}

function ShieldIcon({ size = 23 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2.5 20 5.7v5.6c0 5-3.4 8.2-8 10.2-4.6-2-8-5.2-8-10.2V5.7L12 2.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="m8.7 12.1 2.1 2.1 4.7-4.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function DocumentIcon() {
  return (
    <svg width="30" height="34" viewBox="0 0 30 34" fill="none" aria-hidden="true">
      <path d="M5 1.5h12.8L25 8.8v23.7H5V1.5Z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M17.5 1.8v7.4h7.2M9 15h12M9 20h12M9 25h9" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

function DocumentIllustration() {
  return (
    <svg className="document-illustration" viewBox="0 0 560 650" fill="none" role="img" aria-label="Ilustración de gestión documental segura">
      <defs>
        <linearGradient id="binderFace" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#F7FAFF" />
          <stop offset="1" stopColor="#D8E7FA" />
        </linearGradient>
        <linearGradient id="binderSide" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#E9F2FD" />
          <stop offset="1" stopColor="#C5DAF3" />
        </linearGradient>
        <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#EAF2FC" />
        </linearGradient>
        <linearGradient id="blueShield" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#EEF6FF" />
          <stop offset="1" stopColor="#90BDF6" />
        </linearGradient>
        <filter id="softShadow" x="-30%" y="-30%" width="160%" height="180%">
          <feDropShadow dx="0" dy="14" stdDeviation="13" floodColor="#87A6CB" floodOpacity=".14" />
        </filter>
      </defs>

      <g opacity=".72" stroke="#BFD4ED" strokeWidth="1.5" strokeDasharray="7 7">
        <path d="M67 296 336 139l172 101v234L243 627 67 523V296Z" />
        <path d="m67 296 176 102 265-158M243 398v229" />
      </g>
      <ellipse cx="306" cy="578" rx="215" ry="44" fill="#D8E7F7" opacity=".34" />

      <g filter="url(#softShadow)">
        <g transform="translate(50 151)">
          <path d="m0 54 100-57 48 28-100 58L0 54Z" fill="#F8FBFF" stroke="#AFC9E8" strokeWidth="1.5" />
          <path d="m0 54 48 29v229L0 282V54Z" fill="url(#binderSide)" stroke="#94B8E2" strokeWidth="1.5" />
          <path d="m48 83 100-58v229L48 312V83Z" fill="url(#binderFace)" stroke="#AAC5E5" strokeWidth="1.5" />
          <path d="M8 88 38 105v112L8 200V88Z" fill="#EAF3FE" stroke="#ACC8E8" />
          <ellipse cx="25" cy="252" rx="11" ry="14" fill="#F6FAFF" stroke="#A8C5E7" />
        </g>
        <g transform="translate(104 128)">
          <path d="m0 54 100-57 48 28-100 58L0 54Z" fill="#FBFDFF" stroke="#B8CFEA" strokeWidth="1.5" />
          <path d="m0 54 48 29v229L0 282V54Z" fill="url(#binderSide)" stroke="#9BBADE" strokeWidth="1.5" />
          <path d="m48 83 100-58v229L48 312V83Z" fill="url(#binderFace)" stroke="#AAC5E5" strokeWidth="1.5" />
          <path d="M8 88 38 105v112L8 200V88Z" fill="#EAF3FE" stroke="#ACC8E8" />
          <ellipse cx="25" cy="252" rx="11" ry="14" fill="#F6FAFF" stroke="#A8C5E7" />
        </g>
        <g transform="translate(161 166)">
          <path d="m0 54 100-57 48 28-100 58L0 54Z" fill="#FBFDFF" stroke="#B8CFEA" strokeWidth="1.5" />
          <path d="m0 54 48 29v229L0 282V54Z" fill="url(#binderSide)" stroke="#9BBADE" strokeWidth="1.5" />
          <path d="m48 83 100-58v229L48 312V83Z" fill="url(#binderFace)" stroke="#AAC5E5" strokeWidth="1.5" />
          <path d="M8 88 38 105v112L8 200V88Z" fill="#EAF3FE" stroke="#ACC8E8" />
          <ellipse cx="25" cy="252" rx="11" ry="14" fill="#F6FAFF" stroke="#A8C5E7" />
        </g>
      </g>

      <g filter="url(#softShadow)" transform="translate(276 56)">
        <path d="M0 15A15 15 0 0 1 15 0h109l58 65v179a15 15 0 0 1-15 15H15a15 15 0 0 1-15-15V15Z" fill="url(#paper)" stroke="#4F88D4" strokeWidth="1.7" />
        <path d="M124 0v49a16 16 0 0 0 16 16h42" fill="#BBD8FB" />
        <path d="m124 0 58 65h-42a16 16 0 0 1-16-16V0Z" stroke="#4F88D4" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M28 72h48M28 103h112M28 132h112M28 161h112M28 190h92" stroke="#DFEAF7" strokeWidth="9" />
      </g>

      <g filter="url(#softShadow)" transform="translate(362 249)">
        <path d="M33 53c8-29 33-48 62-48 36 0 65 29 65 65v3c28 4 50 29 50 59 0 33-26 59-58 59H44c-35 0-64-29-64-65 0-34 23-62 53-73Z" fill="url(#paper)" stroke="#A9C2DF" strokeWidth="1.5" />
        <g transform="translate(72 69)" stroke="#749DD0" strokeWidth="2">
          <rect x="0" y="28" width="46" height="47" rx="6" />
          <path d="M9 28V17a14 14 0 0 1 28 0v11" />
          <path d="M23 47v12" strokeLinecap="round" />
          <circle cx="23" cy="45" r="4" fill="#BFD5EF" />
        </g>
      </g>

      <g filter="url(#softShadow)" transform="translate(247 355) rotate(8 104 141)">
        <rect x="0" y="0" width="208" height="282" rx="13" fill="url(#paper)" stroke="#8EAFD5" strokeWidth="1.4" />
        <text x="21" y="42" fill="#52729A" fontSize="14" fontFamily="Arial, sans-serif">Control de versiones</text>
        <g fontFamily="Arial, sans-serif" fontSize="10">
          <rect x="16" y="58" width="176" height="57" rx="8" fill="#F5F9FE" stroke="#DCE8F5" />
          <circle cx="27" cy="77" r="4" fill="#6EA6ED" /><text x="39" y="81" fill="#547295">Versión 2.1</text>
          <rect x="139" y="68" width="40" height="20" rx="9" fill="#DDF4E8" /><text x="148" y="82" fill="#46926B">Actual</text>
          <rect x="16" y="124" width="176" height="57" rx="8" fill="#F8FBFF" stroke="#DCE8F5" />
          <circle cx="27" cy="143" r="4" fill="#82AFE6" /><text x="39" y="147" fill="#627D9D">Versión 2.0</text>
          <text x="39" y="164" fill="#9BB0C8">15/05/2024 10:30</text>
          <rect x="16" y="190" width="176" height="57" rx="8" fill="#F8FBFF" stroke="#DCE8F5" />
          <circle cx="27" cy="209" r="4" fill="#82AFE6" /><text x="39" y="213" fill="#627D9D">Versión 1.0</text>
          <text x="39" y="230" fill="#9BB0C8">02/05/2024 09:15</text>
        </g>
      </g>

      <g filter="url(#softShadow)" transform="translate(96 462)">
        <path d="M54 0c18 13 37 15 54 12v58c0 41-23 67-54 81C23 137 0 111 0 70V12C18 15 36 13 54 0Z" fill="url(#blueShield)" stroke="#397DD5" strokeWidth="2" />
        <path d="M54 15c13 9 26 11 39 9v43c0 31-16 51-39 63-23-12-39-32-39-63V24c13 2 26 0 39-9Z" fill="#F5FAFF" stroke="#9BC1EF" />
        <path d="m34 70 15 16 28-31" stroke="#4C91E7" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  )
}

function Login() {
  const [showPassword, setShowPassword] = useState(false)
  const [identity, setIdentity] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [user, setUser] = useState(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [documentOpen, setDocumentOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [readingOpen, setReadingOpen] = useState(false)
  const [favoritesOpen, setFavoritesOpen] = useState(false)
  const [readerDocumentId, setReaderDocumentId] = useState(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  useEffect(() => {
    const openLibrary = () => setLibraryOpen(true)
    const openDocument = (event) => { setReaderDocumentId(event.detail?.documentId || null); setDocumentOpen(true) }
    const openHistory = () => setHistoryOpen(true)
    const openReading = () => setReadingOpen(true)
    const openFavorites = () => setFavoritesOpen(true)
    window.addEventListener('reader-library-open', openLibrary)
    window.addEventListener('reader-document-open', openDocument)
    window.addEventListener('reader-history-open', openHistory)
    window.addEventListener('reader-reading-open', openReading)
    window.addEventListener('reader-favorites-open', openFavorites)
    return () => { window.removeEventListener('reader-library-open', openLibrary); window.removeEventListener('reader-document-open', openDocument); window.removeEventListener('reader-history-open', openHistory); window.removeEventListener('reader-reading-open', openReading); window.removeEventListener('reader-favorites-open', openFavorites) }
  }, [])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true
    apiRequest('/api/auth/me/')
      .catch(() => null)
      .then((data) => {
        if (active && data?.user) setUser(data.user)
      })
      .catch(() => {})
    return () => { active = false }
  }, [])

  async function handleLogin(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const data = await apiRequest('/api/auth/login/', {
        method: 'POST',
        body: { identity, password, remember },
      })
      setUser(data.user)
      setCurrentPassword(password)
      setPassword('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handlePasswordChange(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const data = await apiRequest('/api/auth/change-password/', {
        method: 'POST',
        body: {
          current_password: currentPassword,
          new_password: newPassword,
          confirm_password: confirmPassword,
        },
      })
      setUser(data.user)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLogout() {
    setError('')
    setSubmitting(true)
    try {
      await apiRequest('/api/auth/logout/', { method: 'POST' })
      setUser(null)
      setLibraryOpen(false)
      setDocumentOpen(false)
      setHistoryOpen(false)
      setReadingOpen(false)
      setFavoritesOpen(false)
      setReaderDocumentId(null)
      setIdentity('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function openReaderView(view, documentId = null) {
    const target = view === 'documents' ? 'document' : view
    setLibraryOpen(target === 'library')
    setDocumentOpen(target === 'document')
    setHistoryOpen(target === 'history')
    setReadingOpen(target === 'reading')
    setFavoritesOpen(target === 'favorites')
    if (documentId) setReaderDocumentId(documentId)
  }

  const isAdministrator = user?.roles?.some((role) => role.code === 'ADMINISTRADOR')
  const isEditor = user?.roles?.some((role) => role.code === 'EDITOR')
  const isReviewer = user?.roles?.some((role) => ['REVISOR', 'REVIEWER'].includes(role.code))
  const isReader = user?.roles?.some((role) => role.code === 'LECTOR')

  if (user && !user.must_change_password && isAdministrator) {
    return <Dashboard user={user} onLogout={handleLogout} logoutPending={submitting} error={error} />
  }

  if (user && !user.must_change_password && isEditor) {
    return <EditorDashboard user={user} onLogout={handleLogout} logoutPending={submitting} error={error} />
  }

  if (user && !user.must_change_password && isReviewer) {
    return <ReviewerDashboard user={user} onLogout={handleLogout} logoutPending={submitting} error={error} />
  }

  if (user && !user.must_change_password && isReader) {
    return <><ReaderDashboard user={user} onLogout={handleLogout} logoutPending={submitting} error={error} onNavigate={openReaderView} />{libraryOpen && <div className="reader-library-overlay"><ReaderLibraryShell user={user} onClose={() => openReaderView('dashboard')} onNavigate={openReaderView} onLogout={handleLogout} logoutPending={submitting} /></div>}{documentOpen && <div className="reader-library-overlay"><ReaderDocumentShell user={user} documentId={readerDocumentId} onClose={() => openReaderView('dashboard')} onNavigate={openReaderView} onLogout={handleLogout} logoutPending={submitting} /></div>}{historyOpen && <div className="reader-library-overlay"><ReaderVersionHistoryShell user={user} documentId={readerDocumentId} onClose={() => openReaderView('dashboard')} onNavigate={openReaderView} onLogout={handleLogout} logoutPending={submitting} /></div>}{readingOpen && <div className="reader-library-overlay"><ReaderReadingHistoryShell user={user} onClose={() => openReaderView('dashboard')} onNavigate={openReaderView} onLogout={handleLogout} logoutPending={submitting} /></div>}{favoritesOpen && <div className="reader-library-overlay"><ReaderFavoritesShell user={user} onClose={() => openReaderView('dashboard')} onNavigate={openReaderView} onLogout={handleLogout} logoutPending={submitting} /></div>}</>
  }

  return (
    <main className="login-page">
      <aside className="login-aside">
        <div>
          <Brand />
          <div className="aside-rule" />
          <div className="aside-feature">
            <div className="aside-feature__icon"><DocumentIcon /></div>
            <div>
              <h2>Gestión Documental</h2>
              <p>Control, trazabilidad y seguridad<br />para la gestión de documentos<br />institucionales.</p>
            </div>
          </div>
        </div>

        <div className="aside-trust"><ShieldIcon /><span>Plataforma segura y confiable</span></div>
        <svg className="aside-waves" viewBox="0 0 400 520" preserveAspectRatio="none" aria-hidden="true">
          <path d="M-45 418C104 397 235 166 401 221" />
          <path d="M-25 476C143 438 224 223 424 275" />
          <path d="M-62 548C112 470 242 291 428 337" />
        </svg>
      </aside>

      <section className="login-main">
        <div className="dot-grid dot-grid--top" aria-hidden="true" />
        <div className="dot-grid dot-grid--bottom" aria-hidden="true" />

        <div className="login-stage">
          <section className="login-card" aria-labelledby="login-title">
            <Brand compact />
            <div className="login-heading">
              <h1 id="login-title">{user ? (user.must_change_password ? 'Cambie su contraseña' : 'Sesión iniciada') : 'Inicio de Sesión'}</h1>
              <p>{user ? (user.must_change_password ? 'Defina una contraseña personal para continuar.' : `Bienvenido, ${user.full_name}.`) : <>Acceda de forma segura a la plataforma<br />de gestión documental.</>}</p>
            </div>

            {!user && <form onSubmit={handleLogin}>
              <div className="form-field">
                <label htmlFor="identity">Correo o usuario</label>
                <div className="input-shell">
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.7" />
                    <path d="M5 21v-2.2a5.3 5.3 0 0 1 5.3-5.3h3.4a5.3 5.3 0 0 1 5.3 5.3V21H5Z" stroke="currentColor" strokeWidth="1.7" />
                  </svg>
                  <input id="identity" name="identity" type="text" autoComplete="username" placeholder="Ingrese su correo o usuario" value={identity} onChange={(event) => setIdentity(event.target.value)} required />
                </div>
              </div>

              <div className="form-field">
                <label htmlFor="password">Contraseña</label>
                <div className="input-shell">
                  <LockIcon />
                  <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Ingrese su contraseña" value={password} onChange={(event) => setPassword(event.target.value)} required />
                  <button className="password-toggle" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={showPassword}>
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M3 3 21 21M10.6 10.7a2 2 0 0 0 2.7 2.7M9.3 5.4A10 10 0 0 1 12 5c5.7 0 9 7 9 7a15.8 15.8 0 0 1-2.1 3.2M6.2 6.3C4.1 8 3 12 3 12s3.3 7 9 7a9.3 9.3 0 0 0 3.2-.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="form-options">
                <label className="remember-option"><input type="checkbox" name="remember" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><span>Recordarme</span></label>
                <button type="button" className="forgot-link" onClick={() => setError('Solicite al administrador el restablecimiento de su contraseña.')}>¿Olvidó su contraseña?</button>
              </div>

              {error && <p className="form-message form-message--error" role="alert">{error}</p>}
              <button type="submit" className="submit-button" disabled={submitting}><LockIcon size={18} /><span>{submitting ? 'Verificando...' : 'Iniciar sesión'}</span></button>
            </form>}

            {user?.must_change_password && <form onSubmit={handlePasswordChange}>
              <div className="form-field">
                <label htmlFor="current-password">Contraseña temporal</label>
                <div className="input-shell"><LockIcon /><input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></div>
              </div>
              <div className="form-field">
                <label htmlFor="new-password">Nueva contraseña</label>
                <div className="input-shell"><LockIcon /><input id="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></div>
              </div>
              <div className="form-field">
                <label htmlFor="confirm-password">Confirme la nueva contraseña</label>
                <div className="input-shell"><LockIcon /><input id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></div>
              </div>
              {error && <p className="form-message form-message--error" role="alert">{error}</p>}
              <button type="submit" className="submit-button" disabled={submitting}><LockIcon size={18} /><span>{submitting ? 'Guardando...' : 'Guardar contraseña'}</span></button>
              <button type="button" className="submit-button submit-button--secondary" onClick={handleLogout} disabled={submitting}>Cerrar sesión</button>
            </form>}

            {user && !user.must_change_password && <div className="session-summary">
              <div className="session-avatar" aria-hidden="true">{user.first_name?.[0]}{user.last_name?.[0]}</div>
              <strong>{user.full_name}</strong>
              <span>{user.email}</span>
              <span className="session-role">{user.roles?.map((role) => role.name).join(', ') || 'Usuario'}</span>
              {error && <p className="form-message form-message--error" role="alert">{error}</p>}
              <button type="button" className="submit-button submit-button--secondary" onClick={handleLogout} disabled={submitting}>{submitting ? 'Cerrando...' : 'Cerrar sesión'}</button>
            </div>}

            <div className="card-trust">
              <div><span /><ShieldIcon size={19} /><span /></div>
              <p>Acceso seguro a la plataforma de gestión documental<br />con control de versiones y trazabilidad.</p>
            </div>
          </section>

          <div className="illustration-wrap"><DocumentIllustration /></div>
        </div>
      </section>
    </main>
  )
}

export default Login
