const { chromium } = require('C:/Users/Cristian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
async function main() {
  const browser = await chromium.launch({headless:true})
  const checks = []
  try {
    for (const kind of ['individual','total','conflict']) {
      const page = await browser.newPage()
      const review = {id:'review-old', document:{id:'doc',version_id:'v1',version:'1.0'},status:{code:'PENDIENTE'},checklist:[],comments:[]}
      await page.route('**/api/**', async route => {
        const url = new URL(route.request().url())
        let status = 200, body
        if (url.pathname.endsWith('/csrf/')) body = {csrf_token:'test'}
        else if (url.pathname.endsWith('/approve/')) {
          assert.equal(url.pathname, '/api/reviews/review-old/approve/')
          if (kind === 'conflict') {status = 409; body = {code:'REVIEW_NOT_PENDING',detail:'La solicitud ya fue resuelta.'}}
          else body = {review:{...review,status:{code:'APROBADA'}},approval:{individual_approved:true,version_approved:kind === 'total',pending_count:kind === 'total' ? 0 : 1}}
        } else if (url.pathname.includes('/reviews/')) body = {review}
        else body = {document:{id:'doc',files:[{id:'v1',version:'1.0'}]}}
        await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)})
      })
      await page.goto('http://127.0.0.1:5173/static/tests/review-version.html')
      await page.getByRole('button',{name:'Aprobar documento',exact:true}).click()
      if (kind === 'conflict') {
        await page.getByRole('alert').getByText('La solicitud ya fue resuelta.').waitFor()
        assert.equal(await page.getByRole('status').innerText(), '')
      } else {
        const message = kind === 'total'
          ? 'Revisión aprobada. La versión cuenta con la aprobación de todos los revisores.'
          : 'Aprobación individual registrada. Revisiones pendientes: 1. La versión sigue en revisión.'
        await page.getByRole('status').getByText(message,{exact:true}).waitFor()
        assert.ok(await page.getByRole('button',{name:'Aprobar documento',exact:true}).isDisabled())
      }
      checks.push({case:kind,result:'PASS'})
      await page.close()
    }
    fs.writeFileSync(__dirname + '/resultado_aprobacion_ui.json', JSON.stringify({checks},null,2))
    console.log(checks)
  } finally {await browser.close()}
}
main().catch(error => {console.error(error); process.exitCode=1})
