// Validate everything before mutating the shared configuration used by Protocol.
export function readDeviceConfig(bytes, config) {
  if(bytes[0]!==1)throw Error('Unsupported device protocol; update ESP firmware');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(1));
  if(!text.length||bytes.length>4097)throw Error('Invalid device configuration');
  const rows=text.split('\n');
  if(rows.length!==config.tabs.length)throw Error('Device effect count differs; update configuration');
  const canonical=s=>s.replace(/[_\s]/g,'').toUpperCase();
  const parsed=rows.map((line,i)=>{
    const f=line.split('|'),tab=config.tabs[i];
    if(f.length!==4||canonical(f[0])!==canonical(tab.short_name))throw Error('Device effect order differs; update configuration');
    const knobs=f[1]?f[1].split(','):[],drops=f[2]?f[2].split(','):[];
    const options=drops.length?f[3].split(';').map(s=>s?s.split(':'):[]):[];
    if(knobs.length!==tab.params.knobs.length||drops.length!==tab.params.dropdowns.length||options.length!==drops.length||options.some(o=>o.length>28))
      throw Error(`Device ${tab.short_name} layout differs: ${knobs.length} knobs/${drops.length} dropdowns; web expects ${tab.params.knobs.length}/${tab.params.dropdowns.length}`);
    return {knobs,drops,options};
  });
  for(let i=0;i<parsed.length;i++){
    const {knobs,drops,options}=parsed[i];
    config.tabs[i].params.knobs=knobs;config.tabs[i].params.dropdowns=drops;
    drops.forEach((key,j)=>{config.dropdowns[key]=options[j];});
  }
  return text;
}
