import { useEffect, useState } from 'react'
import { apiRequest, formatDate } from './api'
import './ReportsView.css'

const actorName = (actor) => actor?.name || 'No consta'

export default function TraceabilityReport({ onBack }) {
  const [documents, setDocuments] = useState([])
  const [selected, setSelected] = useState('')
  const [data, setData] = useState(null)
  const [format, setFormat] = useState('PDF')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [download, setDownload] = useState(null)
  useEffect(() => {
    let active = true
    async function load() {
      try {
        let offset = 0
        const all = []
        do {
          const page = await apiRequest(`/api/documents/?include_archived=true&limit=100&offset=${offset}`)
          all.push(...page.results)
          offset = page.next_offset
        } while (active && offset !== null && offset !== undefined)
        if (active) setDocuments(all)
      } catch (e) { if (active) setError(e.message) }
    }
    load()
    return () => { active = false }
  }, [])

  async function consult(event) {
    event.preventDefault()
    setBusy(true); setError(''); setData(null); setDownload(null)
    try { setData(await apiRequest(`/api/reports/?scope=traceability&document_id=${encodeURIComponent(selected)}`)) }
    catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  async function generate() {
    setBusy(true); setError(''); setDownload(null)
    try {
      const result = await apiRequest('/api/reports/generate/', {
        method: 'POST', body: { scope: 'traceability', format, filters: { document_id: data.document.id } },
      })
      setDownload(result.report)
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  return <div className="reports-view">
    <header className="reports-heading"><div><h1>Reporte integral de trazabilidad</h1><p>Historial conservado de un documento, con fuentes, actores y fechas.</p></div><div className="reports-actions"><button onClick={onBack}>Volver a reportes</button></div></header>
    <form className="reports-panel reports-actions" style={{ padding: 16, flexWrap: 'wrap', alignItems: 'end' }} onSubmit={consult}>
      <label className="reports-filter" style={{ flex: '1 1 420px' }}><span>Documento</span><select style={{ width: '100%' }} aria-label="Documento de trazabilidad" value={selected} disabled={busy} required onChange={e => { setSelected(e.target.value); setData(null); setDownload(null) }}>
        <option value="">Seleccione un documento</option>{documents.map(doc => <option key={doc.id} value={doc.id}>{doc.code} — {doc.title}</option>)}
      </select></label><button type="submit" disabled={!selected || busy}>Consultar trazabilidad</button>
    </form>
    {error && <p className="reports-error" role="alert">{error}</p>}
    {busy && <p role="status">Procesando reporte…</p>}
    {data && <>
      <section className="reports-panel" style={{ padding: 16, marginTop: 16 }}>
        <h2>{data.document.code} — {data.document.title}</h2>
        <p>{data.summary.versions} versiones · {data.summary.reviews} solicitudes · {data.summary.records} registros de evidencia</p>
        {data.notes.map(note => <p key={note}>{note}</p>)}
        <div className="reports-actions"><select aria-label="Formato de trazabilidad" value={format} onChange={e => setFormat(e.target.value)} disabled={busy}><option value="PDF">PDF</option><option value="XLSX">Excel (XLSX)</option></select><button className="is-primary" disabled={busy} onClick={generate}>Exportar trazabilidad</button>{download && <a href={download.download_url} download>Descargar {download.format}</a>}</div>
      </section>
      <section className="reports-panel" style={{ padding: 16, marginTop: 16 }}><h2>Versiones conservadas</h2>
        {data.versions.map(v => <p key={v.id}><strong>{v.version}</strong> · {actorName(v.author)} · {formatDate(v.created_at)} · Estado actual: {v.current_state}{v.is_current ? ' · Vigente' : ''}<br />{v.comment || 'Sin comentario'}</p>)}
      </section>
      <section className="reports-panel reports-recent" style={{ marginTop: 16 }}><header><h2>Cronología de evidencias</h2></header><div className="reports-table-scroll"><table><thead><tr><th>Fecha</th><th>Versión</th><th>Evento</th><th>Actor</th><th>Revisor asignado</th><th>Estado / origen</th><th>Detalle</th><th>Fuente</th></tr></thead><tbody>
        {data.rows.map(row => <tr key={row.id}><td>{formatDate(row.at)}</td><td>{row.version || '—'}</td><td>{row.event}<br />{row.successful === false ? 'Fallido' : ''}</td><td>{actorName(row.actor)}</td><td>{actorName(row.reviewer)}</td><td>{row.state_from || row.state_to ? `${row.state_from || 'No consta'} → ${row.state_to || 'No consta'}` : ''}{row.restored_from && `Restaurada desde ${row.restored_from.version}`}</td><td style={{ whiteSpace: 'pre-wrap', minWidth: 220 }}>{row.comment}{Object.keys(row.details).length > 0 && <details><summary>Detalle de la fuente</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(row.details, null, 2)}</pre></details>}</td><td>{row.source}<br />{row.source_id}</td></tr>)}
      </tbody></table></div></section>
    </>}
  </div>
}
