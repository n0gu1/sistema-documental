const { chromium } = require('C:/Users/Cristian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
async function main() {
  const browser = await chromium.launch({ headless: true })
  const checks = []
  try {
    for (const mode of ['exact', 'missing', 'preview-error', 'switch']) {
      const page = await browser.newPage()
      const fetched = [], opened = [], decisions = []
      await page.exposeFunction('recordOpen', url => opened.push(url))
      await page.addInitScript(() => { window.open = url => { window.recordOpen(url); return null } })
      const review = id => ({ id, document:{ id:'document', version_id:id === 'review-old' ? 'old' : 'next', version:id === 'review-old' ? '1.0' : '1.2', code:'REQ45', title:'Versión solicitada' }, status:{code:'PENDIENTE'}, checklist:[], comments:[] })
      await page.route('**/api/**', async route => {
        const url = new URL(route.request().url())
        let body = {}, status = 200
        if (url.pathname.endsWith('/csrf/')) body = {csrf_token:'test'}
        else if (url.pathname.endsWith('/approve/')) {
          decisions.push(url.pathname)
          body = {review:{...review('review-old'), status:{code:'APROBADA'}}}
        } else if (url.pathname.includes('/reviews/')) body = {review:review(url.pathname.split('/')[3])}
        else if (url.pathname.includes('/preview/')) {
          fetched.push(url.pathname)
          return route.fulfill({status:mode === 'preview-error' || (mode === 'switch' && url.pathname.includes('/next/')) ? 500 : 200, contentType:'text/plain', body:url.pathname.includes('/old/') ? 'CONTENIDO ANTIGUO EXACTO' : 'OTRA VERSION'})
        } else body = {document:{id:'document', version_id:'global', version:'9.9', files:[{id:'global', version:'9.9', is_current:true}, ...(mode === 'missing' ? [] : [{id:'old', version:'1.0'}, {id:'next', version:'1.2'}])].map(f => ({...f, name:f.id, preview_url:`/api/files/${f.id}/preview/`, download_url:`/api/files/${f.id}/download/`}))}}
        await route.fulfill({status, contentType:'application/json', body:JSON.stringify(body)})
      })
      await page.goto('http://127.0.0.1:5173/static/tests/review-version.html')
      if (mode === 'missing') {
        await page.getByRole('alert').getByText('No se encontró el archivo de la versión solicitada para revisión.').waitFor()
        assert.deepEqual(fetched, [])
        assert.equal(await page.getByRole('button', {name:'Aprobar documento'}).count(), 0)
      } else {
        await page.locator('.reviewer-document-title dd').getByText('1.0', {exact:true}).waitFor()
        if (mode === 'preview-error') {
          await page.getByRole('button', {name:'Abrir vista previa', exact:true}).click()
          await page.waitForFunction(() => true)
        } else {
          await page.locator('iframe').waitFor()
          assert.equal(await page.locator('iframe').evaluate(async el => (await fetch(el.src)).text()), 'CONTENIDO ANTIGUO EXACTO')
        }
        if (mode === 'switch') {
          await page.getByRole('button', {name:'Otra solicitud'}).click()
          await page.getByText('No fue posible cargar la vista previa del archivo.', {exact:true}).waitFor()
          assert.equal(await page.locator('iframe').count(), 0)
          await page.locator('.reviewer-document-title dd').getByText('1.2', {exact:true}).waitFor()
        } else {
          await page.getByRole('button', {name:'Anexos', exact:true}).click()
          assert.equal(await page.locator('.reviewer-file-list > div').count(), 1)
          await page.getByRole('button', {name:'Descargar', exact:true}).click()
          await page.getByRole('button', {name:'Aprobar documento', exact:true}).click()
          await page.waitForFunction(() => document.querySelector('.is-approve').disabled)
          assert.deepEqual(decisions, ['/api/reviews/review-old/approve/'])
          assert.ok(opened.includes('/api/files/old/download/'))
          if (mode === 'preview-error') assert.ok(opened.includes('/api/files/old/preview/'))
        }
        assert.ok(fetched.length > 0 && fetched.every(p => !p.includes('/global/')))
      }
      checks.push({case:mode, result:'PASS'})
      await page.close()
    }
    fs.writeFileSync(__dirname + '/resultado_revision_version_ui.json', JSON.stringify({environment:'UI local con API controlada', checks}, null, 2))
    console.log(checks)
  } finally { await browser.close() }
}
main().catch(error => {console.error(error); process.exitCode=1})
