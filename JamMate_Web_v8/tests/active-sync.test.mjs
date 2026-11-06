import assert from 'node:assert/strict';
import {ActiveSync,crc16} from '../js/services/ActiveSync.js';
import {APP_CONFIG} from '../js/config.js';import {Protocol} from '../js/services/Protocol.js';
const blob=new Uint8Array(Protocol.serializeState({name:'Device',bpm:137,master:38,effectStates:{},effectParams:{16:{dropdown0:2}}}));
const body=Uint8Array.of(2,3,...APP_CONFIG.tabs.flatMap(t=>[t.params.knobs.length,t.params.dropdowns.length]),...blob);
function packets(token,revision,chunk=230){const out=[];for(let off=0;off<body.length;off+=chunk){const b=new Uint8Array(14+Math.min(chunk,body.length-off)),v=new DataView(b.buffer);b.set([0xa7,1]);v.setUint16(2,token,true);v.setUint32(4,revision,true);v.setUint16(8,off,true);v.setUint16(10,body.length,true);v.setUint16(12,crc16(body),true);b.set(body.subarray(off,off+chunk),14);out.push(b);}return out;}
const sent=[],states=[],changes=[];const s=new ActiveSync({send:async p=>sent.push(p),onSnapshot:p=>states.push(p),onDelta:p=>changes.push(p)});
s.start();await new Promise(r=>setImmediate(r));const token=s.pending;
for(const p of packets(token,10,6))s.handle(p);assert.equal(states.length,1);assert.equal(s.revision,10);
const delta=Uint8Array.of(0xa7,2,11,0,0,0,16,1,0,73);s.handle(delta);assert.equal(changes.length,1);s.handle(delta);assert.equal(changes.length,1);
s.poll();await new Promise(r=>setImmediate(r));assert.equal(sent.at(-1)[0],0x5d);
const reply=Uint8Array.of(0xa7,3,s.pollToken&255,s.pollToken>>8,12,0,0,0);s.handle(reply);assert.ok(s.pending); // lost final delta repaired by revision check
for(const p of packets(s.pending,12))s.handle(p);assert.equal(s.revision,12);
s.requestSnapshot();const broken=packets(s.pending,12);broken.at(-1)[14]^=1;for(const p of broken)s.handle(p);assert.equal(states.length,2);assert.equal(s.revision,12); // corruption never applied
s.requestSnapshot();for(const p of packets(s.pending,13))s.handle(p);assert.equal(s.revision,13);
s.stop();const n=sent.length;s.poll();assert.equal(sent.length,n);
console.log('PASS active sync: minimum-MTU snapshot assembly, checksum, revisions, duplicate suppression, lost-final-update recovery, corrupt snapshot isolation and timer cleanup');
