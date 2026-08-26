import { useState } from 'react'
import './ReviewerVersionComparisonView.css'

const history = [
  ['1.2', '26/05/2024 14:10', 'Lucía Fernández', 'Ajustes en alcance, responsabilidades y anexos.', 'En revisión', 'review'],
  ['1.1', '15/05/2024 09:20', 'Lucía Fernández', 'Actualización general del documento.', 'Aprobada', 'approved'],
  ['1.0', '30/04/2024 11:05', 'Lucía Fernández', 'Versión inicial del instructivo.', 'Aprobada', 'approved'],
]

const findings = [
  ['Crítico', 'Se elimina el apartado de registros sin justificación documentada.', 'Sección 5', 'Línea 58', '14:25', 'critical'],
  ['Importante', 'Ampliación del alcance requiere validación con dueños de proceso.', 'Sección 2', 'Línea 44', '14:22', 'important'],
  ['Menor', 'Redacción sugerida para mayor claridad en objetivo.', 'Sección 1', 'Línea 8', '14:18', 'minor'],
  ['Importante', 'Nuevo registro FOR-015 debe ser revisado y aprobado por Calidad.', 'Sección 5', 'Línea 65', '14:15', 'important'],
]

const comments = [
  ['LF', 'Lucía Fernández', 'Autora', 'Se agrega el requisito de reporting para alinear con ISO 19011.', '14:10', 'author'],
  ['MG', 'María González', 'Revisor', 'De acuerdo, por favor confirmar el formato del reporte.', '14:16', 'reviewer'],
  ['LF', 'Lucía Fernández', 'Autora', 'El formato se encuentra en desarrollo, se compartirá en breve.', '14:19', 'author'],
]

function CompareIcon({ name, size = 18 }) {
  let content
  switch (name) {
    case 'document': content = <><path d="M6 2.8h8.6L19 7.2V21H6z" /><path d="M14.5 3v4.5H19M9 12h7M9 16h7" /></>; break
    case 'download': content = <><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 18v3h16v-3" /></>; break
    case 'comment': content = <><path d="M4 5h16v11H8l-4 4V5Z" /><path d="M8 9h8m-8 3h5" /></>; break
    case 'approve': content = <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.7 2.7L16.5 9" /></>; break
    case 'clock': content = <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>; break
    case 'flag': content = <><path d="M5 21V4" /><path d="M5 5c5-3 8 3 14 0v9c-6 3-9-3-14 0" /></>; break
    case 'eye': content = <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>; break
    case 'calendar': content = <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></>; break
    case 'arrow': content = <path d="m9 18 6-6-6-6" />; break
    case 'plus': content = <path d="M12 5v14M5 12h14" />; break
    default: content = <circle cx="12" cy="12" r="8" />
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function VersionStatus({ tone, children }) {
  return <span className={`reviewer-comparison-status is-${tone}`}>{children}</span>
}

function ReviewerVersionComparisonView({ onAction }) {
  const [activeFinding, setActiveFinding] = useState(null)
  const [showAllComments, setShowAllComments] = useState(false)
  const visibleComments = showAllComments ? comments : comments.slice(0, 3)

  return <div className="reviewer-comparison"><header className="reviewer-comparison-heading"><div><h1>Comparación de versiones</h1><p>Contrasta cambios entre versiones, valida ajustes y deja hallazgos.</p></div><time><CompareIcon name="calendar" size={18} /> 23 de mayo de 2024</time></header><section className="reviewer-comparison-summary"><span className="reviewer-comparison-document-icon"><CompareIcon name="document" size={35} /></span><div className="reviewer-comparison-summary-info"><h2>INS-007 Instructivo de Auditoría Interna</h2><dl><div><dt>Área</dt><dd>Auditoría Interna</dd></div><div><dt>Versión anterior</dt><dd>1.1</dd></div><div><dt>Versión actual</dt><dd>1.2</dd></div><div><dt>Estado</dt><dd><VersionStatus tone="review">En revisión</VersionStatus></dd></div><div><dt>Autor</dt><dd>Lucía Fernández</dd></div><div><dt>Fecha de actualización</dt><dd>26/05/2024 14:10</dd></div></dl></div><div className="reviewer-comparison-summary-actions"><button type="button" onClick={() => onAction('Descargar comparación')}><CompareIcon name="download" size={17} /> Descargar</button><button type="button" onClick={() => onAction('Emitir observación')}><CompareIcon name="comment" size={17} /> Emitir observación</button><button className="is-primary" type="button" onClick={() => onAction('Aprobar cambios')}><CompareIcon name="approve" size={17} /> Aprobar cambios</button></div></section><div className="reviewer-comparison-layout"><main><section className="reviewer-comparison-card reviewer-comparison-history"><header><h2><CompareIcon name="clock" size={19} /> Historial de versiones</h2><button type="button" onClick={() => onAction('Ver todas las versiones')}>Ver todas las versiones</button></header><div className="reviewer-comparison-history-table"><table><thead><tr><th>Versión</th><th>Fecha</th><th>Autor</th><th>Descripción de cambios</th><th>Estado</th></tr></thead><tbody>{history.map((item) => <tr key={item[0]}><td><strong>{item[0]}</strong></td><td>{item[1]}</td><td>{item[2]}</td><td>{item[3]}</td><td><VersionStatus tone={item[5]}>{item[4]}</VersionStatus></td></tr>)}</tbody></table></div></section><section className="reviewer-comparison-card reviewer-comparison-diff"><header><h2><span className="is-old"><CompareIcon name="document" size={17} /></span> Versión 1.1 <span className="reviewer-comparison-arrow">→</span> <span className="is-new"><CompareIcon name="document" size={17} /></span> Versión 1.2</h2><div className="reviewer-comparison-legend"><span className="is-addition">Adición</span><span className="is-modification">Modificación</span><span className="is-deletion">Eliminación</span></div></header><div className="reviewer-comparison-columns"><div className="reviewer-comparison-column"><h3>Versión 1.1</h3><article><b>1. OBJETIVO</b><p>Establecer lineamientos para planear, ejecutar y dar seguimiento a las auditorías internas de los procesos de la organización.</p></article><article><b>2. ALCANCE</b><p className="is-deletion">Aplica a todos los procesos del Sistema de Gestión de Calidad.</p></article><article><b>3. RESPONSABILIDADES</b><p>El Auditor Líder es responsable de planear y coordinar la auditoría.</p></article><article><b>4. DOCUMENTOS DE REFERENCIA</b><p>ISO 19011:2018 Directrices para la auditoría de sistemas de gestión.</p></article><article><b>5. REGISTROS</b><p className="is-deletion">No aplica.</p></article></div><div className="reviewer-comparison-change-arrows"><span className="is-addition">→</span><span className="is-modification">↔</span><span className="is-addition">→</span><span className="is-addition">→</span><span className="is-deletion">⊖</span></div><div className="reviewer-comparison-column"><h3>Versión 1.2</h3><article><b>1. OBJETIVO</b><p>Establecer lineamientos para planear, ejecutar, dar seguimiento <mark className="is-addition">y reportar los resultados</mark> de las auditorías internas de los procesos de la organización.</p></article><article><b>2. ALCANCE</b><p className="is-modification">Aplica a todos los procesos del Sistema de Gestión de Calidad <mark>y a los procesos de apoyo definidos en el mapa de procesos.</mark></p></article><article><b>3. RESPONSABILIDADES</b><p>El Auditor Líder es responsable de planear, coordinar <mark className="is-addition">y comunicar los resultados de la auditoría.</mark></p></article><article><b>4. DOCUMENTOS DE REFERENCIA</b><p>ISO 19011:2018 Directrices para la auditoría de sistemas de gestión. <mark className="is-addition">ISO 9001:2015 Sistemas de gestión de la calidad - Requisitos.</mark></p></article><article><b>5. REGISTROS</b><p className="is-addition">FOR-015 Lista de verificación de auditoría (ver Anexo 1).</p></article></div></div></section></main><aside className="reviewer-comparison-sidebar"><section className="reviewer-comparison-card reviewer-comparison-findings"><header><h2><CompareIcon name="flag" size={19} /> Hallazgos del revisor</h2><button type="button" onClick={() => onAction('Ver todos los hallazgos')}>Ver todos</button></header><div>{findings.map((item, index) => <article className={activeFinding === index ? 'is-selected' : ''} key={`${item[0]}-${item[1]}`} onClick={() => setActiveFinding(index)}><span className={`reviewer-comparison-finding-label is-${item[5]}`}>{item[0]}</span><p>{item[1]}</p><small>{item[2]}</small><time>{item[3]}<br />26/05/2024, {item[4]}</time><button type="button" aria-label={`Ver hallazgo ${index + 1}`} onClick={(event) => { event.stopPropagation(); onAction(`Ver hallazgo ${index + 1}`) }}><CompareIcon name="eye" size={15} /></button></article>)}</div></section><section className="reviewer-comparison-card reviewer-comparison-comments"><header><h2><CompareIcon name="comment" size={19} /> Comentarios y notas</h2><button type="button" onClick={() => setShowAllComments((current) => !current)}>{showAllComments ? 'Ver menos' : 'Ver todos'}</button></header><div className="reviewer-comparison-comment-list">{visibleComments.map((item, index) => <article key={`${item[1]}-${index}`}><span className={`reviewer-comparison-avatar is-${item[5]}`}>{item[0]}</span><div><strong>{item[1]}</strong><small>{item[2]}</small><p>{item[3]}</p><time>26/05/2024, {item[4]}</time></div></article>)}</div></section></aside></div><footer className="editor-footer"><span>© 2024 Consultoría Alexandria. Todos los derechos reservados.</span><span>Versión 2.1.0</span></footer></div>
}

export default ReviewerVersionComparisonView
