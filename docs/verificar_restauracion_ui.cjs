const { chromium } = require('C:/Users/Cristian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

async function main() {
  const browser = await chromium.launch({ headless: true })
  const checks = []
  try {
    for (const view of ['admin', 'editor']) {
      for (const fail of [false, true]) {
        const page = await browser.newPage()
        let versions = ['1.3','1.2','1.1'].map(version => ({ id: version, version, is_current: version === '1.3', status: { code: 'BORRADOR', name: 'Borrador' } }))
        let restored = false
        const posts = []
        await page.route('**/api/**', async route => {
          const url = new URL(route.request().url())
          let body
          let status = 200
          if (url.pathname.endsWith('/csrf/')) body = { csrf_token: 'test' }
          else if (url.pathname.endsWith('/restore/')) {
            assert.equal(url.pathname, '/api/documents/test-document/versions/1.2/restore/')
            assert.equal(route.request().method(), 'POST')
            assert.deepEqual(route.request().postDataJSON(), { version_type: 'minor' })
            posts.push(url.pathname)
            if (fail) { status = 400; body = { detail: 'Fallo de integridad controlado' } }
            else {
              versions = [{ id:'1.4', version:'1.4', is_current:true, status:{ code:'BORRADOR',name:'Borrador' } }, ...versions.map(v => ({ ...v, is_current:false }))]
              restored = true
              status = 201
              body = { version: versions[0] }
            }
          } else if (url.pathname.endsWith('/versions/')) body = { versions, current_version_id: restored ? '1.4' : '1.3' }
          else if (url.pathname.endsWith('/timeline/')) body = { events: [] }
          else body = { document: { id:'test-document', code:'REQ39', title:'Restauración de prueba' } }
          await route.fulfill({ status, contentType:'application/json', body:JSON.stringify(body) })
        })
        await page.goto(`http://127.0.0.1:5173/static/tests/versions-selection.html?view=${view}`)
        await page.getByRole('button', { name:'Restaurar versión 1.2', exact:true }).click()
        if (fail) await page.getByRole('alert').getByText('Fallo de integridad controlado').waitFor()
        else await page.getByRole('status').getByText('Contenido de 1.2 restaurado como nueva versión 1.4.').waitFor()
        const expected = fail ? '1.3' : '1.4'
        const current = page.getByRole('button', { name:`Restaurar versión ${expected}`, exact:true })
        await current.waitFor()
        assert.ok(await current.isDisabled())
        assert.equal(await page.locator('tbody tr').count(), fail ? 3 : 4)
        assert.equal(posts.length, 1)
        assert.equal(await page.locator('tbody tr').filter({ has: page.getByText('1.2', { exact:true }) }).count(), 1)
        checks.push({ view, case: fail ? 'error conserva historial y muestra fallo' : 'restaurar 1.2 recarga 1.4 y conserva anteriores', result:'PASS' })
        await page.close()
      }
    }
    fs.writeFileSync(path.join(__dirname, 'resultado_restauracion_ui.json'), JSON.stringify({ environment:'UI local con API controlada', checks }, null, 2))
    console.log(checks)
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode=1 })
