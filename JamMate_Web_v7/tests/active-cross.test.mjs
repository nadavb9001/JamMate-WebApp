import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {ActiveSync} from '../js/services/ActiveSync.js';import {Protocol} from '../js/services/Protocol.js';
const esp=path.resolve('../../JamMate_Ctrl'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'jm-active-cross-'));
try{
 const main=fs.readFileSync(path.join(esp,'src/main.cpp'),'utf8'),start=main.indexOf('size_t serializeStructToBlob(const Preset& in, uint8_t* out) {');assert.ok(start>=0);
 let end=main.indexOf('{',start),depth=1;while(depth){end++;if(main[end]==='{')depth++;if(main[end]==='}')depth--;}
 const serializer=main.slice(start,end+1);
 let host=fs.readFileSync(path.join(esp,'test/native/baseline-config-host.cpp'),'utf8').split('static bool chunk(')[0];
 host=host.replace('size_t syncPacketSize(){return 244;}bool sendSyncPacket(const uint8_t*,size_t){return true;}', 'std::vector<std::vector<uint8_t>> sync;size_t syncPacketSize(){return 20;}bool sendSyncPacket(const uint8_t* p,size_t n){sync.emplace_back(p,p+n);return true;}');
 host=host.replace('size_t serializeStructToBlob(const Preset&,uint8_t*){return 0;}',serializer);
 host+=`int main(int argc,char**argv){
  ensureWebConfig();assert(loadFxLayoutFromConfig());currentPreset={};currentPreset.bank=2;currentPreset.number=3;currentPreset.bpm=137;state.volume=38;strcpy(currentPreset.name,"Native ESP");currentPreset.effects[16].knobs[0]=71;currentPreset.effects[16].dropdowns[0]=2;
  requestActiveSnapshot(123);for(unsigned i=0;i<300&&(s_syncRequested||s_syncSending);i++){mockTime+=80;serviceWebSync();}assert(!s_syncSending&&!s_syncRequested);
  const auto sent=btManager.sync.size();for(unsigned i=0;i<100;i++){mockTime+=80;serviceWebSync();}assert(btManager.sync.size()==sent);
  currentPreset.effects[16].knobs[0]=82;mockTime+=80;serviceWebSync();assert(btManager.sync.back()[1]==2);
  currentPreset.bank=4;currentPreset.number=1;mockTime+=80;serviceWebSync();for(unsigned i=0;i<300&&(s_syncRequested||s_syncSending);i++){mockTime+=80;serviceWebSync();}
  std::ofstream f(argv[1],std::ios::binary);for(const auto& p:btManager.sync){const uint8_t n=p.size();f.write((const char*)&n,1);f.write((const char*)p.data(),p.size());}
 }`;
 fs.writeFileSync(path.join(tmp,'host.cpp'),host);execFileSync('g++',['-std=c++17','-I'+path.join(esp,'include'),path.join(tmp,'host.cpp'),'-o',path.join(tmp,'host')]);execFileSync(path.join(tmp,'host'),[path.join(tmp,'packets.bin')]);
 const snapshots=[],deltas=[];const client=new ActiveSync({send:async()=>{},onSnapshot:b=>snapshots.push({bank:b[0],slot:b[1],state:Protocol.deserializeState(b.slice(38).buffer,Array.from({length:18},(_,i)=>[b[2+i*2],b[3+i*2]]))}),onDelta:p=>deltas.push(p)});
 client.running=true;client.pending=123;
 const packets=fs.readFileSync(path.join(tmp,'packets.bin'));for(let off=0;off<packets.length;){const n=packets[off++];client.handle(Uint8Array.from(packets.subarray(off,off+n)));off+=n;}
 assert.equal(snapshots.length,2);assert.equal(snapshots[0].state.effectParams[16].knob0,71);assert.equal(snapshots[0].state.effectParams[16].dropdown0,2);assert.equal(snapshots[0].state.master,38);assert.equal(deltas[0].value,82);assert.equal(snapshots[1].bank,4);assert.equal(snapshots[1].slot,1);client.stop();
 console.log('PASS actual ESP/web interoperability: minimum-MTU snapshots, CRC, canonical serialization, active preset selection, Vintage, changed-only knob delta and idle silence');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
