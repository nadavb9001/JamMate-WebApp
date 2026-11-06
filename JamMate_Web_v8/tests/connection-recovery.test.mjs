import assert from 'node:assert/strict';
import {BLEService as ble} from '../js/services/BLEService.js';
import {uploadResource} from '../js/services/Resources.js';
const listeners=new Set();let subscribe=async()=>{throw Error('Subscribe rejected');};
const characteristic={addEventListener(n,f){listeners.add(f);},removeEventListener(n,f){listeners.delete(f);},startNotifications:()=>subscribe()};
ble.shouldReconnect=true;ble.device={gatt:{async connect(){return {async getPrimaryService(){return {async getCharacteristic(){return characteristic;}};}};}}};
try{
 for(let i=0;i<10;i++){await assert.rejects(ble._connectGatt(),/Subscribe rejected/);assert.equal(listeners.size,0);}
 let release;subscribe=()=>new Promise(resolve=>release=resolve);
 const cancelled=assert.rejects(ble._connectGatt(),/Connection cancelled/);await new Promise(r=>setImmediate(r));
 assert.equal(listeners.size,1);ble._clear();release();await cancelled;assert.equal(listeners.size,0);
 let rejectBatch;const fake={isConnected:true,_epoch:1,sendBatch(){return new Promise((_,reject)=>rejectBatch=reject);}};
 const upload=assert.rejects(uploadResource(fake,'midi',Uint8Array.of(1,2,3),'test.mid'),/Link lost/);
 fake._epoch++;fake.isConnected=false;rejectBatch(Error('Link lost'));await upload;assert.equal(fake._abortResourceId,undefined);assert.equal(fake._resourceBusy,false);
 fake.isConnected=true;fake.sendBatch=async()=>{throw Error('Write rejected');};
 await assert.rejects(uploadResource(fake,'midi',Uint8Array.of(1,2,3),'test.mid'),/Write rejected/);assert.ok(fake._abortResourceId);
 console.log('PASS connection recovery: failed subscriptions leave no listeners, cancelled discovery is isolated, old uploads cannot abort resources on a newer connection');
}finally{ble.shouldReconnect=false;ble._clear();}
