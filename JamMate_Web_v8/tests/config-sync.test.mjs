import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {APP_CONFIG} from '../js/config.js';
import {Protocol} from '../js/services/Protocol.js';
import {crc16} from '../js/services/WebSync.js';
import {parseDeviceConfig} from '../js/services/ConfigSync.js';
assert.deepEqual(APP_CONFIG.dropdowns.ReverbEngine,['Dattorro','FDN','Vintage']);
const vintagePreset=Protocol.serializeState({effectStates:{16:{enabled:true}},effectParams:{16:{dropdown0:2}}});
assert.equal(Protocol.deserializeState(vintagePreset).effectParams[16].dropdown0,2);
import {crc32} from '../js/services/Resources.js';
const encoded=text=>Uint8Array.from([1,...new TextEncoder().encode(text)]);
const text=Protocol.buildConfigText(APP_CONFIG),config=structuredClone(APP_CONFIG);
assert.equal(parseDeviceConfig(encoded(text)).text,text);
const before=structuredClone(config);
assert.throws(()=>parseDeviceConfig(encoded(text.replace('GATE|','OTHER|'))));assert.deepEqual(config,before);
assert.doesNotThrow(()=>parseDeviceConfig(encoded(text.replace('threshold_db,',''))));assert.deepEqual(config,before);
assert.equal(parseDeviceConfig(encoded(text.replace('threshold_db,',''))).layout[0][0],4);
assert.throws(()=>parseDeviceConfig(Uint8Array.of(2)));
const inputs=Object.fromEntries(['drumEnable','looperEnable','autoArm','bounceMode','tunerEnable','drumStyle','loopSync','loopLength','trackSelect','playbackMode'].map(k=>[k,{checked:false,value:'0'}]));
let assembled=[],fail=false,badReadback=false,badCrc=false,reads=0,states=0;const statuses=[];
const ble={isConnected:true,configReady:true,_sessionReady:true,_epoch:1,async readConfigChecksum(){return crc32(assembled);},async readCurrentState(){states++;return Uint8Array.of(0x31,0,0);},async _readConfiguration(){return this.request(Uint8Array.of(0x54,0,0),b=>b[0]===0x55);},async request(packet,matches){
 const p=new Uint8Array(packet);
 let response;
 if(p[0]===0x52){
   const index=p[3]|p[4]<<8;if(index===0)assembled=[];
   assembled.push(...p.slice(6));
   const crc=p[5]?(crc16(assembled)^(badCrc?1:0)):0;
   response=Uint8Array.of(0x53,fail?1:0,p[3],p[4],crc&255,crc>>8);
 }else{assert.equal(ble.configUploading,true);assert.equal(ble.configReady,true);reads++;response=Uint8Array.from([0x55,(assembled.length+1)&255,(assembled.length+1)>>8,1,...assembled]);if(badReadback)response[5]^=1;}
 assert.ok(matches(response));return response;
},send(){throw Error('Remote updates must not send');}};
const context={console,Uint8Array,ArrayBuffer,DataView,TextEncoder,TextDecoder,Promise,crc16,crc32,parseDeviceConfig,APP_CONFIG:structuredClone(APP_CONFIG),Protocol,BLEService:ble,
 document:{getElementById:id=>inputs[id]||null,querySelector:()=>null,querySelectorAll:()=>[]},window:{JamMateMobile:{syncControls(){}}},View:{updateStatus:s=>statuses.push(s),updateEffectButtons(){}}};
vm.createContext(context);
const source=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8').replace(/^import .*?;\s*$/gm,'').replace('export const app','const app');
vm.runInContext(source+'\nthis.app=app;',context);const app=context.app;
assert.notEqual(app.config,context.APP_CONFIG);assert.notEqual(app.bundledConfig,app.config);
// Device labels/options may populate runtime UI, but cannot replace the upload source.
app.config.tabs[0].params.knobs[0]='ESP label';assert.notEqual(app.bundledConfig.tabs[0].params.knobs[0],'ESP label');
await Promise.all([app.sendConfigUpdate(),app.sendConfigUpdate()]);assert.equal(ble.configReady,true);assert.equal(reads,1);assert.equal(states,1);assert.deepEqual(assembled,Array.from(new TextEncoder().encode(text)));
fail=true;await assert.rejects(app.sendConfigUpdate(),/rejected/);assert.equal(ble.configReady,true);assert.equal(ble.configUploading,false);
fail=false;badCrc=true;await assert.rejects(app.sendConfigUpdate(),/checksum differs/);assert.equal(ble.configReady,true);
badCrc=false;badReadback=true;await assert.rejects(app.sendConfigUpdate(),/readback differs/);assert.equal(ble.configReady,true);assert.equal(states,4);
badReadback=false;await app.sendConfigUpdate();assert.equal(ble.configReady,true);assert.equal(states,5);
app.syncRemoteControl([1,42,2,3,130,1,127,2,1,4,3,1,1,5,2,1,1,0]);
assert.equal(app.autoArm,true);assert.equal(app.loopLevel,100);assert.equal(app.bounceMode,true);assert.equal(app.muteMask,5);
assert.equal(inputs.autoArm.checked,true);assert.equal(inputs.tunerEnable.checked,true);assert.equal(inputs.drumEnable.checked,true);
console.log('PASS config sync: validation before mutation, acknowledged upload plus checksum/readback, NACK retains normal controls, silent complete controls');
