const {chromium} = require('C:/Users/Cristian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const fs = require('node:fs')
const assert = require('node:assert/strict')
async function main() {
  const {snapshots} = JSON.parse(fs.readFileSync(__dirname+'/resultado_contrato_estados.json','utf8'))
  const browser = await chromium.launch({headless:true})
  const checks = []
  try {
    for (const role of ['editor','reviewer']) {
      const page = await browser.newPage()
      let active = role === 'editor' ? 0 : 1
      await page.route('**/api/**',async route => {
        const {document,review} = snapshots[active]
        const path = new URL(route.request().url()).pathname
        let body
        if (path.endsWith('/catalogs/')) body = {areas:[],types:[]}
        else if (path.endsWith('/permissions/')) body = {roles:[],permissions:[],assignments:[]}
        else if (path.includes('/preview/')) return route.fulfill({contentType:'text/plain',body:'Contenido de prueba'})
        else if (path.endsWith('/reviews/')) body = {reviews:review?[review]:[]}
        else if (path.includes('/reviews/')) body = {review}
        else body = {document}
        await route.fulfill({contentType:'application/json',body:JSON.stringify(body)})
      })
      await page.goto(`http://127.0.0.1:5173/static/tests/rejection-feedback.html?${new URLSearchParams({role,document:snapshots[0].document.id,review:'review'})}`)
      for (;active<snapshots.length;active++) {
        if (active>(role==='editor'?0:1)) await page.getByRole('button',{name:'Actualizar estados',exact:true}).click()
        const target = role==='editor'?snapshots[active].document.current_version:snapshots[active].review.version
        const panel = page.getByRole('region',{name:'Estado de la versión',exact:true})
        await panel.getByText(target.status.code,{exact:true}).waitFor()
        await panel.getByText(target.is_current?'Vigente':'No vigente',{exact:true}).waitFor()
        await panel.getByText(target.is_published?'Publicada':'No publicada',{exact:true}).waitFor()
        if (role==='editor' && snapshots[active].review) await page.getByRole('region',{name:'Estados de solicitudes'}).getByText(/Estado de solicitud: (PENDIENTE|APROBADA)/).waitFor()
        if (role==='reviewer') assert.ok((await page.locator('.reviewer-document-summary').innerText()).includes('Estado de solicitud'))
        checks.push({role,stage:snapshots[active].stage,result:'PASS'})
        if (active===snapshots.length-1) await panel.screenshot({path:__dirname+`/estados_${role}.png`})
      }
      await page.close()
    }
    fs.writeFileSync(__dirname+'/resultado_contrato_estados_ui.json',JSON.stringify({result:'PASS',environment:'Componentes reales con snapshots de la secuencia Neon',checks},null,2))
    console.log(checks)
  } finally {await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1})
