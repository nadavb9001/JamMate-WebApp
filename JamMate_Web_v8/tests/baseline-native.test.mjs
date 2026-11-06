import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {execFileSync} from 'node:child_process';
const esp=path.resolve('../../JamMate_Ctrl'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'jm-baseline-'));
try{
 fs.writeFileSync(path.join(tmp,'stream.cpp'),`#include <cassert>\n#include <vector>\n#include "BaselineBleStream.hpp"\nint main(){
  for(unsigned width=1;width<=20;width++){
   BaselineBleStream stream;std::vector<unsigned char> record(1030);record[0]=0x52;record[1]=3;record[2]=4;for(unsigned i=3;i<record.size();i++)record[i]=i;unsigned count=0;
   for(unsigned off=0;off<record.size();off+=width)stream.accept(record.data()+off,std::min(size_t(width),record.size()-off),100,[&](auto* p,size_t n){assert(n==record.size());assert(std::equal(p,p+n,record.begin()));count++;});assert(count==1&&stream.used==0);
  }
  BaselineBleStream s;unsigned calls=0;auto receive=[&](auto*,size_t){calls++;};unsigned char records[]={0x20,3,0,1,2,3,0x30,0,0};s.accept(records,9,0,receive);assert(calls==2);
  s.accept(records,4,1,receive);s.reset();s.accept(records,6,2,receive);assert(calls==3);
  unsigned char bad[]={1,255,255};s.accept(bad,3,3,receive);assert(s.used==0);
  s.accept(records,4,4,receive);s.accept(records,6,3005,receive);assert(calls==4);
 }`);
 for(const [source,name] of [[path.join(tmp,'stream.cpp'),'stream'],[path.join(esp,'test/native/baseline-config-host.cpp'),'config'],[path.join(esp,'test/native/v8-resources.cpp'),'resources'],[path.join(esp,'test/native/active-sync-host.cpp'),'active']]){
  execFileSync('g++',['-std=c++17','-I'+path.join(esp,'include'),source,'-o',path.join(tmp,name)]);execFileSync(path.join(tmp,name));
 }
 const bt=fs.readFileSync(path.join(esp,'include/BluetoothManager_binary.hpp'),'utf8');assert.ok(bt.includes('6e400001-b5a3-f393-e0a9-e50e24dcca9f'));assert.ok(bt.includes('6e400002-b5a3-f393-e0a9-e50e24dcca9f'));assert.ok(!bt.includes('6e400003')&&!bt.includes('8a8e000')&&!bt.includes('->notify(')&&!bt.includes('senderTask'));
 console.log('PASS baseline ESP: raw fragmentation/coalescing/reset, config apply and preservation without replies, resource CRC staging and original single-characteristic topology');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
