const { chromium } = require('C:/Users/Cristian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

async function main() {
  const browser = await chromium.launch({ headless: true })
  const checks = []
  try {
    for (const view of ['admin', 'editor', 'reader']) {
      const context = await browser.newContext()
      const page = await context.newPage()
      const requests = []
      const errors = []
      page.on('pageerror', e => errors.push(e.message))
      const documents = ['A', 'B'].map(id => ({ id, code: id, title: `Documento ${id}`, status: { name: 'Publicado' } }))
      await context.route('**/api/**', async route => {
        const url = new URL(route.request().url())
        requests.push(url.pathname + url.search)
        if (url.pathname.includes('/preview/')) return route.fulfill({ contentType: 'text/plain', body: url.pathname })
        let body
        if (url.pathname.endsWith('/catalogs/')) body = { types: [], areas: [], statuses: [], responsibles: [] }
        else if (/\/documents\/$/.test(url.pathname)) body = { results: documents, count: 2 }
        else {
          const id = url.pathname.match(/\/documents\/([AB])\//)?.[1]
          assert.ok(id, url.pathname)
          const versions = (id === 'A' ? ['1.1', '1.0'] : ['2.2', '2.1', '2.0']).map((version, index) => ({ id: `${id}-${version}`, version, is_current: index === 0, comment: `Historial exclusivo ${id}`, preview_url: `http://127.0.0.1:5173/api/documents/${id}/versions/${id}-${version}/preview/` }))
          if (url.pathname.endsWith('/versions/')) body = { versions, current_version_id: versions[0].id }
          else if (url.pathname.endsWith('/timeline/')) body = { events: [{ id: `event-${id}`, comment: `Evento exclusivo ${id}` }] }
          else body = { document: documents.find(doc => doc.id === id) }
        }
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
      })
      await page.goto(`http://127.0.0.1:5173/static/tests/document-history.html?view=${view}`)
      if (view === 'editor') await page.getByRole('navigation').getByRole('button', { name: 'Versiones', exact: true }).click()
      await page.getByText(/Seleccione un documento/).waitFor()
      assert.ok(!requests.some(url => /limit=1(?:&|$)/.test(url)))
      for (const id of ['B', 'A', 'B']) {
        if (view === 'editor') {
          await page.getByRole('navigation').getByRole('button', { name: 'Documentos', exact: true }).click()
          await page.getByRole('button', { name: `Historial de Documento ${id}`, exact: true }).click()
        } else await page.getByRole('button', { name: `Documento ${id}`, exact: true }).click()
        await page.locator('tbody tr').filter({ hasText: `Historial exclusivo ${id}` }).first().waitFor()
        assert.equal(await page.locator('tbody tr').count(), id === 'A' ? 2 : 3)
        assert.equal(await page.getByText(`Historial exclusivo ${id === 'A' ? 'B' : 'A'}`, { exact: true }).count(), 0)
        if (view === 'admin') await page.getByText(`Evento exclusivo ${id}`, { exact: true }).waitFor()
        const version = id === 'A' ? '1.0' : '2.0'
        const row = page.locator('tbody tr').filter({ has: page.getByText(version, { exact: true }) })
        const popupPromise = context.waitForEvent('page')
        await row.getByRole('button', { name: view === 'editor' ? `Previsualizar versión ${version}` : view === 'admin' ? `Ver versión ${version}` : 'Ver versión', exact: true }).click()
        const popup = await popupPromise
        await popup.waitForLoadState()
        assert.equal(new URL(popup.url()).pathname, `/api/documents/${id}/versions/${id}-${version}/preview/`)
        assert.equal(await popup.locator('body').innerText(), `/api/documents/${id}/versions/${id}-${version}/preview/`)
        await popup.close()
        checks.push({ view, document: id, historicalVersion: version, result: 'PASS' })
      }
      assert.deepEqual(errors, [])
      assert.ok(!requests.some(url => /limit=1(?:&|$)/.test(url)))
      await context.close()
    }
    const result = { environment: 'UI local con API y bytes de preview controlados; sin escrituras remotas', checks }
    fs.writeFileSync(path.join(__dirname, 'resultado_historial_seleccion_ui.json'), JSON.stringify(result, null, 2))
    console.log(JSON.stringify(result, null, 2))
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
