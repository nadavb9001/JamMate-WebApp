import {uploadResource} from './Resources.js?v=8.7.1';
import {APP_CONFIG} from '../config.js?v=8.7.1';
import {ActiveSync} from './ActiveSync.js?v=8.7.1';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const bytes=b=>b instanceof Uint8Array?b:new Uint8Array(b);
export const BLEService={
 SERVICE_UUID:'6e400001-b5a3-f393-e0a9-e50e24dcca9f',
 CHARACTERISTIC_UUID:'6e400002-b5a3-f393-e0a9-e50e24dcca9f',
 device:null,characteristic:null,isConnected:false,shouldReconnect:false,lastError:null,onStatusChange:null,
 onSnapshot:null,onDelta:null,onSyncError:null,_pendingJobs:0,_recoveries:0,_epoch:0,_tail:Promise.resolve(),_reconnecting:false,_writeFailed:false,
 _setStatus(s){this.onStatusChange?.(s);},
 async connect(){
  if(!navigator.bluetooth)throw Error('Web Bluetooth is unavailable');
  if(this.device&&this._disconnectListener)this.device.removeEventListener('gattserverdisconnected',this._disconnectListener);
  this._setStatus('connecting');
  this.device=await navigator.bluetooth.requestDevice({filters:[{namePrefix:'JamMate'}],optionalServices:[this.SERVICE_UUID]});
  this.shouldReconnect=true;this._disconnectListener=()=>this._handleDisconnect();
  this.device.addEventListener('gattserverdisconnected',this._disconnectListener);
  try{await this._connectGatt();}catch(e){this.lastError=e.message;this._setStatus('reconnecting');this._reconnect();throw e;}
 },
 async _connectGatt(){
  this._sync?.stop();
  const epoch=++this._epoch,check=()=>{if(epoch!==this._epoch||!this.shouldReconnect)throw Error('Connection cancelled');};
  const server=await this.device.gatt.connect();check();
  const service=await server.getPrimaryService(this.SERVICE_UUID);check();
  const characteristic=await service.getCharacteristic(this.CHARACTERISTIC_UUID);check();
  if(this.characteristic&&this._notifyListener)this.characteristic.removeEventListener('characteristicvaluechanged',this._notifyListener);
  const listener=e=>{if(epoch===this._epoch)this._sync?.handle(new Uint8Array(e.target.value.buffer,e.target.value.byteOffset,e.target.value.byteLength));};
  characteristic.addEventListener('characteristicvaluechanged',listener);
  try{await characteristic.startNotifications();check();}
  catch(e){characteristic.removeEventListener('characteristicvaluechanged',listener);throw e;}
  this._notifyListener=listener;
  this.characteristic=characteristic;this.isConnected=true;this._recoveries=0;this._writeFailed=false;this._tail=Promise.resolve();this.lastError=null;
  this._sync=new ActiveSync({send:p=>this.send(p),busy:()=>this._pendingJobs>0||this._writeFailed,
   onSnapshot:p=>{this._recoveries=0;this.onSnapshot?.(p);},onDelta:p=>this.onDelta?.(p),onError:e=>this.onSyncError?.(e)});
  this._sync.start();this._setStatus('connected');
 },
 send(data){return this.sendBatch([data]);},
 sendMessage(op,data=new Uint8Array()){
  const payload=bytes(data),record=new Uint8Array(payload.length+3);record[0]=op;record[1]=payload.length&255;record[2]=payload.length>>8;record.set(payload,3);return this.send(record);
 },
 sendBatch(records,onSent=()=>{}){
  if(!this.isConnected||!this.characteristic)return Promise.reject(Error('BLE disconnected'));
  if(this._writeFailed)return Promise.reject(Error('Reconnect before sending more commands after the failed write'));
  const packets=records.map(b=>Uint8Array.from(bytes(b))),epoch=this._epoch,char=this.characteristic;
  for(const p of packets)if(p.length<3||p.length>2051||(p[1]|p[2]<<8)!==p.length-3)return Promise.reject(Error('Invalid baseline command record'));
  for(let i=0;i<packets.length;i++){
   const p=packets[i];if(p[0]!==0x20)continue;
   const tab=APP_CONFIG.tabs[p[3]];if(p.length!==6||!tab)return Promise.reject(Error('Invalid effect parameter'));
   const k=tab.params.knobs.length,flat=p[4];if(flat>k+tab.params.dropdowns.length)return Promise.reject(Error('Invalid parameter index'));
   packets[i]=Uint8Array.of(0x28,4,0,p[3],flat===0?0:flat<=k?1:2,flat===0?0:flat<=k?flat-1:flat-k-1,p[5]);
  }
  const check=()=>{if(epoch!==this._epoch||!this.isConnected||char!==this.characteristic)throw Error('BLE disconnected');if(this._writeFailed)throw Error('Reconnect after the failed write');};
  this._pendingJobs++;
  const operation=this._tail.catch(()=>{}).then(async()=>{
   for(let i=0;i<packets.length;i++){
    const p=packets[i];check();
    for(let offset=0;offset<p.length;offset+=20){
     check();const part=p.slice(offset,offset+20);
     try{
      let timer;const write=char.writeValueWithResponse?char.writeValueWithResponse(part):char.writeValue(part);
      try{await Promise.race([write,new Promise((_,reject)=>{timer=setTimeout(()=>{const error=Error('GATT write stalled; reconnect');error.uncertain=true;reject(error);},5000);})]);}finally{clearTimeout(timer);}
     }
     catch(e){if(epoch===this._epoch){this._writeFailed=true;this.lastError=e.message;this.onSyncError?.('Write failed: '+e.message);if(!e.uncertain)this._recoverWrite();}throw e;}
     check();
    }
    onSent(i+1,packets.length);await sleep(20);
   }
  });
  const tracked=operation.finally(()=>{this._pendingJobs--;});this._tail=tracked;return tracked;
 },
 uploadResource(kind,data,name,options){return uploadResource(this,kind,data,name,options);},
 async disconnect(){this.shouldReconnect=false;this.device?.gatt.disconnect();this._clear();this._setStatus('disconnected');},
 _recoverWrite(){
  if(this._writeRecovery||++this._recoveries>3)return;
  const epoch=this._epoch;
  this._writeRecovery=setTimeout(()=>{
   this._writeRecovery=null;if(!this.isConnected||epoch!==this._epoch)return;
   this._writeFailed=false;
   if(this._abortResourceId){const p=new Uint8Array(4);new DataView(p.buffer).setUint32(0,this._abortResourceId,true);this._abortResourceId=null;this.sendMessage(0x93,p).catch(()=>{});}
   this._sync?.fail('Refreshing state after failed write');
   if(this._sync){this._sync.attempts=0;this._sync.requestSnapshot();}
  },2200);
 },
 _clear(){this._abortResourceId=null;this._sync?.stop();clearTimeout(this._writeRecovery);this._writeRecovery=null;if(this.characteristic&&this._notifyListener)this.characteristic.removeEventListener('characteristicvaluechanged',this._notifyListener);++this._epoch;this.isConnected=false;this.characteristic=null;this._writeFailed=false;this._tail=Promise.resolve();},
 _handleDisconnect(){this._clear();this._setStatus(this.shouldReconnect?'reconnecting':'disconnected');if(this.shouldReconnect)this._reconnect();},
 async _reconnect(){
  if(this._reconnecting)return;this._reconnecting=true;
  try{while(this.shouldReconnect){await sleep(1000);if(!this.shouldReconnect)break;try{await this._connectGatt();return;}catch(e){this.lastError=e.message;}}}
  finally{this._reconnecting=false;}
 }
};
