import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {execFileSync} from 'node:child_process';
const esp=path.resolve('../../JamMate_Ctrl'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'jm-session-'));
const source=fs.readFileSync(path.join(esp,'include/BluetoothManager_binary.hpp'),'utf8');
function method(signature){const start=source.indexOf(signature);assert.ok(start>=0);let at=source.indexOf('{',start),depth=1;while(depth){at++;if(source[at]==='{')depth++;if(source[at]==='}')depth--;}return source.slice(start,at+1);}
try{
 assert.ok(!source.includes('server->disconnect('),'Firmware protocol faults must never close GATT');
 fs.writeFileSync(path.join(tmp,'v8-recovery-methods.inc'),[' void requestRecovery(',' void tick()',' void sendHello('].map(method).join('\n'));
 fs.writeFileSync(path.join(tmp,'v8-write-method.inc'),method('  void onWrite(').replace('override',''));
 execFileSync('g++',['-std=c++17','-I'+path.join(esp,'include'),'-I'+tmp,path.join(esp,'test/native/v8-session-host.cpp'),'-o',path.join(tmp,'test')]);
 execFileSync(path.join(tmp,'test'));
 console.log('PASS actual ESP session handlers: checksum-only HELLO, 200ms state-0 probes, CRC mismatch accepted, idempotent retry, queue fault retains link, fresh epochs and MTU update');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
