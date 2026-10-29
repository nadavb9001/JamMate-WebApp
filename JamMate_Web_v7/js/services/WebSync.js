// JamMate device-authoritative state replication, protocol v1.
// DSP -> ESP -> Web supplies time and status. Never write cached presets TO
// the device automatically. The cache is a read-only offline mirror.
export const SYNC_CMD = Object.freeze({CATALOG_REQUEST:0x37,CATALOG_DATA:0x38,
  SLOT_REQUEST:0x39,SLOT_DATA:0x3a,PARAM:0x36,BEAT:0x3c,LOOP:0x3d,
  CONTROL:0x3e,SELECTION:0x3f});
export function crc16(bytes) {
  let crc=0xffff;
  for(const byte of bytes){crc ^= byte;for(let j=0;j<8;j++) crc=(crc&1)?((crc>>>1)^0xa001):(crc>>>1);}
  return crc & 65535;
}
const key=(bank,slot)=>`jammate.device.preset.v1.${bank}.${slot}`;
export class WebSync {
  constructor({send,onPreset,onSelection,onParam,onBeat,onLoop,onControl,onStatus}={}) {
    Object.assign(this,{send,onPreset,onSelection,onParam,onBeat,onLoop,onControl,onStatus});
    this.cache=new Map();this.queue=[];this.requesting=null;this.started=false;
    this.lastBeat=null;this.lastBeatAt=0;this.lastBeatMs=500;this.lastLoopAt=0;
    this.lastLoop=null;this.lastSelection=null;this.syncReceived=0;this.expected=0;
    this.syncFailed=0;this.slotStartedAt=0;
  }
  reset() {this.started=false;this.queue=[];this.requesting=null;this.lastBeat=null;
    this.lastLoop=null;this.cache.clear();this.slotStartedAt=0;}
  start() {
    if(this.started)return;
    this.started=true;
    this.send(Uint8Array.of(SYNC_CMD.CATALOG_REQUEST));
  }
  _readLocal(bank,slot){
    let item=this.cache.get(key(bank,slot));
    if(item)return item;
    try {
      const saved=JSON.parse(localStorage.getItem(key(bank,slot)));
      if(saved&&saved.v===1&&typeof saved.hex==='string'&&saved.hex.length<=8192&&saved.hex.length%2===0){
        const arr=Uint8Array.from(saved.hex.match(/../g)||[],n=>parseInt(n,16));
        if(arr.length===saved.len&&crc16(arr)===saved.crc) {item={bytes:arr,crc:saved.crc};this.cache.set(key(bank,slot),item);return item;}
      }
    }catch(_){}return null;
  }
  _cacheSlot(bank,slot,bytes){
    const data=Uint8Array.from(bytes);const crc=crc16(data);
    this.cache.set(key(bank,slot),{bytes:data,crc});
    try {localStorage.setItem(key(bank,slot),JSON.stringify({v:1,len:data.length,crc,
      hex:Array.from(data,b=>b.toString(16).padStart(2,'0')).join('')}));}catch(_){}
  }
  // Export for future user-initiated backup; never silently import to ESP.
  cachedPresets(){return Array.from(this.cache.keys());}
  _nextSlot(){
    if(this.requesting||!this.queue.length)return;
    const item=this.queue.shift();this.requesting={...item,tries:0};
    this._requestSlot();
  }
  _requestSlot(){
    if(!this.requesting)return;
    this.requesting.tries++;
    this.slotStartedAt=Date.now();
    const {bank,slot}=this.requesting;
    this.send(Uint8Array.of(SYNC_CMD.SLOT_REQUEST,2,0,bank,slot));
  }
  checkTimeout(now=Date.now()){
    if(this.requesting && now-this.slotStartedAt>3000){
      if(this.requesting.tries<3)this._requestSlot();
      else this._finishFailedSlot();
    }
  }
  _finishFailedSlot(){
    if(!this.requesting)return;
    const {bank,slot}=this.requesting;
    this.onStatus?.(`Preset ${bank+1}:${slot+1} failed to sync`);
    this.syncFailed++;
    this.requesting=null;
    this._nextSlot();
  }
  catalog(bytes){
    if(bytes.length<2||bytes[0]!==1)return false;
    const n=bytes[1];if(n>35||bytes.length!==2+n*6)return false;
    this.queue=[];this.requesting=null;this.expected=n;this.syncReceived=0;this.syncFailed=0;
    for(let i=0;i<n;i++) {
      const o=2+i*6,bank=bytes[o],slot=bytes[o+1];
      const size=bytes[o+2]|(bytes[o+3]<<8),crc=bytes[o+4]|(bytes[o+5]<<8);
      if(bank>6||slot>4||size<4||size>2048)return false;
      const local=this._readLocal(bank,slot);
      if(!local||local.bytes.length!==size||local.crc!==crc) this.queue.push({bank,slot,size,crc});
    }
    if(this.queue.length) this.onStatus?.(`Syncing ${this.queue.length} changed/missing presets`);
    else this.onStatus?.(`All ${n} presets up to date`);
    this._nextSlot();return true;
  }
  slot(bytes){
    if(bytes.length<2||!this.requesting)return false;
    const {bank,slot,size,crc}=this.requesting;
    if(bytes[0]!==bank||bytes[1]!==slot)return false;
    if(bytes.length===size+2&&crc16(bytes.subarray(2))===crc){
      this._cacheSlot(bank,slot,bytes.subarray(2));this.syncReceived++;
    } else {
      // A truncated notification cannot overwrite the local cache.
      if(this.requesting.tries<3){this._requestSlot();return true;}
      this._finishFailedSlot();return true;
    }
    this.requesting=null;
    if(!this.queue.length)this.onStatus?.(`Preset sync: ${this.syncReceived} updated, ${this.syncFailed} failed`);
    this._nextSlot();return true;
  }
  handle(cmd,bytes){
    if(!(bytes instanceof Uint8Array))bytes=new Uint8Array(bytes);
    if(cmd===SYNC_CMD.CATALOG_DATA)return this.catalog(bytes);
    if(cmd===SYNC_CMD.SLOT_DATA)return this.slot(bytes);
    if(cmd===SYNC_CMD.PARAM){if(bytes.length>=3)this.onParam?.(bytes[0],bytes[1],bytes[2]);return true;}
    if(cmd===0x20||cmd===0x21){if(bytes.length>=(cmd===0x21?2:3))this.onParam?.(bytes[0],cmd===0x21?0:bytes[1],cmd===0x21?bytes[1]:bytes[2]);return true;}
    if(cmd===0x26){if(bytes.length>=1)this.onSelection?.(null,null,bytes[0],null);return true;}
    if(cmd===SYNC_CMD.SELECTION){if(bytes.length===4){
      this.lastSelection=[bytes[0],bytes[1]];this.onSelection?.(...Array.from(bytes));
    }return true;}
    if(cmd===SYNC_CMD.CONTROL){if(bytes.length>=12)this.onControl?.(Array.from(bytes));return true;}
    if(cmd===SYNC_CMD.BEAT){
      if(bytes.length!==16||bytes[0]!==1||!(bytes[1]&1)||!bytes[3]||bytes[2]>=bytes[3])return true;
      const view=new DataView(bytes.buffer,bytes.byteOffset,16);
      const beat={beat:bytes[2],beatsPerBar:bytes[3],bar:view.getUint32(4,true),
        sample:view.getUint32(8,true),bpm10:view.getUint16(12,true),seq:view.getUint16(14,true),
        downbeat:!!(bytes[1]&2),autoStart:!!(bytes[1]&4)};
      // Reject out-of-order/duplicate 16-bit sequence IDs.
      if(this.lastBeat){const d=(beat.seq-this.lastBeat.seq+65536)%65536;if(d===0||d>=0x8000)return true;
        const elapsed=(beat.sample-this.lastBeat.sample)>>>0;
        if(elapsed>0&&elapsed<48000*5*d) this.lastBeatMs=Math.max(100,Math.min(2500,elapsed/(48*d)));
      }else this.lastBeatMs=600000/Math.max(1,beat.bpm10);
      this.lastBeat=beat;this.lastBeatAt=Date.now();this.onBeat?.(beat);return true;
    }
    if(cmd===SYNC_CMD.LOOP){if(bytes.length>=5){
      const states=['IDLE','ARMED','WAIT','REC','PLAY'];
      this.lastLoop={looperState:states[bytes[0]]||'IDLE',layers:bytes[1],
        loopPhase:bytes[2]===255?null:bytes[2]/100,loopMs:bytes[3]|(bytes[4]<<8)};
      this.lastLoopAt=Date.now();this.onLoop?.(this.lastLoop);
    }return true;}
    return false;
  }
  // Used by animation code; no synthetic free-running beat after lost transport.
  timing(){
    if(!this.lastBeat || Date.now()-this.lastBeatAt>2.5*this.lastBeatMs+150)return null;
    return {...this.lastBeat,beatFraction:Math.min(1,(Date.now()-this.lastBeatAt)/this.lastBeatMs)};
  }
}
