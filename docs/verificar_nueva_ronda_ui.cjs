const {chromium} = require('C:/Users/Cristian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const assert = require('node:assert/strict')
async function main() {
  const browser = await chromium.launch({headless:true})
  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(60000)
    let role = 'editor'
    const submitted = []
    await page.route('**/api/**',async route => {
      const req = route.request(), url = new URL(req.url())
      // Preserve Chromium's multipart file stream; postDataBuffer omits file bytes.
      await route.continue({url:`http://127.0.0.1:${process.env.REQ48_PORT}${url.pathname}${url.search}`,headers:{...req.headers(),'X-Test-Role':role}})
    })
    const open = async (who,review='') => {
      role = who
      await page.goto(`http://127.0.0.1:5173/static/tests/rejection-feedback.html?${new URLSearchParams({document:process.env.REQ48_DOCUMENT,role,review})}`)
    }
    const send = async version => {
      await page.getByRole('button',{name:'Enviar a revisión',exact:true}).click()
      const form = page.locator('[aria-labelledby="editor-review-form-title"]')
      await form.locator('select[multiple] option').first().waitFor({state:'attached'})
      await form.locator('select[multiple]').selectOption(process.env.REQ48_REVIEWER)
      const submission = page.waitForResponse(r=>r.request().method()==='POST' && new URL(r.url()).pathname.endsWith('/submit-review/'))
      await form.getByRole('button',{name:'Enviar a revisión',exact:true}).click()
      const response = await submission
      const data = await response.json()
      assert.equal(response.status(),201,JSON.stringify(data))
      submitted.push(data.reviews[0])
      await page.getByRole('status').getByText(`La versión ${version} se envió a una nueva revisión correctamente.`,{exact:true}).waitFor()
    }
    await open('editor')
    await send('1.0')
    assert.equal(submitted.length,1)
    await open('reviewer',submitted[0].id)
    await page.getByRole('button',{name:'Rechazar definitivamente',exact:true}).click()
    await page.getByPlaceholder('Explique el motivo del rechazo definitivo...').fill(process.env.REQ48_MOTIVE)
    await page.getByRole('button',{name:'Confirmar rechazo',exact:true}).click()
    await page.getByRole('status').getByText('Revisión rechazada.',{exact:true}).waitFor()
    await open('editor')
    await page.getByRole('region',{name:'Motivos de rechazo'}).getByText(process.env.REQ48_MOTIVE,{exact:true}).waitFor()
    assert.ok(await page.getByRole('button',{name:'Enviar a revisión',exact:true}).isDisabled())
    const chooserPromise = page.waitForEvent('filechooser')
    await page.getByRole('button',{name:'Crear versión corregida',exact:true}).click()
    await (await chooserPromise).setFiles(process.env.REQ48_FILE)
    const uploadResponse = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/versions/'))
    await page.getByRole('button',{name:'Cargar versión',exact:true}).click()
    const uploaded = await uploadResponse
    assert.equal(uploaded.status(),201,JSON.stringify(await uploaded.json()))
    await page.getByRole('status').getByText('La versión 1.1 está en borrador. Envíela a revisión para iniciar una nueva ronda.',{exact:true}).waitFor()
    // Reload demonstrates the next send targets persisted 1.1, not transient state.
    await page.reload()
    await send('1.1')
    assert.equal(submitted.length,2)
    assert.notEqual(submitted[0].id,submitted[1].id)
    assert.notEqual(submitted[0].document.version_id,submitted[1].document.version_id)
    assert.equal(submitted[1].document.version,'1.1')
    await open('reviewer',submitted[1].id)
    await page.locator('.reviewer-document-title dd').getByText('1.1',{exact:true}).waitFor()
    const inbox = await page.evaluate(async()=> (await fetch('/api/reviews/inbox/?status=PENDIENTE&limit=100')).json())
    assert.ok(inbox.results.some(r=>r.id===submitted[1].id && r.document.version_id===submitted[1].document.version_id))
    assert.ok(!inbox.results.some(r=>r.id===submitted[0].id))
    assert.ok(await page.getByRole('button',{name:'Aprobar documento',exact:true}).isEnabled())
    await page.locator('.reviewer-document-summary').screenshot({path:__dirname+'/nueva_ronda_revisor.png'})
    console.log('PASS: 1.0 enviada → rechazada → Editor carga 1.1 → envía 1.1 → mismo Revisor recibe solicitud nueva válida.')
  } finally {await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1})
