// Ejecutar con ROLE_TEST_PASSWORD y PLAYWRIGHT_MODULE definidos en el entorno.
// Crea una cuenta nueva contra el frontend/backend locales y la BD configurada.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE)
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } })
  const page = await context.newPage()
  page.setDefaultTimeout(60000)
  const base = 'http://localhost:5173'
  const username = `req11.editor.${Date.now()}`
  try {
    await page.goto(`${base}/static/`)
    await page.getByLabel('Correo o usuario').fill('prueba.admin@test.local')
    await page.locator('#password').fill(process.env.ROLE_TEST_PASSWORD)
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    await page.getByRole('button', { name: 'Usuarios', exact: true }).click()
    await page.getByRole('button', { name: 'Nuevo usuario', exact: true }).click()
    const form = page.locator('.users-create-panel')
    await form.getByLabel('Usuario', { exact: true }).fill(username)
    await form.getByLabel('Correo', { exact: true }).fill(`${username}@test.local`)
    await form.getByLabel('Nombres', { exact: true }).fill('Prueba requisito 11')
    await form.getByLabel('Apellidos', { exact: true }).fill('Reasignacion')
    await form.getByLabel('Contraseña temporal', { exact: true }).fill(process.env.ROLE_TEST_PASSWORD)
    const rolesResponse = await context.request.get(`${base}/api/admin/roles/`)
    assert.equal(rolesResponse.status(), 200)
    const { roles } = await rolesResponse.json()
    const editor = roles.find(r => r.codigo === 'EDITOR')
    const reviewer = roles.find(r => r.codigo === 'REVISOR')
    await form.getByRole('combobox').selectOption(editor.id)
    const createdPromise = page.waitForResponse(r => r.url().endsWith('/api/admin/users/') && r.request().method() === 'POST')
    await form.getByRole('button', { name: 'Crear usuario', exact: true }).click()
    const createdResponse = await createdPromise
    assert.equal(createdResponse.status(), 201)
    const { user } = await createdResponse.json()
    assert.deepEqual(user.roles.map(r => r.code), ['EDITOR'])
    const row = page.getByRole('row').filter({ hasText: `${username}@test.local` })
    await row.click()
    const roleForm = page.locator('.users-role-form')
    await roleForm.getByRole('combobox').selectOption(reviewer.id)
    const savedPromise = page.waitForResponse(r => r.url().endsWith(`/users/${user.id}/roles/`) && r.request().method() === 'PUT')
    await roleForm.getByRole('button', { name: 'Guardar rol', exact: true }).click()
    assert.equal((await savedPromise).status(), 200)
    await roleForm.getByRole('status').waitFor()
    assert.match(await roleForm.locator('p').first().innerText(), /Revisor/i)
    assert.match(await row.locator('td').nth(4).innerText(), /Revisor/i)
    const consultedResponse = await context.request.get(`${base}/api/admin/users/${user.id}/`)
    assert.equal(consultedResponse.status(), 200)
    const consulted = (await consultedResponse.json()).user
    assert.deepEqual(consulted.roles.map(r => r.code), ['REVISOR'])
    await page.reload()
    await page.getByRole('button', { name: 'Usuarios', exact: true }).click()
    await page.getByRole('row').filter({ hasText: `${username}@test.local` }).click()
    assert.match(await page.locator('.users-role-form p').first().innerText(), /Revisor/i)
    const result = { email: user.email, id: user.id, before: ['EDITOR'], after: consulted.roles.map(r => r.code), create_status: 201, update_status: 200, get_status: 200, ui_after_save: 'Revisor', ui_after_reload: 'Revisor', status: 'PASS' }
    fs.writeFileSync(path.join(__dirname, 'resultado_reasignacion_roles.json'), JSON.stringify(result, null, 2))
    await page.screenshot({ path: path.join(__dirname, 'reasignacion_roles.png'), fullPage: true })
    console.log(JSON.stringify(result))
  } catch (error) {
    console.error(error.message)
    console.error((await page.locator('body').innerText()).slice(0, 2200))
    throw error
  } finally {
    const csrf = await context.request.get(`${base}/api/auth/csrf/`).catch(() => null)
    if (csrf?.ok()) await context.request.post(`${base}/api/auth/logout/`, { headers: { 'X-CSRFToken': (await csrf.json()).csrf_token } }).catch(() => {})
    await browser.close()
  }
})().catch(() => { process.exitCode = 1 })
