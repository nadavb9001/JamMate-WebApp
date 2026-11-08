// All binary resources use the same begin / block / commit writes; completion is not reported by the ESP.
export function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
const kinds={nam:1,ir:2,midi:3};
const record=(op,p)=>{const b=new Uint8Array(p.length+3);b[0]=op;b[1]=p.length&255;b[2]=p.length>>8;b.set(p,3);return b;};
const view=p=>new DataView(p.buffer,p.byteOffset,p.byteLength);
export async function uploadResource(ble,kind,bytes,name,{items=0,onProgress=()=>{}}={}){
 kind=kinds[kind]||kind;bytes=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 if(![1,2,3].includes(kind)||!bytes.length||bytes.length>131072)throw Error('Unsupported resource or size');
 if(ble._resourceBusy)throw Error('Another resource transfer is active');ble._resourceBusy=true;
 const epoch=ble._epoch;
 const id=crypto.getRandomValues(new Uint32Array(1))[0]||1;
 const filename=new TextEncoder().encode(String(name||'resource').replace(/[\x00-\x1f]/g,''));
 if(filename.length>64){ble._resourceBusy=false;throw Error('Filename exceeds 64 UTF-8 bytes; rename the file before uploading');}
 const begin=new Uint8Array(18+filename.length),v=view(begin);v.setUint32(0,id,true);begin[4]=kind;v.setUint32(5,bytes.length,true);v.setUint32(9,crc32(bytes),true);v.setUint32(13,items,true);begin[17]=filename.length;begin.set(filename,18);
 const packets=[record(0x90,begin)];
 try{
  for(let offset=0;offset<bytes.length;offset+=512){
   const end=Math.min(bytes.length,offset+512),p=new Uint8Array(8+end-offset),v=view(p);v.setUint32(0,id,true);v.setUint32(4,offset,true);p.set(bytes.subarray(offset,end),8);packets.push(record(0x91,p));
  }
  const end=new Uint8Array(4);view(end).setUint32(0,id,true);packets.push(record(0x92,end));
  await ble.sendBatch(packets,(done)=>onProgress(Math.min(bytes.length,Math.max(0,done-1)*512),bytes.length));
  return {id,kind,bytes:bytes.length,crc:crc32(bytes),confirmed:false};

 }catch(e){if(ble.isConnected&&ble._epoch===epoch)ble._abortResourceId=id;throw e;}finally{ble._resourceBusy=false;}
}
