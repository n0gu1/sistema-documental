// UI local corregida contra API real de Render. Requiere DOCUMENT_TEST_PASSWORD.
const { chromium } = require('C:/Users/Cristian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { createHash } = require('node:crypto')
const remote = 'https://sistema-documental-nw05.onrender.com'
const local = 'http://127.0.0.1:5173'
const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64')
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex')
;(async () => {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } })
  const page = await context.newPage()
  let lastUploadResponse
  page.setDefaultTimeout(60000)
  // Puente de pruebas: conserva autenticación y CSRF, cambia el origen al servidor destino.
  await page.route(`${local}/api/**`, async route => {
    const request = route.request()
    const headers = await request.allHeaders()
    headers.origin = remote
    headers.referer = `${remote}/`
    delete headers.host
    const response = await route.fetch({ url: remote + new URL(request.url()).pathname + new URL(request.url()).search, headers })
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/documents/') {
      lastUploadResponse = { status: response.status(), data: await response.json() }
    }
    await route.fulfill({ response })
  })
  try {
    await page.goto(`${local}/static/`)
    await page.getByLabel('Correo o usuario').fill('prueba.editor@test.local')
    await page.locator('#password').fill(process.env.DOCUMENT_TEST_PASSWORD)
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    await page.getByRole('button', { name: 'Documentos', exact: true }).click()
    await page.getByRole('button', { name: 'Crear documento', exact: true }).click()
    const dialog = page.getByRole('dialog')
    const code = `REQ19-EDITOR-${Date.now()}`
    await dialog.getByLabel('Código', { exact: true }).fill(code)
    await dialog.getByLabel('Título', { exact: true }).fill('Prueba carga inicial PNG conocido')
    await dialog.locator('select').nth(0).selectOption({ index: 1 })
    await dialog.locator('select').nth(1).selectOption({ index: 1 })
    const fileInput = dialog.locator('input[type=file]')
    const negative = []
    for (const file of [
      { name: 'no-permitido.txt', mimeType: 'text/plain', buffer: Buffer.from('Prueba requisito 19') },
      { name: 'mime-incorrecto.png', mimeType: 'text/plain', buffer: bytes },
      { name: 'contenido-incorrecto.png', mimeType: 'image/png', buffer: Buffer.from('Esto no es un PNG') },
      { name: 'demasiado-grande.png', oversized: true },
    ]) {
      if (file.oversized) {
        await fileInput.evaluate(input => {
          const transfer = new DataTransfer()
          transfer.items.add(new File([new Uint8Array(50 * 1024 * 1024 + 1)], 'demasiado-grande.png', { type: 'image/png' }))
          input.files = transfer.files
          input.dispatchEvent(new Event('change', { bubbles: true }))
        })
      } else await fileInput.setInputFiles(file)
      const pending = page.waitForResponse(r => r.url().endsWith('/api/documents/') && r.request().method() === 'POST')
      await dialog.getByRole('button', { name: 'Guardar', exact: true }).click()
      const response = await pending
      const data = lastUploadResponse.data
      assert.equal(response.status(), 400, JSON.stringify(data))
      negative.push({ name: file.name, status: response.status(), error: data })
      console.log(JSON.stringify(negative.at(-1)))
      fs.writeFileSync('docs/resultado_validacion_carga_inicial.json', JSON.stringify(negative, null, 2))
      await dialog.getByRole('button', { name: 'Guardar', exact: true }).waitFor()
    }
    if (process.env.DOCUMENT_TEST_VALIDATION_ONLY === '1') return
    await fileInput.setInputFiles({ name: 'req19-pixel.png', mimeType: 'image/png', buffer: bytes })
    const pending = page.waitForResponse(r => r.url().endsWith('/api/documents/') && r.request().method() === 'POST')
    await dialog.getByRole('button', { name: 'Guardar', exact: true }).click()
    const response = await pending
    const data = lastUploadResponse.data
    fs.writeFileSync('docs/resultado_intento_carga_inicial.json', JSON.stringify({ code, status: response.status(), data }, null, 2))
    assert.equal(response.status(), 201, JSON.stringify(data))
    const file = data.document.files[0]
    assert.equal(data.document.files.length, 1)
    assert.equal(file.version, '1.0')
    assert.equal(file.size, bytes.length)
    assert.equal(file.sha256, sha256(bytes))
    const downloaded = await page.evaluate(async path => {
      const response = await fetch(path)
      return { status: response.status, bytes: Array.from(new Uint8Array(await response.arrayBuffer())) }
    }, new URL(file.download_url).pathname)
    assert.equal(downloaded.status, 200)
    assert.deepEqual(Buffer.from(downloaded.bytes), bytes)
    fs.writeFileSync('docs/req19-pixel.png', bytes)
    const result = { code, document_id: data.document.id, file, negative, upload_status: 201, download_status: 200, size: bytes.length, sha256: sha256(bytes), downloaded_sha256: sha256(Buffer.from(downloaded.bytes)), bytes_equal: true, backend: remote, frontend: local }
    fs.writeFileSync('docs/resultado_carga_inicial.json', JSON.stringify(result, null, 2))
    console.log(JSON.stringify(result))
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
