const { chromium } = require('C:/Users/Cristian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const fs = require('node:fs')
const assert = require('node:assert/strict')
;(async () => {
  const browser = await chromium.launch({headless:true})
  const page = await browser.newPage({viewport:{width:1440,height:1080}})
  page.setDefaultTimeout(60000)
  const base='http://127.0.0.1:5173'
  const checks=[]
  try {
    await page.goto(base+'/static/')
    await page.getByLabel('Correo o usuario').fill('prueba.lector@test.local')
    await page.locator('#password').fill(process.env.DOCUMENT_TEST_PASSWORD)
    const login=page.waitForResponse(r=>r.url().endsWith('/api/auth/login/') && r.request().method()==='POST')
    await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click()
    assert.equal((await login).status(),200)
    const request=page.context().request
    const catalogs=await (await request.get(base+'/api/documents/catalogs/')).json()
    const initial=await (await request.get(base+'/api/reader/documents/')).json()
    assert.ok(initial.results.length,'Se necesita un documento publicado accesible')
    const sample=initial.results[0]
    await page.getByRole('button',{name:'Biblioteca documental',exact:true}).click()
    const meaningful=url=>[...url.searchParams.keys()].filter(k=>!['limit','offset','ordering'].includes(k))
    const cases=[
      ['nombre','search',sample.title.toLowerCase(),()=>page.getByPlaceholder('Buscar por código, documento o palabra clave...').fill(sample.title)],
      ['tipo','type_id',String(sample.type.id),()=>page.locator('.reader-library-filters select').nth(1).selectOption(sample.type.name)],
      ['área','area_id',sample.area.id,()=>page.locator('.reader-library-filters select').nth(0).selectOption(sample.area.name)],
      ['estado','status_code','PUBLICADO',()=>page.locator('.reader-library-filters select').nth(2).selectOption('Publicado')],
      ['fecha desde','date_from',sample.date||'2024-01-01',()=>page.getByLabel('Fecha documental desde',{exact:true}).fill(sample.date||'2024-01-01')],
      ['fecha hasta','date_to',sample.date||'2026-09-08',()=>page.getByLabel('Fecha documental hasta',{exact:true}).fill(sample.date||'2026-09-08')],
    ]
    for (const [label,key,value,action] of cases) {
      await page.getByRole('button',{name:'Limpiar filtros',exact:true}).click()
      const pending=page.waitForResponse(r=>{const u=new URL(r.url());return u.pathname==='/api/reader/documents/' && u.searchParams.get(key)===value})
      pending.catch(()=>{})
      console.log('Probando '+label)
      await action()
      const response=await pending
      assert.equal(response.status(),200,await response.text())
      const url=new URL(response.url())
      assert.deepEqual(meaningful(url),[key])
      const data=await response.json()
      const counterpart=await request.get(base+'/api/documents/'+url.search)
      assert.equal(counterpart.status(),200)
      const general=await counterpart.json()
      assert.equal(general.count,data.count)
      assert.deepEqual(general.results.map(d=>d.id),data.results.map(d=>d.id))
      checks.push({filter:label,parameter:key,result:'PASS',count:data.count})
    }
    await page.screenshot({path:'docs/filtros_lector_ui.png',fullPage:true})
    fs.writeFileSync('docs/resultado_filtros_documentales_ui.json',JSON.stringify({result:'PASS',checks,sample_id:sample.id},null,2))
    console.log(JSON.stringify({result:'PASS',checks}))
  } catch(error) {await page.screenshot({path:'docs/filtros_error.png'});console.log(await page.locator('body').innerText());throw error}
  finally {await browser.close()}
})()
