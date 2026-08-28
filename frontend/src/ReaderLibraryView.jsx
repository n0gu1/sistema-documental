import { useDeferredValue, useEffect, useState } from "react";
import {
  apiRequest,
  buildDocumentQuery,
  DOCUMENT_ORDERING_OPTIONS,
  downloadFile,
  normalizeDocument,
} from "./documentApi";
import "./ReaderLibraryView.css";

const PAGE_SIZE = 10;

function LibraryIcon({ name, size = 18 }) {
  const content =
    name === "search" ? (
      <>
        <circle cx="10.8" cy="10.8" r="6.8" />
        <path d="m16 16 4.5 4.5" />
      </>
    ) : name === "download" ? (
      <>
        <path d="M12 3v12m0 0-4-4m4 4 4-4" />
        <path d="M4 18v3h16v-3" />
      </>
    ) : name === "star" ? (
      <path d="m12 3 2.8 5.8 6.2.9-4.5 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.7l6.2-.9L12 3Z" />
    ) : name === "eye" ? (
      <>
        <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ) : name === "calendar" ? (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 2v6M17 2v6M3 10h18" />
      </>
    ) : name === "bookmark" ? (
      <path d="M6 3h12v18l-6-4-6 4z" />
    ) : (
      <>
        <path d="M6 2.8h8.6L19 7.2V21H6z" />
        <path d="M14.5 3v4.5H19M9 12h7M9 16h7" />
      </>
    );
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={name === "star" ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {content}
    </svg>
  );
}

function ReaderLibraryView({ onAction, onNavigate }) {
  const [documents, setDocuments] = useState([]);
  const [total, setTotal] = useState(0);
  const [catalogs, setCatalogs] = useState({
    areas: [],
    types: [],
    statuses: [],
  });
  const [query, setQuery] = useState("");
  const [area, setArea] = useState("Todas las áreas");
  const [type, setType] = useState("Todos los tipos");
  const [status, setStatus] = useState("Todos los estados");
  const [page, setPage] = useState(1);
  const [ordering, setOrdering] = useState("-updated_at");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  useEffect(() => {
    let active = true;
    apiRequest("/api/documents/catalogs/")
      .then((data) => {
        if (active) setCatalogs(data);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const query = buildDocumentQuery({
      search: deferredQuery,
      area: area === "Todas las áreas" ? "" : area,
      type: type === "Todos los tipos" ? "" : type,
      status: status === "Todos los estados" ? "" : status,
      ordering,
      catalogs,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    });
    apiRequest(`/api/reader/documents/?${query}`)
      .then((data) => {
        if (active) {
          setDocuments((data.results || []).map(normalizeDocument));
          setTotal(data.count || 0);
        }
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [deferredQuery, area, type, status, ordering, page, catalogs]);

  const visibleDocuments = documents;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const areas = catalogs.areas?.length
    ? catalogs.areas.map((item) => item.name)
    : [...new Set(documents.map((document) => document.area).filter(Boolean))];
  const types = catalogs.types?.length
    ? catalogs.types.map((item) => item.name)
    : [...new Set(documents.map((document) => document.type).filter(Boolean))];
  const statuses = ["Publicado"];
  const selectedDocument = visibleDocuments[0];

  async function toggleFavorite(document) {
    try {
      await apiRequest(`/api/reader/documents/${document.id}/favorite/`, {
        method: document.favorite ? "DELETE" : "POST",
      });
      setDocuments((current) =>
        current.map((item) =>
          item.id === document.id
            ? { ...item, favorite: !item.favorite }
            : item,
        ),
      );
      onAction(
        document.favorite
          ? "Documento retirado de favoritos."
          : "Documento agregado a favoritos.",
      );
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  function openDocument(document) {
    onNavigate?.("document", document.id);
  }

  function clearFilters() {
    setQuery("");
    setArea("Todas las áreas");
    setType("Todos los tipos");
    setStatus("Todos los estados");
    setOrdering("-updated_at");
    setPage(1);
    onAction("Se limpiaron los filtros.");
  }

  function updateFilter(setter) {
    return (value) => {
      setter(value);
      setPage(1);
    };
  }

  function openSelectedDocument() {
    if (selectedDocument) return openDocument(selectedDocument);
    onAction("No hay documentos disponibles para consultar.");
  }

  return (
    <div className="reader-library">
      <header className="reader-library-heading">
        <div>
          <h1>Biblioteca documental</h1>
          <p>Explora y consulta los documentos institucionales disponibles.</p>
        </div>
      </header>
      {error && (
        <p className="editor-error" role="alert">
          {error}
        </p>
      )}
      <div className="reader-library-layout">
        <main>
          <section className="reader-library-filters">
            <label className="reader-library-filter-search">
              <span>Búsqueda libre</span>
              <div>
                <LibraryIcon name="search" size={17} />
                <input
                  value={query}
                  onChange={(event) => updateFilter(setQuery)(event.target.value)}
                  placeholder="Buscar por código, documento o palabra clave..."
                />
              </div>
            </label>
            <label>
              <span>Área</span>
              <select
                value={area}
                onChange={(event) => updateFilter(setArea)(event.target.value)}
              >
                <option>Todas las áreas</option>
                {areas.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Tipo de documento</span>
              <select
                value={type}
                onChange={(event) => updateFilter(setType)(event.target.value)}
              >
                <option>Todos los tipos</option>
                {types.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Estado</span>
              <select
                value={status}
                onChange={(event) => updateFilter(setStatus)(event.target.value)}
              >
                <option>Todos los estados</option>
                {statuses.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <div className="reader-library-filter-actions">
              <button
                className="is-primary"
                type="button"
                onClick={openSelectedDocument}
              >
                <LibraryIcon name="eye" size={17} /> Ver documento
              </button>
              <button type="button" onClick={clearFilters}>
                Limpiar filtros
              </button>
            </div>
          </section>
          <section className="reader-library-table-card">
            <header className="reader-library-results-heading">
              <span>
                <LibraryIcon size={17} />{" "}
                <strong>
                  {loading
                    ? "Cargando documentos..."
                    : `${total} documentos encontrados`}
                </strong>
              </span>
            </header>
            <div className="reader-library-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Documento</th>
                    <th>Área</th>
                    <th>Tipo</th>
                    <th>Versión vigente</th>
                    <th>Actualización</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleDocuments.map((document) => (
                    <tr key={document.id}>
                      <td>{document.code}</td>
                      <td>
                        <button
                          className="reader-library-document-link"
                          type="button"
                          onClick={() => openDocument(document)}
                        >
                          {document.title}
                        </button>
                      </td>
                      <td>{document.area}</td>
                      <td>{document.type}</td>
                      <td>{document.version}</td>
                      <td>{document.updated}</td>
                      <td>
                        <div className="reader-library-actions">
                          <button
                            type="button"
                            aria-label={`Ver ${document.title}`}
                            onClick={() => openDocument(document)}
                          >
                            <LibraryIcon name="eye" size={16} />
                          </button>
                          {document.downloadUrl && (
                            <button
                              type="button"
                              aria-label={`Descargar ${document.title}`}
                              onClick={() => downloadFile(document.downloadUrl)}
                            >
                              <LibraryIcon name="download" size={16} />
                            </button>
                          )}
                          <button
                            className={document.favorite ? "is-favorite" : ""}
                            type="button"
                            aria-label={`${document.favorite ? "Quitar de" : "Agregar a"} favoritos`}
                            onClick={() => toggleFavorite(document)}
                          >
                            <LibraryIcon name="star" size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && !visibleDocuments.length && (
                <div className="reader-library-empty">
                  <LibraryIcon name="search" size={25} />
                  <strong>Sin resultados</strong>
                  <span>Prueba con otros términos o limpia los filtros.</span>
                </div>
              )}
            </div>
            <footer>
              <span>
                Mostrando {visibleDocuments.length} de {total} documentos
              </span>
              <label>
                Ordenar por{" "}
                <select
                  value={ordering}
                  onChange={(event) => {
                    setOrdering(event.target.value);
                    setPage(1);
                  }}
                >
                  {DOCUMENT_ORDERING_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="reader-library-pagination">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  Anterior
                </button>
                <span>
                  Página {currentPage} de {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() =>
                    setPage((value) => Math.min(totalPages, value + 1))
                  }
                >
                  Siguiente
                </button>
              </div>
            </footer>
          </section>
        </main>
        <aside className="reader-library-sidebar">
          <section>
            <header>
              <h2>
                <LibraryIcon name="bookmark" size={18} /> Documentos recientes
              </h2>
              <button type="button" onClick={() => onNavigate?.("library")}>
                Ver todos
              </button>
            </header>
            <div className="reader-library-recent-list">
              {documents.slice(0, 5).length ? (
                documents.slice(0, 5).map((document) => (
                  <button
                    type="button"
                    key={document.id}
                    onClick={() => openDocument(document)}
                  >
                    <span className="reader-library-recent-icon">
                      <LibraryIcon name="document" size={18} />
                    </span>
                    <span>
                      <strong>{document.code}</strong>
                      <small>{document.title}</small>
                      <time>{document.updated}</time>
                    </span>
                  </button>
                ))
              ) : (
                <p className="reader-library-empty">
                  No hay documentos recientes.
                </p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

export default ReaderLibraryView;
