// Prueba UI local con cuentas reales y Neon. Requiere DOCUMENT_TEST_PASSWORD.
const { chromium } = require('C:/Users/Cristian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const fs = require('node:fs')
const assert = require('node:assert/strict')
;(async () => {
  const browser = await chromium.launch({ headless: true })
  const results = []
  let activePage
  try {
    for (const role of ['admin', 'editor']) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } })
      const page = await context.newPage()
      activePage = page
      page.setDefaultTimeout(60000)
      await page.goto('http://127.0.0.1:5173/static/')
      await page.getByLabel('Correo o usuario').fill(`prueba.${role}@test.local`)
      await page.locator('#password').fill(process.env.DOCUMENT_TEST_PASSWORD)
      await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
      await page.getByRole('button', { name: 'Documentos', exact: true }).click()
      await page.getByRole('button', { name: /^(Crear documento|Nuevo documento)$/ }).click()
      const dialog = page.getByRole('dialog')
      const code = `REQ2021-${role.toUpperCase()}-${Date.now()}`
      const title = `Campos documentales ${code}`
      await dialog.getByLabel('Código', { exact: true }).fill(code)
      await dialog.getByLabel('Título', { exact: true }).fill(title)
      await dialog.locator('select').nth(0).selectOption({ index: 1 })
      await dialog.locator('select').nth(1).selectOption({ index: 1 })
      await dialog.getByLabel('Fecha documental').fill('2026-09-07')
      await dialog.getByLabel('Clasificación').fill('Interno')
      await dialog.getByLabel('Observaciones').fill('Observación inicial de prueba')
      const pending = page.waitForResponse(r => r.url().endsWith('/api/documents/') && r.request().method() === 'POST')
      await dialog.getByRole('button', { name: 'Guardar', exact: true }).click()
      const response = await pending
      const data = await response.json()
      assert.equal(response.status(), 201, JSON.stringify(data))
      const id = data.document.id
      await dialog.waitFor({ state: 'hidden' })
      const api = async () => (await (await context.request.get(`http://127.0.0.1:5173/api/documents/${id}/`)).json()).document
      let detail = await api()
      assert.equal(detail.date, '2026-09-07')
      assert.equal(detail.metadata.classification, 'Interno')
      assert.equal(detail.metadata.observations, 'Observación inicial de prueba')
      if (role === 'admin') {
        await page.getByRole('button', { name: `Ver ${title}`, exact: true }).click()
        const fields = page.getByRole('dialog', { name: 'Campos documentales' })
        await fields.waitFor()
        assert.equal(await fields.getByLabel('Fecha documental').inputValue(), '2026-09-07')
        assert.equal(await fields.getByLabel('Clasificación').inputValue(), 'Interno')
        assert.equal(await fields.getByLabel('Observaciones').inputValue(), 'Observación inicial de prueba')
        await page.screenshot({ path: 'docs/campos_documentales_admin.png', fullPage: true })
        await fields.getByRole('button', { name: 'Cerrar', exact: true }).last().click()
      }
      if (role === 'editor') {
        await page.getByRole('button', { name: `Editar ${title}`, exact: true }).click()
        await page.getByLabel('Fecha documental').waitFor()
        // Esperar a que el detalle cargado desde el backend complete el formulario.
        await page.waitForFunction(() => document.querySelector('input[type=date]')?.value === '2026-09-07')
        assert.equal(await page.getByLabel('Clasificación', { exact: true }).inputValue(), 'Interno')
        await page.getByLabel('Fecha documental').fill('2026-08-31')
        await page.getByLabel('Clasificación', { exact: true }).fill('Confidencial')
        await page.getByRole('button', { name: 'Observaciones', exact: true }).click()
        assert.equal(await page.getByRole('textbox', { name: 'Observaciones', exact: true }).inputValue(), 'Observación inicial de prueba')
        await page.getByRole('textbox', { name: 'Observaciones', exact: true }).fill('Observación editada y consultada')
        const save = page.waitForResponse(r => r.url().endsWith(`/api/documents/${id}/`) && r.request().method() === 'PATCH')
        await page.getByRole('button', { name: 'Guardar datos', exact: true }).click()
        assert.equal((await save).status(), 200)
        await page.reload()
        await page.getByRole('button', { name: 'Documentos', exact: true }).click()
        await page.getByRole('button', { name: `Editar ${title}`, exact: true }).click()
        await page.waitForFunction(() => document.querySelector('input[type=date]')?.value === '2026-08-31')
        assert.equal(await page.getByLabel('Clasificación', { exact: true }).inputValue(), 'Confidencial')
        await page.getByRole('button', { name: 'Observaciones', exact: true }).click()
        assert.equal(await page.getByRole('textbox', { name: 'Observaciones', exact: true }).inputValue(), 'Observación editada y consultada')
        await page.screenshot({ path: 'docs/campos_documentales_editor.png', fullPage: true })
        detail = await api()
      }
      assert.equal(detail.files.length, 0)
      results.push({ role, id, code, date: detail.date, metadata: detail.metadata, versions: detail.files.length, result: 'PASS' })
      fs.writeFileSync('docs/resultado_campos_documentales_ui.json', JSON.stringify(results, null, 2))
      console.log(JSON.stringify(results.at(-1)))
      await context.close()
    }
  } catch (error) {
    if (activePage && !activePage.isClosed()) {
      await activePage.screenshot({ path: 'docs/campos_documentales_ui_error.png', fullPage: true })
      console.error((await activePage.locator('body').innerText()).slice(0, 12000))
    }
    throw error
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
