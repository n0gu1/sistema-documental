const { chromium } = require('C:/Users/Cristian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

async function main() {
  const { data } = JSON.parse(fs.readFileSync(path.join(__dirname, 'resultado_trazabilidad_62.json'), 'utf8'))
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
    const errors = [], queries = [], generations = []
    page.on('pageerror', e => errors.push(e.message))
    await page.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url())
      let body
      if (url.pathname === '/api/documents/') body = { results: [data.document], next_offset: null }
      else if (url.pathname === '/api/auth/csrf/') body = { csrf_token: 'test' }
      else if (url.pathname === '/api/reports/generate/') {
        generations.push(request.postDataJSON())
        body = { report: { format: 'XLSX', download_url: '/api/reports/test/download/' } }
      } else if (url.pathname.includes('/schedules/')) body = { schedules: [] }
      else if (url.pathname === '/api/reports/' && url.searchParams.get('scope') === 'traceability') {
        queries.push(url.searchParams.get('document_id')); body = data
      } else body = { rows: [], history: [], options: { areas: [], types: [], statuses: [], responsibles: [] },
        summary: { total: 0, completed: 0, published: 0, in_review: 0, overdue: 0, by_status: [], by_area: [], by_type: [], by_responsible: [] } }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    })
    await page.goto('http://127.0.0.1:5182/static/tests/version-report.html')
    await page.getByRole('button', { name: 'Reporte integral de trazabilidad', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: 'Consultar trazabilidad' }).isDisabled(), true)
    await page.getByLabel('Documento de trazabilidad').selectOption(data.document.id)
    await page.getByRole('button', { name: 'Consultar trazabilidad' }).click()
    await page.getByRole('heading', { name: 'Cronología de evidencias' }).waitFor()
    assert.equal(await page.locator('tbody tr').count(), data.rows.length)
    assert.deepEqual(queries, [data.document.id])
    assert.ok((await page.locator('tbody').innerText()).includes('Restaurada desde 1.0'))
    assert.ok((await page.locator('tbody').innerText()).includes('Publicación'))
    await page.getByLabel('Formato de trazabilidad').selectOption('XLSX')
    await page.getByRole('button', { name: 'Exportar trazabilidad' }).click()
    await page.getByRole('link', { name: 'Descargar XLSX' }).waitFor()
    assert.deepEqual(generations, [{ scope: 'traceability', format: 'XLSX', filters: { document_id: data.document.id } }])
    assert.deepEqual(errors, [])
    await page.screenshot({ path: path.join(__dirname, 'trazabilidad_62_ui.png') })
    await page.getByLabel('Documento de trazabilidad').selectOption('')
    assert.equal(await page.getByRole('link', { name: 'Descargar XLSX' }).count(), 0)
    console.log('PASS: selección explícita, consulta de un documento, 56 filas, publicación/restauración, exportación del mismo ID y limpieza al cambiar selección; API controlada.')
  } finally { await browser.close() }
}
main().catch(e => { console.error(e); process.exitCode = 1 })
