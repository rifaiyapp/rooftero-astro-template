// Offline asset authoring only, not a project dependency:
// npm.cmd exec --cache .temp/npm-cache --yes --package=fonteditor-core@2.6.3 -- node -e ""
// node qa/subset-icons.mjs
import {readFile,writeFile,readdir,access} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url);
let tool;
for(const dir of await readdir('.temp/npm-cache/_npx')) {
 const path=resolve('.temp/npm-cache/_npx',dir,'node_modules/fonteditor-core');
 try{await access(path);tool=require(path);break;}catch{}
}
if(!tool)throw new Error('Cache fonteditor-core@2.6.3 with the command above first.');
await tool.woff2.init();
const css=await readFile('src/styles/icons.css','utf8');
for(const [weight,family] of [['regular','Phosphor'],['fill','Phosphor-Fill']]) {
 const prefix=weight==='fill'?'ph-fill':'ph';
 const codes=[...css.matchAll(new RegExp(`\\.${prefix}\\.ph-[a-z-]+:before\\s*\\{\\s*content: "\\\\([a-f0-9]+)";`,'g'))].map(m=>parseInt(m[1],16));
 if(!codes.length)throw new Error('No icon glyphs discovered');
 const input=await readFile(`node_modules/@phosphor-icons/web/src/${weight}/${family}.ttf`);
 const font=tool.createFont(input,{type:'ttf',subset:codes,hinting:true,kerning:true});
 const output=font.write({type:'woff2',hinting:true,kerning:true});
 await writeFile(`public/assets/optimized/${family}.woff2`,output);
 console.log(family,codes.length,output.length);
}
