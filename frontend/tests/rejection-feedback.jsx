import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { PermissionProvider } from '../src/Permissions'
import ReviewerDocumentReviewView from '../src/ReviewerDocumentReviewView'
import EditorDocumentEditView from '../src/EditorDocumentEditView'

function TestFeedback() {
  const params = new URLSearchParams(location.search)
  const [id, setId] = useState(params.get('document'))
  const [notice, setNotice] = useState('')
  return <PermissionProvider user={{has_all_permissions:true}}>
    <p role="status">{notice}</p>
    {params.get('role') === 'reviewer'
      ? <ReviewerDocumentReviewView reviewId={params.get('review')} onAction={setNotice} />
      : <><button onClick={() => setId(params.get('other'))}>Otro documento</button><EditorDocumentEditView document={{id}} onAction={setNotice} /></>}
  </PermissionProvider>
}
createRoot(document.getElementById('root')).render(<TestFeedback />)
