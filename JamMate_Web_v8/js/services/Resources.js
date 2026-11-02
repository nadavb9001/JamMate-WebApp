// All binary resources use the same begin / block / commit / read operations.
export function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
const kinds={nam:1,ir:2,midi:3};
const record=(op,p)=>{const b=new Uint8Array(p.length+3);b[0]=op;b[1]=p.length&255;b[2]=p.length>>8;b.set(p,3);return b;};
const view=p=>new DataView(p.buffer,p.byteOffset,p.byteLength);
export async function uploadResource(ble,kind,bytes,name,{items=0,onProgress=()=>{}}={}){
 kind=kinds[kind]||kind;bytes=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 if(![1,2,3].includes(kind)||!bytes.length||bytes.length>131072)throw Error('Unsupported resource or size');
 if(ble._resourceBusy)throw Error('Another resource transfer is active');ble._resourceBusy=true;
 const id=crypto.getRandomValues(new Uint32Array(1))[0]||1;
 const filename=new TextEncoder().encode(String(name||'resource').replace(/[\x00-\x1f]/g,'').slice(0,48)).slice(0,64);
 const begin=new Uint8Array(18+filename.length),v=view(begin);v.setUint32(0,id,true);begin[4]=kind;v.setUint32(5,bytes.length,true);v.setUint32(9,crc32(bytes),true);v.setUint32(13,items,true);begin[17]=filename.length;begin.set(filename,18);
 const call=async(op,p,phase,timeout=15000)=>{
  const reply=await ble.request(record(op,p),b=>b[0]===0x94&&b.length===13&&view(b).getUint32(3,true)===id&&b[8]===phase,timeout);
  if(reply[7])throw Error(`Resource rejected (status ${reply[7]}, phase ${phase})`);return view(reply).getUint32(9,true);
 };
 try{
  let offset=await call(0x90,begin,0);
  while(offset<bytes.length){
   const end=Math.min(bytes.length,offset+1024),p=new Uint8Array(8+end-offset),v=view(p);v.setUint32(0,id,true);v.setUint32(4,offset,true);p.set(bytes.subarray(offset,end),8);
   const next=await call(0x91,p,1);if(next!==end)throw Error('Unexpected resource acknowledgement offset');offset=next;onProgress(offset,bytes.length);
  }
  const end=new Uint8Array(4);view(end).setUint32(0,id,true);await call(0x92,end,2,120000);
  return {id,kind,bytes:bytes.length,crc:crc32(bytes)};
 }catch(e){
  if(ble.isConnected){const p=new Uint8Array(4);view(p).setUint32(0,id,true);ble.sendMessage(0x93,p).catch(()=>{});}throw e;
 }finally{ble._resourceBusy=false;}
}
export async function downloadResource(ble,kind,{onProgress=()=>{}}={}){
 kind=kinds[kind]||kind;if(![1,2,3].includes(kind))throw Error('Unsupported resource');
 const id=crypto.getRandomValues(new Uint32Array(1))[0]||1;let bytes=null,offset=0,crc=null;
 do{
  const p=new Uint8Array(11),v=view(p);v.setUint32(0,id,true);p[4]=kind;v.setUint32(5,offset,true);v.setUint16(9,1024,true);
  const reply=await ble.request(record(0x95,p),b=>b[0]===0x96&&b.length>=21&&view(b).getUint32(3,true)===id&&view(b).getUint32(13,true)===offset);
  const r=reply.subarray(3),rv=view(r);if(r[4]||r[5]!==kind)throw Error('Resource unavailable');
  const total=rv.getUint32(6,true),sum=rv.getUint32(14,true),data=r.subarray(18);
  if(!total||total>131072||!data.length||offset+data.length>total)throw Error('Invalid resource block');
  if(!bytes){bytes=new Uint8Array(total);crc=sum;}if(bytes.length!==total||crc!==sum)throw Error('Resource changed during download');
  bytes.set(data,offset);offset+=data.length;onProgress(offset,total);
 }while(offset<bytes.length);
 if(crc32(bytes)!==crc)throw Error('Resource checksum failed');return bytes;
}
