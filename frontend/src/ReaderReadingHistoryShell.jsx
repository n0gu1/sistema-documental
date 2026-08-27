import ReaderReadingHistoryView from './ReaderReadingHistoryView'
import { ReaderLibraryBrand, ReaderNavigation, ReaderShellHeader } from './ReaderLibraryShell'
import './EditorDashboard.css'
import './ReaderDashboard.css'
import './ReaderReadingHistoryView.css'

function ReaderReadingHistoryShell({ user, onClose, onNavigate, onLogout, logoutPending }) {
  return <main className="editor-shell reader-shell reader-reading-shell"><aside className="editor-sidebar"><ReaderLibraryBrand /><ReaderNavigation active="reading" onNavigate={onNavigate} onClose={onClose} /><div className="reader-sidebar-illustration" aria-hidden="true">♜</div><div className="reader-sidebar-footer">© {new Date().getFullYear()} Consultoría Alexandria.<br />Todos los derechos reservados.</div></aside><section className="editor-workspace"><ReaderShellHeader user={user} onLogout={onLogout} logoutPending={logoutPending} /><main className="editor-content reader-reading-content"><ReaderReadingHistoryView onAction={() => {}} /></main></section></main>
}

export default ReaderReadingHistoryShell
