"""Real browser UI + a framed GATT test peer; no hardware readiness claim."""
import os
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
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
  readback=os.environ.get('JAMMATE_TEST_READBACK')=='1'
  if readback:page.add_init_script('window.__suppressNotifications=true;')
  page.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='networkidle')
  page.locator('[data-screen="fx"]').click();page.locator('[data-open-fx="5"]:visible').click()
  assert page.locator('#iirCanvas').is_visible()
  assert not errors,errors
  page.evaluate('''async () => {
    const {app}=await import('./js/app.js?v=16-uart-tx');
    const {BLEService:ble}=await import('./js/services/BLEService.js?v=16-uart-tx');
    const {Protocol}=await import('./js/services/Protocol.js');
    const {FrameReceiver,fragments}=await import('./js/services/Framing.js');
    const {crc16}=await import('./js/services/WebSync.js');
    window.__app=app;window.__ble=ble;window.__writes=[];
    let listener,tx=0,config=Protocol.buildConfigText(app.config),pending=[];
    let txTail=Promise.resolve(),ackWaiter=null,droppedAck=false;
    const emit=bytes=>{
      const id=++tx;
      txTail=txTail.then(async()=>{
        for(const part of fragments(bytes,id,window.__suppressNotifications?244:20)){
          const next=new DataView(part.buffer).getUint16(4,true)+part.length-10;
          let accepted=false;
          for(let tries=0;tries<3&&!accepted;tries++)accepted=await new Promise(resolve=>{
            const timer=setTimeout(()=>{ackWaiter=null;resolve(false);},window.__suppressNotifications?2000:100);
            ackWaiter={id,next,accept(){clearTimeout(timer);ackWaiter=null;resolve(true);}};
            window.__lastTx=part;
            if(!window.__suppressNotifications)listener({target:{value:new DataView(part.buffer)}});
          });
          if(!accepted)throw Error('Peer notification was not acknowledged');
        }
      });
      return txTail;
    };
    const blob=(cmd,payload)=>emit(Uint8Array.from([cmd,payload.length&255,payload.length>>8,...payload]));
    window.__emit=emit;
    const state={name:'Device preset',bpm:137,master:38,effectStates:app.effectStates,effectParams:app.effectParams,eqPoints:Array.from({length:12},()=>({freq:440,gain:0,q:1.4,enabled:true}))};
    const preset=new Uint8Array(Protocol.serializeState(state));
    const receiver=new FrameReceiver();
    const txCharacteristic={startNotifications:async()=>{},addEventListener:(n,f)=>{listener=f;},removeEventListener:()=>{},readValue:async()=>new DataView((window.__lastTx||Uint8Array.of(0)).buffer)};
    const characteristic={writeValueWithResponse:async bytes=>{
      if(bytes[0]===0x7f){
        const id=bytes[1]|bytes[2]<<8,next=bytes[3]|bytes[4]<<8;
        // Reproduce a lost middle-fragment ACK, forcing an identical retry.
        if(!window.__suppressNotifications&&id&&next===20&&!droppedAck){droppedAck=true;return;}
        if(ackWaiter?.id===id&&ackWaiter.next===next)ackWaiter.accept();
        return;
      }
      const p=receiver.accept(bytes);if(!p)return;window.__writes.push(Array.from(p));
      if(p[0]===0x54){
        const all=new TextEncoder().encode(config),offset=p[3]|p[4]<<8,count=p[5]|p[6]<<8,crc=crc16(all);
        const data=all.slice(offset,offset+Math.min(96,count));
        blob(0x55,Uint8Array.from([2,all.length&255,all.length>>8,offset&255,offset>>8,crc&255,crc>>8,...data]));
      }
      if(p[0]===0x30){blob(0x31,preset);emit(Uint8Array.of(0x3f,2,3,38,137));emit(Uint8Array.of(0x3e,1,42,2,3,137,1,127,2,1,4,3,1,1,5,2,1,1,0));}
      if(p[0]===0x37){let manifest=[1,35],crc=crc16(preset);for(let b=0;b<7;b++)for(let s=0;s<5;s++)manifest.push(b,s,preset.length&255,preset.length>>8,crc&255,crc>>8);blob(0x38,manifest);}
      if(p[0]===0x39)blob(0x3a,Uint8Array.from([p[3],p[4],...preset]));
      if(p[0]===0x52){if(!p[3]&&!p[4])pending=[];pending.push(...p.slice(6));let crc=0;if(p[5]){config=new TextDecoder().decode(Uint8Array.from(pending));crc=crc16(pending);}emit(Uint8Array.of(0x53,0,p[3],p[4],crc&255,crc>>8));}
     }};
    ble.device={gatt:{connect:async()=>({getPrimaryService:async()=>({getCharacteristic:async uuid=>uuid.includes("0003-")?txCharacteristic:characteristic})})}};
    await ble._connectGatt();
  }''')
  page.wait_for_function('window.__ble.configReady',timeout=120000)
  print('CONFIG VERIFIED; waiting for 35 preset slots; readback=',readback,flush=True)
  page.wait_for_function('window.__app.webSync.syncReceived===35',timeout=120000)
  if readback:
   assert page.evaluate('window.__ble.rxNotifications')==0
   assert page.evaluate('window.__ble.rxReadbacks')>0
  assert page.evaluate('window.__ble.configReady')
  assert page.evaluate('document.getElementById("presetBank").selectedIndex')==2
  assert page.evaluate('document.getElementById("presetNum").selectedIndex')==3
  assert page.evaluate('window.__app.bpm')==137
  page.locator('#jmBack').click();page.locator('#jmBack').click()
  assert page.locator('[data-jm-bpm]').first.inner_text()=='137'
  assert page.evaluate('window.__app.autoArm') is True
  page.evaluate('window.__writes=[];window.__emit(Uint8Array.of(0x3f,4,1,61,159))')
  assert page.locator('[data-jm-bank-select]').input_value()=='4'
  assert page.locator('[data-jm-slot-select]').input_value()=='1'
  assert page.locator('[data-jm-bpm]').inner_text()=='159'
  assert page.locator('[data-jm-vol]').inner_text()=='61'
  assert page.evaluate('window.__writes.length')==0
  page.locator('[data-screen="drums"]').click();page.locator('[data-drum-toggle="1"]').click()
  page.locator('[data-jm-global-slider="bpm"]').evaluate("el=>{el.value='171';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}")
  page.wait_for_function('window.__writes.some(p=>p[0]===0x25&&p[5]===171)')
  assert page.evaluate('window.__app.drumEnabled')
  page.evaluate('window.__writes=[];window.__emit(Uint8Array.of(0x36,2,15,91))')
  assert page.evaluate('window.__app.effectParams[2].knob14')==91
  assert page.evaluate('window.__writes.length')==0
  if not readback:page.evaluate('window.__app.sendConfigUpdate()')
  assert page.evaluate('window.__ble.configReady')
  assert not errors,errors
  page.evaluate('window.__ble.shouldReconnect=false;window.__ble._handleDisconnect()')
  browser.close()
  print('PASS browser readback='+str(readback)+': disconnected EQ, framed config handshake, actual preset decoding, 35 slots, bank/slot, controls, silent remote knob'+('' if readback else ', verified config upload'))
finally:
 server.shutdown();server.server_close()
