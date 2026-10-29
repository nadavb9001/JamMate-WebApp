import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url).pathname;
const packets=[];
const changes=[];
const nodes={
  masterKnob:{knob:{value:20,min:0,max:100,draw(){changes.push('draw')}}},
  bpmKnob:{knob:{value:120,draw(){}}},
  blVolKnob:{knob:{value:50,draw(){}}},
  btEnableCheck:{checked:true},
  bleEnableCheck:{checked:true},
};
const ctx={
  console,ArrayBuffer,Uint8Array,DataView,TextEncoder,TextDecoder,
  setTimeout,clearTimeout,
  Event:class Event{constructor(type){this.type=type;}},
  document:{getElementById(id){return nodes[id]||null;}},
  window:{dispatchEvent(ev){changes.push(ev.type);}},
  View:{updateStatus(){},updateEffectButtons(){}},
  BLEService:{send(buffer){packets.push(new Uint8Array(buffer));}},
  APP_CONFIG:{tabs:[]},
  buildFlatParams(){return []},
};
vm.createContext(ctx);
const p=fs.readFileSync(root+'js/services/Protocol.js','utf8').replace(/^import .*?;\s*$/gm,'').replace('export const Protocol','const Protocol');
vm.runInContext(p+'\nthis.Protocol=Protocol;',ctx);
const a=fs.readFileSync(root+'js/app.js','utf8').replace(/^import .*?;\s*$/gm,'').replace('export const app','const app');
vm.runInContext(a+'\nthis.app=app;',ctx);
const app=ctx.app;
app.isUpdatingUI=false;
app.effectStates={}; app.effectParams={}; app.config={tabs:[]}; app.currentEffect=null;
assert.equal(ctx.Protocol.CMD.SET_MASTER_VOLUME,0x26);
app.sendGlobalUpdate();
assert.equal(packets.at(-1)[0],0x25,'BPM/BT global packet unchanged');
assert.equal(packets.at(-1)[3],20,'packet currently contains UI volume but ESP must ignore it');
app.sendMasterVolumeUpdate();
assert.deepEqual([...packets.at(-1)],[0x26,1,0,20]);
nodes.masterKnob.knob.value=63;
app.sendMasterVolumeUpdate();
assert.deepEqual([...packets.at(-1)],[0x26,1,0,63]);
const state=ctx.Protocol.serializeState({bpm:128,master:63,name:'Sound',effectStates:{},effectParams:{}});
assert.equal(new Uint8Array(state)[2],63,'preset blob serializes actual level, never hardcodes 100');
const history=new Uint8Array([0x03,120,100,0]);
// A preset load with an old 100% byte must not change global volume.
app.loadStateFromBlob(history.buffer,false);
assert.equal(nodes.masterKnob.knob.value,63);
// GET_STATE response is authoritative for ESP's live master (20 on boot).
const handshake=new Uint8Array([0x03,120,20,0]);
app.loadStateFromBlob(handshake.buffer,true);
assert.equal(nodes.masterKnob.knob.value,20);
assert(changes.includes('jammate:master-volume'));
// A physical ESP volume change is reflected without transmitting a command.
const n=packets.length;
app.syncMasterVolume(44);
assert.equal(nodes.masterKnob.knob.value,44);
assert.equal(packets.length,n);
app.isUpdatingUI=false; // loadStateFromBlob suppresses outbound packets during its UI-refresh window
app.sendGlobalUpdate();
assert.equal(packets.at(-1)[0],0x25);
assert.equal(new Uint8Array(ctx.Protocol.createMasterVolumeUpdate(200))[3],100);
console.log('PASS: global master explicit 0x26, boot sync 20%, old preset 100% ignored, independent BPM packets');
