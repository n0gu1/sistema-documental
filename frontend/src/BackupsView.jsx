import { useDeferredValue, useState } from 'react'
import './BackupsView.css'

const initialBackups = [
  { id: 1, date: '23/05/2024 01:53:34', type: 'Completo', destination: 'Servidor Secundario - DC01', size: '156.24 GB', status: 'Exitoso', duration: '00:18:42', author: 'Ana Rodríguez' },
  { id: 2, date: '22/05/2024 01:52:11', type: 'Incremental', destination: 'Servidor Secundario - DC01', size: '24.08 GB', status: 'Exitoso', duration: '00:07:15', author: 'Ana Rodríguez' },
  { id: 3, date: '21/05/2024 01:51:08', type: 'Incremental', destination: 'Servidor Secundario - DC01', size: '22.71 GB', status: 'Exitoso', duration: '00:06:58', author: 'Sistema' },
  { id: 4, date: '20/05/2024 02:01:12', type: 'Completo', destination: 'Nube - AWS S3', size: '158.11 GB', status: 'En proceso', duration: '00:12:30', author: 'Sistema' },
  { id: 5, date: '19/05/2024 02:00:47', type: 'Completo', destination: 'Servidor Secundario - DC01', size: '157.89 GB', status: 'Fallido', duration: '00:03:21', author: 'Sistema' },
  { id: 6, date: '18/05/2024 01:59:52', type: 'Incremental', destination: 'Servidor Secundario - DC01', size: '23.45 GB', status: 'Exitoso', duration: '00:06:45', author: 'Ana Rodríguez' },
]
const alerts = [
  ['green', 'Respaldo exitoso completado', '23/05/2024 01:53'],
  ['orange', 'Espacio utilizado 80%', '22/05/2024 09:12'],
  ['red', 'Fallo en respaldo programado', '19/05/2024 02:00'],
]

function BackupIcon({ name, size = 18 }) {
  let content
  switch (name) {
    case 'backup': content = <><path d="M6.5 18H18a4 4 0 0 0 .6-8A6.5 6.5 0 0 0 6.3 8.2 5 5 0 0 0 6.5 18Z" /><path d="M12 17V9m0 0-3 3m3-3 3 3" /></>; break
    case 'success': content = <><path d="M12 3 20 6v5c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V6l8-3Z" /><path d="m8.5 12 2.2 2.2 4.8-4.8" /></>; break
    case 'failed': content = <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6m0-6-6 6" /></>; break
    case 'storage': content = <><ellipse cx="12" cy="5" rx="7" ry="3" /><path d="M5 5v6c0 1.7 3.1 3 7 3m7-9v5M5 11v6c0 1.7 3.1 3 7 3" /><circle cx="17" cy="17" r="4" /><path d="M17 15v2l1.5 1" /></>; break
    case 'clock': content = <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>; break
    case 'calendar': content = <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></>; break
    case 'restore': content = <><path d="M4 8v5h5" /><path d="M5.5 16A8 8 0 1 0 4.3 7.5L4 13" /></>; break
    case 'list': content = <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" /></>; break
    case 'eye': content = <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>; break
    case 'download': content = <><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 17v4h16v-4" /></>; break
    case 'more': content = <><circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" /></>; break
    case 'shield': content = <><path d="M12 3 20 6v5c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V6l8-3Z" /><path d="m9 12 2 2 4-4" /></>; break
    case 'points': content = <><path d="M5 8a8 8 0 1 1-1 7" /><path d="M5 3v5H0" /><path d="M12 8v5l3 2" /></>; break
    case 'bell': content = <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7M10 20h4" /></>; break
    case 'arrow': content = <path d="m9 18 6-6-6-6" />; break
    case 'check': content = <path d="m7 12 3 3 7-7" />; break
    default: content = <circle cx="12" cy="12" r="8" />
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function BackupsView({ globalQuery }) {
  const [backups, setBackups] = useState(initialBackups)
  const [notice, setNotice] = useState('')
  const deferredQuery = useDeferredValue(globalQuery.trim().toLowerCase())
  const visibleBackups = backups.filter((backup) => !deferredQuery || [backup.date, backup.type, backup.destination, backup.size, backup.status, backup.author].join(' ').toLowerCase().includes(deferredQuery))

  function executeBackup() {
    setBackups((current) => [{ id: Date.now(), date: '23/05/2024 10:45:00', type: 'Completo', destination: 'Servidor Secundario - DC01', size: 'Calculando...', status: 'En proceso', duration: '00:00:01', author: 'Ana Rodríguez' }, ...current])
    setNotice('El respaldo manual se inició correctamente.')
  }

  function downloadBackup(backup) {
    const content = `Respaldo: ${backup.date}\nTipo: ${backup.type}\nDestino: ${backup.destination}\nEstado: ${backup.status}`
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `respaldo-${backup.id}.txt`
    link.click()
    URL.revokeObjectURL(url)
    setNotice(`Se preparó la descarga del respaldo del ${backup.date}.`)
  }

  return (
    <div className="backups-view">
      <header className="backups-heading"><div><h1>Respaldos y recuperación</h1><p>Protege la información crítica de la organización y administra copias de seguridad de forma segura.</p></div><span><time>23 de mayo de 2024</time><BackupIcon name="calendar" size={18} /></span></header>

      <div className="backups-layout">
        <div className="backups-primary">
          <section className="backups-metrics" aria-label="Indicadores de respaldos">
            <article><span className="backups-metric-icon backups-metric-icon--green"><BackupIcon name="success" size={25} /></span><div><p>Respaldos exitosos</p><strong>1,248</strong><small>↑ <b>8.3%</b> vs. mes anterior</small></div></article>
            <article><span className="backups-metric-icon backups-metric-icon--red"><BackupIcon name="failed" size={25} /></span><div><p>Fallidos</p><strong>12</strong><small className="is-negative">↓ <b>14.3%</b> vs. mes anterior</small></div></article>
            <article><span className="backups-metric-icon backups-metric-icon--violet"><BackupIcon name="storage" size={25} /></span><div><p>Espacio utilizado</p><strong>1.24 <i>TB</i></strong><small>32% del total asignado</small><span className="backups-storage-bar"><i /></span></div></article>
            <article><span className="backups-metric-icon backups-metric-icon--orange"><BackupIcon name="clock" size={25} /></span><div><p>Próximo respaldo</p><strong className="is-date">24/05/2024 02:00</strong><small>En 10 h 34 min</small></div></article>
          </section>

          <section className="backups-panel backups-latest"><h2><BackupIcon name="success" size={18} /> Último respaldo exitoso</h2><dl><div><dt>Fecha y hora</dt><dd>23/05/2024 01:53:34</dd></div><div><dt>Destino</dt><dd>Servidor Secundario - DC01</dd></div><div><dt>Frecuencia</dt><dd>Diaria</dd></div><div><dt>Política de retención</dt><dd>30 días</dd></div><div><dt>Cifrado</dt><dd><i /> Habilitado (AES-256)</dd></div></dl></section>

          <section className="backups-actions"><button className="is-primary" type="button" onClick={executeBackup}><BackupIcon name="backup" size={18} /> Ejecutar respaldo</button><button type="button" onClick={() => setNotice('El programador de respaldos está listo para conectarse al backend.')}><BackupIcon name="calendar" size={18} /> Programar respaldo</button><button type="button" onClick={() => setNotice('Seleccione un punto de restauración para continuar.')}><BackupIcon name="restore" size={18} /> Restaurar</button><button type="button" onClick={() => setNotice('El historial completo está visible en la tabla inferior.')}><BackupIcon name="list" size={18} /> Ver historial</button></section>

          <section className="backups-panel backups-history"><h2>Historial de respaldos</h2><div className="backups-table-scroll"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Destino</th><th>Tamaño</th><th>Estado</th><th>Duración</th><th>Ejecutado por</th><th>Acciones</th></tr></thead><tbody>{visibleBackups.map((backup) => <tr key={backup.id}><td>{backup.date}</td><td>{backup.type}</td><td>{backup.destination}</td><td>{backup.size}</td><td><span className={`backups-status backups-status--${backup.status.toLowerCase().replace(' ', '-')}`}>{backup.status === 'Exitoso' ? <BackupIcon name="check" size={11} /> : backup.status === 'Fallido' ? <BackupIcon name="failed" size={11} /> : <i />}{backup.status}</span></td><td>{backup.duration}</td><td>{backup.author}</td><td><div><button type="button" aria-label={`Ver respaldo ${backup.date}`} onClick={() => setNotice(`Mostrando detalles del respaldo del ${backup.date}.`)}><BackupIcon name="eye" size={14} /></button><button type="button" aria-label={`Descargar respaldo ${backup.date}`} onClick={() => downloadBackup(backup)}><BackupIcon name="download" size={14} /></button><button type="button" aria-label={`Más opciones para respaldo ${backup.date}`}><BackupIcon name="more" size={14} /></button></div></td></tr>)}</tbody></table>{!visibleBackups.length && <div className="backups-empty"><strong>No se encontraron respaldos</strong><span>Modifique la búsqueda global para continuar.</span></div>}</div><footer><span>Mostrando 1 a {visibleBackups.length} de 50 resultados</span><div><button type="button">‹</button><button className="is-current" type="button">1</button><button type="button">2</button><button type="button">3</button><button type="button">…</button><button type="button">9</button><button type="button">›</button></div><select defaultValue="10"><option value="10">10 por página</option><option value="25">25 por página</option></select></footer></section>
        </div>

        <aside className="backups-aside">
          <section className="backups-panel backups-side-card backups-plan"><h2><BackupIcon name="shield" size={19} /> Plan de recuperación</h2><p>Estrategia y procedimientos para recuperar la información ante incidentes.</p><dl><div><dt>Plan actual</dt><dd>Plan de Recuperación v2.1</dd></div><div><dt>RPO (Objetivo)</dt><dd>24 horas</dd></div><div><dt>RTO (Objetivo)</dt><dd>8 horas</dd></div><div><dt>Última prueba</dt><dd>15/05/2024 <b>Exitosa</b></dd></div></dl><button type="button" onClick={() => setNotice('Se abrió el plan de recuperación completo.')}>Ver plan completo</button></section>
          <section className="backups-panel backups-side-card backups-points"><h2><BackupIcon name="points" size={19} /> Puntos de restauración</h2><p>Versiones disponibles para restaurar información.</p><dl><div><dt>Total de puntos</dt><dd>156</dd></div><div><dt>Más antiguo</dt><dd>24/04/2024</dd></div><div><dt>Más reciente</dt><dd>23/05/2024 01:53</dd></div></dl><button type="button" onClick={() => setNotice('Se abrió la administración de puntos de restauración.')}>Administrar puntos</button></section>
          <section className="backups-panel backups-side-card backups-alerts"><h2><BackupIcon name="bell" size={19} /> Alertas y notificaciones</h2>{alerts.map(([tone, title, date]) => <article key={title}><i className={`is-${tone}`} /><div><strong>{title}</strong><time>{date}</time></div><BackupIcon name="arrow" size={14} /></article>)}<button type="button" onClick={() => setNotice('Se abrió el listado completo de alertas.')}>Ver todas las alertas</button></section>
        </aside>
      </div>
      <span className="backups-live-notice" role="status">{notice}</span>
    </div>
  )
}

export default BackupsView
