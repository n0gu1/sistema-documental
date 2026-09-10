const { chromium } = require('C:/Users/Cristian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

async function main() {
  const result = JSON.parse(fs.readFileSync(path.join(__dirname, 'resultado_actividad_61.json'), 'utf8'))
  const data = result.data
  // Contradict the legacy date deliberately: the graph must use activity_date.
  data.rows = data.rows.map(row => ({ ...row, created_at: '2026-09-07T15:00:00Z' }))
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 950 } })
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(route.request().url().includes('/schedules/') ? { schedules: [] } : data) }))
    await page.goto('http://127.0.0.1:5181/static/tests/reviewer-activity.html')
    await page.getByLabel('Hasta', { exact: true }).fill('2026-09-09')
    await page.locator('.reviewer-report-point-value').first().waitFor()
    assert.deepEqual(await page.locator('.reviewer-report-point-value').allTextContents(), ['1', '0', '0', '0', '0', '2', '1'])
    assert.deepEqual(await page.locator('.reviewer-report-metric strong').allTextContents(), ['4', '2', '1', '1'])
    assert.deepEqual(await page.locator('.reviewer-report-metric p').allTextContents(),
      ['Decisiones registradas', 'Aprobaciones emitidas', 'Rechazos emitidos', 'Devoluciones emitidas'])
    assert.deepEqual(errors, [])
    await page.screenshot({ path: path.join(__dirname, 'actividad_61_ui.png'), fullPage: true })
    console.log('PASS: cuatro indicadores 4/2/1/1, siete días 1/0/0/0/0/2/1 por activity_date, sin usar created_at ni errores JS.')
  } finally { await browser.close() }
}
main().catch(e => { console.error(e); process.exitCode = 1 })
