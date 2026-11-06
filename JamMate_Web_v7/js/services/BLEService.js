import {uploadResource} from './Resources.js?v=8.6';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const bytes=b=>b instanceof Uint8Array?b:new Uint8Array(b);
export const BLEService={
 SERVICE_UUID:'6e400001-b5a3-f393-e0a9-e50e24dcca9f',
 CHARACTERISTIC_UUID:'6e400002-b5a3-f393-e0a9-e50e24dcca9f',
 device:null,characteristic:null,isConnected:false,shouldReconnect:false,lastError:null,onStatusChange:null,
 _epoch:0,_tail:Promise.resolve(),_reconnecting:false,_writeFailed:false,
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
  const epoch=++this._epoch,check=()=>{if(epoch!==this._epoch||!this.shouldReconnect)throw Error('Connection cancelled');};
  const server=await this.device.gatt.connect();check();
  const service=await server.getPrimaryService(this.SERVICE_UUID);check();
  const characteristic=await service.getCharacteristic(this.CHARACTERISTIC_UUID);check();
  this.characteristic=characteristic;this.isConnected=true;this._writeFailed=false;this._tail=Promise.resolve();this.lastError=null;
  this._setStatus('connected'); // No handshake, reads, subscription or state requests.
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
  const check=()=>{if(epoch!==this._epoch||!this.isConnected||char!==this.characteristic)throw Error('BLE disconnected');if(this._writeFailed)throw Error('Reconnect after the failed write');};
  const operation=this._tail.catch(()=>{}).then(async()=>{
   for(let i=0;i<packets.length;i++){
    const p=packets[i];check();
    for(let offset=0;offset<p.length;offset+=20){
     check();const part=p.slice(offset,offset+20);
     try{if(char.writeValueWithResponse)await char.writeValueWithResponse(part);else await char.writeValue(part);}
     catch(e){if(epoch===this._epoch){this._writeFailed=true;this.lastError=e.message;this._setStatus('Write failed: '+e.message);}throw e;}
     check();
    }
    onSent(i+1,packets.length);await sleep(20);
   }
  });
  this._tail=operation;return operation;
 },
 uploadResource(kind,data,name,options){return uploadResource(this,kind,data,name,options);},
 async disconnect(){this.shouldReconnect=false;this.device?.gatt.disconnect();this._clear();this._setStatus('disconnected');},
 _clear(){++this._epoch;this.isConnected=false;this.characteristic=null;this._writeFailed=false;this._tail=Promise.resolve();},
 _handleDisconnect(){this._clear();this._setStatus(this.shouldReconnect?'reconnecting':'disconnected');if(this.shouldReconnect)this._reconnect();},
 async _reconnect(){
  if(this._reconnecting)return;this._reconnecting=true;
  try{while(this.shouldReconnect){await sleep(1000);if(!this.shouldReconnect)break;try{await this._connectGatt();return;}catch(e){this.lastError=e.message;}}}
  finally{this._reconnecting=false;}
 }
};
