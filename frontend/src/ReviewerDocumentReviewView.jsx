import { useState } from 'react'
import './ReviewerDocumentReviewView.css'

const checklistItems = [
  ['Estructura del documento', true],
  ['Claridad del contenido', true],
  ['Cumplimiento normativo', false],
  ['Anexos y referencias', true],
  ['Coherencia y consistencia', false],
]

const observations = [
  ['1', 'Aclarar el objetivo respecto a la alineación con ISO/IEC 27001.', 'Menor', 'minor'],
  ['2', 'Especificar responsables del inventario de activos.', 'Importante', 'important'],
  ['3', 'Definir el método de autenticación multifactor requerido.', 'Importante', 'important'],
]

function ReviewIcon({ name, size = 18 }) {
  let content
  switch (name) {
    case 'document': content = <><path d="M6 2.8h8.6L19 7.2V21H6z" /><path d="M14.5 3v4.5H19M9 12h7M9 16h7" /></>; break
    case 'grid': content = <><rect x="4" y="4" width="5" height="5" rx="1" /><rect x="15" y="4" width="5" height="5" rx="1" /><rect x="4" y="15" width="5" height="5" rx="1" /><rect x="15" y="15" width="5" height="5" rx="1" /></>; break
    case 'paperclip': content = <path d="m8 12 6.5-6.5a3 3 0 0 1 4 4L10 18a4 4 0 0 1-5.7-5.7l8-8" />; break
    case 'comment': content = <><path d="M4 5h16v11H8l-4 4V5Z" /><path d="M8 9h8m-8 3h5" /></>; break
    case 'clock': content = <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>; break
    case 'check': content = <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.7 2.7L16.5 9" /></>; break
    case 'pending': content = <><circle cx="12" cy="12" r="8.5" /><path d="M8 12h8" /></>; break
    case 'layers': content = <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>; break
    case 'undo': content = <><path d="M9 7 4 12l5 5" /><path d="M4 12h10a6 6 0 0 1 6 6" /></>; break
    case 'approve': content = <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.7 2.7L16.5 9" /></>; break
    case 'calendar': content = <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /></>; break
    default: content = <circle cx="12" cy="12" r="8" />
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function ReviewerDocumentReviewView({ onAction }) {
  const [activeTab, setActiveTab] = useState('Contenido')
  const [checkedItems, setCheckedItems] = useState(checklistItems.map((item) => item[1]))

  function toggleChecklist(index) {
    setCheckedItems((current) => current.map((checked, itemIndex) => itemIndex === index ? !checked : checked))
  }

  return <div className="reviewer-document-review"><header className="reviewer-review-heading"><div><h1>Revisar documento</h1><p>Analiza el contenido, registra observaciones y emite una decisión.</p></div><time><ReviewIcon name="calendar" size={18} /> 23 de mayo de 2024</time></header><section className="reviewer-document-summary"><span className="reviewer-document-icon"><ReviewIcon name="document" size={39} /></span><div className="reviewer-document-title"><h2>POL-002 Política de Seguridad de la Información</h2><dl><div><dt>Código</dt><dd>POL-002</dd></div><div><dt>Área</dt><dd>Seguridad de la Información</dd></div><div><dt>Tipo</dt><dd>Política</dd></div><div><dt>Versión</dt><dd>1.2</dd></div><div><dt>Estado</dt><dd><b>En revisión</b></dd></div><div><dt>Autor</dt><dd>Carlos Méndez</dd></div></dl></div><div className="reviewer-document-extra"><div><dt>Enviado por</dt><dd>Carlos Méndez</dd></div><div><dt>Fecha de envío</dt><dd>22/05/2024, 09:15</dd></div><div><dt>Fecha límite</dt><dd>28/05/2024</dd></div><div><dt>Revisor asignado</dt><dd>María González</dd></div></div></section><div className="reviewer-review-body"><main><nav className="reviewer-review-tabs" aria-label="Secciones del documento">{['Vista general', 'Contenido', 'Anexos', 'Observaciones'].map((tab) => <button className={activeTab === tab ? 'is-active' : ''} type="button" key={tab} onClick={() => setActiveTab(tab)}><ReviewIcon name={tab === 'Vista general' ? 'grid' : tab === 'Contenido' ? 'document' : tab === 'Anexos' ? 'paperclip' : 'comment'} size={17} /> {tab}</button>)}</nav>{activeTab === 'Contenido' ? <article className="reviewer-document-content"><h3>1. <strong>Objetivo</strong></h3><p>Establecer los lineamientos para proteger la información de Consultoría Alexandria asegurando su confidencialidad, integridad y disponibilidad, mediante la gestión adecuada de riesgos y el cumplimiento de la normativa aplicable. <mark>1</mark></p><h3>2. <strong>Alcance</strong></h3><p>Aplica a todos los colaboradores, contratistas y terceros que accedan, procesen o administren información de Consultoría Alexandria, en cualquier medio o formato.</p><h3>3. <strong>Lineamientos</strong></h3><h4>3.1 <strong>Gestión de activos de información</strong></h4><p>La organización debe identificar, clasificar y mantener un inventario actualizado de sus activos de información. <mark>2</mark></p><h4>3.2 <strong>Control de accesos</strong></h4><p>El acceso a la información debe otorgarse únicamente a las personas autorizadas, bajo el principio de <mark>mínimo privilegio.</mark> <mark>3</mark></p><p>Se deben cumplir las siguientes acciones:</p><ul><li>Asignar accesos de acuerdo con el rol y responsabilidades.</li><li>Revisar y retirar accesos innecesarios de manera periódica.</li><li>Utilizar autenticación multifactor para sistemas críticos.</li></ul><h4>3.3 <strong>Clasificación de la información</strong></h4><p>La información debe clasificarse de acuerdo con su nivel de sensibilidad:</p><ul><li><strong>Pública:</strong> Información disponible para el público en general.</li><li><strong>Interna:</strong> Información de uso interno de la organización.</li><li><strong>Confidencial:</strong> Información que puede causar daño si es revelada sin autorización.</li><li><strong>Restringida:</strong> Información crítica cuyo acceso está limitado a personal autorizado.</li></ul></article> : <article className="reviewer-review-empty"><ReviewIcon name={activeTab === 'Anexos' ? 'paperclip' : activeTab === 'Observaciones' ? 'comment' : 'grid'} size={30} /><h3>{activeTab}</h3><p>Esta sección está disponible en esta vista frontend.</p></article>}<div className="reviewer-review-actions"><button type="button" onClick={() => onAction('Guardar observación')}><ReviewIcon name="document" size={18} /> Guardar observación</button><button type="button" onClick={() => onAction('Comparar versiones')}><ReviewIcon name="layers" size={18} /> Comparar versiones</button><button className="is-return" type="button" onClick={() => onAction('Devolver con observaciones')}><ReviewIcon name="undo" size={18} /> Devolver con observaciones</button><button className="is-approve" type="button" onClick={() => onAction('Aprobar documento')}><ReviewIcon name="approve" size={18} /> Aprobar documento</button></div></main><aside className="reviewer-review-sidebar"><section className="reviewer-review-side-card reviewer-review-status"><header><h2><ReviewIcon name="clock" size={20} /> Estado de revisión</h2></header><dl><div><dt>Etapa actual</dt><dd><b>Revisión de contenido</b></dd></div><div><dt>Tiempo restante</dt><dd className="is-green">5 días hábiles</dd></div><div><dt>Nivel de prioridad</dt><dd className="is-orange"><i /> Media</dd></div><div><dt>Asignado a</dt><dd>María González</dd></div></dl></section><section className="reviewer-review-side-card reviewer-review-checklist"><header><h2><ReviewIcon name="check" size={20} /> Checklist de revisión</h2></header><ul>{checklistItems.map((item, index) => <li key={item[0]}><span>{item[0]}</span><button className={checkedItems[index] ? 'is-checked' : ''} type="button" onClick={() => toggleChecklist(index)}><ReviewIcon name={checkedItems[index] ? 'check' : 'pending'} size={15} /> {checkedItems[index] ? 'Cumple' : 'Pendiente'}</button></li>)}</ul></section><section className="reviewer-review-side-card reviewer-review-observations"><header><h2><ReviewIcon name="comment" size={20} /> Observaciones del revisor</h2></header><div>{observations.map((item) => <article key={item[0]}><b>{item[0]}</b><p>{item[1]}</p><span className={`is-${item[3]}`}>{item[2]}</span></article>)}</div><button type="button" onClick={() => onAction('Todas las observaciones')}>Ver todas las observaciones (3) <span>→</span></button></section></aside></div><footer className="editor-footer"><span>© 2024 Consultoría Alexandria. Todos los derechos reservados.</span><span>Versión 2.1.0</span></footer></div>
}

export default ReviewerDocumentReviewView
