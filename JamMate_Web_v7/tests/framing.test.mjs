import assert from 'node:assert/strict';
import {BLEService as ble} from '../js/services/BLEService.js';
import {Receiver,unpack,packet,DATA,ACK} from '../js/services/Wire.js';
ble.isConnected=ble.configReady=true;ble._session=17;ble._att=20;ble._window=4;ble._epoch=1;
const peer=new Receiver();let lost=false,completed=0,emptyAckLost=false;
ble.characteristic={writeValueWithoutResponse:async b=>{
 const p=unpack(b,17);if(p.type!==DATA)return;
 if(p.offset===8&&!lost){lost=true;return;}
 const r=peer.accept(p);if(r.message)completed++;
 if(r.next!==undefined){if(!p.total&&!emptyAckLost){emptyAckLost=true;return;}const ack=packet(ACK,p.op,p.id,r.next,0,0,17);ble._handleData({target:{value:new DataView(ack.buffer)}});}
}};
await ble.sendMessage(0x91,Uint8Array.from({length:101},(_,i)=>i));assert.equal(completed,1);assert.ok(lost);
await ble.sendMessage(1);assert.equal(completed,2);
const rejected=ble.rxRejected;ble._handleData({target:{value:new DataView(Uint8Array.of(0x7e,1,0).buffer)}});assert.equal(ble.rxRejected,rejected+1);
ble.characteristic={writeValueWithoutResponse:async()=>{}};
const pending=ble.sendMessage(0x20,Uint8Array.of(1,1,33));const failure=assert.rejects(pending,/disconnected/);
await new Promise(resolve=>setTimeout(resolve,5));ble._clear();await failure;
await assert.rejects(ble.sendMessage(0x20,Uint8Array.of(1,1,33)),/disconnected/);
console.log('PASS v8 browser sender: minimum MTU, lost data, empty messages, old-frame rejection and disconnect cancellation');
