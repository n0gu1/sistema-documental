// Prueba del frontend real con las respuestas /me/ verificadas en Neon.
// PLAYWRIGHT_MODULE: ruta al módulo Playwright. Vite debe escuchar en 5173.
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE)

;(async () => {
  const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'resultado_permisos_efectivos.json'), 'utf8'))
  const policy = await import(pathToFileURL(path.join(__dirname, '../frontend/src/permissionPolicy.js')))
  assert.equal(policy.hasPermission({ roles: [{ code: 'ADMINISTRADOR' }] }, 'usuarios.gestionar'), false)
  assert.equal(policy.hasPermission(null, 'documentos.descargar'), false)
  assert.equal(policy.hasPermission(fixtures.administrator, 'codigo.no_catalogado'), true)
  assert.equal(policy.workspaceFor({ ...fixtures.allowed, permissions: ['usuarios.consultar'] }), 'management')
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  let currentUser = fixtures.allowed
  let writeCount = 0
  await page.route('**/api/**', route => {
    const request = route.request()
    if (!['GET', 'HEAD'].includes(request.method())) writeCount++
    const response = request.url().includes('/auth/me/') ? { user: currentUser }
      : { results: [], roles: [], permissions: [], sessions: [], devices: [] }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) })
  })
  try {
    await page.goto('http://localhost:5173/static/')
    const download = page.getByRole('button', { name: /Descargar archivo/ })
    await download.waitFor()
    assert.equal(await download.isDisabled(), false)
    await page.screenshot({ path: path.join(__dirname, 'permiso_descarga_habilitado.png'), fullPage: true })
    currentUser = fixtures.denied
    const refreshed = page.waitForResponse(r => r.url().includes('/auth/me/'))
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await refreshed
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('Descargar archivo') && b.disabled))
    assert.equal(await download.isDisabled(), true)
    assert.deepEqual(fixtures.allowed.roles, fixtures.denied.roles)
    await page.screenshot({ path: path.join(__dirname, 'permiso_descarga_deshabilitado.png'), fullPage: true })
    currentUser = { ...fixtures.allowed, permissions: ['usuarios.consultar'] }
    await page.reload()
    await page.getByRole('button', { name: 'Usuarios', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: 'Nuevo usuario', exact: true }).isDisabled(), true)
    assert.equal(await page.getByRole('button', { name: 'Roles y permisos', exact: true }).count(), 0)
    currentUser = fixtures.administrator
    await page.reload()
    await page.getByRole('button', { name: 'Usuarios', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: 'Nuevo usuario', exact: true }).isDisabled(), false)
    assert.equal(await page.getByRole('button', { name: 'Roles y permisos', exact: true }).count(), 1)
    currentUser = fixtures.editor
    await page.reload()
    await page.getByRole('navigation', { name: 'Navegación del editor' }).waitFor()
    await page.getByRole('navigation', { name: 'Navegación del editor' }).getByRole('button', { name: 'Versiones', exact: true }).click()
    await page.getByText('No hay documentos disponibles.', { exact: true }).waitFor()
    currentUser = fixtures.reviewer
    await page.reload()
    await page.getByRole('navigation', { name: 'Navegación del revisor' }).waitFor()
    await page.getByRole('button', { name: 'Bandeja de revisión', exact: true }).click()
    await page.getByRole('heading', { name: /Bandeja de revisión/i }).waitFor()
    assert.equal(writeCount, 0)
    assert.deepEqual(errors, [])
    const result = { status: 'PASS', same_role_download_allowed: true, same_role_download_denied: true,
      permissions_refreshed_on_focus: true, custom_permissions_open_management: true,
      consultation_does_not_enable_user_creation: true, administrator_preserved: true,
      roles_alone_do_not_grant_access: true, frontend_page_errors: errors,
      editor_and_reviewer_workspaces: true,
      manual_backend_denial: fixtures.manual_request_status,
      method: 'Navegador con respuestas API de ensayo; autorización real probada por separado en Neon' }
    fs.writeFileSync(path.join(__dirname, 'resultado_permisos_ui.json'), JSON.stringify(result, null, 2))
    console.log(JSON.stringify(result))
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
