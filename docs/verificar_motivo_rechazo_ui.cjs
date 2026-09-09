const {chromium} = require('C:/Users/Cristian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const assert = require('node:assert/strict')
async function main() {
  const browser = await chromium.launch({headless:true})
  try {
    const params = new URLSearchParams({document:process.env.REQ47_DOCUMENT,other:process.env.REQ47_OTHER,review:process.env.REQ47_REVIEW})
    const page = await browser.newPage()
    page.setDefaultTimeout(60000)
    let role = 'reviewer'
    await page.route('**/api/**',async route => {
      const req = route.request(), url = new URL(req.url())
      const response = await fetch(`http://127.0.0.1:${process.env.REQ47_PORT}${url.pathname}${url.search}`,{method:req.method(),headers:{'X-Test-Role':role,'Content-Type':'application/json'},body:req.postData() || undefined})
      await route.fulfill({status:response.status,contentType:response.headers.get('content-type'),body:Buffer.from(await response.arrayBuffer())})
    })
    await page.goto(`http://127.0.0.1:5173/static/tests/rejection-feedback.html?${params}&role=reviewer`)
    await page.getByRole('button',{name:'Rechazar definitivamente',exact:true}).click()
    await page.getByPlaceholder('Explique el motivo del rechazo definitivo...').fill(process.env.REQ47_MOTIVE)
    await page.getByRole('button',{name:'Confirmar rechazo',exact:true}).click()
    await page.getByRole('status').getByText('Revisión rechazada.',{exact:true}).waitFor()
    role = 'editor'
    await page.goto(`http://127.0.0.1:5173/static/tests/rejection-feedback.html?${params}&role=editor`)
    const panel = page.getByRole('region',{name:'Motivos de rechazo'})
    await panel.locator('.editor-rejection-reason').waitFor()
    assert.equal(await panel.locator('.editor-rejection-reason').innerText(),process.env.REQ47_MOTIVE)
    await panel.getByRole('heading',{name:'Versión 1.0 · Rechazada'}).waitFor()
    await page.reload()
    await panel.locator('.editor-rejection-reason').waitFor()
    assert.equal(await panel.locator('.editor-rejection-reason').innerText(),process.env.REQ47_MOTIVE)
    await panel.screenshot({path:__dirname+'/motivo_rechazo_editor.png'})
    await page.getByRole('button',{name:'Otro documento',exact:true}).click()
    await panel.getByText('No hay rechazos registrados.',{exact:true}).waitFor()
    assert.equal(await panel.locator('.editor-rejection-reason').count(),0)
    console.log('PASS: Revisor rechaza desde UI, Editor recibe motivo exacto, persiste al recargar, otro documento no hereda motivo. Sin reenvío.')
  } finally {await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1})
