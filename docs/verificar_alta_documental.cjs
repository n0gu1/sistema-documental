// Prueba de alta con cuentas de ensayo. Requiere DOCUMENT_TEST_PASSWORD.
const { chromium } = require('C:/Users/Cristian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
;(async () => {
  const browser = await chromium.launch({ headless: true })
  const results = []
  try {
    for (const base of [process.env.DOCUMENT_TEST_BASE || 'http://127.0.0.1:5173']) {
      for (const role of ['admin', 'editor', 'revisor', 'lector']) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } })
        const page = await context.newPage()
        page.setDefaultTimeout(60000)
        await page.goto(base.startsWith('https:') ? base : `${base}/static/`)
        await page.getByLabel('Correo o usuario').fill(`prueba.${role}@test.local`)
        await page.locator('#password').fill(process.env.DOCUMENT_TEST_PASSWORD)
        await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
        await page.locator('nav').waitFor()
        const result = { base, role }
        if (['admin', 'editor'].includes(role)) await page.getByRole('button', { name: 'Documentos', exact: true }).click()
        const create = page.getByRole('button', { name: /^(Crear documento|Nuevo documento)$/ })
        result.create_enabled = await create.count() > 0 && await create.first().isEnabled()
        const code = `REQ18-${role.toUpperCase()}-${Date.now()}`
        if (base.startsWith('http:') && ['admin', 'editor'].includes(role)) {
          assert.equal(result.create_enabled, true)
          await create.first().click()
          const dialog = page.getByRole('dialog')
          await dialog.getByLabel('Código', { exact: true }).fill(code)
          await dialog.getByLabel('Título', { exact: true }).fill(`Prueba alta documental ${role}`)
          await dialog.getByLabel('Descripción', { exact: true }).fill('Verificación requisito 18; registro sin archivo.')
          await dialog.locator('select').nth(0).selectOption({ index: 1 })
          await dialog.locator('select').nth(1).selectOption({ index: 1 })
          const responsePromise = page.waitForResponse(r => r.url().endsWith('/api/documents/') && r.request().method() === 'POST')
          await dialog.getByRole('button', { name: 'Guardar', exact: true }).click()
          const response = await responsePromise
          result.status = response.status()
          const data = await response.json()
          assert.equal(result.status, 201, JSON.stringify(data))
          result.document_id = data.document.id
          assert.equal(data.document.code, code)
          await dialog.waitFor({ state: 'hidden' })
          await page.reload()
          const detail = await context.request.get(`${base}/api/documents/${data.document.id}/`)
          assert.equal(detail.status(), 200)
          assert.equal((await detail.json()).document.code, code)
          result.persisted = true
        } else {
          // Un formulario vacío distingue autorización (400) de denegación (403), sin crear registros remotos.
          result.status = await page.evaluate(async () => {
            const csrf = await (await fetch('/api/auth/csrf/')).json()
            const response = await fetch('/api/documents/', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf.csrf_token }, body: '{}' })
            return response.status
          })
          assert.equal(result.status, ['admin', 'editor'].includes(role) ? 400 : 403)
        }
        results.push(result)
        console.log(JSON.stringify(result))
        fs.writeFileSync(`docs/resultado_alta_documental${base.startsWith('https:') ? '_render' : ''}.json`, JSON.stringify(results, null, 2))
        await context.close()
      }
    }
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
