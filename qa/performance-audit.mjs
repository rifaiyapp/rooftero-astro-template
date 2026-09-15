import {createServer} from 'node:http';
import {readFile,writeFile,readdir,stat,mkdir,access} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
import sharp from 'sharp';
import assert from 'node:assert/strict';
const phase=process.argv[2] || 'before';
// QA-only, pinned axe build; no production dependency or third-party script.
const axePath='.temp/axe-4.10.3.min.js';
try { await access(axePath); } catch {
 await mkdir('.temp',{recursive:true});
 const response=await fetch('https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.3/axe.min.js');
 if(!response.ok)throw new Error('Unable to download QA-only axe');
 await writeFile(axePath,await response.text());
}
const server=createServer(async(req,res)=>{try{const p=resolve('dist','.'+(req.url==='/'?'/index.html':req.url));const b=await readFile(p);res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.avif':'image/avif','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'})[extname(p)]||'application/octet-stream');res.end(b);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch();
const report={assets:[]};
for(const f of await readdir('public/assets')){if(!/\.(png|jpg|webp|avif)$/.test(f))continue;const m=await sharp('public/assets/'+f).metadata();report.assets.push({file:f,width:m.width,height:m.height,bytes:(await stat('public/assets/'+f)).size});}
for(const [name,width,height,dpr] of [['mobile',390,844,3],['desktop',1440,900,1],['wide',1920,1080,1],['tablet',820,1180,2]]){
 const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:dpr,reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.url());});
 await page.addInitScript(()=>{window.lcp=[];new PerformanceObserver(l=>{for(const e of l.getEntries())window.lcp.push({tag:e.element?.tagName,id:e.element?.id,class:e.element?.className,url:e.url,size:e.size,time:e.startTime});}).observe({type:'largest-contentful-paint',buffered:true});});
 await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'networkidle'});
 await page.waitForTimeout(500);
 await page.addScriptTag({path:axePath});
 const accessibility=await page.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'rule',values:['color-contrast','target-size']}});return r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary,data:n.any.map(a=>a.data)}))}));});
 report[name]=await page.evaluate(()=>({lcp:window.lcp,initialBytes:performance.getEntriesByType('resource').reduce((n,r)=>n+r.decodedBodySize,0),resources:performance.getEntriesByType('resource').map(r=>({url:r.name.split('/').pop(),bytes:r.decodedBodySize})),images:[...document.images].map(i=>({src:i.currentSrc,box:[i.width,i.height],rect:[i.getBoundingClientRect().width,i.getBoundingClientRect().height],top:i.getBoundingClientRect().top,loading:i.loading})),overflow:document.documentElement.scrollWidth>innerWidth,fonts:[...document.fonts].map(f=>({family:f.family,status:f.status,display:f.display}))}));
 if(phase==='after') {
   const failures=[];
   for(const selector of ['#home','#services','#about','#reviews','#faq','#roof-check','.site-footer']) {
     await page.locator(selector).scrollIntoViewIfNeeded();
     await page.waitForTimeout(150);
     const r=await page.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'rule',values:['color-contrast','target-size']}});return r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));});
     failures.push(...r);
   }
   report[name].scrolledAccessibility=failures;
   report[name].brokenImages=await page.locator('img').evaluateAll(images=>images.filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src));
   assert.deepEqual(report[name].brokenImages,[]);
   const beforeTransform=await page.locator('.testimonial-track').evaluate(e=>getComputedStyle(e).transform);
   await page.locator('.review-arrow.next').click();
   await page.waitForTimeout(100);
   assert.equal(await page.locator('[data-review-dot="1"]').getAttribute('aria-current'),'true');
   assert.notEqual(await page.locator('.testimonial-track').evaluate(e=>getComputedStyle(e).transform),beforeTransform,'Carousel must physically move');
   await page.locator('[data-review-dot="3"]').click();
   assert.equal(await page.locator('[data-review-dot="3"]').getAttribute('aria-current'),'true');
   await page.locator('.faq-question').nth(1).click();
   assert.equal(await page.locator('.faq-question').nth(1).getAttribute('aria-expanded'),'true');
   if(width<=820){await page.locator('.menu-toggle').click();assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'),'true');await page.locator('#site-nav a').nth(1).click();assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'),'false');}
   report[name].interactionChecks='PASS: carousel arrow/dot, FAQ, mobile navigation';
   await page.evaluate(()=>scrollTo(0,0));
 }
 await page.screenshot({path:`qa/performance-${phase}-${name}.png`,fullPage:true});
 report[name].errors=errors;
 report[name].accessibility=accessibility;
 await page.close();
}
await writeFile(`qa/performance-${phase}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();server.close();
