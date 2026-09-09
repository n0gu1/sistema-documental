const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Cristian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

async function main() {
  const browser = await chromium.launch({ headless: true })
  const checks = []
  try {
    for (const view of ['admin', 'editor']) {
      for (const persisted of ['1.2', '1.1', null]) {
        const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } })
        const errors = []
        page.on('pageerror', error => errors.push(error.message))
        const requests = []
        const versions = ['1.2', '1.1', '1.0'].map(version => ({
          id: version, version, is_current: version === persisted,
          name: `archivo-${version}.txt`, size: 1200, comment: `Cambio ${version}`,
          created_at: '2026-09-08T12:00:00Z', author: { name: 'Autor de prueba' },
          status: { code: 'BORRADOR', name: `Estado ${version}` },
        }))
        await page.route('**/api/**', async route => {
          const request = route.request()
          requests.push({ method: request.method(), url: request.url() })
          const url = new URL(request.url())
          let body
          if (url.pathname.endsWith('/compare/')) body = { from: { version: url.searchParams.get('from_version') }, to: { version: url.searchParams.get('to_version') }, changed_fields: [], same_content: false }
          else if (url.pathname.endsWith('/versions/')) body = { versions, current_version_id: persisted }
          else if (url.pathname.endsWith('/timeline/')) body = { events: [] }
          else if (url.pathname === '/api/documents/') body = { results: [{ id: 'test-document' }] }
          else if (url.pathname === '/api/documents/test-document/') body = { document: { id: 'test-document', title: 'Prueba de versión vigente', code: 'REQ35', area: { name: 'Pruebas' }, responsible: { name: 'Autor de prueba' }, updated_at: '2026-09-08T12:00:00Z' } }
          else throw new Error(`Ruta inesperada: ${request.url()}`)
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
        })
        await page.goto(`${process.env.UI_URL || 'http://127.0.0.1:5173/static'}/tests/versions-selection.html?view=${view}`)
        const header = page.locator(view === 'admin' ? '.versions-document-card' : '.editor-versions-document-info')
        await header.waitFor()
        const currentValue = header.locator(view === 'admin' ? 'article' : 'dl > div').filter({ has: page.getByText('Versión vigente', { exact: true }) })
        const assertCurrent = async () => {
          assert.equal((await currentValue.innerText()).replace(/\s+/g, ' ').trim(), `Versión vigente ${persisted || 'Sin versión vigente'}`)
          const marks = page.locator('tbody tr').filter({ has: page.getByText('Vigente', { exact: true }) })
          assert.equal(await marks.count(), persisted ? 1 : 0)
          if (persisted) assert.equal(await marks.locator('td').first().locator('strong').innerText(), persisted)
        }
        await assertCurrent()
        for (const selected of ['1.0', '1.1', '1.2']) {
          await page.locator('label').filter({ has: page.getByText('Versión seleccionada', { exact: true }) }).locator('select').selectOption(selected)
          await page.locator('label').filter({ has: page.getByText('Versión anterior', { exact: true }) }).locator('select').selectOption(selected === '1.0' ? '1.1' : '1.0')
          await assertCurrent()
          const response = page.waitForResponse(r => r.url().includes('/compare/'))
          await page.getByRole('button', { name: view === 'admin' ? 'Comparar versiones' : 'Comparar', exact: true }).click()
          const compared = await response
          assert.equal(new URL(compared.url()).searchParams.get('to_version'), selected)
          await assertCurrent()
          if (persisted === '1.2' && selected === '1.0') await page.screenshot({ path: path.join(__dirname, `vigencia_${view}_ui.png`), fullPage: true })
          checks.push({ view, persisted, selected, result: 'PASS' })
        }
        if (view === 'admin') {
          await page.getByRole('button', { name: 'Intercambiar versiones' }).click()
          await assertCurrent()
          checks.push({ view, persisted, action: 'intercambiar', result: 'PASS' })
        }
        assert.deepEqual(errors, [])
        assert.ok(requests.every(request => request.method === 'GET'), 'Seleccionar/comparar no debe mutar persistencia')
        await page.close()
      }
    }
    const result = { environment: 'Componentes reales en Vite local; respuestas API controladas, sin escrituras en BD', checks }
    fs.writeFileSync(path.join(__dirname, 'resultado_vigencia_ui.json'), JSON.stringify(result, null, 2))
    console.log(JSON.stringify(result, null, 2))
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
