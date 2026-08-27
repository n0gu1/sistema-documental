import { useDeferredValue, useEffect, useState } from 'react'
import { apiRequest, formatDate } from './api'
import './BackupsView.css'

const emptyData = {
  backups: [],
  restore_points: [],
  alerts: [],
  destinations: [],
  config: { active: true, frequency: 'daily', retention_days: 30, destination: 's3', include_files: true, encrypted: true },
  recovery_plan: { name: 'Plan de Recuperacion v1.0', rpo_hours: 24, rto_hours: 8, last_test_status: 'pendiente' },
  metrics: { successful: 0, failed: 0, storage_bytes: 0, next_run_at: null, last_success_at: null },
}

function BackupIcon({ name, size = 18 }) {
  const paths = {
    backup: <><path d="M6.5 18H18a4 4 0 0 0 .6-8A6.5 6.5 0 0 0 6.3 8.2 5 5 0 0 0 6.5 18Z" /><path d="M12 17V9m0 0-3 3m3-3 3 3" /></>,
    success: <><path d="M12 3 20 6v5c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V6l8-3Z" /><path d="m8.5 12 2.2 2.2 4.8-4.8" /></>,
    failed: <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6m0-6-6 6" /></>,
    storage: <><ellipse cx="12" cy="5" rx="7" ry="3" /><path d="M5 5v6c0 1.7 3.1 3 7 3m7-9v5M5 11v6c0 1.7 3.1 3 7 3" /><circle cx="17" cy="17" r="4" /><path d="M17 15v2l1.5 1" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></>,
    restore: <><path d="M4 8v5h5" /><path d="M5.5 16A8 8 0 1 0 4.3 7.5L4 13" /></>,
    list: <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" /></>,
    download: <><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 17v4h16v-4" /></>,
    shield: <><path d="M12 3 20 6v5c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V6l8-3Z" /><path d="m9 12 2 2 4-4" /></>,
    points: <><path d="M5 8a8 8 0 1 1-1 7" /><path d="M5 3v5H0" /><path d="M12 8v5l3 2" /></>,
    bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7M10 20h4" /></>,
    check: <path d="m7 12 3 3 7-7" />,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.storage}</svg>
}

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function backupType(type) {
  return type === 'automatico' ? 'Automatico' : type === 'prueba' ? 'Prueba' : 'Manual'
}

function backupStatus(status) {
  return status === 'exitoso' ? 'Exitoso' : status === 'fallido' ? 'Fallido' : status === 'en_proceso' ? 'En proceso' : status
}

function BackupsView({ globalQuery }) {
  const [data, setData] = useState(emptyData)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const deferredQuery = useDeferredValue(globalQuery.trim().toLowerCase())

  async function loadBackups() {
    try {
      setError('')
      const result = await apiRequest('/api/backups/')
      setData({ ...emptyData, ...result })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadBackups() }, [])

  const visibleBackups = data.backups.filter((backup) => !deferredQuery || [backup.name, backup.type, backup.destination, backup.status, backup.sha256].join(' ').toLowerCase().includes(deferredQuery))
  const latest = data.restore_points[0]
  const config = data.config

  async function executeBackup() {
    setSaving(true)
    try {
      const result = await apiRequest('/api/backups/', { method: 'POST' })
      setNotice(`Respaldo creado: ${formatBytes(result.backup.size_bytes)} y ${result.backup.database_records} registros protegidos.`)
      await loadBackups()
    } catch (requestError) { setError(requestError.message) } finally { setSaving(false) }
  }

  async function saveConfiguration(event) {
    event.preventDefault()
    setSaving(true)
    const form = new FormData(event.currentTarget)
    try {
      await apiRequest('/api/backups/config/', {
        method: 'POST',
        body: {
          active: form.get('active') === 'on',
          frequency: form.get('frequency'),
          retention_days: Number(form.get('retention_days')),
          destination: form.get('destination'),
          include_files: true,
        },
      })
      setNotice('La política automática de respaldos se guardó correctamente.')
      await loadBackups()
    } catch (requestError) { setError(requestError.message) } finally { setSaving(false) }
  }

  async function restoreBackup(backup) {
    setSaving(true)
    try {
      const result = await apiRequest(`/api/backups/${backup.id}/restore/`, { method: 'POST', body: { mode: 'restore_files' } })
      setNotice(`Punto de restauración verificado: ${result.result.files_verified} archivos comprobados.`)
      await loadBackups()
    } catch (requestError) { setError(requestError.message) } finally { setSaving(false) }
  }

  async function testRecoveryPlan() {
    setSaving(true)
    try {
      const result = await apiRequest('/api/backups/recovery-test/', { method: 'POST' })
      setNotice(`Prueba de recuperación exitosa: ${result.result.database_records} registros verificados.`)
      await loadBackups()
    } catch (requestError) { setError(requestError.message) } finally { setSaving(false) }
  }

  return <div className="backups-view">
    <header className="backups-heading"><div><h1>Respaldos y recuperación</h1><p>Protege la información crítica con copias cifradas y puntos de restauración verificables.</p></div><span><time>{new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}</time><BackupIcon name="calendar" size={18} /></span></header>
    {(error || notice) && <p className={error ? 'backups-error' : 'backups-success'} role="status">{error || notice}</p>}
    <div className="backups-layout">
      <div className="backups-primary">
        <section className="backups-metrics" aria-label="Indicadores de respaldos">
          <article><span className="backups-metric-icon backups-metric-icon--green"><BackupIcon name="success" size={25} /></span><div><p>Respaldos exitosos</p><strong>{loading ? '...' : data.metrics.successful}</strong><small>Copias disponibles</small></div></article>
          <article><span className="backups-metric-icon backups-metric-icon--red"><BackupIcon name="failed" size={25} /></span><div><p>Fallidos</p><strong>{loading ? '...' : data.metrics.failed}</strong><small className="is-negative">Requieren atención</small></div></article>
          <article><span className="backups-metric-icon backups-metric-icon--violet"><BackupIcon name="storage" size={25} /></span><div><p>Espacio utilizado</p><strong>{formatBytes(data.metrics.storage_bytes)}</strong><small>Archivos cifrados en destino</small></div></article>
          <article><span className="backups-metric-icon backups-metric-icon--orange"><BackupIcon name="clock" size={25} /></span><div><p>Próximo respaldo</p><strong className="is-date">{data.metrics.next_run_at ? formatDate(data.metrics.next_run_at) : 'Pendiente'}</strong><small>{config.active ? `Frecuencia ${config.frequency}` : 'Programación inactiva'}</small></div></article>
        </section>
        <section className="backups-panel backups-latest"><h2><BackupIcon name="success" size={18} /> Último respaldo exitoso</h2><dl><div><dt>Fecha y hora</dt><dd>{latest ? formatDate(latest.finished_at) : 'Sin respaldos'}</dd></div><div><dt>Destino</dt><dd>{latest?.destination || config.destination}</dd></div><div><dt>Frecuencia</dt><dd>{config.frequency}</dd></div><div><dt>Retención</dt><dd>{config.retention_days} días</dd></div><div><dt>Cifrado</dt><dd><i /> AES-256-GCM habilitado</dd></div></dl></section>
        <section className="backups-actions"><button className="is-primary" type="button" onClick={executeBackup} disabled={saving}><BackupIcon name="backup" size={18} /> {saving ? 'Procesando...' : 'Ejecutar respaldo'}</button><button type="button" onClick={() => document.getElementById('backup-config')?.scrollIntoView({ behavior: 'smooth' })}><BackupIcon name="calendar" size={18} /> Programar respaldo</button><button type="button" onClick={() => latest && restoreBackup(latest)} disabled={!latest || saving}><BackupIcon name="restore" size={18} /> Restaurar</button><button type="button" onClick={() => document.getElementById('backup-history')?.scrollIntoView({ behavior: 'smooth' })}><BackupIcon name="list" size={18} /> Ver historial</button></section>
        <section className="backups-panel backups-config" id="backup-config"><h2><BackupIcon name="calendar" size={18} /> Política de respaldos automáticos</h2><form onSubmit={saveConfiguration}><label><span>Estado</span><input type="checkbox" name="active" defaultChecked={config.active} /> Activa</label><label><span>Frecuencia</span><select name="frequency" defaultValue={config.frequency}><option value="daily">Diaria</option><option value="weekly">Semanal</option><option value="monthly">Mensual</option></select></label><label><span>Retención (días)</span><input type="number" name="retention_days" min="1" max="3650" defaultValue={config.retention_days} /></label><label><span>Destino</span><select name="destination" defaultValue={config.destination}>{data.destinations.map((destination) => <option value={destination.code} key={destination.code}>{destination.name}</option>)}</select></label><button className="is-primary" type="submit" disabled={saving}>Guardar configuración</button></form><small>La ejecución automática utiliza el comando del programador del entorno. Las copias siempre se cifran antes de almacenarse.</small></section>
        <section className="backups-panel backups-history" id="backup-history"><h2>Historial de respaldos</h2><div className="backups-table-scroll"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Destino</th><th>Tamaño</th><th>Estado</th><th>Contenido</th><th>Acciones</th></tr></thead><tbody>{visibleBackups.map((backup) => <tr key={backup.id}><td>{formatDate(backup.started_at)}</td><td>{backupType(backup.type)}</td><td>{backup.destination}</td><td>{formatBytes(backup.size_bytes)}</td><td><span className={`backups-status backups-status--${backupStatus(backup.status).toLowerCase().replace(' ', '-')}`}>{backup.status === 'exitoso' ? <BackupIcon name="check" size={11} /> : backup.status === 'fallido' ? <BackupIcon name="failed" size={11} /> : <i />}{backupStatus(backup.status)}</span></td><td>{backup.database_records} registros · {backup.files} archivos</td><td><div><a className="backups-icon-button" aria-label={`Descargar respaldo ${backup.name}`} href={backup.download_url}><BackupIcon name="download" size={14} /></a><button type="button" aria-label={`Restaurar respaldo ${backup.name}`} onClick={() => restoreBackup(backup)} disabled={saving || backup.status !== 'exitoso'}><BackupIcon name="restore" size={14} /></button></div></td></tr>)}</tbody></table>{!visibleBackups.length && <div className="backups-empty"><strong>{loading ? 'Cargando respaldos...' : 'No se encontraron respaldos'}</strong><span>Ejecute una copia manual o configure la programación automática.</span></div>}</div></section>
      </div>
      <aside className="backups-aside"><section className="backups-panel backups-side-card backups-plan"><h2><BackupIcon name="shield" size={19} /> Plan de recuperación</h2><p>Estrategia para recuperar metadatos y archivos ante un incidente.</p><dl><div><dt>Plan actual</dt><dd>{data.recovery_plan.name}</dd></div><div><dt>RPO objetivo</dt><dd>{data.recovery_plan.rpo_hours} horas</dd></div><div><dt>RTO objetivo</dt><dd>{data.recovery_plan.rto_hours} horas</dd></div><div><dt>Última prueba</dt><dd>{data.recovery_plan.last_test_at ? `${formatDate(data.recovery_plan.last_test_at)} · Exitosa` : 'Pendiente'}</dd></div></dl><button type="button" onClick={testRecoveryPlan} disabled={!latest || saving}>Probar plan de recuperación</button></section><section className="backups-panel backups-side-card backups-points"><h2><BackupIcon name="points" size={19} /> Puntos de restauración</h2><p>Copias cifradas disponibles para verificar o recuperar archivos faltantes.</p><dl><div><dt>Total de puntos</dt><dd>{data.restore_points.length}</dd></div><div><dt>Más antiguo</dt><dd>{data.restore_points.length ? formatDate(data.restore_points[data.restore_points.length - 1].finished_at) : '—'}</dd></div><div><dt>Más reciente</dt><dd>{latest ? formatDate(latest.finished_at) : '—'}</dd></div></dl><button type="button" onClick={() => latest && restoreBackup(latest)} disabled={!latest || saving}>Administrar puntos</button></section><section className="backups-panel backups-side-card backups-alerts"><h2><BackupIcon name="bell" size={19} /> Alertas y notificaciones</h2>{data.alerts.length ? data.alerts.slice(0, 3).map((alert) => <article key={alert.id}><i className="is-red" /><div><strong>{alert.title}</strong><time>{formatDate(alert.at)}</time></div></article>) : <p>No hay fallos de respaldo registrados.</p>}</section></aside>
    </div>
  </div>
}

export default BackupsView
