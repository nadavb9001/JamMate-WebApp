// Only active preset state and changed values. No config or bank catalog reads.
export function crc16(bytes){let c=65535;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c&1)?(c>>>1)^0xa001:c>>>1;}return c;}
const u16=(p,n)=>p[n]|p[n+1]<<8;
const u32=(p,n)=>new DataView(p.buffer,p.byteOffset+n,4).getUint32(0,true);
const record=(op,token)=>Uint8Array.of(op,2,0,token&255,token>>8);
export class ActiveSync {
 constructor({send,busy=()=>false,onSnapshot=()=>{},onDelta=()=>{},onError=()=>{},snapshotTimeout=20000}){Object.assign(this,{send,busy,onSnapshot,onDelta,onError,snapshotTimeout});this.stop();}
 start(){this.stop();this.running=true;this.token=(Math.random()*65534|0)+1;this.timer=setInterval(()=>this.poll(),5000);this.requestSnapshot();}
 stop(){this.running=false;clearInterval(this.timer);clearTimeout(this.waitTimer);clearTimeout(this.pollTimer);clearTimeout(this.retryTimer);this.pending=null;this.assembly=null;this.pollToken=null;this.revision=null;this.needsSnapshot=true;this.attempts=0;}
 nextToken(){return this.token=this.token%65535+1;}
 requestSnapshot(){
  if(!this.running||this.pending)return;
  clearTimeout(this.waitTimer);
  const token=this.nextToken();this.needsSnapshot=true;this.pending=token;this.assembly=null;this.attempts++;
  Promise.resolve(this.send(record(0x5c,token))).then(()=>{
   if(this.running&&this.pending===token&&!this.assembly)this.waitTimer=setTimeout(()=>this.fail('Active preset response timed out'),Math.min(5000,this.snapshotTimeout));
  }).catch(e=>this.fail(e.message));
 }
 fail(message){
  if(!this.running)return;this.needsSnapshot=true;
  clearTimeout(this.waitTimer);this.pending=null;this.assembly=null;this.onError(message);
  if(this.running&&this.attempts<3&&!this.retryTimer)this.retryTimer=setTimeout(()=>{this.retryTimer=null;this.requestSnapshot();},200);
 }
 poll(){
  if(!this.running||this.pending||this.assembly||this.pollToken||this.busy())return;
  if(this.needsSnapshot||this.revision===null){this.attempts=0;this.requestSnapshot();return;}
  const token=this.nextToken();this.pollToken=token;
  Promise.resolve(this.send(record(0x5d,token))).then(()=>{if(this.running&&this.pollToken===token)this.pollTimer=setTimeout(()=>{this.pollToken=null;this.attempts=0;this.requestSnapshot();},3000);}).catch(e=>{if(!this.running)return;this.pollToken=null;this.onError(e.message);});
 }
 handle(p){
  if(!this.running||p.length<2||p[0]!==0xa7)return;
  if(p[1]===3){
   if(p.length!==8||u16(p,2)!==this.pollToken)return;
   clearTimeout(this.pollTimer);this.pollToken=null;
   if(u32(p,4)!==this.revision){this.attempts=0;this.requestSnapshot();}return;
  }
  if(p[1]===2){
   if(p.length!==10&&p.length!==14)return this.fail('Malformed parameter update');
   const fx=p[6],kind=p[7],index=p[8];
   if(!((p.length===10&&((fx<18&&((kind===0&&index===0)||(kind===1&&index<16)||(kind===2&&index<10)))||(fx===0xfe&&kind===3&&index<2)))||(p.length===14&&fx===0xfd&&kind===4&&index<12)))return this.fail('Invalid parameter update');
   const revision=u32(p,2);if(this.pending||this.assembly)return;
   if(this.revision===null){this.requestSnapshot();return;}
   const distance=(revision-this.revision)>>>0;
   if(distance===0||distance>=0x80000000)return;
   if(distance!==1){this.attempts=0;this.requestSnapshot();return;}
   try{this.onDelta({fx:p[6],kind:p[7],index:p[8],value:p[9],bytes:p.slice(9)});this.revision=revision;}catch(e){this.fail(e.message);}return;
  }
  if(p[1]!==1||p.length<15)return;
  const token=u16(p,2),revision=u32(p,4),offset=u16(p,8),total=u16(p,10),crc=u16(p,12),data=p.subarray(14);
  if(this.pending?token!==this.pending:token!==0)return;
  if(this.revision!==null&&((revision-this.revision)>>>0)>=0x80000000)return;
  if(!total||total>1100||offset+data.length>total)return this.fail('Invalid active preset size');
  if(offset===0)this.assembly={token,revision,total,crc,used:0,deadline:Date.now()+this.snapshotTimeout,bytes:new Uint8Array(total)};
  const a=this.assembly;
  if(!a||a.token!==token||a.revision!==revision||a.total!==total||a.crc!==crc||a.used!==offset)return this.fail('Missing active preset fragment');
  a.bytes.set(data,offset);a.used+=data.length;
  if(a.used!==total){clearTimeout(this.waitTimer);this.waitTimer=setTimeout(()=>this.fail('Active preset stalled'),Math.max(1,Math.min(2000,a.deadline-Date.now())));return;}
  if(crc16(a.bytes)!==a.crc)return this.fail('Active preset checksum failed');
  try{
   const b=a.bytes;if(b.length<42||b[0]>6||b[1]>4||b[38]!==3||b[41]>31)throw Error('Invalid active preset');
   let off=42+b[41],seen=0;
   for(let f=0;f<18;f++)if(b[2+f*2]>16||b[3+f*2]>10)throw Error('Invalid effect counts');
   while(off<b.length){
    if(off+2>b.length)throw Error('Truncated active preset');const fx=b[off++],count=b[off++];
    if(fx===0xfe){if(count>12||off+count*5!==b.length)throw Error('Invalid EQ data');off=b.length;break;}
    if(fx>=18||(seen&(1<<fx))||count!==1+b[2+fx*2]+b[3+fx*2]||off+count>b.length)throw Error('Invalid effect record');
    seen|=1<<fx;off+=count;
   }
   if(seen!==0x3ffff)throw Error('Incomplete active preset');
   this.onSnapshot(a.bytes);this.revision=revision;this.needsSnapshot=false;this.attempts=0;this.pending=null;this.assembly=null;clearTimeout(this.waitTimer);clearTimeout(this.retryTimer);this.retryTimer=null;}catch(e){this.fail(e.message);}
 }
}
