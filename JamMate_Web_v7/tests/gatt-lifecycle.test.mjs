import assert from 'node:assert/strict';
import {BLEService as ble} from '../js/services/BLEService.js';
import {packet,DATA,ACK} from '../js/services/Wire.js';
const frame=(type,id)=>packet(type,0x3e,id,0,0,0,77);
ble.isConnected=true;ble._epoch=1;let release,active=0,maxActive=0;const order=[];
ble.characteristic={
 async writeValueWithoutResponse(b){active++;maxActive=Math.max(active,maxActive);order.push('data'+b[4]);if(b[4]===1)await new Promise(r=>release=r);active--;},
 async writeValueWithResponse(b){active++;maxActive=Math.max(active,maxActive);order.push('ack'+b[4]);active--;}
};
const first=ble._write(frame(DATA,1));await new Promise(r=>setImmediate(r));
const second=ble._write(frame(DATA,2)),ack=ble._write(frame(ACK,3));release();await Promise.all([first,second,ack]);
assert.deepEqual(order,['data1','ack3','data2']);assert.equal(maxActive,1);
// Speed up only the production GATT deadlines, not application logic.
const timer=globalThis.setTimeout;globalThis.setTimeout=(f,ms,...args)=>timer(f,ms===2500||ms===5000?20:ms,...args);
try{
 ble.shouldReconnect=false;ble.device={gatt:{disconnect(){}}};
 let late;ble.characteristic={writeValueWithoutResponse:()=>new Promise(r=>late=r)};
 const stuck=assert.rejects(ble._write(frame(DATA,4)),/BLE write timed out/);
 const queued=assert.rejects(ble._write(frame(ACK,5)),/Session reset/);await Promise.all([stuck,queued]);
 assert.equal(ble.isConnected,true);assert.equal(ble.state,0);assert.equal(ble._gattQueue.length,0);
 ble.isConnected=true;const fresh={writeValueWithResponse:async()=>{}};ble.characteristic=fresh;
 await ble._write(frame(ACK,6));late();await new Promise(r=>setImmediate(r));assert.equal(ble.characteristic,fresh);assert.equal(ble.isConnected,true);
 ble._clear();ble.shouldReconnect=true;
 let finishDiscovery;ble.device={gatt:{connect:async()=>({getPrimaryService:()=>new Promise(r=>finishDiscovery=r)})}};
 await assert.rejects(ble._connectGatt(),/V8 service discovery timed out/);ble._clear();
 ble.characteristic=fresh;finishDiscovery({getCharacteristic:async()=>{throw Error('Stale discovery must not continue');}});
 await new Promise(r=>setImmediate(r));assert.equal(ble.characteristic,fresh);
}finally{globalThis.setTimeout=timer;ble.shouldReconnect=false;ble._clear();}
console.log('PASS GATT lifecycle: confirmed priority ACKs, serialized operations, hung write/discovery deadlines, queued cancellation and late-result isolation');
