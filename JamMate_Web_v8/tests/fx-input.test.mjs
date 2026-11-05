import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const esp=path.resolve('../../JamMate_Ctrl'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'jammate-fx-input-'));
try{
 const source=fs.readFileSync(path.join(esp,'src/DisplayManager_Fx.cpp'),'utf8');
 const grid=fs.readFileSync(path.join(esp,'include/JmFxGridPortrait.hpp'),'utf8');
 const order=grid.match(/static constexpr uint8_t order\[18\] = [^;]+;/)[0];
 const start=source.indexOf('void DisplayManager::handleFxGridMode()');
 const end=source.indexOf('static JmFxPortrait::Model buildFxModel',start);
 const edit=source.slice(source.indexOf('void DisplayManager::handleFxEditMode()'));
 fs.writeFileSync(path.join(tmp,'fx-input-handlers.inc'),`namespace JmFxGrid{${order} int dsp(int n){return order[n];}}\n`+source.slice(start,end)+edit);
 execFileSync('g++',['-std=c++17','-I'+path.join(esp,'include'),'-I'+tmp,path.join(esp,'test/native/fx-input-host.cpp'),'-o',path.join(tmp,'test')]);
 execFileSync(path.join(tmp,'test'));
 console.log('PASS actual LCD FX handlers: long opens, short toggles, knob/dropdown edit sends DSP and BLE, back, alternate entry, Home and no stale click');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
