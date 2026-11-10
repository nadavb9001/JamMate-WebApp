// UI tab indices are identities, never DSP ids or positions in a chain.
const DSP_IDS={GATE:0,COMP:1,AWAH:2,OVRD:3,DIST:4,NAM:5,EQUL:6,OCTV:7,HARM:8,CHOR:9,TREM:10,PHAS:11,FLNG:12,FIR:13,_FIR:13,DELY:14,RVRB:15};
export const dspId=tab=>DSP_IDS[String(tab?.dsp_tag??'').trim()];
export function wireOrder(tabs,order){
 if(order.length!==tabs.length||new Set(order).size!==tabs.length||order.some(i=>!Number.isInteger(i)||!tabs[i]))throw Error('Invalid effect order');
 const ids=order.map(i=>dspId(tabs[i])).filter(i=>i!==undefined);
 if(ids.length!==16||new Set(ids).size!==16)throw Error('Effect layout does not match DSP');
 return ids;
}
export function defaultEffectOrder(tabs){return tabs.map((_,i)=>i).sort((a,b)=>(dspId(tabs[a])??256)-(dspId(tabs[b])??256));}
export function mergeDspOrder(tabs,current,ids){
 if(ids.length!==16||new Set(ids).size!==16||ids.some(i=>!Number.isInteger(i)||i<0||i>=16))throw Error('Invalid DSP order report');
 const byId=new Map(tabs.map((t,i)=>[dspId(t),i]));let k=0;
 const result=current.map(i=>dspId(tabs[i])===undefined?i:byId.get(ids[k++]));
 wireOrder(tabs,result);return result;
}
export function insertEffect(order,source,before=null){
 if(!order.includes(source)||before!==null&&!order.includes(before))throw Error('Unknown effect');
 if(source===before)return order.slice();
 const next=order.filter(i=>i!==source),slot=before===null?next.length:next.indexOf(before);
 next.splice(slot,0,source);return next;
}
export function createOrderCommand(token,ids=null){
 const p=new Uint8Array(ids?22:5);p[0]=ids?0x2a:0x2b;p[1]=p.length-3;p[3]=token&255;p[4]=token>>8;
 if(ids){if(ids.length!==16||new Set(ids).size!==16||ids.some(i=>!Number.isInteger(i)||i<0||i>15))throw Error('Invalid DSP ids');p[5]=16;p.set(ids,6);}
 return p;
}
export class EffectOrderTransport {
 constructor(send){this.send=send;this.nextToken=0;this.pending=null;}
 request(ids=null){
  if(this.pending)return Promise.reject(Error('Wait for the current order confirmation'));
  const token=this.nextToken=this.nextToken%65535+1;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>this.fail(Error('DSP order confirmation timed out')),8500);
   this.pending={token,resolve,reject,timer,pairs:Array(16).fill(null)};
   Promise.resolve().then(()=>this.send(createOrderCommand(token,ids))).catch(e=>this.fail(e));
  });
 }
 fail(error){const p=this.pending;if(!p)return;this.pending=null;clearTimeout(p.timer);p.reject(error);}
 handle(b){
  const p=this.pending;if(!p||b.length<8||b[0]!==0xa8||b[1]!==1||(b[2]|b[3]<<8)!==p.token)return;
  const status=b[4],count=b[5],start=b[6],n=b[7];
  if(status>=2&&status<=4){if(count===0&&n===0&&b.length===8)this.fail(Error(status===2?'DSP order bridge is busy':status===3?'DSP did not confirm the order':'ESP rejected the order request'));return;}
  if(status>1||count!==16||start+n>16||n===0||b.length!==8+n*2)return;
  if(p.status!==undefined&&p.status!==status){this.fail(Error('Conflicting order report'));return;}p.status=status;
  for(let i=0;i<n;i++){
   const pair=[b[8+2*i],b[9+2*i]],old=p.pairs[start+i];
   if(old&&(old[0]!==pair[0]||old[1]!==pair[1])){this.fail(Error('Conflicting order fragments'));return;}
   p.pairs[start+i]=pair;
  }
  if(p.pairs.some(x=>x===null))return;
  const ids=p.pairs.map(x=>x[0]);
  if(new Set(ids).size!==16||ids.some(i=>i>15)){this.fail(Error('Invalid DSP order report'));return;}
  this.pending=null;clearTimeout(p.timer);
  if(status){const e=Error('DSP rejected the order');e.ids=ids;p.reject(e);}else p.resolve({ids,flags:p.pairs.map(x=>x[1])});
 }
}
