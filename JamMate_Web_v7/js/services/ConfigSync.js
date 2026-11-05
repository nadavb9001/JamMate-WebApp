// Parse the ESP's config for inspection/mapping, never mutate the web config.
export function parseDeviceConfig(bytes){
 if(bytes[0]!==1)throw Error('Unsupported configuration encoding');
 const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(1));
 if(!text.length||bytes.length>4097)throw Error('Invalid device configuration');
 const rows=text.split('\n'),names=['GATE','COMP','AWAH','OVRD','DIST','EQUL','HARM','VIBR','CHOR','OCTV','FLNG','PHAS','TREM','FIR','DELY','NAM','RVRB','GNRC'];
 if(rows.length!==18)throw Error('Invalid device effect count');
 const effects=rows.map((line,i)=>{
  const f=line.split('|');
  if(f.length!==4||f[0].replace(/[_\s]/g,'').toUpperCase()!==names[i])throw Error('Invalid device effect order');
  const knobs=f[1]?f[1].split(','):[],drops=f[2]?f[2].split(','):[],options=drops.length?f[3].split(';').map(s=>s?s.split(':'):[]):[];
  if(knobs.length>16||drops.length>10||options.length!==drops.length||options.some(o=>o.length>28))throw Error('Invalid device effect layout');
  return {name:f[0],knobs,drops,options};
 });
 return {text,effects,layout:effects.map(e=>[e.knobs.length,e.drops.length])};
}
