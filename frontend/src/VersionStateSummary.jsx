import './VersionStateSummary.css'

function statusTone(code) {
  const value = `${code || ''}`.toLowerCase()
  if (value.includes('rechaz')) return 'red'
  if (value.includes('revision') || value.includes('revisión')) return 'orange'
  if (value.includes('aprob') || value.includes('public')) return 'green'
  if (value.includes('borrador') || value.includes('draft')) return 'blue'
  return 'gray'
}

function StateBadge({ tone, children }) {
  return <span className={`version-state-summary__badge version-state-summary__badge--${tone}`}><i />{children}</span>
}

export default function VersionStateSummary({ version }) {
  const state = version?.version_status || version?.status
  const code = typeof state === 'string' ? state : state?.code
  const published = version?.is_published ?? (code ? code === 'PUBLICADO' : null)
  const currentLabel = version?.is_current === true ? 'Vigente' : version?.is_current === false ? 'No vigente' : 'Sin información'
  const publicationLabel = published === true ? 'Publicada' : published === false ? 'No publicada' : 'Sin información'
  return <section aria-label="Estado de la versión" className="version-state-summary">
    <dl>
      <div><dt>Versión consultada</dt><dd>{version?.version || 'Sin versión'}</dd></div>
      <div><dt>Estado de la versión</dt><dd><StateBadge tone={statusTone(code)}>{code || 'Sin estado'}</StateBadge></dd></div>
      <div><dt>Vigencia</dt><dd><StateBadge tone={version?.is_current === true ? 'green' : 'gray'}>{currentLabel}</StateBadge></dd></div>
      <div><dt>Publicación de esta versión</dt><dd><StateBadge tone={published === true ? 'green' : published === false ? 'orange' : 'gray'}>{publicationLabel}</StateBadge></dd></div>
    </dl>
  </section>
}
