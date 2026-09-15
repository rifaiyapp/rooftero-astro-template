import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
const files=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean))];
const violations=[];
const forbidden=new RegExp(['rifai'+'yapp','shibga'+'media','KEYDIV_'+'GITHUB','keydiv'+String.raw`\.workers\.dev`,'automation'+String.raw`\.keydiv`,'lead'+'-gateway',String.raw`https?://[^\s"'<>]*keydiv\.com`].join('|'),'i');
const credential=/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:ghp_|github_pat_)[A-Za-z0-9_]{25,}|\bAKIA[A-Z0-9]{16}\b/;
const localPath=/[A-Z]:[\\/]Users[\\/]|\/Users\/[^/]+\//;
async function inspect(path, tracked=false) {
  if(tracked && (/(^|\/)(?:node_modules|dist|tmp|test-results|playwright-report)\//.test(path) || /(?:\.log|\.zip|\.webm)$/.test(path) || /^qa\/.*\.(?:png|jpe?g|webp|html|json)$/.test(path))) violations.push(`${path}: local artifact`);
  if(tracked && /(^|\/)\.env(?:\.|$)/.test(path) && path !== '.env.example') violations.push(`${path}: environment file`);
  if(!/\.(?:md|json|jsonc|mjs|js|ts|astro|css|sh|html|txt)$/.test(path) && !['_headers','.env.example'].some(name=>path.endsWith(name))) return;
  let content;
  try { content=await readFile(path,'utf8'); } catch(error) { if(error.code==='ENOENT') return; throw error; }
  // The approved server-side binding and its exact setup instruction are not public operational URLs.
  // Keep the existing prohibition everywhere else, including browser output.
  const operationalContent = path === 'wrangler.jsonc'
    ? content.replace(/\{\s*"binding":\s*"LEAD_GATEWAY",\s*"service":\s*"lead\x2dgateway"\s*\}/g, '')
    : path === 'docs/CUSTOMER-SETUP.md'
      ? content.replace(/^LEAD_GATEWAY -> lead\x2dgateway\r?$/gm, '')
      : content;
  if(forbidden.test(operationalContent)) violations.push(`${path}: seller operational reference`);
  if(credential.test(content)) violations.push(`${path}: credential pattern`);
  if(localPath.test(content)) violations.push(`${path}: local machine path`);
}
for(const file of files) await inspect(file,true);
async function walk(dir) { for(const entry of await readdir(dir,{withFileTypes:true})) { const path=`${dir}/${entry.name}`; if(entry.isDirectory()) await walk(path); else await inspect(path); } }
await walk('dist');
const config=JSON.parse(await readFile('project.config.json','utf8'));
assert.equal(config.factoryVersion,'4.7');
const publishing=await readFile('wrangler.jsonc','utf8');
assert.doesNotMatch(publishing,/"(?:account_id|zone_id|routes|route)"/,'Review customer bindings explicitly before distribution');
for(const name of ['CUSTOMIZATION','CODEX-CLOUD-SETUP','FORM-INTEGRATION','CUSTOMER-SETUP']) assert.ok((await readFile(`docs/${name}.md`,'utf8')).trim());
assert.deepEqual(violations,[],'Distribution audit failed (values withheld)');
console.log('PASS current-source and built-output distribution audit');
