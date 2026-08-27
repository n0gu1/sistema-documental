import ReaderVersionHistoryView from './ReaderVersionHistoryView'
import { ReaderLibraryBrand, ShellIcon } from './ReaderLibraryShell'
import './EditorDashboard.css'
import './ReaderDashboard.css'
import './ReaderVersionHistoryView.css'

function ReaderVersionHistoryShell({ user, documentId, onClose }) {
  const initials = `${user.first_name?.[0] || 'M'}${user.last_name?.[0] || 'L'}`
  const displayName = `${user.first_name || 'Maria'} ${user.last_name || 'Lopez'}`
  return <main className="editor-shell reader-shell reader-history-shell"><aside className="editor-sidebar"><ReaderLibraryBrand /><nav className="editor-nav reader-nav" aria-label="Navegación del lector"><button type="button" onClick={onClose}><ShellIcon name="dashboard" size={22} /> Dashboard</button><button type="button" onClick={onClose}><ShellIcon name="library" size={22} /> Biblioteca documental</button><button type="button"><ShellIcon name="document" size={22} /> Documentos disponibles</button><button className="is-active" type="button"><ShellIcon name="layers" size={22} /> Historial de versiones</button><button type="button"><ShellIcon name="history" size={22} /> Historial de lectura</button><button type="button"><ShellIcon name="favorite" size={22} /> Favoritos</button></nav><div className="reader-sidebar-illustration" aria-hidden="true">♜</div><div className="reader-sidebar-footer">© 2024 Consultoría Alexandria.<br />Todos los derechos reservados.</div></aside><section className="editor-workspace"><header className="editor-topbar"><label className="editor-search"><ShellIcon name="search" size={20} /><input type="search" aria-label="Buscar" placeholder="Buscar documentos, versiones, usuarios..." /></label><div className="editor-topbar__actions"><button className="editor-notification" type="button" aria-label="Notificaciones"><ShellIcon name="bell" size={23} /><span>3</span></button><button className="editor-profile__trigger" type="button"><span className="editor-avatar">{initials}</span><span><strong>{displayName}</strong><small>Lector</small></span><ShellIcon name="chevron" size={17} /></button></div></header><main className="editor-content reader-history-content"><ReaderVersionHistoryView documentId={documentId} onBack={onClose} onAction={() => {}} /></main></section></main>
}

export default ReaderVersionHistoryShell
