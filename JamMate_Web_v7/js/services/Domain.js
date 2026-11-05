// Counts describe the sender's config, never replace the receiver's config.
export const configLayout=config=>config.tabs.map(t=>[t.params.knobs.length,t.params.dropdowns.length]);
export function wrapPreset(data,layout,prefix=0){
 const out=new Uint8Array(data.length+37);out.set(data.subarray(0,prefix));out[prefix]=4;out.set(layout.flat(),prefix+1);out.set(data.subarray(prefix),prefix+37);return out;
}
export function unwrapPreset(data,prefix=0){
 if(data.length<prefix+41||data[prefix]!==4)throw Error('Invalid BLE preset layout envelope');
 const layout=Array.from({length:18},(_,i)=>[data[prefix+1+i*2],data[prefix+2+i*2]]);
 if(layout.some(([k,d])=>k>16||d>10)||data[prefix+37]!==3)throw Error('Invalid BLE preset counts');
 const blob=data.subarray(prefix+37);let off=4+blob[3],seen=0;
 if(blob[3]>31||off>blob.length)throw Error('Invalid BLE preset name');
 while(off<blob.length){
  if(off+2>blob.length)throw Error('Truncated BLE preset');
  const fx=blob[off++],count=blob[off++];
  if(fx===0xfe){if(count>12||off+count*5!==blob.length)throw Error('Invalid BLE EQ data');off=blob.length;break;}
  if(fx>=18||(seen&(1<<fx))||count!==1+layout[fx][0]+layout[fx][1]||off+count>blob.length)throw Error('Invalid BLE preset effect');
  seen|=1<<fx;off+=count;
 }
 if(seen!==0x3ffff)throw Error('Incomplete BLE preset');
 const bytes=new Uint8Array(data.length-37);bytes.set(data.subarray(0,prefix));bytes.set(data.subarray(prefix+37),prefix);return {data:bytes,layout};
}
export function encodeCommand(op,data,layout){
 if(op===0x20){
  const [fx,flat,value]=data;if(data.length!==3||!layout[fx])throw Error('Invalid effect parameter');
  const [k,d]=layout[fx];if(flat>k+d)throw Error('Invalid parameter index');
  return Uint8Array.of(fx,flat===0?0:flat<=k?1:2,flat===0?0:flat<=k?flat-1:flat-k-1,value);
 }
 if(op===0x32)return wrapPreset(data,layout,2);
 if(op===0x27){const fx=data[0];if(!layout[fx])throw Error('Invalid effect');return Uint8Array.of(fx,...layout[fx],...data.subarray(2));}
 return data;
}
export function localParam(data,layout){
 if(data.length!==4)return null;
 const [fx,kind,index,value]=data,[k,d]=layout[fx]||[];
 if(kind===0&&index===0&&k!==undefined)return Uint8Array.of(fx,0,value);
 if(kind===1&&index<k)return Uint8Array.of(fx,1+index,value);
 if(kind===2&&index<d)return Uint8Array.of(fx,1+k+index,value);
 return null;
}
