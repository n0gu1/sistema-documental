// Requisito 22: UI real, dos documentos existentes; no crea archivos ni versiones.
const { chromium } = require('C:/Users/Cristian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } })
  const page = await context.newPage()
  page.setDefaultTimeout(60000)
  const requests = []
  const results = []
  page.on('request', request => {
    const url = new URL(request.url())
    if (url.pathname.startsWith('/api/documents/')) requests.push({ method: request.method(), path: url.pathname, query: url.search })
  })
  function verifyRequests(documentId, start, label) {
    const scoped = requests.slice(start).filter(item => /^\/api\/documents\/[0-9a-f-]{36}\//.test(item.path))
    assert.ok(scoped.length, `Sin peticiones para ${label}`)
    assert.ok(scoped.every(item => item.path.startsWith(`/api/documents/${documentId}/`)), JSON.stringify(scoped))
    results.push({ test: label, document_id: documentId, requests: scoped, result: 'PASS' })
    console.log(`${label}: PASS (${documentId})`)
  }
  async function openList() {
    await page.getByRole('button', { name: 'Documentos', exact: true }).click()
    await page.locator('.documents-table-panel table').waitFor()
  }
  async function assertHistory(document) {
    const card = page.locator('.versions-document-card')
    await card.getByText(document.code, { exact: true }).waitFor()
    assert.equal(await card.getByText(document.title, { exact: true }).count(), 1)
    assert.equal(await page.getByRole('navigation', { name: 'Documento seleccionado' }).getAttribute('data-document-id'), document.id)
  }
  try {
    await page.goto('http://127.0.0.1:5173/static/')
    await page.getByLabel('Correo o usuario').fill('prueba.admin@test.local')
    await page.locator('#password').fill(process.env.DOCUMENT_TEST_PASSWORD)
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    await page.getByRole('button', { name: 'Versiones', exact: true }).click()
    await page.getByText('Seleccione un documento para consultar su historial.', { exact: true }).waitFor()
    assert.equal(requests.filter(item => /^\/api\/documents\/[0-9a-f-]{36}\//.test(item.path)).length, 0)
    results.push({ test: 'Historial sin selección no elige el primer documento', result: 'PASS' })
    const response = await context.request.get('http://127.0.0.1:5173/api/documents/?search=REQ2021-&limit=25')
    assert.equal(response.status(), 200)
    const available = (await response.json()).results
    assert.ok(available.length >= 3, 'Se requieren al menos tres documentos de ensayo existentes para omitir el primero')
    const documents = available.slice(1, 3)
    assert.notEqual(documents[0].id, documents[1].id)

    for (const document of documents) {
      await openList()
      let start = requests.length
      await page.getByRole('button', { name: `Ver ${document.title}`, exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'Campos documentales' })
      await dialog.getByText(`${document.code} · ${document.title}`, { exact: true }).waitFor()
      assert.equal(await dialog.getAttribute('data-document-id'), document.id)
      verifyRequests(document.id, start, 'Detalle del documento pulsado')

      start = requests.length
      await dialog.getByRole('button', { name: 'Editar documento', exact: true }).click()
      await page.waitForFunction(code => [...document.querySelectorAll('input')].some(input => input.value === code), document.code)
      assert.equal(await page.getByLabel('Título del documento').inputValue(), document.title)
      const saved = page.waitForResponse(response => response.request().method() === 'PATCH' && response.url().endsWith(`/api/documents/${document.id}/`))
      await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click()
      const savedResponse = await saved
      assert.equal(savedResponse.status(), 200)
      const savedDocument = (await savedResponse.json()).document
      assert.equal(savedDocument.id, document.id)
      assert.equal(savedDocument.title, document.title)
      assert.equal(savedDocument.files.length, 0)
      verifyRequests(document.id, start, 'Edición y PATCH conservan el ID')

      start = requests.length
      await page.getByRole('navigation', { name: 'Documento seleccionado' }).getByRole('button', { name: 'Ver historial', exact: true }).click()
      await assertHistory(document)
      verifyRequests(document.id, start, 'Detalle, versiones y timeline del mismo ID')
      assert.ok(requests.slice(start).some(item => item.path === `/api/documents/${document.id}/versions/`))
      assert.ok(requests.slice(start).some(item => item.path === `/api/documents/${document.id}/timeline/`))
      await page.screenshot({ path: `docs/seleccion_documental_${document.id}.png`, fullPage: true })

      await openList()
      start = requests.length
      await page.getByRole('button', { name: `Editar ${document.title}`, exact: true }).click()
      await page.waitForFunction(code => [...document.querySelectorAll('input')].some(input => input.value === code), document.code)
      verifyRequests(document.id, start, 'Editar desde fila conserva el ID')
      await openList()
      start = requests.length
      await page.getByRole('button', { name: `Ver versiones de ${document.title}`, exact: true }).click()
      await assertHistory(document)
      verifyRequests(document.id, start, 'Historial desde fila conserva el ID')
      await openList()
      start = requests.length
      await page.getByRole('button', { name: 'Versiones', exact: true }).click()
      await assertHistory(document)
      verifyRequests(document.id, start, 'Menú Versiones conserva la última selección')
    }
    assert.equal(requests.filter(item => new URLSearchParams(item.query).get('limit') === '1').length, 0)
    fs.writeFileSync('docs/resultado_seleccion_documental_ui.json', JSON.stringify({ documents, tests: results, result: 'PASS', versions_created: 0 }, null, 2))
  } catch (error) {
    await page.screenshot({ path: 'docs/seleccion_documental_error.png', fullPage: true })
    console.error((await page.locator('body').innerText()).slice(0, 6000))
    throw error
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
