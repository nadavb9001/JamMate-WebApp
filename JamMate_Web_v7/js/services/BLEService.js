import {uploadResource,downloadResource} from './Resources.js?v=8.4.1';
import {HEADER,MAX,DATA,ACK,HELLO,crc16,packet,unpack,Receiver} from './Wire.js?v=8.4.1';
import {Protocol} from './Protocol.js?v=8.4.1';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const deadline=(action,label,ms=5000)=>{
 let timer;return Promise.race([Promise.resolve().then(action),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' timed out')),ms);})]).finally(()=>clearTimeout(timer));
};
const asBytes=b=>b instanceof Uint8Array?b:new Uint8Array(b.buffer||b,b.byteOffset||0,b.byteLength);
export const BLEService={
 SERVICE_UUID:'8a8e0001-8a8e-4800-8000-4a616d4d6174',
 CHARACTERISTIC_UUID:'8a8e0002-8a8e-4800-8000-4a616d4d6174',
 NOTIFY_UUID:'8a8e0003-8a8e-4800-8000-4a616d4d6174',
 device:null,isConnected:false,configReady:false,isSyncing:false,shouldReconnect:false,
 configUploading:false,_sessionReady:false,lastError:null,configurationError:null,onStatusChange:null,onDataReceived:null,onConfigProgress:null,
 _session:0,_epoch:0,_id:0,_att:20,_window:4,_rx:new Receiver(),_queue:[],_waiters:new Set(),
 _gattQueue:[],_gattBusy:false,_sending:false,_reconnecting:false,_pingBlocked:false,
 rxNotifications:0,rxRejected:0,rxReadbacks:0,
 _readTimer:null,_readBusy:false,_lastNotifyAt:0,_recoverUntil:0,_usingReadback:false,_stateRecovery:null,
 _setStatus(status){this.onStatusChange?.(status);},
 async connect(){
  if(!navigator.bluetooth)throw Error('Web Bluetooth is unavailable in this browser');
  this.shouldReconnect=true;this._setStatus('connecting');
  try{
   if(this.device&&this._disconnectListener)this.device.removeEventListener('gattserverdisconnected',this._disconnectListener);
   this.device=await navigator.bluetooth.requestDevice({filters:[{namePrefix:'JamMate'}],optionalServices:[this.SERVICE_UUID]});
   this._disconnectListener=()=>this._handleDisconnect();
   this.device.addEventListener('gattserverdisconnected',this._disconnectListener);
   await this._connectGatt();
  }catch(e){this.lastError=e.message;this.shouldReconnect=false;this.device?.gatt.disconnect();this._clear();this._setStatus('Connection failed: '+e.message);throw e;}
 },
 async _connectGatt(){
  const epoch=++this._epoch;
  const check=()=>{if(epoch!==this._epoch||!this.shouldReconnect)throw Error('Connection cancelled');};
  const server=await deadline(()=>this.device.gatt.connect(),'GATT connection',10000);check();this.server=server;
  const service=await deadline(()=>server.getPrimaryService(this.SERVICE_UUID),'V8 service discovery');check();
  const write=await deadline(()=>service.getCharacteristic(this.CHARACTERISTIC_UUID),'RX discovery');check();
  const notify=await deadline(()=>service.getCharacteristic(this.NOTIFY_UUID),'TX discovery');check();
  if(write.properties?.read===false||notify.properties?.read===false)throw Error('Install v8.3 firmware. If already installed, forget/re-pair JamMate to refresh its Bluetooth services.');
  this.characteristic=write;this.notifyCharacteristic=notify;
  this._dataListener=e=>{if(epoch===this._epoch)this._handleData(e);};
  notify.addEventListener('characteristicvaluechanged',this._dataListener);
  await deadline(()=>notify.startNotifications(),'Notification subscription');check();
  this._session=crypto.getRandomValues(new Uint32Array(1))[0]||1;
  this._att=20;this._rx.reset();this._id=0;this.rxNotifications=this.rxRejected=0;
  this._sessionReady=false;this.isConnected=true;this._lastNotifyAt=Date.now();this._recoverUntil=Date.now()+6000;this._usingReadback=false;this._readBusy=false;this.rxReadbacks=0;
  clearTimeout(this._readTimer);this._readTimer=null;this._armReadback();
  this.configReady=false;this.configurationError=null;
  this._setStatus('syncing');
  // HELLO is always 20 bytes, including on the minimum ATT MTU.
  const hello=this._response(b=>b[0]===0,5000);
  await this._write(packet(HELLO,0,0,0,4,0,this._session,Uint8Array.of(8,4,244,0)));
  const caps=await hello;
  if(caps.length!==7||caps[3]!==8)throw Error('ESP does not support JamMate v8');
  if(!(caps[4]&0x80))throw Error('Install firmware v8.3 for notification recovery');
  this._window=Math.max(1,Math.min(4,caps[4]&15));this._att=Math.max(20,Math.min(244,caps[5]|caps[6]<<8));
  this._sessionReady=true;
  console.log(`[V8] session ready: ATT=${this._att}, window=${this._window}`);
  try{await this._readConfiguration();}catch(e){if(!this.isConnected)throw e;this.configurationError=e.message;}
  if(!this.configReady){
    this.lastError=this.configurationError||'Device configuration not verified';
    this._setStatus('configuration-required');return;
  }
  // The existing config callback requests current state. Wait for its completion.
  if(!this._stateReceived)await this._response(b=>b[0]===0x31,15000);
  if(epoch!==this._epoch)throw Error('Connection changed during sync');
  this.lastError=null;this._setStatus('connected');
 },
 _response(matches,timeout){
  let waiter;
  const promise=new Promise((resolve,reject)=>{
   waiter={matches,resolve,reject};waiter.timer=setTimeout(()=>{this._waiters.delete(waiter);reject(Error('Device response timed out'));},timeout);this._waiters.add(waiter);
  });
  promise.cancel=()=>{clearTimeout(waiter.timer);this._waiters.delete(waiter);};
  promise.catch(()=>{});return promise;
 },
 request(data,matches,timeout=15000){
  const response=this._response(matches,timeout);let active=true;
  return Promise.all([this.send(data,()=>active),response]).then(([,reply])=>reply).finally(()=>{active=false;response.cancel();});
 },
 _write(bytes){
  const priority=bytes[2]===ACK||bytes[2]===HELLO;
  return new Promise((resolve,reject)=>{
   this._gattQueue.push({bytes,priority,epoch:this._epoch,char:this.characteristic,resolve,reject});this._drainGatt();
  });
 },
 _read(char){
  return new Promise((resolve,reject)=>{this._gattQueue.push({read:true,priority:true,epoch:this._epoch,char,resolve,reject});this._drainGatt();});
 },
 _recoveryPending(){
  return this.isConnected&&!!(this._flight||this._waiters.size||(Date.now()<=this._recoverUntil&&((this._rx.current&&!this._rx.current.complete)||(this._stateRecovery&&Date.now()<this._stateRecovery.until))));
 },
 _armReadback(){
  if(this._readTimer||!this.isConnected)return;
  this._readTimer=setTimeout(()=>{
   this._readTimer=null;this._recoverReadback().finally(()=>{if(this._recoveryPending())this._armReadback();});
  },250);
 },
 async _recoverReadback(){
  if(!this._recoveryPending()||this._readBusy||Date.now()-this._lastNotifyAt<600)return;
  if(!this.characteristic?.readValue||!this.notifyCharacteristic?.readValue)return;
  this._readBusy=true;const epoch=this._epoch;
  try{
   for(const char of (this._flight?[this.characteristic,this.notifyCharacteristic]:[this.notifyCharacteristic])){
    const value=await this._read(char);if(epoch!==this._epoch)return;
    if(value.byteLength>=HEADER&&value.getUint8(0)===0xd8){
     if(!this._usingReadback){this._usingReadback=true;console.warn('[V8] Notification recovery using active-transfer readback');}
     this._handleData({target:{value}},'read');
    }
   }
  }catch(e){if(epoch===this._epoch)console.warn('[V8] Readback:',e.message);}
  finally{if(epoch===this._epoch)this._readBusy=false;}
 },
 async _drainGatt(){
  if(this._gattBusy)return;this._gattBusy=true;
  try{while(this._gattQueue.length){
   const high=this._gattQueue.findIndex(q=>q.priority),q=this._gattQueue.splice(high<0?0:high,1)[0];
   if(!this.isConnected||q.epoch!==this._epoch||(q.char!==this.characteristic&&q.char!==this.notifyCharacteristic)){q.reject(Error('BLE disconnected'));continue;}
   try{
    const value=await deadline(()=>{
     if(q.read)return q.char.readValue();
     // Confirm transport ACKs/HELLO at GATT level. Bulk DATA retains fast WNR.
     if(q.priority&&q.char.writeValueWithResponse)return q.char.writeValueWithResponse(q.bytes);
     if(q.char.writeValueWithoutResponse)return q.char.writeValueWithoutResponse(q.bytes);
     return q.char.writeValueWithResponse(q.bytes);
    },q.read?'Transfer readback':q.bytes[2]===ACK?'Transport ACK write':'BLE write',2500);
    if(q.epoch!==this._epoch)throw Error('BLE disconnected');q.resolve(value);
   }catch(e){q.reject(e);if(q.epoch===this._epoch){this.lastError=e.message;console.error('[V8]',e.message);this.device?.gatt.disconnect();this._handleDisconnect();}}
  }}finally{this._gattBusy=false;if(this._gattQueue.length)this._drainGatt();}
 },
 send(data,active=()=>true){
  const b=asBytes(data);
  if(b.length<3||(b[1]|b[2]<<8)!==b.length-3)return Promise.reject(Error('Invalid v8 command record'));
  return this.sendMessage(b[0],b.subarray(3),active);
 },
 sendMessage(op,data=new Uint8Array(),active=()=>true){
  if(!this.isConnected)return Promise.reject(Error('BLE disconnected'));
  if((!this.configReady||this.configUploading)&&![0x01,0x52,0x54].includes(op))return Promise.reject(Error(this.configurationError||'Reading device configuration'));
  if(data.length>MAX)return Promise.reject(Error('Transfer block exceeds negotiated message bound'));
  if(this._queue.length>=128)return Promise.reject(Error('Device command queue is full'));
  this._recoverUntil=Date.now()+6000;
  const replies=op===0x37?[0x38]:op===0x39?[0x3a]:op===0x30?[0x31]:op===0x54?[0x55]:op===0x47||op===0x41||op===0x42?[0x3e]:op===0x32||op===0x33?[0x34]:op===0x20||op===0x27?[0x36,0x27,0x34]:op===0x22?[0x22,0x34]:op===0x25||op===0x26?[0x3f,0x26]:op===0x23||op===0x43||op===0x44?[0x49,0x3e]:op===0x24?[0x3e]:op===0x40?[0x57]:null;
  if(replies)this._stateRecovery={ops:replies,until:this._recoverUntil};
  this._armReadback();
  return new Promise((resolve,reject)=>{
   this._queue.push({op,active,data:Uint8Array.from(data),priority:data.length>200?1:0,epoch:this._epoch,resolve,reject});this._pump();
  });
 },
 async _pump(){
  if(this._sending)return;this._sending=true;
  try{while(this._queue.length&&this.isConnected){
   const index=this._queue.findIndex(q=>q.priority===0),q=this._queue.splice(index<0?0:index,1)[0];
   if(!q.active()){q.reject(Error('Device request expired'));continue;}
   try{await this._transfer(q);q.resolve();}catch(e){q.reject(e);if(q.epoch===this._epoch)this.device?.gatt.disconnect();}
  }}finally{this._sending=false;if(this._queue.length&&this.isConnected)this._pump();}
 },
 async _transfer(q){
  const id=this._id=this._id%65535+1,total=q.data.length,crc=crc16(q.data),chunk=this._att-HEADER;
  const flight={id,op:q.op,next:0,max:0,complete:false};this._flight=flight;let failures=0,empty=total===0;
  try{do{
   if(q.epoch!==this._epoch||!this.isConnected)throw Error('BLE disconnected');
   if(!q.active())throw Error('Device request expired');
   const base=flight.next;let end=base;empty=total===0;
   for(let w=0;w<this._window&&(end<total||empty);w++){
    const bytes=q.data.subarray(end,Math.min(end+chunk,total));flight.max=end+bytes.length;
    await this._write(packet(DATA,q.op,id,end,total,crc,this._session,bytes));end+=bytes.length;empty=false;
   }
   const until=Date.now()+1000;
   while((flight.next<end||(!total&&!flight.complete))&&Date.now()<until&&q.epoch===this._epoch){
    await new Promise(resolve=>{const timer=setTimeout(()=>{this._wake=null;resolve();},Math.max(1,until-Date.now()));this._wake=()=>{clearTimeout(timer);this._wake=null;resolve();};});
   }
   if(flight.next===base&&(total||!flight.complete)){if(++failures>=4)throw Error('BLE acknowledgement timed out');}else failures=0;
  }while(flight.next<total||(!total&&!flight.complete));
  }finally{if(this._flight===flight)this._flight=null;}
 },
 _handleData(event,source='notify'){
  if(source==='notify')this._lastNotifyAt=Date.now();else this.rxReadbacks++;
  const p=unpack(asBytes(event.target.value),this._session);if(!p){this.rxRejected++;return;}if(source==='notify')this.rxNotifications++;
  if(p.type===ACK){const f=this._flight;if(f&&p.id===f.id&&p.op===f.op&&(p.offset===0||p.offset>=f.next)&&p.offset<=f.max){f.next=p.offset;f.complete=true;this._wake?.();}return;}
  const result=this._rx.accept(p);
  if(result.next!==undefined)this._write(packet(ACK,p.op,p.id,result.next,0,0,this._session)).catch(()=>{});
  if(result.message){
   if(this._stateRecovery?.ops.includes(result.message.op))this._stateRecovery=null;
   this._dispatch(result.message.op,result.message.data);
  }
 },
 _dispatch(op,data){
  const record=new Uint8Array(data.length+3);record[0]=op;record[1]=data.length&255;record[2]=data.length>>8;record.set(data,3);
  // Response predicates consume the same bounded domain records as builders.
  // These records are in-process values; only Wire.js packets go over BLE.
  const rawOps=new Set([0x53,0x59]);
  const match=rawOps.has(op)?Uint8Array.of(op,...data):record;
  for(const w of this._waiters)if(w.matches(match)){clearTimeout(w.timer);this._waiters.delete(w);w.resolve(match);}
  if(op===0)return;
  if(op===0x31)this._stateReceived=true;
  if(op===0x55&&data[0]===2)return; // config pages only reach their assembler
  this.onDataReceived?.({cmd:op,dataView:new DataView(data.buffer,data.byteOffset,data.length)});
 },
 beginConfigurationUpload(){
  if(!this.isConnected||!this._sessionReady)throw Error('Wait for the BLE session before uploading configuration');
  this.configUploading=true;this.configReady=false;this._stateReceived=false;this._stateRecovery=null;
  const keep=[];for(const q of this._queue){if(q.op===0x52||q.op===0x54)keep.push(q);else q.reject(Error('Configuration upload paused normal synchronization'));}this._queue=keep;
 },
 uploadResource(kind,bytes,name,options){return uploadResource(this,kind,bytes,name,options);},
 downloadResource(kind,options){return downloadResource(this,kind,options);},
 async readCurrentState(timeout=15000){return this.request(Protocol.createGetState(),b=>b[0]===0x31,timeout);},
 async disconnect(){this.shouldReconnect=false;this.device?.gatt.disconnect();this._clear();this._setStatus('disconnected');},
 _clear(){
  ++this._epoch;clearTimeout(this._readTimer);this._readTimer=null;this.isConnected=false;this.configReady=false;this.configUploading=false;this._sessionReady=false;this._stateReceived=false;this._stateRecovery=null;this._session=0;this._rx.reset();this._wake?.();
  if(this.notifyCharacteristic&&this._dataListener)this.notifyCharacteristic.removeEventListener('characteristicvaluechanged',this._dataListener);
  this.characteristic=this.notifyCharacteristic=null;
  for(const q of this._gattQueue.splice(0))q.reject(Error('BLE disconnected'));
  for(const q of this._queue.splice(0))q.reject(Error('BLE disconnected'));
  for(const w of this._waiters){clearTimeout(w.timer);w.reject(Error('BLE disconnected'));}this._waiters.clear();
 },
 _handleDisconnect(){this._clear();this._setStatus(this.shouldReconnect?'reconnecting':'disconnected');if(this.shouldReconnect)this._reconnect();},
 async _reconnect(){
  if(this._reconnecting)return;this._reconnecting=true;
  try{for(let attempt=0;attempt<8&&this.shouldReconnect;attempt++){
   await sleep(Math.min(10000,500*2**attempt));if(!this.shouldReconnect)break;
   try{await this._connectGatt();if(!this.isConnected)throw Error('Connection dropped during sync');return;}catch(e){this.lastError=e.message;console.warn('[V8] reconnect',e.message);this._clear();this.device?.gatt.disconnect();}
  }if(this.shouldReconnect){this.shouldReconnect=false;this._setStatus('disconnected');}
  }finally{this._reconnecting=false;}
 },
    async _readConfiguration(timeout=4000){
        const deadline=Date.now()+120000;
        let offset=0,expectedCrc=null,assembled=null;
        for(;;){
            let reply;
            for(let attempt=0;attempt<3;attempt++){
                if(Date.now()>deadline)throw Error('Configuration download timed out');
                try{
                    const packet=Uint8Array.of(0x54,4,0,offset&255,offset>>8,96,0);
                    reply=await this.request(packet,b=>b[0]===0x55&&(b.length>=10&&b[3]===2&&(b[6]|b[7]<<8)===offset),timeout);
                    break;
                }catch(e){
                    if(!this.isConnected)throw e;
                    if(attempt===2)throw Error(`Config read stopped at ${offset} bytes; received ${this.rxNotifications} notifications, rejected ${this.rxRejected} frames: ${e.message}`);
                }
            }
            const total=reply[4]|reply[5]<<8,crc=reply[8]|reply[9]<<8,data=reply.subarray(10);
            if(!total||total>4096||!data.length||data.length>96||offset+data.length>total)throw Error('Invalid configuration page');
            if(!assembled){assembled=new Uint8Array(total);expectedCrc=crc;}
            if(assembled.length!==total||expectedCrc!==crc)throw Error('Device configuration changed during read');
            assembled.set(data,offset);offset+=data.length;
            this.onConfigProgress?.(offset,total);
            if(offset===total){
                if(crc16(assembled)!==expectedCrc)throw Error('Configuration checksum failed');
                const payload=Uint8Array.from([1,...assembled]),frame=new Uint8Array(payload.length+3);
                frame[0]=0x55;frame[1]=payload.length&255;frame[2]=payload.length>>8;frame.set(payload,3);
                this.onDataReceived?.({cmd:0x55,dataView:new DataView(payload.buffer)});
                return frame;
            }
        }
    },

};
