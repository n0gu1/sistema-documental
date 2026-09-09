// Requisito 23: formulario real, error visible, guardado y recarga contra Neon.
const { chromium } = require('C:/Users/Cristian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const fs = require('node:fs')
const assert = require('node:assert/strict')

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } })
  const page = await context.newPage()
  page.setDefaultTimeout(60000)
  const base = 'http://127.0.0.1:5173'
  const checks = []
  try {
    await page.goto(`${base}/static/`)
    await page.getByLabel('Correo o usuario').fill('prueba.editor@test.local')
    await page.locator('#password').fill(process.env.DOCUMENT_TEST_PASSWORD)
    const login = page.waitForResponse(response => response.url().endsWith('/api/auth/login/') && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    assert.equal((await login).status(), 200)
    const catalogs = await (await context.request.get(`${base}/api/documents/catalogs/`)).json()
    assert.ok(catalogs.areas.length >= 2 && catalogs.types.length >= 2)
    const csrf = await (await context.request.get(`${base}/api/auth/csrf/`)).json()
    const originalCode = `REQ23-UI-${Date.now()}`
    const originalTitle = `Edición normal ${originalCode}`
    const createdResponse = await context.request.post(`${base}/api/documents/`, {
      headers: { 'X-CSRFToken': csrf.csrf_token },
      data: { code: originalCode, title: originalTitle, description: 'Descripción original', date: '2026-09-07',
        area_id: catalogs.areas[0].id, type_id: catalogs.types[0].id,
        metadata: { classification: 'Interno', observations: 'Original', custom: 'Conservar clave existente' } },
    })
    assert.equal(createdResponse.status(), 201, await createdResponse.text())
    const original = (await createdResponse.json()).document
    const path = `/api/documents/${original.id}/`
    const detail = async () => (await (await context.request.get(`${base}${path}`)).json()).document
    await page.getByRole('button', { name: 'Documentos', exact: true }).click()
    await page.getByRole('button', { name: `Editar ${originalTitle}`, exact: true }).click()
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Guardar datos' && !button.disabled))

    const code = originalCode + '-EDIT'
    const title = `Modificado ${code}`
    await page.getByRole('textbox', { name: 'Código', exact: true }).fill(code)
    await page.getByRole('textbox', { name: /Título del documento/ }).fill(title)
    await page.getByRole('textbox', { name: 'Descripción', exact: true }).fill('Descripción modificada desde UI')
    await page.getByLabel('Fecha documental').fill('2026-08-31')
    await page.getByRole('combobox', { name: 'Área responsable', exact: true }).selectOption(catalogs.areas[1].id)
    await page.getByRole('combobox', { name: 'Tipo de documento', exact: true }).selectOption(String(catalogs.types[1].id))
    await page.getByRole('textbox', { name: 'Clasificación', exact: true }).fill('Confidencial')
    await page.getByRole('textbox', { name: 'Palabras clave', exact: true }).fill('edición, prueba')
    await page.getByRole('textbox', { name: /^Alcance/ }).fill('Alcance modificado')
    await page.getByRole('button', { name: 'Observaciones', exact: true }).click()
    await page.getByRole('textbox', { name: 'Observaciones', exact: true }).fill('Observaciones modificadas desde UI')

    // La respuesta de error es simulada en el navegador; rollback real se prueba en Python.
    const failSave = async route => {
      if (route.request().method() === 'PATCH') await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Fallo de prueba al guardar datos' }) })
      else await route.continue()
    }
    await page.route(`**${path}`, failSave)
    await page.getByRole('button', { name: 'Guardar datos', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: 'Fallo de prueba al guardar datos' }).waitFor()
    assert.equal(await page.getByText('Datos guardados. La versión del archivo se conserva.', { exact: true }).count(), 0)
    const afterFailure = await detail()
    assert.equal(afterFailure.code, original.code)
    assert.deepEqual(afterFailure.metadata, original.metadata)
    checks.push('Error de guardado visible sin mensaje de éxito ni cambios persistidos')
    await page.unroute(`**${path}`, failSave)

    const writes = []
    page.on('request', request => { if (request.method() === 'PATCH' && request.url().endsWith(path)) writes.push(request.postDataJSON()) })
    const saved = page.waitForResponse(response => response.request().method() === 'PATCH' && response.url().endsWith(path))
    await page.getByRole('button', { name: 'Guardar datos', exact: true }).click()
    await page.getByRole('button', { name: 'Guardando...', exact: true }).waitFor()
    assert.ok(await page.getByRole('button', { name: 'Guardando...', exact: true }).isDisabled())
    assert.ok(await page.getByRole('textbox', { name: 'Observaciones', exact: true }).isDisabled())
    assert.equal((await saved).status(), 200)
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Guardar datos' && !button.disabled))
    assert.equal(writes.length, 1)
    assert.deepEqual(Object.keys(writes[0]).sort(), ['code', 'title', 'description', 'date', 'area_id', 'type_id', 'metadata'].sort())
    checks.push('Un PATCH con los siete campos autorizados y formulario bloqueado durante el guardado')

    await page.reload()
    await page.getByRole('button', { name: 'Documentos', exact: true }).click()
    await page.getByRole('button', { name: `Editar ${title}`, exact: true }).click()
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Guardar datos' && !button.disabled))
    assert.equal(await page.getByRole('textbox', { name: 'Código', exact: true }).inputValue(), code)
    assert.equal(await page.getByRole('textbox', { name: /Título del documento/ }).inputValue(), title)
    assert.equal(await page.getByRole('textbox', { name: 'Descripción', exact: true }).inputValue(), 'Descripción modificada desde UI')
    assert.equal(await page.getByLabel('Fecha documental').inputValue(), '2026-08-31')
    assert.equal(await page.getByRole('combobox', { name: 'Área responsable', exact: true }).inputValue(), catalogs.areas[1].id)
    assert.equal(await page.getByRole('combobox', { name: 'Tipo de documento', exact: true }).inputValue(), String(catalogs.types[1].id))
    assert.equal(await page.getByRole('textbox', { name: 'Clasificación', exact: true }).inputValue(), 'Confidencial')
    await page.screenshot({ path: 'docs/edicion_documental_recargada.png', fullPage: true })
    await page.getByRole('button', { name: 'Observaciones', exact: true }).click()
    assert.equal(await page.getByRole('textbox', { name: 'Observaciones', exact: true }).inputValue(), 'Observaciones modificadas desde UI')
    const persisted = await detail()
    assert.equal(persisted.metadata.custom, 'Conservar clave existente')
    assert.equal(persisted.metadata.scope, 'Alcance modificado')
    assert.equal(persisted.metadata.keywords, 'edición, prueba')
    assert.equal(persisted.files.length, 0)
    checks.push('Recargar y reabrir conserva datos, metadatos y clave adicional, sin versiones nuevas')
    const output = { document: persisted, checks, versions_created: 0, result: 'PASS' }
    fs.writeFileSync('docs/resultado_edicion_documental_ui.json', JSON.stringify(output, null, 2))
    console.log(JSON.stringify(output))
  } catch (error) {
    await page.screenshot({ path: 'docs/edicion_documental_error.png', fullPage: true })
    console.error((await page.locator('body').innerText()).slice(0, 7000))
    throw error
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
