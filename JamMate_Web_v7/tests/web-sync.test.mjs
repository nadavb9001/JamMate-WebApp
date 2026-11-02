import assert from 'node:assert/strict';
import {WebSync,crc16,SYNC_CMD} from '../js/services/WebSync.js';
const data=new Map();
globalThis.localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
const send=[],received=[],changes=[],controls=[],selections=[];
const create=()=>new WebSync({send:p=>send.push(Array.from(p)),onParam:(...a)=>changes.push(a),onControl:c=>controls.push(c),onSelection:(...a)=>selections.push(a),onStatus:s=>received.push(s)});
const blobs=Array.from({length:35},(_,i)=>Uint8Array.of(3,120,20,1,65+i%10,1,2,i,37,6));
const manifest=()=>{
 const m=[1,35];for(let bank=0;bank<7;bank++)for(let slot=0;slot<5;slot++){
 const b=blobs[bank*5+slot],h=crc16(b);
 m.push(bank,slot,b.length&255,b.length>>8,h&255,h>>8);
 }return Uint8Array.from(m);
};
assert.equal(crc16(Uint8Array.from([1,2,3,4,5])),0xbb2a);
const s=create();s.start();s.start();assert.deepEqual(send.shift(),[SYNC_CMD.CATALOG_REQUEST,0,0]);
assert.equal(s.handle(SYNC_CMD.CATALOG_DATA,manifest()),true);
assert.equal(s.expected,35);assert.equal(s.queue.length,34);assert.deepEqual(send.shift(),[0x39,2,0,0,0]);
for(let i=0;i<35;i++) {
 const bank=(i/5)|0,slot=i%5;
 assert.equal(s.handle(SYNC_CMD.SLOT_DATA,Uint8Array.from([bank,slot,...blobs[i]])),true);
 if(i<34)assert.deepEqual(send.shift(),[0x39,2,0,((i+1)/5)|0,(i+1)%5]);
}
assert.equal(s.syncReceived,35);assert.equal(s.queue.length,0);assert.equal(s.cachedPresets().length,35);
assert.equal(s.catalog(Uint8Array.from([1,36])),false);
const reconnect=create();reconnect.start();send.length=0;reconnect.catalog(manifest());assert.equal(reconnect.queue.length,0);
blobs[12]=Uint8Array.of(3,122,20,1,78,2,3,77,31,9);
reconnect.catalog(manifest());assert.equal(reconnect.queue.length,0); // requesting one
assert.deepEqual(send.shift(),[0x39,2,0,2,2]);
const corruption=Uint8Array.from([2,2,...blobs[12]]);corruption[3]^=1;
reconnect.slot(corruption);assert.deepEqual(send.shift(),[0x39,2,0,2,2]); // retry corrupted slot
reconnect.slot(Uint8Array.from([2,2,...blobs[12]]));assert.equal(reconnect._readLocal(2,2).crc,crc16(blobs[12]));
reconnect.handle(0x36,Uint8Array.of(2,4,77));reconnect.handle(0x36,Uint8Array.of(1,0,0));
assert.deepEqual(changes.slice(-2),[[2,4,77],[1,0,0]]);
reconnect.handle(0x27,Uint8Array.of(2,3,1,44,55));assert.deepEqual(changes.slice(-3),[[2,0,1],[2,1,44],[2,2,55]]);
reconnect.handle(SYNC_CMD.SELECTION,Uint8Array.of(5,4,20,120));assert.deepEqual(selections.at(-1),[5,4,20,120]);
assert.equal(reconnect.handle(0x3c,new Uint8Array(16)),false);
assert.equal(reconnect.handle(0x3d,new Uint8Array(6)),false);
reconnect.handle(SYNC_CMD.CONTROL,Uint8Array.of(1,80,0,2,120,1,100,2,0,4,0,0));assert.equal(controls.at(-1)[6],100);
// Timeout re-requests are bounded and cannot upload corrupt data.
const timed=create();timed.catalog(manifest());assert.equal(timed.requesting,null); // all cached
blobs[7]=Uint8Array.of(3,120,20,4,71,19,44,55);
timed.catalog(manifest());assert.equal(timed.requesting.tries,1);
timed.checkTimeout(timed.slotStartedAt+15001);assert.equal(timed.requesting.tries,2);
timed.checkTimeout(timed.slotStartedAt+15001);assert.equal(timed.requesting.tries,3);
timed.checkTimeout(timed.slotStartedAt+15001);assert.equal(timed.syncFailed,1);
reconnect.reset();assert.equal(reconnect.started,false);
const missing=create();missing.start();
missing.checkTimeout(missing.catalogStartedAt+10001);assert.equal(missing.catalogTries,2);
missing.checkTimeout(missing.catalogStartedAt+10001);assert.equal(missing.catalogTries,3);
missing.checkTimeout(missing.catalogStartedAt+10001);assert.equal(missing.started,false);
const partial=manifest();partial[4]=0;partial[5]=0;
const corruptSlot=create();assert.equal(corruptSlot.catalog(partial),true);assert.equal(corruptSlot.syncFailed,1);
const duplicate=manifest();duplicate[8]=duplicate[2];duplicate[9]=duplicate[3];assert.equal(create().catalog(duplicate),false);
console.log('PASS web-sync: CRC parity, 35 slots, reconnect diff, corrupted download, parameters, selection, removed live telemetry, controls');
