import { useEffect, useState } from 'react'
import { apiRequest, downloadFile, formatDate, readerDocumentPath } from './documentApi'
import './ReaderDocumentView.css'

function DocumentIcon({ name, size = 20 }) {
  const content = name === 'download'
    ? <><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 18v3h16v-3" /></>
    : name === 'star'
      ? <path d="m12 3 2.8 5.8 6.2.9-4.5 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.7l6.2-.9L12 3Z" />
      : <><path d="M6 2.8h8.6L19 7.2V21H6z" /><path d="M14.5 3v4.5H19M9 12h7M9 16h7" /></>
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={name === 'star' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>
}

function ReaderDocumentView({ documentId, onBack, onAction }) {
  const [document, setDocument] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        let id = documentId
        if (!id) {
          const list = await apiRequest('/api/reader/documents/?limit=1')
          id = list.results?.[0]?.id
        }
        if (!id) throw new Error('No hay documentos publicados disponibles.')
        const data = await apiRequest(readerDocumentPath(id))
        if (!active) return
        setDocument(data.document)
        apiRequest(`/api/reader/documents/${id}/read/`, { method: 'POST', body: {} }).catch(() => {})
      } catch (requestError) { if (active) setError(requestError.message) }
      finally { if (active) setLoading(false) }
    }
    load()
    return () => { active = false }
  }, [documentId])

  async function toggleFavorite() {
    if (!document) return
    try {
      await apiRequest(`/api/reader/documents/${document.id}/favorite/`, { method: document.favorite ? 'DELETE' : 'POST' })
      setDocument((current) => ({ ...current, favorite: !current.favorite }))
      onAction(document.favorite ? 'Documento retirado de favoritos.' : 'Documento agregado a favoritos.')
    } catch (requestError) { setError(requestError.message) }
  }

  if (loading) return <div className="reader-document-view"><p>Cargando documento...</p></div>
  if (error) return <div className="reader-document-view"><button className="reader-document-back" type="button" onClick={onBack}>← Volver</button><p className="editor-error" role="alert">{error}</p></div>
  const version = document.version
  const metadata = Object.entries(document.metadata || {})

  return <div className="reader-document-view"><button className="reader-document-back" type="button" onClick={onBack}>← &nbsp;Volver a documentos disponibles</button><section className="reader-document-layout"><main><header className="reader-document-header"><span className="reader-document-file"><DocumentIcon size={34} /></span><div className="reader-document-title"><h1>{document.code} {document.title}</h1><div className="reader-document-meta"><span><b>Código</b>{document.code}</span><span><b>Área</b>{document.area?.name}</span><span><b>Tipo</b>{document.type?.name}</span><span><b>Versión</b>{version?.version || '—'}</span><span><b>Estado</b><em>{document.status?.name || 'Publicado'}</em></span><span><b>Actualizado</b>{formatDate(document.updated_at)}</span></div></div></header><nav className="reader-document-tabs" aria-label="Secciones del documento"><button className="is-active" type="button"><DocumentIcon size={18} /> Contenido</button><button type="button" onClick={() => version?.download_url && downloadFile(version.download_url)}><DocumentIcon name="download" size={18} /> Descargar</button><button type="button" onClick={toggleFavorite}><DocumentIcon name="star" size={18} /> {document.favorite ? 'Quitar favorito' : 'Favorito'}</button></nav><article className="reader-document-body"><h2>{document.title}</h2><p>{document.description || 'Este documento no tiene una descripción registrada.'}</p>{metadata.length > 0 && <><h3>Metadatos</h3><dl>{metadata.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></>}<p className="reader-document-muted">Última actualización: {formatDate(document.updated_at)}</p></article></main><aside className="reader-document-aside"><section><h2>Acciones</h2><button type="button" onClick={() => version?.download_url && downloadFile(version.download_url)}><DocumentIcon name="download" size={17} /> Descargar versión publicada</button><button type="button" onClick={toggleFavorite}><DocumentIcon name="star" size={17} /> {document.favorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}</button></section><section><h2>Información</h2><p>Versión publicada: {version?.version || '—'}</p><p>Publicada: {formatDate(version?.published_at)}</p></section></aside></section></div>
}

export default ReaderDocumentView
