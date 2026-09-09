import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { PermissionProvider } from '../src/Permissions'
import ReviewerDocumentReviewView from '../src/ReviewerDocumentReviewView'

function TestReview() {
  const [id, setId] = useState('review-old')
  const [message, setMessage] = useState('')
  return <PermissionProvider user={{ has_all_permissions: true }}>
    <button onClick={() => setId('review-next')}>Otra solicitud</button>
    <p role="status">{message}</p>
    <ReviewerDocumentReviewView reviewId={id} onAction={setMessage} />
  </PermissionProvider>
}
createRoot(document.getElementById('root')).render(<TestReview />)
