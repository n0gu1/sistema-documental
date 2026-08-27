import ReaderFavoritesView from './ReaderFavoritesView'
import { ReaderLibraryBrand, ReaderNavigation, ReaderShellHeader } from './ReaderLibraryShell'
import './EditorDashboard.css'
import './ReaderDashboard.css'
import './ReaderFavoritesView.css'

function ReaderFavoritesShell({ user, onClose, onNavigate, onLogout, logoutPending }) {
  return <main className="editor-shell reader-shell reader-favorites-shell"><aside className="editor-sidebar"><ReaderLibraryBrand /><ReaderNavigation active="favorites" onNavigate={onNavigate} onClose={onClose} /><div className="reader-sidebar-illustration" aria-hidden="true">♜</div><div className="reader-sidebar-footer">© {new Date().getFullYear()} Consultoría Alexandria.<br />Todos los derechos reservados.</div></aside><section className="editor-workspace"><ReaderShellHeader user={user} onLogout={onLogout} logoutPending={logoutPending} /><main className="editor-content reader-favorites-content-shell"><ReaderFavoritesView onAction={() => {}} /></main></section></main>
}

export default ReaderFavoritesShell
