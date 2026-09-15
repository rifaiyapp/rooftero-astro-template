import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';
const root = resolve(process.env.QA_DIST || 'dist');
const server = createServer(async (req,res) => {
  const pathname = new URL(req.url,'http://localhost').pathname;
  const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try { res.writeHead(200, {'Content-Type': {'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'}[extname(file)] || 'application/octet-stream'}).end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0,'127.0.0.1',done));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser=await chromium.launch({headless:true});
  for (const javaScriptEnabled of [true,false]) {
    const context=await browser.newContext({javaScriptEnabled});
    const page=await context.newPage();
    const external=[];
    await page.route('**/*',route => {
      if (route.request().url().startsWith(base)) return route.continue();
      external.push(route.request().url()); return route.abort();
    });
    await page.goto(base,{waitUntil:'networkidle'});
    if(javaScriptEnabled) await page.waitForFunction(()=>document.querySelector('#callback').dataset.leadConnected);
    const calls=[];
    page.on('request', request => calls.push(request.url()));
    if(javaScriptEnabled) {
      await page.locator('button[type=submit]').click();
      assert.equal(await page.locator('.form-status').textContent(),'Please complete the required fields.');
      await page.evaluate(()=>{window.leadEvents=0; document.addEventListener('rooflume:lead-submitted',()=>window.leadEvents++);});
    }
    const fields={name:'Test Homeowner',phone:'(818) 555-0147',email:'test@example.com',zip:'90210',message:'Example request'};
    for(const [name,value] of Object.entries(fields)) await page.locator(`[name=${name}]`).fill(value);
    await page.locator('button[type=submit]').click();
    assert.equal(page.url(),base+'/');
    assert.deepEqual(calls,[],'Demo/native fallback must not send any request');
    assert.deepEqual(external,[]);
    for(const [name,value] of Object.entries(fields)) assert.equal(await page.locator(`[name=${name}]`).inputValue(),value);
    if(javaScriptEnabled) {
      assert.equal(await page.locator('.form-status').textContent(),process.env.QA_CONFIG_INVALID ? 'Online requests are not configured. Please call us.' : 'Demo only. Your request was not sent.');
      assert.equal(await page.evaluate(()=>window.leadEvents),0);
      assert.equal(await page.locator('button[type=submit]').isEnabled(),true);
    }
    await context.close();
  }
  console.log('PASS non-sending form, honest feedback, retained fields and JavaScript-disabled fallback');
} finally { await browser?.close(); await new Promise(done=>server.close(done)); }
