import {uploadResource,downloadResource} from './Resources.js?v=8.0';
import {HEADER,MAX,DATA,ACK,HELLO,crc16,packet,unpack,Receiver} from './Wire.js?v=8.0';
import {Protocol} from './Protocol.js?v=8.0';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const asBytes=b=>b instanceof Uint8Array?b:new Uint8Array(b.buffer||b,b.byteOffset||0,b.byteLength);
export const BLEService={
 SERVICE_UUID:'8a8e0001-8a8e-4800-8000-4a616d4d6174',
 CHARACTERISTIC_UUID:'8a8e0002-8a8e-4800-8000-4a616d4d6174',
 NOTIFY_UUID:'8a8e0003-8a8e-4800-8000-4a616d4d6174',
 device:null,isConnected:false,configReady:false,isSyncing:false,shouldReconnect:false,
 configurationError:null,onStatusChange:null,onDataReceived:null,onConfigProgress:null,
 _session:0,_epoch:0,_id:0,_att:20,_window:4,_rx:new Receiver(),_queue:[],_waiters:new Set(),
 _io:Promise.resolve(),_sending:false,_reconnecting:false,_pingBlocked:false,
 rxNotifications:0,rxRejected:0,
 _setStatus(status){this.onStatusChange?.(status);},
 async connect(){
  if(!navigator.bluetooth)throw Error('Web Bluetooth is unavailable in this browser');
  this.shouldReconnect=true;this._setStatus('connecting');
  try{
   this.device=await navigator.bluetooth.requestDevice({filters:[{namePrefix:'JamMate'}],optionalServices:[this.SERVICE_UUID]});
   this._disconnectListener=()=>this._handleDisconnect();
   this.device.addEventListener('gattserverdisconnected',this._disconnectListener);
   await this._connectGatt();
  }catch(e){this.shouldReconnect=false;this.device?.gatt.disconnect();this._clear();this._setStatus('Connection failed: '+e.message);throw e;}
 },
 async _connectGatt(){
  const epoch=++this._epoch;
  this.server=await this.device.gatt.connect();
  const service=await this.server.getPrimaryService(this.SERVICE_UUID);
  this.characteristic=await service.getCharacteristic(this.CHARACTERISTIC_UUID);
  this.notifyCharacteristic=await service.getCharacteristic(this.NOTIFY_UUID);
  this._dataListener=e=>this._handleData(e);
  this.notifyCharacteristic.addEventListener('characteristicvaluechanged',this._dataListener);
  await this.notifyCharacteristic.startNotifications();
  if(epoch!==this._epoch||!this.shouldReconnect)throw Error('Connection cancelled');
  this._session=crypto.getRandomValues(new Uint32Array(1))[0]||1;
  this._att=20;this._rx.reset();this._id=0;this.rxNotifications=this.rxRejected=0;
  this.isConnected=true;this.configReady=false;this.configurationError=null;
  this._setStatus('syncing');
  // HELLO is always 20 bytes, including on the minimum ATT MTU.
  const hello=this._response(b=>b[0]===0,5000);
  await this._write(packet(HELLO,0,0,0,4,0,this._session,Uint8Array.of(8,4,244,0)));
  const caps=await hello;
  if(caps.length!==7||caps[3]!==8)throw Error('ESP does not support JamMate v8');
  this._window=Math.max(1,Math.min(4,caps[4]));this._att=Math.max(20,Math.min(244,caps[5]|caps[6]<<8));
  console.log(`[V8] session ready: ATT=${this._att}, window=${this._window}`);
  await this._readConfiguration();
  if(!this.configReady)throw Error(this.configurationError||'Device configuration not verified');
  // The existing config callback requests current state. Wait for its completion.
  if(!this._stateReceived)await this._response(b=>b[0]===0x31,15000);
  if(epoch!==this._epoch)throw Error('Connection changed during sync');
  this._setStatus('connected');
  this._keepAliveTimer=setInterval(()=>{if(!this._pingBlocked)this.send(Protocol.createPing()).catch(()=>{});},10000);
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
  const char=this.characteristic,epoch=this._epoch;
  const run=this._io.catch(()=>{}).then(async()=>{
   if(!this.isConnected||epoch!==this._epoch||char!==this.characteristic)throw Error('BLE disconnected');
   if(char.writeValueWithoutResponse)await char.writeValueWithoutResponse(bytes);
   else await char.writeValueWithResponse(bytes);
  });this._io=run;return run;
 },
 send(data,active=()=>true){
  const b=asBytes(data);
  if(b.length<3||(b[1]|b[2]<<8)!==b.length-3)return Promise.reject(Error('Invalid v8 command record'));
  return this.sendMessage(b[0],b.subarray(3),active);
 },
 sendMessage(op,data=new Uint8Array(),active=()=>true){
  if(!this.isConnected)return Promise.reject(Error('BLE disconnected'));
  if(!this.configReady&&![0x01,0x52,0x54].includes(op))return Promise.reject(Error(this.configurationError||'Reading device configuration'));
  if(data.length>MAX)return Promise.reject(Error('Transfer block exceeds negotiated message bound'));
  if(this._queue.length>=128)return Promise.reject(Error('Device command queue is full'));
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
  const flight={id,next:0,max:0,complete:false};this._flight=flight;let failures=0,empty=total===0;
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
 _handleData(event){
  const p=unpack(asBytes(event.target.value),this._session);if(!p){this.rxRejected++;return;}this.rxNotifications++;
  if(p.type===ACK){const f=this._flight;if(f&&p.id===f.id&&(p.offset===0||p.offset>=f.next)&&p.offset<=f.max){f.next=p.offset;f.complete=true;this._wake?.();}return;}
  const result=this._rx.accept(p);
  if(result.next!==undefined)this._write(packet(ACK,p.op,p.id,result.next,0,0,this._session)).catch(()=>{});
  if(result.message)this._dispatch(result.message.op,result.message.data);
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
 uploadResource(kind,bytes,name,options){return uploadResource(this,kind,bytes,name,options);},
 downloadResource(kind,options){return downloadResource(this,kind,options);},
 async readCurrentState(timeout=15000){return this.request(Protocol.createGetState(),b=>b[0]===0x31,timeout);},
 async disconnect(){this.shouldReconnect=false;this.device?.gatt.disconnect();this._clear();this._setStatus('disconnected');},
 _clear(){
  ++this._epoch;this.isConnected=false;this.configReady=false;this._stateReceived=false;this._session=0;this._rx.reset();this._wake?.();
  clearInterval(this._keepAliveTimer);this._keepAliveTimer=null;
  if(this.notifyCharacteristic&&this._dataListener)this.notifyCharacteristic.removeEventListener('characteristicvaluechanged',this._dataListener);
  this.characteristic=this.notifyCharacteristic=null;this._io=Promise.resolve();
  for(const q of this._queue.splice(0))q.reject(Error('BLE disconnected'));
  for(const w of this._waiters){clearTimeout(w.timer);w.reject(Error('BLE disconnected'));}this._waiters.clear();
 },
 _handleDisconnect(){this._clear();this._setStatus(this.shouldReconnect?'reconnecting':'disconnected');if(this.shouldReconnect)this._reconnect();},
 async _reconnect(){
  if(this._reconnecting)return;this._reconnecting=true;
  try{for(let attempt=0;attempt<8&&this.shouldReconnect;attempt++){
   await sleep(Math.min(10000,500*2**attempt));if(!this.shouldReconnect)break;
   try{await this._connectGatt();return;}catch(e){console.warn('[V8] reconnect',e.message);this._clear();this.device?.gatt.disconnect();}
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
