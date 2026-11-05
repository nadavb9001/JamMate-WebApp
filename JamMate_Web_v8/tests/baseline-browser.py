from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
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
  page.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='networkidle')
  page.evaluate('''async()=>{
   const {BLEService:ble}=await import('./js/services/BLEService.js?v=8.6');window.__ble=ble;window.__records=[];window.__config=[];window.__connects=0;
   let pending=[],listener=null;
   const char={async writeValueWithResponse(bytes){
    if(bytes.length>20)throw Error('Oversized ATT write');pending.push(...bytes);
    while(pending.length>=3){const n=3+pending[1]+(pending[2]<<8);if(pending.length<n)break;const r=pending.splice(0,n);window.__records.push(r);if(r[0]===0x52){if(!r[3]&&!r[4])window.__config=[];window.__config.push(...r.slice(6));}}
   },readValue(){throw Error('No ESP readback allowed');},startNotifications(){throw Error('No notification subscription allowed');}};
   const device={addEventListener(n,f){listener=f;},removeEventListener(){},gatt:{connected:false,
    async connect(){this.connected=true;window.__connects++;return {async getPrimaryService(uuid){if(uuid!==ble.SERVICE_UUID)throw Error('Wrong service');return {async getCharacteristic(uuid){if(uuid!==ble.CHARACTERISTIC_UUID)throw Error('Wrong characteristic');return char;}};}};},
    disconnect(){this.connected=false;pending=[];listener?.();}}};
   Object.defineProperty(navigator,'bluetooth',{value:{async requestDevice(){return device;}},configurable:true});
  }''')
  page.locator('#jmConnect').click();page.wait_for_function('window.__ble.isConnected')
  assert page.evaluate('window.__records.length')==0
  page.locator('[data-screen="fx"]').click();page.locator('[data-open-fx="16"]:visible').click()
  assert page.locator('[data-dropdown="0"]').evaluate("el=>Array.from(el.options).some(o=>o.text==='Vintage')")
  page.evaluate("window.app.onEffectParamChanged(16,13,2)")
  page.wait_for_function('window.__records.some(p=>p[0]===0x20&&p[3]===16&&p[4]===13&&p[5]===2)')
  page.evaluate('window.app.sendConfigUpdate()')
  assert page.evaluate("new TextDecoder().decode(Uint8Array.from(window.__config)).includes('Dattorro:FDN:Vintage')")
  page.locator('#jmBack').click();page.locator('#jmBack').click();page.locator('[data-screen="looper"]').click()
  page.locator('[data-proxy="loopBtn_rec"]').click();page.wait_for_function('window.__records.some(p=>p[0]===0x42&&p[4]===1)')
  page.evaluate('window.__records=[]');page.clock.install();page.clock.fast_forward(35000)
  assert page.evaluate('window.__records.length')==0
  page.evaluate('window.__ble.device.gatt.disconnect()');page.wait_for_function('window.__connects===2&&window.__ble.isConnected')
  assert page.evaluate('window.__records.length')==0
  assert not errors,errors
  page.evaluate('window.__ble.disconnect()');browser.close()
  print('PASS baseline UI: original UUID service/one characteristic, zero connect/idle/reconnect traffic, no reads/subscriptions, Vintage parameter/config writes, looper REC and physical reconnect')
finally:server.shutdown();server.server_close()
