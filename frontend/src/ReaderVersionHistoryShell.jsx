import ReaderVersionHistoryView from './ReaderVersionHistoryView'
import { ReaderLibraryBrand, ReaderNavigation, ReaderShellHeader } from './ReaderLibraryShell'
import './EditorDashboard.css'
import './ReaderDashboard.css'
import './ReaderVersionHistoryView.css'

function ReaderVersionHistoryShell({ user, documentId, onClose, onNavigate }) {
  return <main className="editor-shell reader-shell reader-history-shell"><aside className="editor-sidebar"><ReaderLibraryBrand /><ReaderNavigation active="history" onNavigate={onNavigate} onClose={onClose} /><div className="reader-sidebar-illustration" aria-hidden="true">♜</div><div className="reader-sidebar-footer">© {new Date().getFullYear()} Consultoría Alexandria.<br />Todos los derechos reservados.</div></aside><section className="editor-workspace"><ReaderShellHeader user={user} /><main className="editor-content reader-history-content"><ReaderVersionHistoryView documentId={documentId} onBack={onClose} onAction={() => {}} /></main></section></main>
}

export default ReaderVersionHistoryShell
