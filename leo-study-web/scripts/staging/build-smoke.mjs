import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const account=JSON.parse(await readFile('.test-accounts.local','utf8')).cadet
const browser=await chromium.launch()
const failures=[]
try {
 const context=await browser.newContext({viewport:{width:1440,height:1000}})
 await context.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort('blockedbyclient'))
 const page=await context.newPage();page.on('pageerror',e=>failures.push(e.message))
 await page.goto('http://127.0.0.1:5177/signin')
 await page.getByLabel('Email address',{exact:true}).fill(account.email)
 await page.getByLabel('Password',{exact:true}).fill(account.password)
 await page.getByRole('button',{name:'Sign in',exact:false}).click()
 await page.locator('.today-dashboard').waitFor()
 assert.match(await page.getByRole('heading',{level:1}).first().textContent(),/Alex/)
 await page.goto('http://127.0.0.1:5177/study')
 await page.locator('#main-content').waitFor()
 assert.equal(new URL(page.url()).pathname,'/study')
 await page.goto('http://127.0.0.1:5177/home');await page.locator('.today-dashboard').waitFor()
 await page.waitForLoadState('networkidle')
if(!await page.locator('.ui-light-mode').count()){await page.getByRole('button',{name:'Open profile menu',exact:true}).click();await page.getByRole('button',{name:'Switch to Light Mode',exact:true}).click();await page.locator('.ui-light-mode').waitFor()}
 await mkdir('docs/screenshots',{recursive:true})
 for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844],['narrow',320,800]]){
  await page.setViewportSize({width,height})
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),`Overflow at ${width}px`)
  await page.screenshot({path:`docs/screenshots/home-${name}-light.png`,fullPage:true,animations:'disabled'})
 }
 await page.setViewportSize({width:1440,height:1000})
 await page.getByRole('button',{name:'Open profile menu',exact:true}).click()
 await page.getByRole('button',{name:'Switch to Dark Mode',exact:true}).click()
 await page.locator('.app-shell:not(.ui-light-mode)').waitFor()
 await page.screenshot({path:'docs/screenshots/home-desktop-dark.png',fullPage:true,animations:'disabled'})
 await page.setViewportSize({width:320,height:800})
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'Dark 320px overflow')
 await page.screenshot({path:'docs/screenshots/home-narrow-dark.png',fullPage:true,animations:'disabled'})
 await page.setViewportSize({width:1440,height:1000})
 await page.getByRole('button',{name:'Open profile menu',exact:true}).click()
 await page.getByRole('button',{name:'Switch to Light Mode',exact:true}).click()
 await page.locator('.ui-light-mode').waitFor()
 assert.deepEqual(failures,[])
 console.log('PASS: compiled staging bundle login, dashboard, study deep-link, light/dark and 1440/390/320px layouts; no uncaught JavaScript errors. Synthetic screenshots saved under docs/screenshots.')
} finally {await browser.close()}
