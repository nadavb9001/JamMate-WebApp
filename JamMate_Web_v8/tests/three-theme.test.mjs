import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const html = readFileSync(root+'index.html','utf8');
const shell = readFileSync(root+'js/ui/mobile-shell.js','utf8');
const app = readFileSync(root+'js/app.js','utf8');
for (const t of ['neon','metal','medieval']) assert.match(html,new RegExp(`<option value="${t}"`));
assert(!html.includes('id="btnTheme"'));
assert(!app.includes("label: '☀️ Light'"));
assert(shell.includes('currentJamMateTheme()'));
assert(shell.includes('upgradeSelects(page)'));
assert(readFileSync(root+'css/metal.css','utf8').includes('metal-grain.svg'));
assert(readFileSync(root+'css/medieval.css','utf8').includes('medieval-filigree.svg'));
const storage = new Map(); const listeners=new Map(); const controls=[];
const htmlElt={dataset:{jmTheme:'metal'}};
const body={dataset:{},classList:{remove(...cls){for(const c of cls)assert(typeof c==='string');}}};
const sheets={jmMetalStyle:{media:'not all'},jmMedievalStyle:{media:'not all'}};
globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
globalThis.document={
  documentElement:htmlElt,body,
  getElementById:id=>sheets[id]??null,
  querySelector:selector=>selector==='meta[name="theme-color"]'?{setAttribute(k,v){this[k]=v}}:null,
  querySelectorAll:()=>controls,
  addEventListener:(event,cb)=>listeners.set(event,cb),
  dispatchEvent:()=>{}
};
globalThis.CustomEvent = class CustomEvent { constructor(type,opts){this.type=type;this.detail=opts.detail;}};
const {installThemeManager,setJamMateTheme,currentJamMateTheme}=await import('../js/ui/ThemeManager.js');
let updates=0;installThemeManager(()=>updates++);
assert.equal(currentJamMateTheme(),'metal');
assert.equal(sheets.jmMetalStyle.media,'all');
assert.equal(sheets.jmMedievalStyle.media,'not all');
const sel={value:'metal',dispatchEvent(ev){assert.equal(ev.bubbles,false);}};
controls.push(sel);
for(const name of ['medieval','neon','metal']){
 setJamMateTheme(name);
 assert.equal(htmlElt.dataset.jmTheme,name);
 assert.equal(body.dataset.jmTheme,name);
 assert.equal(sel.value,name);
 assert.equal(sheets.jmMetalStyle.media,name==='metal'?'all':'not all');
 assert.equal(sheets.jmMedievalStyle.media,name==='medieval'?'all':'not all');
 assert.equal(storage.get('jammate.theme.v1'),name);
}
assert(updates>=4);
sel.value='medieval';listeners.get('change')({target:{value:'medieval',matches:()=>true}});
assert.equal(currentJamMateTheme(),'medieval');
console.log('PASS: three styles; persisted theme; exclusive sheets; native/custom selections; no legacy toggle');
