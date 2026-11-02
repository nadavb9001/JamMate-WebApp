import {crc16} from './WebSync.js?v=16-uart-tx';

export function fragments(input, id, size=20) {
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
  if(!bytes.length||bytes.length>6144||size<11)throw Error('Invalid BLE frame');
  const out=[],crc=crc16(bytes);
  for(let offset=0;offset<bytes.length;offset+=size-10){
    const part=bytes.slice(offset,offset+size-10),frame=new Uint8Array(10+part.length);
    const v=new DataView(frame.buffer);
    frame.set([0x7e,1]);v.setUint16(2,id,true);v.setUint16(4,offset,true);
    v.setUint16(6,bytes.length,true);v.setUint16(8,crc,true);frame.set(part,10);out.push(frame);
  }
  return out;
}
export class FrameReceiver {
  constructor(){this.pending=new Map();this.completed=new Map();}
  reset(){this.pending.clear();this.completed.clear();}
  accept(bytes,now=Date.now()){
    this.error=null;this.ackOffset=null;
    for(const [id,p] of this.pending)if(now-p.time>5000)this.pending.delete(id);
    if(bytes.length<=10||bytes[0]!==0x7e||bytes[1]!==1)return null;
    const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const id=v.getUint16(2,true),offset=v.getUint16(4,true),total=v.getUint16(6,true),crc=v.getUint16(8,true);
    if(!total||total>6144||offset+bytes.length-10>total){this.pending.delete(id);this.error=`Invalid fragment length id=${id}`;return null;}
    const done=this.completed.get(id);
    if(done&&now-done.time<5000&&done.bytes.length===total&&done.crc===crc&&bytes.subarray(10).every((v,i)=>v===done.bytes[offset+i])){
      this.ackOffset=offset+bytes.length-10;return null;
    }
    if(offset===0){
      if(this.pending.size>=4)this.pending.delete(this.pending.keys().next().value);
      this.pending.set(id,{bytes:new Uint8Array(total),used:0,crc,time:now});
    }
    const p=this.pending.get(id);
    if(p&&p.bytes.length===total&&p.crc===crc&&offset+bytes.length-10<=p.used&&bytes.subarray(10).every((v,i)=>v===p.bytes[offset+i])){
      this.ackOffset=offset+bytes.length-10;return null;
    }
    if(!p||p.bytes.length!==total||p.crc!==crc||p.used!==offset){this.pending.delete(id);this.error=`Fragment gap/metadata mismatch id=${id} offset=${offset}`;return null;}
    p.bytes.set(bytes.subarray(10),offset);p.used+=bytes.length-10;p.time=now;
    if(p.used!==total){this.ackOffset=p.used;return null;}
    this.pending.delete(id);
    if(crc16(p.bytes)!==crc){this.error=`Message CRC mismatch id=${id}`;return null;}
    this.ackOffset=total;
    if(this.completed.size>=4)this.completed.delete(this.completed.keys().next().value);
    this.completed.set(id,{bytes:p.bytes,crc,time:now});
    return p.bytes;
  }
}
