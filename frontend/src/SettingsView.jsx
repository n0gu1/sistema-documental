import { useDeferredValue, useState } from 'react'
import './SettingsView.css'

const tabs = ['General', 'Seguridad', 'Notificaciones', 'Integraciones', 'Respaldos', 'Apariencia']
const initialSettings = {
  organization: 'Consultoría Alexandria', timezone: '(GMT-05:00) Bogotá, Lima, Quito', language: 'Español (Latinoamérica)', securePassword: true,
  minLength: '12 caracteres', complexity: 'Alta (mayúsculas, minúsculas, números y símbolos)', expiration: '90 días', mfaAdmins: true, mfaUsers: false,
  inactivity: '30 minutos', maxSession: '8 horas', smtpServer: 'smtp.consultoriaalexandria.com', port: '587', smtpUser: 'notificaciones@consultoriaalexandria.com', security: 'STARTTLS',
  primary: '#1E3A8A', secondary: '#0F172A', maxFile: '50 MB', maxBatch: '250 MB', fileTypes: 'PDF, DOCX, XLSX, PPTX, JPG, PNG',
}
const integrations = [
  { icon: 'microsoft', name: 'Microsoft 365', description: 'Sincronización de usuarios y grupos', date: '23/05/2024 09:45:12' },
  { icon: 'google', name: 'Google Workspace', description: 'Autenticación y calendario', date: '23/05/2024 09:30:41' },
  { icon: 'storage', name: 'Almacenamiento S3', description: 'Respaldo de documentos', date: '23/05/2024 08:15:22' },
]
const changes = [
  ['23/05/2024 10:20:15', 'Ana Rodríguez', 'Seguridad', 'Se activó MFA para todos los usuarios'],
  ['23/05/2024 09:58:33', 'Ana Rodríguez', 'General', 'Se actualizó el tiempo de sesión'],
  ['22/05/2024 16:45:10', 'Juan Martínez', 'Notificaciones', 'Se configuró el correo saliente (SMTP)'],
  ['22/05/2024 11:22:07', 'Laura Ramírez', 'Apariencia', 'Se actualizó el logo de la organización'],
]

function SettingsIcon({ name, size = 17 }) {
  let content
  switch (name) {
    case 'building': content = <><path d="M3 21h18M5 21V9h14v12M3 9l9-6 9 6M8 12v6m4-6v6m4-6v6" /></>; break
    case 'mail': content = <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>; break
    case 'phone': content = <path d="M5 3h4l2 5-2.5 1.5a15 15 0 0 0 6 6L16 13l5 2v4c0 1.1-.9 2-2 2A16 16 0 0 1 3 5c0-1.1.9-2 2-2Z" />; break
    case 'clock': content = <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>; break
    case 'more': content = <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>; break
    default: content = <circle cx="12" cy="12" r="8" />
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function Toggle({ checked, onChange, label }) {
  return <button className={`settings-toggle${checked ? ' is-on' : ''}`} type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}><span /></button>
}

function Field({ label, children }) {
  return <label className="settings-field"><span>{label}</span>{children}</label>
}

function BrandPreview() {
  return <div className="settings-brand-preview"><SettingsIcon name="building" size={34} /><div><span>Consultoría</span><strong>Alexandria</strong></div></div>
}

function SettingsView({ globalQuery }) {
  const [activeTab, setActiveTab] = useState('General')
  const [settings, setSettings] = useState(initialSettings)
  const [notice, setNotice] = useState('')
  const deferredQuery = useDeferredValue(globalQuery.trim().toLowerCase())
  const update = (key, value) => setSettings((current) => ({ ...current, [key]: value }))
  const filteredIntegrations = integrations.filter((item) => !deferredQuery || [item.name, item.description, item.date].join(' ').toLowerCase().includes(deferredQuery))
  const filteredChanges = changes.filter((item) => !deferredQuery || item.join(' ').toLowerCase().includes(deferredQuery))

  function handleSubmit(event) {
    event.preventDefault()
    setNotice('Los cambios de configuración se guardaron localmente.')
  }

  function resetSettings() {
    setSettings(initialSettings)
    setNotice('Se restablecieron los valores iniciales.')
  }

  return (
    <div className="settings-view">
      <header className="settings-heading"><h1>Configuración del sistema</h1><p>Parametriza y gestiona los ajustes generales de la plataforma institucional.</p></header>
      <div className="settings-layout">
        <div className="settings-main">
          <form className="settings-card settings-form" onSubmit={handleSubmit}>
            <nav className="settings-tabs" aria-label="Secciones de configuración">{tabs.map((tab) => <button className={activeTab === tab ? 'is-active' : ''} type="button" key={tab} onClick={() => { setActiveTab(tab); setNotice(`Se seleccionó la sección ${tab}.`) }}>{tab}</button>)}</nav>
            {activeTab === 'General' ? <>
              <div className="settings-columns">
                <section>
                  <Field label="Nombre de la organización"><input value={settings.organization} onChange={(event) => update('organization', event.target.value)} /></Field>
                  <Field label="Zona horaria"><select value={settings.timezone} onChange={(event) => update('timezone', event.target.value)}><option>(GMT-05:00) Bogotá, Lima, Quito</option><option>(GMT-06:00) Ciudad de México</option><option>(GMT-03:00) Buenos Aires</option></select></Field>
                  <Field label="Idioma predeterminado"><select value={settings.language} onChange={(event) => update('language', event.target.value)}><option>Español (Latinoamérica)</option><option>English</option><option>Português</option></select></Field>
                  <fieldset className="settings-group"><legend>Políticas de contraseña</legend><div className="settings-switch-row"><span>Requerir contraseña segura</span><Toggle checked={settings.securePassword} onChange={(value) => update('securePassword', value)} label="Requerir contraseña segura" /></div><div className="settings-value-row"><span>Longitud mínima</span><strong>{settings.minLength}</strong></div><Field label="Complejidad"><select value={settings.complexity} onChange={(event) => update('complexity', event.target.value)}><option>Alta (mayúsculas, minúsculas, números y símbolos)</option><option>Media (letras y números)</option><option>Básica</option></select></Field><Field label="Expiración de contraseña"><select value={settings.expiration} onChange={(event) => update('expiration', event.target.value)}><option>90 días</option><option>60 días</option><option>30 días</option><option>Nunca</option></select></Field></fieldset>
                </section>
                <section>
                  <fieldset className="settings-group settings-group--top"><legend>Autenticación multifactor (MFA)</legend><div className="settings-switch-row"><span>Requerir MFA para administradores</span><Toggle checked={settings.mfaAdmins} onChange={(value) => update('mfaAdmins', value)} label="MFA para administradores" /></div><div className="settings-switch-row"><span>Requerir MFA para todos los usuarios</span><Toggle checked={settings.mfaUsers} onChange={(value) => update('mfaUsers', value)} label="MFA para todos los usuarios" /></div></fieldset>
                  <fieldset className="settings-group"><legend>Tiempo de sesión</legend><Field label="Tiempo de inactividad permitido"><select value={settings.inactivity} onChange={(event) => update('inactivity', event.target.value)}><option>30 minutos</option><option>15 minutos</option><option>1 hora</option></select></Field><Field label="Sesión máxima"><select value={settings.maxSession} onChange={(event) => update('maxSession', event.target.value)}><option>8 horas</option><option>4 horas</option><option>12 horas</option></select></Field></fieldset>
                  <fieldset className="settings-group"><legend>Correo saliente (SMTP)</legend><Field label="Servidor SMTP"><input value={settings.smtpServer} onChange={(event) => update('smtpServer', event.target.value)} /></Field><div className="settings-inline-fields"><Field label="Puerto"><input value={settings.port} onChange={(event) => update('port', event.target.value)} /></Field><Field label="Usuario"><input value={settings.smtpUser} onChange={(event) => update('smtpUser', event.target.value)} /></Field></div><Field label="Seguridad"><select value={settings.security} onChange={(event) => update('security', event.target.value)}><option>STARTTLS</option><option>SSL/TLS</option><option>Ninguna</option></select></Field><button className="settings-outline-button settings-test-smtp" type="button" onClick={() => setNotice('La configuración SMTP se validó correctamente.')}>Probar configuración</button></fieldset>
                </section>
                <section>
                  <fieldset className="settings-group settings-group--top settings-brand"><legend>Branding</legend><span className="settings-field-label">Logo de la organización</span><div className="settings-brand-row"><BrandPreview /><div><button className="settings-outline-button" type="button" onClick={() => setNotice('El selector de logo está listo para conectarse al backend.')}>Cambiar logo</button><small>Formatos: PNG, JPG. Máx. 2MB</small></div></div><div className="settings-color-row"><span>Color primario</span><input type="color" value={settings.primary} onChange={(event) => update('primary', event.target.value.toUpperCase())} /><input value={settings.primary} onChange={(event) => update('primary', event.target.value)} /></div><div className="settings-color-row"><span>Color secundario</span><input type="color" value={settings.secondary} onChange={(event) => update('secondary', event.target.value.toUpperCase())} /><input value={settings.secondary} onChange={(event) => update('secondary', event.target.value)} /></div><span className="settings-field-label">Favicon</span><div className="settings-favicon"><span><SettingsIcon name="building" size={18} /></span><button className="settings-outline-button" type="button" onClick={() => setNotice('El selector de favicon está listo para conectarse al backend.')}>Cambiar favicon</button><small>Formato: ICO, PNG. Máx. 512KB</small></div></fieldset>
                  <fieldset className="settings-group settings-upload"><legend>Parámetros de carga de documentos</legend><Field label="Tamaño máximo por archivo"><select value={settings.maxFile} onChange={(event) => update('maxFile', event.target.value)}><option>50 MB</option><option>100 MB</option><option>250 MB</option></select></Field><Field label="Tamaño máximo total por carga"><select value={settings.maxBatch} onChange={(event) => update('maxBatch', event.target.value)}><option>250 MB</option><option>500 MB</option><option>1 GB</option></select></Field><Field label="Tipos de archivo permitidos"><input value={settings.fileTypes} onChange={(event) => update('fileTypes', event.target.value)} /><small>Separa los tipos de archivo con comas.</small></Field></fieldset>
                </section>
              </div>
              <footer className="settings-form-actions"><button className="is-primary" type="submit">Guardar cambios</button><button type="button" onClick={resetSettings}>Restablecer</button><button type="button" onClick={() => setNotice('La configuración general se validó correctamente.')}>Probar configuración</button></footer>
            </> : <section className="settings-tab-placeholder"><span>{activeTab.slice(0, 1)}</span><h2>Configuración de {activeTab.toLowerCase()}</h2><p>Esta sección está preparada para administrar sus opciones desde el frontend.</p><button type="button" onClick={() => setActiveTab('General')}>Volver a General</button></section>}
          </form>

          <div className="settings-bottom-grid">
            <section className="settings-card settings-table-card"><h2>Integraciones activas</h2><div className="settings-table-wrap"><table><thead><tr><th>Integración</th><th>Estado</th><th>Descripción</th><th>Última sincronización</th><th>Acciones</th></tr></thead><tbody>{filteredIntegrations.map((item) => <tr key={item.name}><td><span className={`settings-integration-icon is-${item.icon}`}>{item.icon === 'microsoft' ? 'M' : item.icon === 'google' ? 'G' : 'S3'}</span>{item.name}</td><td><span className="settings-connected">Conectado</span></td><td>{item.description}</td><td>{item.date}</td><td><button type="button" aria-label={`Opciones de ${item.name}`} onClick={() => setNotice(`Se abrieron las opciones de ${item.name}.`)}><SettingsIcon name="more" size={15} /></button></td></tr>)}</tbody></table>{!filteredIntegrations.length && <p className="settings-empty">No se encontraron integraciones.</p>}</div><button className="settings-card-link" type="button" onClick={() => setActiveTab('Integraciones')}>Ver todas las integraciones</button></section>
            <section className="settings-card settings-table-card"><h2>Registro de cambios de configuración</h2><div className="settings-table-wrap"><table><thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Sección</th><th>Cambio realizado</th></tr></thead><tbody>{filteredChanges.map((item) => <tr key={item[0]}>{item.map((value) => <td key={value}>{value}</td>)}</tr>)}</tbody></table>{!filteredChanges.length && <p className="settings-empty">No se encontraron cambios.</p>}</div><button className="settings-card-link" type="button" onClick={() => setNotice('Se abrió el historial completo de configuración.')}>Ver histórico completo</button></section>
          </div>
        </div>

        <aside className="settings-aside">
          <section className="settings-card settings-info-card"><header><h2>Estado del sistema</h2><span>Operativo</span></header><p>Estado general</p><small>Todos los servicios funcionando correctamente.</small><dl><div><dt>Servicios</dt><dd>8/8 operativos <i /></dd></div><div><dt>Base de datos</dt><dd>Operativo <i /></dd></div><div><dt>Almacenamiento</dt><dd>65% utilizado <i /></dd></div><div><dt>Última verificación</dt><dd>23/05/2024 10:25:34</dd></div></dl><button type="button" onClick={() => setNotice('El sistema opera correctamente: 8 de 8 servicios disponibles.')}>Ver detalles del sistema</button></section>
          <section className="settings-card settings-info-card"><header><h2>Licencia</h2><span>Activa</span></header><dl><div><dt>Plan</dt><dd>Empresarial</dd></div><div><dt>Usuarios autorizados</dt><dd>250</dd></div><div><dt>Vencimiento</dt><dd>23/05/2025</dd></div></dl><button type="button" onClick={() => setNotice('Se abrió la administración de la licencia.')}>Gestionar licencia</button></section>
          <section className="settings-card settings-info-card"><header><h2>Versión actual</h2></header><dl><div><dt>Versión</dt><dd>2.1.0</dd></div><div><dt>Fecha de lanzamiento</dt><dd>15/05/2024</dd></div></dl><button type="button" onClick={() => setNotice('Se abrieron las notas de la versión 2.1.0.')}>Ver notas de la versión</button></section>
          <section className="settings-card settings-info-card settings-support"><header><h2>Soporte técnico</h2></header><dl><div><dt><SettingsIcon name="mail" size={14} /> Correo</dt><dd>soporte@consultoriaalexandria.com</dd></div><div><dt><SettingsIcon name="phone" size={14} /> Teléfono</dt><dd>+57 1 234 5678</dd></div><div><dt><SettingsIcon name="clock" size={14} /> Horario</dt><dd>Lun - Vie 8:00 a.m. - 6:00 p.m.</dd></div></dl><button type="button" onClick={() => setNotice('Se inició una solicitud de soporte técnico.')}>Abrir ticket de soporte</button></section>
        </aside>
      </div>
      <span className="settings-live-notice" role="status">{notice}</span>
    </div>
  )
}

export default SettingsView
