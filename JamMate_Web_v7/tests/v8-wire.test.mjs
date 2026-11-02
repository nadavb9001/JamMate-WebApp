import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {Receiver,packet,unpack,crc16,DATA,ACK,MAX} from '../js/services/Wire.js';
const ctrl=process.env.JAMMATE_CTRL_DIR||path.resolve(import.meta.dirname,'../../../JamMate_Ctrl');
const data=Uint8Array.from({length:1024},(_,i)=>i&255),session=123;
const frames=[];for(let off=0;off<data.length;off+=228)frames.push(packet(DATA,0x91,1,off,data.length,crc16(data),session,data.slice(off,off+228)));
const rx=new Receiver();let complete=0;
for(const f of frames){const p=unpack(f,session);const r=rx.accept(p);if(r.message){assert.deepEqual(r.message.data,data);complete++;}assert.equal(rx.accept(p).next,r.next);}
assert.equal(complete,1);assert.equal(unpack(frames[0],session+1),null);
const gap=new Receiver();gap.accept(unpack(frames[0],session));assert.equal(gap.accept(unpack(frames[2],session)).next,228);
const corrupt=frames.map(x=>x.slice());corrupt.at(-1)[16]^=1;const bad=new Receiver();let last;for(const f of corrupt)last=bad.accept(unpack(f,session));assert.equal(last.next,0);assert.equal(last.message,undefined);
for(const f of frames)last=bad.accept(unpack(f,session));assert.deepEqual(last.message.data,data);
assert.equal(rx.accept({type:DATA,id:2,offset:0,total:MAX+1,crc:0,op:1,data:new Uint8Array()}).message,undefined);
const source=fs.readFileSync(path.join(ctrl,'include/BluetoothManager_binary.hpp'),'utf8');const start=source.indexOf(' void transmit(const Outgoing& p)');const end=source.indexOf(' static void senderTask',start);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'jm-v8-'));fs.writeFileSync(path.join(temp,'v8-transmit.inc'),source.slice(start,end));
for(const file of ['v8-sender','v8-resources']){
 execFileSync('g++',['-std=c++17','-I',path.join(ctrl,'include'),'-I',temp,path.join(ctrl,'test/native/'+file+'.cpp'),'-o',path.join(temp,file)]);
 process.stdout.write(execFileSync(path.join(temp,file)));
}
fs.rmSync(temp,{recursive:true});
console.log('PASS v8 wire: CRC recovery, duplicate suppression, gaps, stale sessions and bounded sizes');
