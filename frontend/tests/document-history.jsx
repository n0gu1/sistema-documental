import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { PermissionProvider } from '../src/Permissions'
import EditorDashboard from '../src/EditorDashboard'
import VersionsView from '../src/VersionsView'
import ReaderVersionHistoryView from '../src/ReaderVersionHistoryView'

function TestHistory() {
  const [id, setId] = useState(null)
  const view = new URLSearchParams(location.search).get('view')
  const user = { has_all_permissions: true, email: 'ui@test.local' }
  return <PermissionProvider user={user}>{view === 'editor' ? <EditorDashboard user={user} /> : <>
    <button onClick={() => setId('A')}>Documento A</button><button onClick={() => setId('B')}>Documento B</button>
    {view === 'reader' ? <ReaderVersionHistoryView key={id} documentId={id} /> : <VersionsView key={id} documentId={id} />}
  </>}</PermissionProvider>
}
createRoot(document.getElementById('root')).render(<TestHistory />)
