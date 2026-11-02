// v8 only. One bounded, binary format for commands, state and resource blocks.
export const HEADER=16, MAX=2048, DATA=1, ACK=2, HELLO=3;
export function crc16(bytes){let c=65535;for(const b of bytes){c^=b;for(let j=0;j<8;j++)c=(c&1)?(c>>>1)^0xa001:c>>>1;}return c;}
export function packet(type,op,id,offset,total,crc,session,data=new Uint8Array()){
 const b=new Uint8Array(HEADER+data.length),v=new DataView(b.buffer);b.set([0xd8,8,type,op]);
 v.setUint16(4,id,true);v.setUint16(6,offset,true);v.setUint16(8,total,true);v.setUint16(10,crc,true);v.setUint32(12,session,true);b.set(data,HEADER);return b;
}
export function unpack(b,session){
 if(!(b instanceof Uint8Array))b=new Uint8Array(b.buffer,b.byteOffset,b.byteLength);
 if(b.length<HEADER||b[0]!==0xd8||b[1]!==8)return null;
 const v=new DataView(b.buffer,b.byteOffset,b.byteLength);if(!session||v.getUint32(12,true)!==session)return null;
 return {type:b[2],op:b[3],id:v.getUint16(4,true),offset:v.getUint16(6,true),total:v.getUint16(8,true),crc:v.getUint16(10,true),data:b.subarray(HEADER)};
}
export class Receiver {
 reset(){this.current=null;}
 constructor(){this.reset();}
 accept(p){
  if(p.type!==DATA||!p.id||p.total>MAX||p.offset>p.total||p.data.length>p.total-p.offset||(!p.data.length&&p.total))return {};
  if(this.current?.id!==p.id){if(p.offset)return {next:0};this.current={...p,used:0,bytes:new Uint8Array(p.total),complete:false};}
  const c=this.current;if(c.op!==p.op||c.total!==p.total||c.crc!==p.crc)return {};
  if(p.offset<c.used||c.complete)return {next:c.used};
  if(p.offset!==c.used)return {next:c.used};
  c.bytes.set(p.data,c.used);c.used+=p.data.length;
  if(c.used!==c.total)return {next:c.used};
  if(crc16(c.bytes)!==c.crc){c.used=0;return {next:0};}
  c.complete=true;return {next:c.used,message:{op:c.op,data:c.bytes}};
 }
}
