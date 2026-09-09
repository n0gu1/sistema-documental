export default function VersionStateSummary({ version }) {
  const state = version?.version_status || version?.status
  const code = typeof state === 'string' ? state : state?.code
  const published = version?.is_published ?? (code ? code === 'PUBLICADO' : null)
  return <section aria-label="Estado de la versión" className="version-state-summary">
    <dl style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', padding: '12px' }}>
      <div><dt>Versión consultada</dt><dd>{version?.version || 'Sin versión'}</dd></div>
      <div><dt>Estado de la versión</dt><dd>{code || 'Sin estado'}</dd></div>
      <div><dt>Vigencia</dt><dd>{version?.is_current === true ? 'Vigente' : version?.is_current === false ? 'No vigente' : 'Sin información'}</dd></div>
      <div><dt>Publicación de esta versión</dt><dd>{published === true ? 'Publicada' : published === false ? 'No publicada' : 'Sin información'}</dd></div>
    </dl>
  </section>
}
