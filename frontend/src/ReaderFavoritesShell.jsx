import ReaderFavoritesView from './ReaderFavoritesView'
import { ReaderLibraryBrand, ReaderShellHeader, ShellIcon } from './ReaderLibraryShell'
import './EditorDashboard.css'
import './ReaderDashboard.css'
import './ReaderFavoritesView.css'

function ReaderFavoritesShell({ user, onClose }) {
  return <main className="editor-shell reader-shell reader-favorites-shell"><aside className="editor-sidebar"><ReaderLibraryBrand /><nav className="editor-nav reader-nav" aria-label="Navegación del lector"><button type="button" onClick={onClose}><ShellIcon name="dashboard" size={22} /> Dashboard</button><button type="button"><ShellIcon name="library" size={22} /> Biblioteca documental</button><button type="button"><ShellIcon name="document" size={22} /> Documentos disponibles</button><button type="button"><ShellIcon name="layers" size={22} /> Historial de versiones</button><button type="button"><ShellIcon name="history" size={22} /> Historial de lectura</button><button className="is-active" type="button"><ShellIcon name="favorite" size={22} /> Favoritos</button></nav><div className="reader-sidebar-illustration" aria-hidden="true">♜</div><div className="reader-sidebar-footer">© {new Date().getFullYear()} Consultoría Alexandria.<br />Todos los derechos reservados.</div></aside><section className="editor-workspace"><ReaderShellHeader user={user} /><main className="editor-content reader-favorites-content-shell"><ReaderFavoritesView onAction={() => {}} /></main></section></main>
}

export default ReaderFavoritesShell
