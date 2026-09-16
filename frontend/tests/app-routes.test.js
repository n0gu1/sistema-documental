import assert from 'node:assert/strict'
import test from 'node:test'
import { pathForRoute, routeForPath } from '../src/appRoutes.js'

test('maps every top-level module to a stable URL', () => {
  const cases = [
    ['management', 'dashboard', '/dashboard'],
    ['management', 'document', '/documentos'],
    ['management', 'layers', '/versiones'],
    ['management', 'users', '/usuarios'],
    ['management', 'shield', '/roles-permisos'],
    ['management', 'clipboard', '/bitacora'],
    ['management', 'chart', '/reportes'],
    ['management', 'cloud', '/respaldos'],
    ['management', 'settings', '/configuracion'],
    ['editor', 'dashboard', '/dashboard'],
    ['editor', 'documents', '/documentos'],
    ['editor', 'versions', '/versiones'],
    ['editor', 'audit', '/bitacora'],
    ['editor', 'reports', '/reportes'],
    ['reviewer', 'dashboard', '/dashboard'],
    ['reviewer', 'review-inbox', '/revisiones'],
    ['reviewer', 'review-document', '/documentos-asignados'],
    ['reviewer', 'compare', '/comparacion-versiones'],
    ['reviewer', 'personal-log', '/bitacora'],
    ['reviewer', 'reports', '/reportes'],
    ['reader', 'dashboard', '/dashboard'],
    ['reader', 'library', '/biblioteca'],
    ['reader', 'document', '/documentos'],
    ['reader', 'history', '/versiones'],
    ['reader', 'reading', '/historial-lectura'],
    ['reader', 'favorites', '/favoritos'],
  ]

  for (const [workspace, view, path] of cases) {
    assert.equal(pathForRoute(workspace, view), path)
    assert.equal(routeForPath(workspace, path).view, view)
  }
})

test('resolves management module and document URLs', () => {
  assert.deepEqual(routeForPath('management', '/usuarios'), { view: 'users' })
  assert.deepEqual(routeForPath('management', '/documentos/42/editar'), {
    view: 'document',
    documentMode: 'edit',
    documentId: '42',
  })
  assert.equal(pathForRoute('management', 'layers', { documentId: 42 }), '/documentos/42/versiones')
})

test('uses the same public module URL for the editor workspace', () => {
  assert.deepEqual(routeForPath('editor', '/documentos'), { view: 'documents', documentId: null })
  assert.deepEqual(routeForPath('editor', '/documentos/8/versiones'), { view: 'versions', documentId: '8' })
  assert.equal(pathForRoute('editor', 'reports'), '/reportes')
})

test('resolves reviewer and reader detail URLs', () => {
  assert.deepEqual(routeForPath('reviewer', '/revisiones/15'), { view: 'review-document', reviewId: '15' })
  assert.equal(pathForRoute('reviewer', 'review-document', { reviewId: 15 }), '/revisiones/15')
  assert.deepEqual(routeForPath('reader', '/documentos/21'), { view: 'document', documentId: '21' })
  assert.equal(pathForRoute('reader', 'favorites'), '/favoritos')
})

test('rejects unknown and malformed application URLs', () => {
  assert.equal(routeForPath('management', '/'), null)
  assert.equal(routeForPath('management', '/documentos/1/desconocido'), null)
  assert.equal(routeForPath('reader', '/usuarios'), null)
})
