const { chromium } = require('C:/Users/Cristian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

async function main() {
  const result = JSON.parse(fs.readFileSync(path.join(__dirname, 'resultado_reporte_versiones_60.json'), 'utf8'))
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
    const errors = [], generated = [], scopes = []
    page.on('pageerror', e => errors.push(e.message))
    await page.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url())
      let body
      if (url.pathname === '/api/auth/csrf/') body = { csrf_token: 'test' }
      else if (url.pathname === '/api/reports/generate/') {
        generated.push(request.postDataJSON())
        body = { report: { id: 'test', name: 'Reporte de versiones', scope: 'versions', format: 'XLSX', rows: 2 } }
      } else if (url.pathname === '/api/reports/schedules/') body = { schedules: [] }
      else if (url.pathname === '/api/reports/') {
        const scope = url.searchParams.get('scope')
        scopes.push(scope)
        const rows = scope === 'versions' ? result.rows : []
        body = { scope, rows, history: [], summary: { total: rows.length, completed: 1, published: 1,
          in_review: 0, overdue: 0, by_status: [], by_area: [], by_type: [], by_responsible: [] },
          options: { areas: [], types: [], statuses: [], responsibles: [] } }
      } else throw new Error(request.url())
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    })
    await page.goto('http://127.0.0.1:5179/static/tests/version-report.html')
    await page.getByLabel('Tipo de reporte').selectOption('versions')
    await page.getByRole('cell', { name: '1.0', exact: true }).waitFor()
    assert.equal(await page.locator('.reports-recent tbody tr').count(), 2)
    for (const row of result.rows) {
      const displayed = page.locator('.reports-recent tbody tr').filter({ has: page.getByRole('cell', { name: row.version, exact: true }) })
      const text = await displayed.innerText()
      for (const expected of [row.code, row.title, row.author, row.status, row.comment, '27/08/2026']) assert.ok(text.includes(expected), expected)
    }
    await page.getByLabel('Formato de reporte').selectOption('XLSX')
    await page.getByRole('button', { name: 'Generar reporte', exact: true }).click()
    await page.getByRole('status').waitFor()
    assert.equal(generated[0].scope, 'versions')
    assert.equal(generated[0].format, 'XLSX')
    assert.ok(scopes.includes('versions'))
    assert.deepEqual(errors, [])
    await page.screenshot({ path: path.join(__dirname, 'reporte_versiones_60_ui.png'), fullPage: true })
    console.log('PASS: selector, dos versiones y seis campos, generación XLSX con scope versions, sin errores JS. API controlada con filas obtenidas de Neon.')
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
