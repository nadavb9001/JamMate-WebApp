import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {APP_CONFIG} from '../js/config.js';
import {configLayout,encodeCommand,localParam,wrapPreset,unwrapPreset} from '../js/services/Domain.js';
import {Protocol} from '../js/services/Protocol.js';
const esp=path.resolve('../../JamMate_Ctrl'),display=fs.readFileSync(path.join(esp,'src/DisplayData.cpp'),'utf8'),main=fs.readFileSync(path.join(esp,'src/main.cpp'),'utf8');
const array=name=>{const value=display.match(new RegExp('\\b'+name+'\\[\\] = \\{ ([^}]+) \\};'))?.[1];assert.ok(value,`Missing fallback ${name}`);return JSON.parse('['+value+']');};
for(let i=0;i<18;i++){
 const tab=APP_CONFIG.tabs[i],knobs=tab.params.knobs,drops=tab.params.dropdowns;
 if(knobs.length)assert.deepEqual(array(`cfgKnobs${i}`),knobs);
 if(drops.length){assert.deepEqual(array(`cfgDrops${i}`),drops);const counts=array(`cfgOptionCounts${i}`);drops.forEach((name,d)=>{assert.deepEqual(array(`cfgOptions${i}_${d}`),APP_CONFIG.dropdowns[name]);assert.equal(counts[d],APP_CONFIG.dropdowns[name].length);});}
}
const body=main.split('uint8_t FX_LAYOUT[18][2] = {')[1].split('};')[0];
assert.deepEqual([...body.matchAll(/\{(\d+),\s*(\d+)\}/g)].map(m=>[+m[1],+m[2]]),configLayout(APP_CONFIG));
const compiled=display.split('FxLayout fxLayouts[TOTAL_FX] = {')[1];
assert.deepEqual([...compiled.matchAll(/\{ (\d+), [^,]+, (\d+),/g)].map(m=>[+m[1],+m[2]]),configLayout(APP_CONFIG));
const local=configLayout(APP_CONFIG),remote=local.map(v=>v.slice());remote[17]=[8,2];
const data=encodeCommand(0x20,Uint8Array.of(17,11,4),local);assert.deepEqual(data,Uint8Array.of(17,2,0,4));
assert.deepEqual(localParam(data,remote),Uint8Array.of(17,9,4));
assert.equal(localParam(Uint8Array.of(17,1,9,99),remote),null);
const blob=new Uint8Array(Protocol.serializeState({effectStates:{},effectParams:{16:{dropdown0:2}}}));
assert.deepEqual(unwrapPreset(wrapPreset(blob,local)).data,blob);
const broken=wrapPreset(blob,local);broken[1]=16;assert.throws(()=>unwrapPreset(broken));
assert.deepEqual(APP_CONFIG.dropdowns.ReverbEngine,['Dattorro','FDN','Vintage']);
console.log('PASS all 18 effects: compiled LCD labels, counts, options and web defaults agree; Vintage index 2; typed dropdown mapping across 8/10 knobs and validated preset envelopes');
