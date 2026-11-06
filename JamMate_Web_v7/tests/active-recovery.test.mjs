import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {ActiveSync,crc16} from '../js/services/ActiveSync.js';
import {Protocol} from '../js/services/Protocol.js';import {APP_CONFIG} from '../js/config.js';
const blob=new Uint8Array(Protocol.serializeState({name:'Recovery',bpm:137,master:38,effectStates:{},effectParams:{}}));
const state=Uint8Array.of(2,3,...APP_CONFIG.tabs.flatMap(t=>[t.params.knobs.length,t.params.dropdowns.length]),...blob);
const frames=(token,revision)=>{const result=[];for(let off=0;off<state.length;off+=100){const p=new Uint8Array(14+Math.min(100,state.length-off)),v=new DataView(p.buffer);p.set([0xa7,1]);v.setUint16(2,token,true);v.setUint32(4,revision,true);v.setUint16(8,off,true);v.setUint16(10,state.length,true);v.setUint16(12,crc16(state),true);p.set(state.subarray(off,off+100),14);result.push(p);}return result;};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
mock.timers.enable({apis:['setTimeout','setInterval','Date']});
const requests=[],received=[];const s=new ActiveSync({send:async p=>requests.push(p),onSnapshot:p=>received.push(p)});
try{
 s.start();await flush();for(const p of frames(s.pending,10))s.handle(p);
 s.poll();await flush();assert.ok(s.pollToken);
 s.requestSnapshot();await flush();for(const p of frames(s.pending,11))s.handle(p);
 const sent=requests.length;mock.timers.tick(3100);await flush();
 assert.equal(requests.length,sent,'A completed snapshot must cancel the older revision timeout');
 s.requestSnapshot();await flush();const packets=frames(s.pending,12);
 s.handle(packets[0]);s.handle(packets[1]);const deadline=s.assembly.deadline;mock.timers.tick(100);
 s.handle(packets[1]);s.handle(packets[0]);assert.equal(s.assembly.deadline,deadline);
 for(const p of packets.slice(2))s.handle(p);
 assert.equal(s.revision,12,'Identical duplicated fragments must not restart recovery');
 assert.equal(received.length,3);
 s.requestSnapshot();await flush();const bad=frames(s.pending,13);s.handle(bad[0]);bad[0][14]^=1;s.handle(bad[0]);
 assert.equal(s.revision,12,'Conflicting duplicate bytes must never be applied');assert.equal(s.needsSnapshot,true);
 s.stop();
 let oldReject,first=true,errors=0;const restarted=new ActiveSync({send:()=>first?(first=false,new Promise((_,reject)=>oldReject=reject)):Promise.resolve(),onError:()=>errors++});
 try{restarted.start();restarted.start();const current=restarted.pending;await flush();oldReject(Error('Old connection failed'));await flush();assert.equal(restarted.pending,current);assert.equal(errors,0);}
 finally{restarted.stop();}
 console.log('PASS recovery: old revision timeout cancelled, duplicate prefix/middle fragments tolerated, conflicting bytes isolated');
}finally{s.stop();mock.timers.reset();}
