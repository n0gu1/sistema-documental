// Frontend y backend locales, BD real. Restaura los datos originales al finalizar.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE)
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
;(async () => {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } })
  const page = await context.newPage()
  page.setDefaultTimeout(60000)
  const base = 'http://localhost:5173'
  let original, changed = false, result
  try {
    await page.goto(`${base}/static/`)
    await page.getByLabel('Correo o usuario').fill('prueba.admin@test.local')
    await page.locator('#password').fill(process.env.USER_TEST_PASSWORD)
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    await page.getByRole('button', { name: 'Usuarios', exact: true }).click()
    const list = await (await context.request.get(`${base}/api/admin/users/?search=prueba.editor%40test.local`)).json()
    original = list.results.find(user => user.email === 'prueba.editor@test.local')
    assert.ok(original)
    const area = list.areas.find(area => area.id !== original.area_id)
    assert.ok(area, 'Se necesita un área activa alternativa')
    await page.getByRole('row').filter({ hasText: original.email }).click()
    await page.getByRole('button', { name: 'Editar usuario seleccionado', exact: true }).click()
    const form = page.locator('.users-edit-panel')
    const edited = { email: `prueba.editor.req8.${Date.now()}@test.local`, first_name: 'Prueba edición', last_name: 'Persistencia ocho', area_id: area.id }
    await form.getByLabel('Correo', { exact: true }).fill(edited.email)
    await form.getByLabel('Nombres', { exact: true }).fill(edited.first_name)
    await form.getByLabel('Apellidos', { exact: true }).fill(edited.last_name)
    await form.getByLabel('Área', { exact: true }).selectOption(area.id)
    const saved = page.waitForResponse(r => r.url().endsWith(`/users/${original.id}/`) && r.request().method() === 'PATCH')
    changed = true
    await form.getByRole('button', { name: 'Guardar cambios' }).click()
    const response = await saved
    assert.equal(response.status(), 200)
    assert.deepEqual(response.request().postDataJSON(), edited)
    await page.getByText('Datos del usuario actualizados correctamente.').waitFor()
    await page.reload()
    await page.getByRole('button', { name: 'Usuarios', exact: true }).click()
    const row = page.getByRole('row').filter({ hasText: edited.email })
    await row.waitFor()
    assert.ok((await row.innerText()).includes(area.nombre))
    await row.click()
    await page.getByRole('button', { name: 'Editar usuario seleccionado', exact: true }).click()
    assert.equal(await form.getByLabel('Correo', { exact: true }).inputValue(), edited.email)
    assert.equal(await form.getByLabel('Nombres', { exact: true }).inputValue(), edited.first_name)
    assert.equal(await form.getByLabel('Apellidos', { exact: true }).inputValue(), edited.last_name)
    assert.equal(await form.getByLabel('Área', { exact: true }).inputValue(), edited.area_id)
    const fetched = (await (await context.request.get(`${base}/api/admin/users/${original.id}/`)).json()).user
    for (const [key, value] of Object.entries(edited)) assert.equal(fetched[key], value)
    assert.deepEqual(fetched.roles, original.roles)
    assert.equal(fetched.active, original.active)
    result = { status: 'PASS', patch: 200, persisted_after_reload: Object.keys(edited), roles_unchanged: true, active_unchanged: true }
  } finally {
    if (changed && original) {
      const csrf = await (await context.request.get(`${base}/api/auth/csrf/`)).json()
      const restored = await context.request.patch(`${base}/api/admin/users/${original.id}/`, { headers: { 'X-CSRFToken': csrf.csrf_token }, data: Object.fromEntries(['email', 'first_name', 'last_name', 'area_id'].map(key => [key, original[key]])) })
      assert.equal(restored.status(), 200)
      const fetched = (await (await context.request.get(`${base}/api/admin/users/${original.id}/`)).json()).user
      for (const key of ['email', 'first_name', 'last_name', 'area_id']) assert.equal(fetched[key], original[key])
      if (result) result.original_data_restored = true
    }
    await browser.close()
  }
  fs.writeFileSync(path.join(__dirname, 'resultado_edicion_usuario.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
})().catch(error => { console.error(error); process.exitCode = 1 })
