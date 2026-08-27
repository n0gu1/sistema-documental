import { useEffect, useState } from 'react'
import { apiRequest, formatDate } from './api'
import './SettingsView.css'

const tabs = ['General', 'Seguridad', 'Notificaciones', 'Integraciones', 'SMTP', 'Archivos', 'Respaldos', 'Apariencia']
const sections = { General: 'general', Seguridad: 'security', Notificaciones: 'notifications', Integraciones: 'integrations', SMTP: 'smtp', Archivos: 'uploads', Respaldos: 'backups', Apariencia: 'appearance' }
const emptySettings = {
  general: { organization_name: '', timezone: 'America/Bogota', language: 'es-CO' },
  security: { strong_password: true, min_length: 12, complexity: 'high', expiration_days: 90, mfa_admins: true, mfa_users: false, inactivity_minutes: 30, max_session_hours: 8 },
  smtp: { enabled: false, host: '', port: 587, username: '', security: 'starttls', password_set: false },
  uploads: { max_file_mb: 50, max_request_mb: 250, extensions: ['.pdf', '.docx', '.xlsx', '.pptx', '.jpg', '.jpeg', '.png'] },
  appearance: { primary_color: '#1E3A8A', secondary_color: '#0F172A', logo_url: '', favicon_url: '' },
  notifications: { in_app_enabled: true, email_enabled: false, digest_frequency: 'immediate' },
  integrations: {},
}

function SettingsIcon({ name, size = 17 }) {
  let content
  switch (name) {
    case 'building': content = <><path d="M3 21h18M5 21V9h14v12M3 9l9-6 9 6M8 12v6m4-6v6m4-6v6" /></>; break
    case 'mail': content = <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>; break
    case 'clock': content = <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>; break
    case 'check': content = <path d="m7 12 3 3 7-7" />; break
    default: content = <circle cx="12" cy="12" r="8" />
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function Field({ label, children }) {
  return <label className="settings-field"><span>{label}</span>{children}</label>
}

function Toggle({ checked, onChange, label }) {
  return <button className={`settings-toggle${checked ? ' is-on' : ''}`} type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}><span /></button>
}

function updateSection(settings, section, key, value) {
  return { ...settings, [section]: { ...settings[section], [key]: value } }
}

function SettingsView({ globalQuery }) {
  const [activeTab, setActiveTab] = useState('General')
  const [settings, setSettings] = useState(emptySettings)
  const [changes, setChanges] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  async function loadSettings() {
    try {
      const result = await apiRequest('/api/settings/')
      setSettings({ ...emptySettings, ...result.settings })
      setChanges(result.changes || [])
    } catch (requestError) { setError(requestError.message) } finally { setLoading(false) }
  }

  useEffect(() => { loadSettings() }, [])

  function update(section, key, value) {
    setSettings((current) => updateSection(current, section, key, value))
    setNotice('')
  }

  async function saveSettings(event) {
    event.preventDefault()
    const section = sections[activeTab]
    if (section === 'backups') {
      setNotice('La configuración de respaldos se administra desde la sección Respaldos.')
      return
    }
    setSaving(true)
    setError('')
    const payload = { ...settings[section] }
    if (section === 'uploads') payload.extensions = payload.extensions.join(',')
    if (section === 'smtp') {
      if (!payload.password) delete payload.password
      delete payload.password_set
    }
    try {
      const result = await apiRequest('/api/settings/', { method: 'POST', body: { [section]: payload } })
      setSettings({ ...emptySettings, ...result.settings })
      setChanges(result.changes || [])
      setNotice(`La sección ${activeTab.toLowerCase()} se guardó correctamente.`)
    } catch (requestError) { setError(requestError.message) } finally { setSaving(false) }
  }

  async function testSmtp() {
    setSaving(true)
    try {
      const result = await apiRequest('/api/settings/smtp/test/', { method: 'POST', body: { dry_run: true } })
      setNotice(`SMTP validado: ${result.host}:${result.port} (${result.security}).`)
    } catch (requestError) { setError(requestError.message) } finally { setSaving(false) }
  }

  async function testIntegration(provider) {
    setSaving(true)
    try {
      const result = await apiRequest(`/api/settings/integrations/${provider}/test/`, { method: 'POST', body: {} })
      setNotice(result.detail)
    } catch (requestError) { setError(requestError.message) } finally { setSaving(false) }
  }

  function renderGeneral() {
    const value = settings.general
    return <div className="settings-columns"><section><Field label="Nombre de la organización"><input value={value.organization_name} onChange={(event) => update('general', 'organization_name', event.target.value)} /></Field><Field label="Zona horaria"><select value={value.timezone} onChange={(event) => update('general', 'timezone', event.target.value)}><option value="America/Bogota">Bogotá, Lima, Quito (UTC-05:00)</option><option value="America/Mexico_City">Ciudad de México (UTC-06:00)</option><option value="America/Argentina/Buenos_Aires">Buenos Aires (UTC-03:00)</option></select></Field><Field label="Idioma predeterminado"><select value={value.language} onChange={(event) => update('general', 'language', event.target.value)}><option value="es-CO">Español (Latinoamérica)</option><option value="en">English</option><option value="pt">Português</option></select></Field></section><section><fieldset className="settings-group"><legend>Políticas de contraseña</legend><div className="settings-switch-row"><span>Requerir contraseña segura</span><Toggle checked={settings.security.strong_password} onChange={(next) => update('security', 'strong_password', next)} label="Requerir contraseña segura" /></div><div className="settings-value-row"><span>Longitud mínima</span><strong>{settings.security.min_length} caracteres</strong></div><div className="settings-value-row"><span>Expiración</span><strong>{settings.security.expiration_days ? `${settings.security.expiration_days} días` : 'Nunca'}</strong></div></fieldset></section><section><fieldset className="settings-group"><legend>Configuración persistente</legend><p className="settings-help">Los cambios se guardan por organización y se aplican a las nuevas sesiones, notificaciones y cargas.</p><div className="settings-value-row"><span>Última actualización</span><strong>{settings.meta?.updated_at ? formatDate(settings.meta.updated_at) : 'Sin cambios'}</strong></div><div className="settings-value-row"><span>Estado</span><strong>{loading ? 'Cargando' : 'Persistido'}</strong></div></fieldset></section></div>
  }

  function renderSecurity() {
    const value = settings.security
    return <div className="settings-columns"><section><fieldset className="settings-group"><legend>Contraseña</legend><div className="settings-switch-row"><span>Contraseña segura</span><Toggle checked={value.strong_password} onChange={(next) => update('security', 'strong_password', next)} label="Contraseña segura" /></div><Field label="Longitud mínima"><input type="number" min="8" max="128" value={value.min_length} onChange={(event) => update('security', 'min_length', Number(event.target.value))} /></Field><Field label="Complejidad"><select value={value.complexity} onChange={(event) => update('security', 'complexity', event.target.value)}><option value="high">Alta</option><option value="medium">Media</option><option value="basic">Básica</option></select></Field><Field label="Expiración"><input type="number" min="0" max="365" value={value.expiration_days} onChange={(event) => update('security', 'expiration_days', Number(event.target.value))} /></Field></fieldset></section><section><fieldset className="settings-group"><legend>Autenticación multifactor</legend><div className="settings-switch-row"><span>MFA para administradores</span><Toggle checked={value.mfa_admins} onChange={(next) => update('security', 'mfa_admins', next)} label="MFA para administradores" /></div><div className="settings-switch-row"><span>MFA para todos los usuarios</span><Toggle checked={value.mfa_users} onChange={(next) => update('security', 'mfa_users', next)} label="MFA para todos los usuarios" /></div></fieldset></section><section><fieldset className="settings-group"><legend>Sesiones</legend><Field label="Inactividad permitida (minutos)"><input type="number" min="5" max="1440" value={value.inactivity_minutes} onChange={(event) => update('security', 'inactivity_minutes', Number(event.target.value))} /></Field><Field label="Sesión máxima (horas)"><input type="number" min="1" max="720" value={value.max_session_hours} onChange={(event) => update('security', 'max_session_hours', Number(event.target.value))} /></Field></fieldset></section></div>
  }

  function renderNotifications() {
    const value = settings.notifications
    return <div className="settings-columns"><section><fieldset className="settings-group"><legend>Canales de notificación</legend><div className="settings-switch-row"><span>Notificaciones dentro de la aplicación</span><Toggle checked={value.in_app_enabled} onChange={(next) => update('notifications', 'in_app_enabled', next)} label="Notificaciones dentro de la aplicación" /></div><div className="settings-switch-row"><span>Notificaciones por correo</span><Toggle checked={value.email_enabled} onChange={(next) => update('notifications', 'email_enabled', next)} label="Notificaciones por correo" /></div></fieldset></section><section><fieldset className="settings-group"><legend>Frecuencia</legend><Field label="Entrega de avisos"><select value={value.digest_frequency} onChange={(event) => update('notifications', 'digest_frequency', event.target.value)}><option value="immediate">Inmediata</option><option value="daily">Resumen diario</option><option value="weekly">Resumen semanal</option></select></Field></fieldset></section><section><p className="settings-help">Los avisos de revisiones, comentarios y publicaciones respetan estos canales. El correo requiere SMTP configurado.</p></section></div>
  }

  function renderSmtp() {
    const value = settings.smtp
    return <div className="settings-columns"><section><fieldset className="settings-group"><legend>Correo saliente SMTP</legend><div className="settings-switch-row"><span>Habilitar SMTP</span><Toggle checked={value.enabled} onChange={(next) => update('smtp', 'enabled', next)} label="Habilitar SMTP" /></div><Field label="Servidor"><input value={value.host} onChange={(event) => update('smtp', 'host', event.target.value)} placeholder="smtp.ejemplo.com" /></Field><Field label="Puerto"><input type="number" min="1" max="65535" value={value.port} onChange={(event) => update('smtp', 'port', Number(event.target.value))} /></Field></fieldset></section><section><fieldset className="settings-group"><legend>Credenciales y seguridad</legend><Field label="Usuario"><input value={value.username} onChange={(event) => update('smtp', 'username', event.target.value)} /></Field><Field label="Contraseña"><input type="password" value={value.password || ''} onChange={(event) => update('smtp', 'password', event.target.value)} placeholder={value.password_set ? 'Guardada, escriba para rotar' : 'No configurada'} /></Field><Field label="Seguridad"><select value={value.security} onChange={(event) => update('smtp', 'security', event.target.value)}><option value="starttls">STARTTLS</option><option value="ssl">SSL/TLS</option><option value="none">Ninguna</option></select></Field></fieldset></section><section><p className="settings-help">La contraseña se cifra antes de persistirse y nunca se devuelve al navegador.</p><button className="settings-outline-button settings-test-smtp" type="button" onClick={testSmtp} disabled={saving}>Validar configuración</button></section></div>
  }

  function renderUploads() {
    const value = settings.uploads
    return <div className="settings-columns"><section><Field label="Tamaño máximo por archivo (MB)"><input type="number" min="1" max="2048" value={value.max_file_mb} onChange={(event) => update('uploads', 'max_file_mb', Number(event.target.value))} /></Field><Field label="Tamaño máximo por solicitud (MB)"><input type="number" min="1" max="2048" value={value.max_request_mb} onChange={(event) => update('uploads', 'max_request_mb', Number(event.target.value))} /></Field></section><section><Field label="Tipos de archivo permitidos"><input value={value.extensions.join(', ')} onChange={(event) => update('uploads', 'extensions', event.target.value.split(',').map((item) => item.trim()).filter(Boolean))} /><small>PDF, DOCX, XLSX, PPTX, JPG, JPEG y PNG.</small></Field></section><section><p className="settings-help">Los límites se aplican por organización al validar nuevas cargas documentales.</p></section></div>
  }

  function renderAppearance() {
    const value = settings.appearance
    return <div className="settings-columns"><section><fieldset className="settings-group"><legend>Colores institucionales</legend><div className="settings-color-row"><span>Color primario</span><input type="color" value={value.primary_color} onChange={(event) => update('appearance', 'primary_color', event.target.value.toUpperCase())} /><input value={value.primary_color} onChange={(event) => update('appearance', 'primary_color', event.target.value)} /></div><div className="settings-color-row"><span>Color secundario</span><input type="color" value={value.secondary_color} onChange={(event) => update('appearance', 'secondary_color', event.target.value.toUpperCase())} /><input value={value.secondary_color} onChange={(event) => update('appearance', 'secondary_color', event.target.value)} /></div></fieldset></section><section><Field label="URL del logo"><input value={value.logo_url} onChange={(event) => update('appearance', 'logo_url', event.target.value)} placeholder="https://..." /></Field><Field label="URL del favicon"><input value={value.favicon_url} onChange={(event) => update('appearance', 'favicon_url', event.target.value)} placeholder="https://..." /></Field></section><section><div className="settings-brand-preview"><SettingsIcon name="building" size={34} /><div><span>{settings.general.organization_name || 'Consultoria'}</span><strong>Alexandria</strong></div></div><p className="settings-help">El branding se guarda como configuración de la organización para ser utilizado por la interfaz y futuras plantillas.</p></section></div>
  }

  function renderIntegrations() {
    const integrations = settings.integrations || {}
    const items = [['storage_s3', 'Almacenamiento S3/B2', 'Archivos documentales y respaldos'], ['smtp', 'Correo SMTP', 'Notificaciones transaccionales'], ['microsoft365', 'Microsoft 365', 'Usuarios y grupos'], ['google_workspace', 'Google Workspace', 'Autenticación y calendario'], ['webhook', 'Webhook HTTPS', 'Eventos externos']]
    return <section className="settings-integrations"><p className="settings-help">Las integraciones externas se configuran por organización. Las credenciales sensibles no se muestran.</p><div className="settings-integration-grid">{items.map(([provider, name, description]) => { const item = integrations[provider] || { enabled: false, status: 'not_configured' }; return <article key={provider}><div><strong>{name}</strong><small>{description}</small></div><span className={item.status === 'configured' ? 'settings-connected' : 'settings-not-configured'}>{item.status === 'configured' ? 'Configurado' : 'No configurado'}</span><button type="button" onClick={() => testIntegration(provider)} disabled={saving}>Probar</button></article> })}</div>{integrations.webhook && <Field label="URL del webhook"><input value={integrations.webhook.url || ''} onChange={(event) => setSettings((current) => ({ ...current, integrations: { ...current.integrations, webhook: { ...current.integrations.webhook, url: event.target.value } } }))} placeholder="https://integracion.ejemplo.com/webhook" /></Field>}</section>
  }

  function renderTab() {
    if (activeTab === 'General') return renderGeneral()
    if (activeTab === 'Seguridad') return renderSecurity()
    if (activeTab === 'Notificaciones') return renderNotifications()
    if (activeTab === 'Integraciones') return renderIntegrations()
    if (activeTab === 'SMTP') return renderSmtp()
    if (activeTab === 'Archivos') return renderUploads()
    if (activeTab === 'Respaldos') return <section className="settings-tab-placeholder"><span>R</span><h2>Respaldos y recuperación</h2><p>La configuración de copias, retención y restauración está disponible en el módulo Respaldos.</p></section>
    if (activeTab === 'Apariencia') return renderAppearance()
    return null
  }

  const query = globalQuery.trim().toLowerCase()
  const visibleChanges = changes.filter((item) => !query || [item.user, item.section, item.description].join(' ').toLowerCase().includes(query))
  const configuredIntegrations = Object.values(settings.integrations || {}).filter((item) => item.status === 'configured').length

  return <div className="settings-view"><header className="settings-heading"><h1>Configuración del sistema</h1><p>Parametriza y gestiona los ajustes persistentes de la plataforma institucional.</p></header>{(error || notice) && <p className={error ? 'settings-error' : 'settings-success'} role="status">{error || notice}</p>}<div className="settings-layout"><div className="settings-main"><form className="settings-card settings-form" onSubmit={saveSettings}><nav className="settings-tabs" aria-label="Secciones de configuración">{tabs.map((tab) => <button className={activeTab === tab ? 'is-active' : ''} type="button" key={tab} onClick={() => { setActiveTab(tab); setNotice('') }}>{tab}</button>)}</nav>{renderTab()}{activeTab !== 'Respaldos' && <footer className="settings-form-actions"><button className="is-primary" type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar cambios'}</button></footer>}</form>{activeTab === 'Integraciones' && <section className="settings-card settings-table-card settings-changes-card"><h2>Integraciones configuradas: {configuredIntegrations}</h2></section>}<section className="settings-card settings-table-card settings-changes-card"><h2>Registro de cambios de configuración</h2><div className="settings-table-wrap"><table><thead><tr><th>Fecha y hora</th><th>Sección</th><th>Cambio realizado</th></tr></thead><tbody>{visibleChanges.map((item) => <tr key={`${item.at}-${item.section}`}><td>{formatDate(item.at)}</td><td>{item.section}</td><td>{item.description}</td></tr>)}</tbody></table>{!visibleChanges.length && <p className="settings-empty">No se encontraron cambios.</p>}</div></section></div><aside className="settings-aside"><section className="settings-card settings-info-card"><header><h2>Estado del sistema</h2><span>Operativo</span></header><p>Configuración persistente</p><small>{loading ? 'Cargando configuración...' : 'Los servicios consultan los valores de la organización.'}</small><dl><div><dt>Base de datos</dt><dd>Operativa <i /></dd></div><div><dt>Almacenamiento</dt><dd>{settings.integrations?.storage_s3?.status === 'configured' ? 'S3/B2' : 'Local'} <i /></dd></div><div><dt>Integraciones</dt><dd>{configuredIntegrations} configuradas</dd></div><div><dt>Última verificación</dt><dd>{settings.meta?.updated_at ? formatDate(settings.meta.updated_at) : 'Pendiente'}</dd></div></dl></section><section className="settings-card settings-info-card"><header><h2>SMTP</h2><span>{settings.smtp.enabled ? 'Activo' : 'Inactivo'}</span></header><dl><div><dt>Servidor</dt><dd>{settings.smtp.host || 'No configurado'}</dd></div><div><dt>Credenciales</dt><dd>{settings.smtp.password_set ? 'Guardadas' : 'Pendientes'}</dd></div></dl><button type="button" onClick={() => { setActiveTab('General'); setNotice('Configure SMTP desde la pestaña General.') }}>Configurar SMTP</button></section><section className="settings-card settings-info-card"><header><h2>Soporte técnico</h2></header><dl><div><dt><SettingsIcon name="mail" size={14} /> Correo</dt><dd>soporte@sistema-documental.local</dd></div><div><dt><SettingsIcon name="clock" size={14} /> Horario</dt><dd>Lun - Vie 8:00 - 18:00</dd></div></dl></section></aside></div></div>
}

export default SettingsView
