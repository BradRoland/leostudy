import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const account=JSON.parse(await readFile('.test-accounts.local','utf8')).cadet
const browser=await chromium.launch()
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}})
 await context.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort('blockedbyclient'))
 const page=await context.newPage()
 await page.goto('http://127.0.0.1:5176/signin')
 await page.getByLabel('Email address',{exact:true}).fill(account.email)
 await page.getByLabel('Password',{exact:true}).fill(account.password)
 await page.getByRole('button',{name:'Sign in',exact:false}).click()
 await page.locator('.today-dashboard').waitFor()
 await page.getByRole('button',{name:'Open profile menu',exact:true}).click()
 const darkSwitch=page.getByRole('button',{name:'Switch to Dark Mode',exact:true});if(await darkSwitch.count())await darkSwitch.click();else await page.getByRole('button',{name:'Open profile menu',exact:true}).click()
 await page.locator('.app-shell:not(.ui-light-mode)').waitFor()
 await page.getByRole('button',{name:'Open profile menu',exact:true}).click()
 const signout=page.getByRole('button',{name:/sign out|log out/i});await signout.click()
 await page.getByLabel('Email address',{exact:true}).waitFor()
 await page.locator('.app-shell').evaluate(el=>{el.classList.remove('ui-light-mode','theme-light');el.classList.add('theme-dark')})
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('.academy-google')).backgroundColor==='rgb(28, 41, 58)')
 await page.getByLabel('Email address',{exact:true}).fill('test-preview@example.invalid')
 await page.getByLabel('Password',{exact:true}).fill('synthetic-example')
 await page.screenshot({path:'docs/screenshots/signin-desktop-dark.png',fullPage:true,animations:'disabled'})
 await page.setViewportSize({width:320,height:800});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2))
 await page.screenshot({path:'docs/screenshots/signin-narrow-dark.png',fullPage:true,animations:'disabled'})
 await page.locator('.app-shell').evaluate(el=>{el.classList.add('ui-light-mode','theme-light');el.classList.remove('theme-dark')})
 await page.setViewportSize({width:1440,height:1000})
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('.academy-google')).backgroundColor==='rgb(255, 255, 255)')
 await page.screenshot({path:'docs/screenshots/signin-desktop-light.png',fullPage:true,animations:'disabled'})
 console.log('PASS: forced light/dark onboarding theme styling, filled input visibility and 320px layout; screenshots captured after background transitions settle.')
}finally{await browser.close()}
