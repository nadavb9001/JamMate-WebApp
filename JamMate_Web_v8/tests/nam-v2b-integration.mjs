// Run with: node tests/nam-v2b-integration.mjs
// No TONE3000 account or BLE hardware needed: mock fetch exercises A2 selection.
import assert from 'node:assert/strict';
import { URL } from 'node:url';

globalThis.window = { location: {origin:'https://jammate.test', pathname:'/index.html'} };
const store = new Map([['t3k_access','mock-token'],['t3k_exp',String(Date.now()+86400000)]]);
globalThis.sessionStorage = {getItem: k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
const urls=[];
const models = [
  {id:12, tone_id:7, name:'Clean', architecture_version:2, size:'lite', model_url:'https://download.test/clean.nam'},
  {id:13, tone_id:7, name:'Crunch', architecture_version:2, size:'lite', model_url:'https://download.test/crunch.nam'},
  {id:14, tone_id:7, name:'Legacy', architecture_version:1, size:'lite', model_url:'https://download.test/legacy.nam'}
];
globalThis.fetch = async url => {
  urls.push(String(url));
  if (String(url).includes('/models?')) return {ok:true, json:async()=>({data:models})};
  if (String(url).includes('/tones/search?')) return {ok:true, json:async()=>({data:[{id:7}],total:1})};
  throw Error('Unexpected request '+url);
};
const { NamLoader } = await import('../js/NamLoader.js');
const res = await NamLoader.search('british',1,'trending',{gear:'amp-cab'});
assert.equal(res.total,1);
const searchUrl = new URL(urls.at(-1));
assert.equal(searchUrl.searchParams.get('format'), 'nam');
assert.equal(searchUrl.searchParams.get('architecture'), '2');
assert.equal(searchUrl.searchParams.get('gears'), 'amp-cab');
const variants = await NamLoader.listToneModels(7);
assert.deepEqual(variants.map(v=>v.id),[12,13]);
const modelsUrl = new URL(urls.at(-1));
assert.equal(modelsUrl.searchParams.get('architecture'), '2');
assert.equal(modelsUrl.searchParams.get('page_size'), '300');
let chosen = null;
NamLoader._downloadAndSend = async (url,name,token,progress,done) => {chosen={url,name,token};done(true,name,{name});};
let success = null;
await NamLoader.sendSelectedModel(variants[1],'fallback',()=>{}, (ok,msg,details)=>{success=ok;});
assert.equal(chosen.url, 'https://download.test/crunch.nam');
assert.equal(chosen.name, 'Crunch.nam');
assert.equal(success, true);
console.log('PASS: filtered NAM A2 search, model variants, selected-model transfer routing');
