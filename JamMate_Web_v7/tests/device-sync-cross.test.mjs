import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {APP_CONFIG} from '../js/config.js';
import {Protocol} from '../js/services/Protocol.js';
import {WebSync} from '../js/services/WebSync.js';
import {readDeviceConfig} from '../js/services/ConfigSync.js';
const esp=process.env.JAMMATE_CTRL_DIR||fileURLToPath(new URL('../../../JamMate_Ctrl/',import.meta.url));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'jammate-cross-'));
try{
 const main=fs.readFileSync(path.join(esp,'src/main.cpp'),'utf8');
 const start=main.indexOf('size_t serializeStructToBlob(const Preset& in');
 assert.ok(start>=0);
 const funcs=main.slice(start,main.indexOf('// DSP PACKET PROCESSING',start)).replace(/\/\/ =+\s*$/,'');
 fs.writeFileSync(path.join(temp,'blob-functions.inc'),funcs);
 execFileSync('g++',['-std=c++17','-I'+path.join(esp,'include'),'-I'+temp,path.join(esp,'test/native/runtime-host.cpp'),'-o',path.join(temp,'host')]);
 process.stdout.write(execFileSync(path.join(temp,'host'),[temp]));
 const canonical=fs.readFileSync(path.join(esp,'include/JmDefaultConfig.hpp'),'utf8').split('R"JMCFG(')[1].split(')JMCFG"')[0];
 assert.equal(canonical,Protocol.buildConfigText(APP_CONFIG),'firmware defaults must match web layout/labels/options');
 const clone=structuredClone(APP_CONFIG);
 readDeviceConfig(Uint8Array.from([1,...new TextEncoder().encode(canonical)]),clone);
 assert.deepEqual(clone,APP_CONFIG);
 const requests=[];globalThis.localStorage={getItem:()=>null,setItem(){}};
 const sync=new WebSync({send:b=>requests.push(b)});sync.start();
 assert.equal(requests.shift()[0],0x37);
 const catalog=fs.readFileSync(path.join(temp,'catalog.bin'));assert.equal(catalog[0],0x38);
 assert.equal(sync.catalog(catalog.subarray(3)),true);
 for(let i=0;i<35;i++){
   const request=requests.shift();assert.equal(request[0],0x39);
   const file=fs.readFileSync(path.join(temp,`slot${request[3]}${request[4]}.bin`));
   assert.equal(file[0],0x3a);assert.equal(sync.slot(file.subarray(3)),true);
   const blob=file.subarray(5),state=Protocol.deserializeState(blob.buffer.slice(blob.byteOffset,blob.byteOffset+blob.length));
   assert.equal(state.master,20);assert.equal(Object.keys(state.effectStates).length,18);assert.equal(state.eqPoints.length,12);
 }
 assert.equal(sync.syncReceived,35);assert.equal(sync.syncFailed,0);
 // Regression guard: these requests must be dispatched by the real firmware.
 for(const cmd of ['0x37','0x39','0x54','0x52'])assert.ok(main.includes('case '+cmd+':'));
 console.log('PASS cross-repository: real firmware helper catalog/slots decode in WebSync, canonical configuration parity');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
