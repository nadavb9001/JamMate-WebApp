from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
import os
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':390,'height':844});errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  if os.environ.get('JAMMATE_TEST_MIN_ATT')=='1':page.add_init_script('window.__minSync=true;')
  page.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='networkidle')
  page.evaluate('''async()=>{
   const {BLEService:ble}=await import('./js/services/BLEService.js?v=8.7.1');
   const {Protocol}=await import('./js/services/Protocol.js?v=8.7.1');
   const {crc16}=await import('./js/services/ActiveSync.js?v=8.7.1');
   window.__ble=ble;window.__records=[];window.__config=[];window.__connects=0;
   let pending=[],disconnectListener=null,notify=null,revision=1,bank=2,slot=3;
   const state={name:'Device preset',bpm:137,master:38,effectStates:{16:{enabled:true}},effectParams:{16:{knob0:71,dropdown0:2}},eqPoints:Array.from({length:12},()=>({freq:440,gain:0,q:1.4,enabled:true}))};
   const emit=p=>notify?.({target:{value:new DataView(p.buffer)}});
   const snapshot=token=>{
    const blob=new Uint8Array(Protocol.serializeState(state)),bytes=Uint8Array.of(bank,slot,...window.app.config.tabs.flatMap(t=>[t.params.knobs.length,t.params.dropdowns.length]),...blob),chunk=window.__minSync?6:230;
    let index=0;for(let offset=0;offset<bytes.length;offset+=chunk,index++){
     const p=new Uint8Array(14+Math.min(chunk,bytes.length-offset)),v=new DataView(p.buffer);p.set([0xa7,1]);v.setUint16(2,token,true);v.setUint32(4,revision,true);v.setUint16(8,offset,true);v.setUint16(10,bytes.length,true);v.setUint16(12,crc16(bytes),true);p.set(bytes.subarray(offset,offset+chunk),14);
     if(window.__dropSnapshot&&index===1){window.__dropSnapshot=false;continue;}setTimeout(()=>emit(p),index*2);
    }
   };
   window.__param=(fx,kind,index,value,drop=false)=>{
    if(!state.effectParams[fx])state.effectParams[fx]={};state.effectParams[fx][(kind===1?'knob':'dropdown')+index]=value;
    const p=Uint8Array.of(0xa7,2,0,0,0,0,fx,kind,index,value);new DataView(p.buffer).setUint32(2,++revision,true);if(!drop)emit(p);
   };
   window.__select=(b,s)=>{bank=b;slot=s;state.name='Physical preset';state.bpm=159;state.effectParams[16].knob0=89;revision++;snapshot(0);};
   const char={addEventListener(n,f){notify=f;},removeEventListener(n,f){if(notify===f)notify=null;},async startNotifications(){},readValue(){throw Error('No readback');},async writeValueWithResponse(bytes){
    if(window.__failNextWrite){window.__failNextWrite=false;throw Error('Transient write failure');}
    if(bytes.length>20)throw Error('Oversized ATT write');pending.push(...bytes);
    while(pending.length>=3){const n=3+pending[1]+(pending[2]<<8);if(pending.length<n)break;const r=pending.splice(0,n);window.__records.push(r);
     if(r[0]===0x5c)snapshot(r[3]|r[4]<<8);
     if(r[0]===0x5d){const p=Uint8Array.of(0xa7,3,r[3],r[4],0,0,0,0);new DataView(p.buffer).setUint32(4,revision,true);emit(p);}
     if(r[0]===0x28&&r[4])window.__param(r[3],r[4],r[5],r[6]);
     if(r[0]===0x33){bank=r[3];slot=r[4];state.name='Web preset';state.effectParams[16].knob0=64;revision++;snapshot(0);}
     if(r[0]===0x52){if(!r[3]&&!r[4])window.__config=[];window.__config.push(...r.slice(6));}
    }
   }};
   const device={addEventListener(n,f){disconnectListener=f;},removeEventListener(){},gatt:{connected:false,
    async connect(){this.connected=true;window.__connects++;return {async getPrimaryService(uuid){if(uuid!==ble.SERVICE_UUID)throw Error('Wrong service');return {async getCharacteristic(uuid){if(uuid!==ble.CHARACTERISTIC_UUID)throw Error('Wrong characteristic');return char;}};}};},
    disconnect(){this.connected=false;pending=[];disconnectListener?.();}}};
   Object.defineProperty(navigator,'bluetooth',{value:{async requestDevice(){return device;}},configurable:true});
  }''')
  page.locator('#jmConnect').click();page.wait_for_function('window.__ble._sync?.revision===1')
  assert page.evaluate('window.app.effectParams[16].knob0')==71
  assert page.evaluate('document.getElementById("presetBank").selectedIndex')==2
  assert page.evaluate('window.__records.every(p=>p[0]===0x5c)'),'Snapshot application must not echo parameters/EQ'
  page.locator('[data-screen="fx"]').click();page.locator('[data-open-fx="16"]:visible').click()
  assert page.locator('[data-dropdown="0"]').evaluate("el=>Array.from(el.options).some(o=>o.text==='Vintage')")
  page.evaluate('window.__records=[];window.__param(16,1,0,82)');page.wait_for_function('window.app.effectParams[16].knob0===82');assert page.locator('[data-knob="0"]').input_value()=='82'
  assert page.evaluate('window.__records.length')==0
  page.evaluate('window.app.onEffectParamChanged(16,13,1)');page.wait_for_function('window.__ble._sync.revision===3')
  page.evaluate('window.__records=[];window.__select(4,1)');page.wait_for_function('window.app.effectParams[16].knob0===89');assert page.locator('[data-knob="0"]').input_value()=='89'
  assert page.evaluate('document.getElementById("presetBank").selectedIndex')==4
  assert page.evaluate('window.app.bpm')==159
  assert page.evaluate('window.__records.length')==0
  page.evaluate('window.__param(16,1,0,93,true);window.__ble._sync.poll()');page.wait_for_function('window.app.effectParams[16].knob0===93')
  page.evaluate('window.__dropSnapshot=true;window.__ble._sync.requestSnapshot()');page.wait_for_function('!window.__ble._sync.pending&&window.__ble._sync.revision===5')
  assert page.evaluate('window.__connects')==1
  page.evaluate('window.__failNextWrite=true;window.app.onEffectParamChanged(16,1,11)')
  page.wait_for_function('!window.__ble._writeFailed&&window.app.effectParams[16].knob0===93',timeout=8000)
  assert page.evaluate('window.__connects')==1
  page.evaluate('window.app.sendConfigUpdate()')
  assert page.evaluate("new TextDecoder().decode(Uint8Array.from(window.__config)).includes('Dattorro:FDN:Vintage')")
  page.evaluate('window.__records=[]');page.wait_for_timeout(5100)
  assert page.evaluate('window.__records.length>=1&&window.__records.every(p=>p[0]===0x5d)')
  page.evaluate('window.__ble.device.gatt.disconnect()');page.wait_for_function('window.__connects===2&&window.__ble._sync?.revision===5')
  assert page.evaluate('window.app.effectParams[16].knob0')==93
  assert not errors,errors
  page.evaluate('window.__ble.disconnect()');browser.close()
  print('PASS active UI: original UUID, connect/current state, typed updates both directions without echo, preset selection, missed-final update, dropped snapshot, write recovery, sparse idle revision checks, config write and reconnect')
finally:server.shutdown();server.server_close()
