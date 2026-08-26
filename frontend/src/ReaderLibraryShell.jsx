import { useState } from 'react'
import ReaderLibraryView from './ReaderLibraryView'
import './EditorDashboard.css'
import './ReaderDashboard.css'
import './ReaderLibraryView.css'

export function ShellIcon({ name, size = 20 }) {
  let content
  switch (name) {
    case 'dashboard': content = <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>; break
    case 'library': content = <><path d="M4 5h16v14H4z" /><path d="M8 5v14M12 8h5M12 12h5M12 16h3" /></>; break
    case 'document': content = <><path d="M6 2.8h8.6L19 7.2V21H6z" /><path d="M14.5 3v4.5H19M9 12h7M9 16h7" /></>; break
    case 'layers': content = <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>; break
    case 'history': content = <><path d="M4 12a8 8 0 1 0 2-5.7" /><path d="M4 4v5h5M12 7v5l3 2" /></>; break
    case 'favorite': content = <path d="m12 3 2.8 5.8 6.2.9-4.5 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.7l6.2-.9L12 3Z" />; break
    case 'search': content = <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>; break
    case 'bell': content = <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7M10 20h4" /></>; break
    case 'chevron': content = <path d="m8 10 4 4 4-4" />; break
    case 'logout': content = <><path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9" /></>; break
    default: content = <circle cx="12" cy="12" r="8" />
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

export function ReaderLibraryBrand() {
  return <div className="editor-brand" aria-label="Consultoría Alexandria"><svg viewBox="0 0 52 52" aria-hidden="true"><path d="M5 18h42L26 7 5 18ZM10 21v19M18 21v19M26 21v19M34 21v19M42 21v19M6 44h40" /></svg><div><span>Consultoría</span><strong>Alexandria</strong></div></div>
}

function ReaderLibraryShell({ user, onClose, onLogout, logoutPending }) {
  const [profileOpen, setProfileOpen] = useState(false)
  const initials = `${user.first_name?.[0] || 'M'}${user.last_name?.[0] || 'L'}`
  const displayName = `${user.first_name || 'Maria'} ${user.last_name || 'Lopez'}`

  return <main className="editor-shell reader-shell reader-library-shell"><aside className="editor-sidebar"><ReaderLibraryBrand /><nav className="editor-nav reader-nav" aria-label="Navegación del lector"><button type="button" onClick={onClose}><ShellIcon name="dashboard" size={22} /> Dashboard</button><button className="is-active" type="button"><ShellIcon name="library" size={22} /> Biblioteca documental</button><button type="button"><ShellIcon name="document" size={22} /> Documentos disponibles</button><button type="button"><ShellIcon name="layers" size={22} /> Historial de versiones</button><button type="button"><ShellIcon name="history" size={22} /> Historial de lectura</button><button type="button"><ShellIcon name="favorite" size={22} /> Favoritos</button></nav><div className="reader-sidebar-illustration" aria-hidden="true">♜</div><div className="reader-sidebar-footer">© 2024 Consultoría Alexandria.<br />Todos los derechos reservados.</div></aside><section className="editor-workspace"><header className="editor-topbar"><label className="editor-search"><ShellIcon name="search" size={20} /><input type="search" aria-label="Buscar" placeholder="Buscar documentos, versiones, palabras clave..." /></label><div className="editor-topbar__actions"><button className="editor-notification" type="button" aria-label="Notificaciones"><ShellIcon name="bell" size={23} /><span>3</span></button><div className="editor-profile"><button className="editor-profile__trigger" type="button" aria-expanded={profileOpen} onClick={() => setProfileOpen((current) => !current)}><span className="editor-avatar">{initials}</span><span><strong>{displayName}</strong><small>Lector</small></span><ShellIcon name="chevron" size={17} /></button>{profileOpen && <div className="editor-profile__menu"><span>{user.email}</span><button type="button" onClick={onLogout} disabled={logoutPending}><ShellIcon name="logout" size={16} /> {logoutPending ? 'Cerrando sesión...' : 'Cerrar sesión'}</button></div>}</div></div></header><main className="editor-content reader-library-content"><ReaderLibraryView onAction={() => {}} /></main></section></main>
}

export default ReaderLibraryShell
