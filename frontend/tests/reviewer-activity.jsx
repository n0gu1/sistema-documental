import React from 'react'
import { createRoot } from 'react-dom/client'
import { PermissionProvider } from '../src/Permissions'
import ReviewerBasicReportsView from '../src/ReviewerBasicReportsView'

createRoot(document.getElementById('root')).render(
  <PermissionProvider user={{ has_all_permissions: true }}><ReviewerBasicReportsView /></PermissionProvider>,
)
