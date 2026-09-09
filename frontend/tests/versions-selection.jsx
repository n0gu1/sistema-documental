import React from 'react'
import { createRoot } from 'react-dom/client'
import { PermissionProvider } from '../src/Permissions'
import VersionsView from '../src/VersionsView'
import EditorVersionsView from '../src/EditorVersionsView'

const editor = new URLSearchParams(window.location.search).get('view') === 'editor'
createRoot(document.getElementById('root')).render(
  <PermissionProvider user={{ has_all_permissions: true }}>
    {editor ? <EditorVersionsView documentId="test-document" /> : <VersionsView documentId="test-document" />}
  </PermissionProvider>,
)
