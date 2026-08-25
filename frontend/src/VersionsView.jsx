import { useState } from 'react'
import './VersionsView.css'

const versionHistory = [
  { version: '1.2', date: '23/05/2024 10:25', status: 'Publicado', owner: 'Juan Martínez', size: '512 KB', comment: 'Actualización anual de la política y controles.', tone: 'green' },
  { version: '1.1', date: '16/05/2024 09:40', status: 'En revisión', owner: 'Laura Ramírez', size: '498 KB', comment: 'Revisión por cambios en el marco normativo.', tone: 'blue' },
  { version: '1.0', date: '02/05/2024 14:15', status: 'Publicado', owner: 'Carlos Pérez', size: '476 KB', comment: 'Versión inicial aprobada.', tone: 'green' },
  { version: '0.9', date: '25/04/2024 11:30', status: 'Borrador', owner: 'María Gómez', size: '460 KB', comment: 'Borrador para revisión interna.', tone: 'orange' },
  { version: '0.8', date: '18/04/2024 16:05', status: 'Obsoleta', owner: 'Diego López', size: '433 KB', comment: 'Versión preliminar.', tone: 'gray' },
]

const compareOptions = ['1.2 (23/05/2024)', '1.1 (16/05/2024)', '1.0 (02/05/2024)', '0.9 (25/04/2024)']

function VersionIcon({ name, size = 18 }) {
  let content

  switch (name) {
    case 'document': content = <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 12h7M9 16h7" /></>; break
    case 'back': content = <path d="m15 18-6-6 6-6M9 12h11" />; break
    case 'upload': content = <><path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M5 14v6h14v-6" /></>; break
    case 'compare': content = <><path d="M7 4v16M17 4v16M3 8h8M13 16h8" /><path d="m4 8 3-3 3 3m4 8 3 3 3-3" /></>; break
    case 'send': content = <path d="m3 11 18-8-8 18-2-8-8-2Zm8 2 4-4" />; break
    case 'chevron': content = <path d="m8 10 4 4 4-4" />; break
    case 'calendar': content = <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></>; break
    case 'eye': content = <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>; break
    case 'download': content = <><path d="M12 4v12m0 0 5-5m-5 5-5-5" /><path d="M5 20h14" /></>; break
    case 'more': content = <><circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" /></>; break
    case 'sort': content = <><path d="M8 5v14m0-14L5 8m3-3 3 3M16 19V5m0 14-3-3m3 3 3-3" /></>; break
    case 'swap': content = <><path d="M7 7h12m0 0-3-3m3 3-3 3M17 17H5m0 0 3 3m-3-3 3-3" /></>; break
    default: content = <circle cx="12" cy="12" r="8" />
  }

  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function VersionsView({ onBack }) {
  const [previousVersion, setPreviousVersion] = useState('1.1 (16/05/2024)')
  const [currentVersion, setCurrentVersion] = useState('1.2 (23/05/2024)')

  function swapVersions() {
    setPreviousVersion(currentVersion)
    setCurrentVersion(previousVersion)
  }

  return (
    <div className="versions-view">
      <header className="versions-heading">
        <div><p>Control documental</p><h1>Gestión de versiones</h1><span>Administre el historial, la trazabilidad y la publicación de versiones documentales.</span></div>
        <button type="button" onClick={onBack}><VersionIcon name="back" size={17} /> Volver a documentos</button>
      </header>

      <section className="versions-document-card">
        <div className="versions-document-card__icon"><VersionIcon name="document" size={24} /></div>
        <article><span>Código</span><strong>DOC-PLT-002</strong></article>
        <article className="versions-document-card__title"><span>Título</span><strong>Política de Seguridad de la Información</strong></article>
        <article><span>Área</span><strong>Tecnología de la Información</strong></article>
        <article><span>Versión vigente</span><strong>1.2</strong></article>
        <article className="versions-document-card__owner"><span>Responsable</span><div><i>JM</i><strong>Juan Martínez<small>Jefe de TI</small></strong></div></article>
        <article><span>Estado</span><strong className="versions-status versions-status--green"><i /> Publicado</strong></article>
        <article><span>Fecha de publicación</span><strong>23/05/2024 10:25</strong></article>
        <VersionIcon name="calendar" size={18} />
      </section>

      <div className="versions-toolbar">
        <button type="button"><VersionIcon name="upload" size={18} /> Subir nueva versión</button>
        <button type="button"><VersionIcon name="compare" size={18} /> Comparar versiones</button>
        <div className="versions-toolbar__split"><button type="button"><VersionIcon name="send" size={18} /> Publicar versión</button><button type="button" aria-label="Más opciones de publicación"><VersionIcon name="chevron" size={15} /></button></div>
      </div>

      <section className="versions-panel versions-history">
        <div className="versions-panel__heading"><div><p>Historial documental</p><h2>Historial de versiones</h2></div><span>5 versiones registradas</span></div>
        <div className="versions-table-scroll">
          <table>
            <thead><tr><th>Versión</th><th>Fecha <VersionIcon name="sort" size={11} /></th><th>Estado</th><th>Responsable</th><th>Tamaño</th><th>Comentario</th><th>Acciones</th></tr></thead>
            <tbody>
              {versionHistory.map((item) => (
                <tr key={item.version}>
                  <td><strong>{item.version}</strong></td><td>{item.date}</td><td><span className={`versions-status versions-status--${item.tone}`}><i /> {item.status}</span></td><td>{item.owner}</td><td>{item.size}</td><td>{item.comment}</td>
                  <td><div className="versions-row-actions"><button type="button" aria-label={`Ver versión ${item.version}`}><VersionIcon name="eye" size={16} /></button><button type="button" aria-label={`Descargar versión ${item.version}`}><VersionIcon name="download" size={16} /></button><button type="button" aria-label={`Más acciones de versión ${item.version}`}><VersionIcon name="more" size={16} /></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer><span>Mostrando 1 a 5 de 5 versiones</span><div><button type="button" disabled>‹</button><button className="is-current" type="button">1</button><button type="button" disabled>›</button></div></footer>
      </section>

      <div className="versions-bottom-grid">
        <section className="versions-panel versions-compare">
          <div className="versions-compare__header">
            <div><p>Análisis de cambios</p><h2>Cambios entre versiones</h2></div>
            <div className="versions-legend"><span className="is-new">+ Nuevos</span><span className="is-modified">~ Modificados</span><span className="is-removed">− Eliminados</span></div>
          </div>
          <div className="versions-compare__controls">
            <label><span>Versión anterior</span><select value={previousVersion} onChange={(event) => setPreviousVersion(event.target.value)}>{compareOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
            <button type="button" aria-label="Intercambiar versiones" onClick={swapVersions}><VersionIcon name="swap" size={18} /></button>
            <label><span>Versión actual</span><select value={currentVersion} onChange={(event) => setCurrentVersion(event.target.value)}>{compareOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
          </div>
          <div className="versions-diff">
            <div className="versions-diff__column"><header>{previousVersion}</header><p><span>1</span>5. Gestión de accesos</p><p><span>2</span>Todo acceso a la información debe ser aprobado por el jefe inmediato.</p><p className="is-removed"><span>3</span>Los usuarios deben cambiar su contraseña cada 60 días.</p><p><span>4</span>No se permite el uso de contraseñas compartidas.</p></div>
            <div className="versions-diff__column"><header>{currentVersion}</header><p><span>1</span>5. Gestión de accesos</p><p><span>2</span>Todo acceso a la información debe ser aprobado por el jefe inmediato.</p><p className="is-modified"><span>3</span>Los usuarios deben cambiar su contraseña cada 90 días.</p><p className="is-new"><span>4</span>Se debe habilitar la autenticación multifactor (MFA) para todos los usuarios.</p><p><span>5</span>No se permite el uso de contraseñas compartidas.</p></div>
          </div>
        </section>

        <section className="versions-panel versions-timeline">
          <div className="versions-panel__heading"><div><p>Trazabilidad</p><h2>Línea de tiempo de versiones</h2></div></div>
          <div className="versions-timeline__list">
            {versionHistory.map((item) => (
              <article key={item.version} className={`versions-timeline__item versions-timeline__item--${item.tone}`}>
                <span className="versions-timeline__dot" />
                <strong>{item.version}</strong>
                <div><b>{item.status}</b><span>{item.owner}</span><small>{item.comment}</small></div>
                <time>{item.date}</time>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

export default VersionsView
