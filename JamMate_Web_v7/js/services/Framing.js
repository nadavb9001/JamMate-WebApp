import {crc16} from './WebSync.js?v=14-sync-recovery';

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
  constructor(){this.pending=new Map();}
  reset(){this.pending.clear();}
  accept(bytes,now=Date.now()){
    for(const [id,p] of this.pending)if(now-p.time>5000)this.pending.delete(id);
    if(bytes.length<=10||bytes[0]!==0x7e||bytes[1]!==1)return null;
    const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const id=v.getUint16(2,true),offset=v.getUint16(4,true),total=v.getUint16(6,true),crc=v.getUint16(8,true);
    if(!total||total>6144||offset+bytes.length-10>total){this.pending.delete(id);return null;}
    if(offset===0){
      if(this.pending.size>=4)this.pending.delete(this.pending.keys().next().value);
      this.pending.set(id,{bytes:new Uint8Array(total),used:0,crc,time:now});
    }
    const p=this.pending.get(id);
    if(!p||p.bytes.length!==total||p.crc!==crc||p.used!==offset){this.pending.delete(id);return null;}
    p.bytes.set(bytes.subarray(10),offset);p.used+=bytes.length-10;p.time=now;
    if(p.used!==total)return null;
    this.pending.delete(id);
    return crc16(p.bytes)===crc?p.bytes:null;
  }
}
