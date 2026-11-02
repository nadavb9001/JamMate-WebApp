import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {APP_CONFIG} from '../js/config.js';
import {Protocol} from '../js/services/Protocol.js';
import {crc16} from '../js/services/WebSync.js';
import {readDeviceConfig} from '../js/services/ConfigSync.js';
const encoded=text=>Uint8Array.from([1,...new TextEncoder().encode(text)]);
const text=Protocol.buildConfigText(APP_CONFIG),config=structuredClone(APP_CONFIG);
assert.equal(readDeviceConfig(encoded(text),config),text);
const before=structuredClone(config);
assert.throws(()=>readDeviceConfig(encoded(text.replace('GATE|','OTHER|')),config));assert.deepEqual(config,before);
assert.throws(()=>readDeviceConfig(encoded(text.replace('threshold_db,','')),config));assert.deepEqual(config,before);
assert.throws(()=>readDeviceConfig(Uint8Array.of(2),config));
const inputs=Object.fromEntries(['drumEnable','looperEnable','autoArm','bounceMode','tunerEnable','drumStyle','loopSync','loopLength','trackSelect','playbackMode'].map(k=>[k,{checked:false,value:'0'}]));
let assembled=[],fail=false,reads=0;const statuses=[];
const ble={isConnected:true,configReady:true,async _readConfiguration(){return this.request(Uint8Array.of(0x54,0,0),b=>b[0]===0x55);},async request(packet,matches){
 const p=new Uint8Array(packet);
 let response;
 if(p[0]===0x52){
   const index=p[3]|p[4]<<8;if(index===0)assembled=[];
   assembled.push(...p.slice(6));
   const crc=p[5]?crc16(assembled):0;
   response=Uint8Array.of(0x53,fail?1:0,p[3],p[4],crc&255,crc>>8);
 }else{reads++;response=Uint8Array.from([0x55,(assembled.length+1)&255,(assembled.length+1)>>8,1,...assembled]);}
 assert.ok(matches(response));return response;
},send(){throw Error('Remote updates must not send');}};
const context={console,Uint8Array,ArrayBuffer,DataView,TextEncoder,TextDecoder,Promise,crc16,readDeviceConfig,APP_CONFIG:structuredClone(APP_CONFIG),Protocol,BLEService:ble,
 document:{getElementById:id=>inputs[id]||null,querySelector:()=>null,querySelectorAll:()=>[]},window:{JamMateMobile:{syncControls(){}}},View:{updateStatus:s=>statuses.push(s),updateEffectButtons(){}}};
vm.createContext(context);
const source=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8').replace(/^import .*?;\s*$/gm,'').replace('export const app','const app');
vm.runInContext(source+'\nthis.app=app;',context);const app=context.app;
await app.sendConfigUpdate();assert.equal(ble.configReady,true);assert.equal(reads,1);assert.deepEqual(assembled,Array.from(new TextEncoder().encode(text)));
fail=true;await assert.rejects(app.sendConfigUpdate(),/rejected/);assert.equal(ble.configReady,false);
app.syncRemoteControl([1,42,2,3,130,1,127,2,1,4,3,1,1,5,2,1,1,0]);
assert.equal(app.autoArm,true);assert.equal(app.loopLevel,100);assert.equal(app.bounceMode,true);assert.equal(app.muteMask,5);
assert.equal(inputs.autoArm.checked,true);assert.equal(inputs.tunerEnable.checked,true);assert.equal(inputs.drumEnable.checked,true);
console.log('PASS config sync: validation before mutation, acknowledged upload plus checksum/readback, NACK blocks edits, silent complete controls');
