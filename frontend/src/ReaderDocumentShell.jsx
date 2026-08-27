import ReaderDocumentView from './ReaderDocumentView'
import { ReaderLibraryBrand, ReaderNavigation, ReaderShellHeader } from './ReaderLibraryShell'
import './EditorDashboard.css'
import './ReaderDashboard.css'
import './ReaderDocumentView.css'

function ReaderDocumentShell({ user, documentId, onClose, onNavigate, onLogout, logoutPending }) {
  return <main className="editor-shell reader-shell reader-document-shell"><aside className="editor-sidebar"><ReaderLibraryBrand /><ReaderNavigation active="documents" onNavigate={onNavigate} onClose={onClose} /><div className="reader-sidebar-illustration" aria-hidden="true">♜</div><div className="reader-sidebar-footer">© {new Date().getFullYear()} Consultoría Alexandria.<br />Todos los derechos reservados.</div></aside><section className="editor-workspace"><ReaderShellHeader user={user} onLogout={onLogout} logoutPending={logoutPending} /><main className="editor-content reader-document-content"><ReaderDocumentView documentId={documentId} onBack={onClose} onAction={() => {}} /></main></section></main>
}

export default ReaderDocumentShell
