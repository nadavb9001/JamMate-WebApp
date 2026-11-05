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
  mismatch=os.environ.get('JAMMATE_TEST_CONFIG_MISMATCH')=='1'
  if mismatch:page.add_init_script('window.__configMismatch=true;')
  no_notify=os.environ.get('JAMMATE_TEST_NO_NOTIFY')=='1'
  lost_controls=os.environ.get('JAMMATE_TEST_LOST_CONTROLS')=='1'
  if no_notify:page.add_init_script('window.__noNotify=true;')
  if lost_controls:page.add_init_script('window.__lostControls=true;')
  page.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='networkidle')
  page.locator('[data-screen="fx"]').click();page.locator('[data-open-fx="5"]:visible').click()
  assert page.locator('#iirCanvas').is_visible()
  assert not errors,errors
  page.evaluate('''async () => {
    const {app}=await import('./js/app.js?v=8.4');
    const {BLEService:ble}=await import('./js/services/BLEService.js?v=8.4');
    const {Protocol}=await import('./js/services/Protocol.js');
    const {Receiver,packet,unpack,crc16,DATA,ACK,HELLO}=await import('./js/services/Wire.js');
    window.__app=app;window.__ble=ble;window.__writes=[];
    let listener,tx=0,session=0,config=Protocol.buildConfigText(app.config),pending=[];
    if(window.__configMismatch){
      const lines=config.split('\\n');const fields=lines[17].split('|');
      fields[1]=fields[1].split(',').slice(0,8).join(',');lines[17]=fields.join('|');config=lines.join('\\n');
    }
    window.__peerConfig=()=>config;
    let txTail=Promise.resolve(),ackWaiter=null,dropped=false,resource=null,savedResource=null,peerConnected=false,lastTx=Uint8Array.of(0),lastRx=Uint8Array.of(0);
    const emitMessage=(op,data)=>{
      const id=++tx,queuedSession=session;
      txTail=txTail.then(async()=>{
        let offset=0;
        do{
          const end=Math.min(offset+228,data.length),part=packet(DATA,op,id,offset,data.length,crc16(data),session,data.slice(offset,end));
          let accepted=false;
          for(let tries=0;tries<4&&!accepted;tries++)accepted=await new Promise(resolve=>{
            const timer=setTimeout(()=>{ackWaiter=null;resolve(false);},(window.__noNotify||(window.__lostControls&&op===0x3e))?1500:100);
            ackWaiter={id,next:end,accept(){clearTimeout(timer);ackWaiter=null;resolve(true);}};
            // Lose one complete notification. The identical retry must recover.
            if(op===0x31&&!dropped){dropped=true;return;}
            lastTx=part;
            if(!window.__noNotify&&!(window.__lostControls&&op===0x3e))listener({target:{value:new DataView(part.buffer)}});
          });
          if(!peerConnected||queuedSession!==session)return;
          if(!accepted)throw Error(`Peer notification ${op.toString(16)} was not acknowledged`);offset=end;
        }while(offset<data.length);
      });return txTail;
    };
    const emit=bytes=>emitMessage(bytes[0],bytes.slice(1));
    const blob=(cmd,payload)=>emitMessage(cmd,Uint8Array.from(payload));
    window.__emit=emit;
    const state={name:'Device preset',bpm:137,master:38,effectStates:app.effectStates,effectParams:app.effectParams,eqPoints:Array.from({length:12},()=>({freq:440,gain:0,q:1.4,enabled:true}))};
    const preset=new Uint8Array(Protocol.serializeState(state));
    const receiver=new Receiver();
    const txCharacteristic={readValue:async()=>new DataView(lastTx.slice().buffer),startNotifications:async()=>{},addEventListener:(n,f)=>{listener=f;},removeEventListener:()=>{}};
    const characteristic={readValue:async()=>new DataView(lastRx.slice().buffer),writeValueWithResponse:async bytes=>characteristic.writeValueWithoutResponse(bytes,true),writeValueWithoutResponse:async (bytes,confirmed=false)=>{
      if(bytes[2]===ACK&&!confirmed)throw Error('Phone drops unconfirmed transport ACK');
      const q=unpack(bytes,bytes[2]===HELLO?new DataView(bytes.buffer).getUint32(12,true):session);
      if(q.type===HELLO){txTail=Promise.resolve();session=new DataView(bytes.buffer).getUint32(12,true);receiver.reset();tx=0;blob(0,Uint8Array.of(8,0x84,244,0));return;}
      if(q.type===ACK){if(ackWaiter?.id===q.id&&ackWaiter.next===q.offset)ackWaiter.accept();return;}
      const result=receiver.accept(q);
      if(result.next!==undefined){const ack=packet(ACK,q.op,q.id,result.next,0,0,session);lastRx=ack;if(!window.__noNotify)listener({target:{value:new DataView(ack.buffer)}});}
      if(!result.message)return;
      const p=Uint8Array.from([q.op,result.message.data.length&255,result.message.data.length>>8,...result.message.data]);window.__writes.push(Array.from(p));
      if(p[0]>=0x90){
        const body=p.slice(3),v=new DataView(body.buffer),id=v.getUint32(0,true);
        const reply=(status,phase,next)=>{const b=new Uint8Array(10),v=new DataView(b.buffer);v.setUint32(0,id,true);b[4]=status;b[5]=phase;v.setUint32(6,next,true);blob(0x94,b);};
        if(p[0]===0x90){resource={id,kind:body[4],total:v.getUint32(5,true),crc:v.getUint32(9,true),bytes:[]};reply(0,0,0);}
        if(p[0]===0x91){if(v.getUint32(4,true)!==resource.bytes.length)throw Error('bad resource offset');resource.bytes.push(...body.slice(8));reply(0,1,resource.bytes.length);}
        if(p[0]===0x92){savedResource=resource;reply(0,2,resource.bytes.length);}
        if(p[0]===0x95){const offset=v.getUint32(5,true),data=savedResource.bytes.slice(offset,offset+v.getUint16(9,true)),b=new Uint8Array(18+data.length),r=new DataView(b.buffer);r.setUint32(0,id,true);b[5]=savedResource.kind;r.setUint32(6,savedResource.total,true);r.setUint32(10,offset,true);r.setUint32(14,savedResource.crc,true);b.set(data,18);blob(0x96,b);}
      }
      if(p[0]===0x54){
        const all=new TextEncoder().encode(config),offset=p[3]|p[4]<<8,count=p[5]|p[6]<<8,crc=crc16(all);
        const data=all.slice(offset,offset+Math.min(96,count));
        blob(0x55,Uint8Array.from([2,all.length&255,all.length>>8,offset&255,offset>>8,crc&255,crc>>8,...data]));
      }
      if(p[0]===0x30){blob(0x31,preset);emit(Uint8Array.of(0x3f,2,3,38,137));emit(Uint8Array.of(0x3e,1,42,2,3,137,1,127,2,1,4,3,1,1,5,2,1,1,0));}
      if(p[0]===0x47){emit(Uint8Array.of(0x3e,0,42,2,3,137,p[3],100,0,0,0,0,0,0,0,0,0,0,0));}
      if(p[0]===0x42){window.__loopRecReceived=p[4]===1;}
      if(p[0]===0x37){let manifest=[1,35],crc=crc16(preset);for(let b=0;b<7;b++)for(let s=0;s<5;s++)manifest.push(b,s,preset.length&255,preset.length>>8,crc&255,crc>>8);blob(0x38,manifest);}
      if(p[0]===0x39)blob(0x3a,Uint8Array.from([p[3],p[4],...preset]));
      if(p[0]===0x52){if(!p[3]&&!p[4])pending=[];pending.push(...p.slice(6));let crc=0;if(p[5]){config=new TextDecoder().decode(Uint8Array.from(pending));crc=crc16(pending);}emit(Uint8Array.of(0x53,0,p[3],p[4],crc&255,crc>>8));}
     }};
    window.__statuses=[];const report=ble.onStatusChange;ble.onStatusChange=s=>{window.__statuses.push(s);report(s);};
    ble.shouldReconnect=true;
    ble.device={gatt:{
      disconnect:()=>{peerConnected=false;ble._handleDisconnect();},
      connect:async()=>{peerConnected=true;return {getPrimaryService:async()=>({getCharacteristic:async uuid=>uuid.includes("0003-")?txCharacteristic:characteristic})};}
    }};
    await ble._connectGatt();
  }''')
  if mismatch:
   assert page.evaluate('window.__ble.isConnected&&!window.__ble.configReady')
   assert page.evaluate("window.__statuses.includes('configuration-required')")
   assert page.evaluate('window.__writes.every(p=>![0x30,0x37,0x39].includes(p[0]))')
   page.evaluate("async()=>{let blocked=false;try{await window.__ble.sendMessage(0x25,Uint8Array.of(1,120,0));}catch(e){blocked=true;}if(!blocked)throw Error('Controls must stay locked until configuration is verified');}")
   # Use the existing Setup action with its confirmation, as on the phone.
   page.locator('#jmBack').click();page.locator('#jmBack').click()
   page.locator('[data-screen="setup"]').click()
   page.once('dialog',lambda dialog:dialog.accept())
   page.locator('#btnUpdateConfig').click()
   page.wait_for_function('window.__ble.configReady&&window.__app._configUploadPromise===null',timeout=120000)
   page.locator('#jmBack').click();page.locator('[data-screen="fx"]').click();page.locator('[data-open-fx="5"]:visible').click()
   assert page.evaluate("window.__writes.filter(p=>p[0]===0x30).length===1")
   assert page.evaluate('window.__peerConfig()===window.__app.deviceConfigText')
  page.wait_for_function('window.__ble.configReady',timeout=120000)
  print('V8 CONFIG VERIFIED; waiting for 35 preset slots',flush=True)
  page.wait_for_function('window.__app.webSync.syncReceived===35',timeout=120000)
  assert page.locator('#jmBeatLed,#jmBeatText,.jm-ring,[data-live-beat]').count()==0
  if not no_notify:
   page.evaluate('window.__emit(Uint8Array.of(0x48,0x23,1))')
   page.evaluate('window.JamMateMobile.setTelemetry({tunerHz:440})')
   assert page.locator('#jmCpu').inner_text()=='CPU 29.1%'
   assert page.locator('.jm-foot-meter i').evaluate("el=>el.style.width")=='29.1%'
  page.evaluate('window.__writes=[]')
  page.wait_for_function('!window.__ble._readBusy')
  page.evaluate('window.__idleReads=window.__ble.rxReadbacks')
  page.clock.install()
  page.clock.fast_forward(35000)
  assert page.evaluate('window.__writes.length')==0,'No unsolicited idle BLE requests'
  assert page.evaluate('window.__idleReads===window.__ble.rxReadbacks'),'No idle readback requests'
  if no_notify:
   assert page.evaluate('window.__ble.rxNotifications')==0
   assert page.evaluate('window.__ble.rxReadbacks')>0
  assert page.evaluate('window.__ble.configReady')
  assert page.evaluate('document.getElementById("presetBank").selectedIndex')==2
  assert page.evaluate('document.getElementById("presetNum").selectedIndex')==3
  assert page.evaluate('window.__app.bpm')==137
  page.locator('#jmBack').click();page.locator('#jmBack').click()
  assert page.locator('[data-jm-bpm]').first.inner_text()=='137'
  assert page.evaluate('window.__app.autoArm') is True
  if not no_notify:
   page.evaluate('window.__writes=[];window.__emit(Uint8Array.of(0x3f,4,1,61,159))')
   assert page.locator('[data-jm-bank-select]').input_value()=='4'
   assert page.locator('[data-jm-slot-select]').input_value()=='1'
   assert page.locator('[data-jm-bpm]').inner_text()=='159'
   assert page.locator('[data-jm-vol]').inner_text()=='61'
   assert page.evaluate('window.__writes.length')==0
  page.locator('[data-screen="drums"]').click();page.locator('[data-drum-toggle="1"]').click()
  page.locator('[data-jm-global-slider="bpm"]').evaluate("el=>{el.value='171';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}")
  page.wait_for_function('window.__writes.some(p=>p[0]===0x25&&p[4]===171)')
  assert page.evaluate('window.__app.drumEnabled')
  assert page.locator('.jm-ring,[data-live-beat]').count()==0
  if not no_notify:
   page.evaluate('window.__writes=[];window.__emit(Uint8Array.of(0x36,2,15,91))')
   assert page.evaluate('window.__app.effectParams[2].knob14')==91
   assert page.evaluate('window.__writes.length')==0
  page.evaluate('window.__app.sendConfigUpdate()')
  assert page.evaluate('window.__ble.configReady')
  assert not errors,errors
  page.locator('#jmBack').click()
  page.locator('[data-screen="looper"]').click()
  page.locator('[data-check="looperEnable"]').uncheck()
  page.wait_for_function('window.__app.looperEnabled===false')
  page.locator('[data-check="looperEnable"]').check()
  page.wait_for_function('window.__app.looperEnabled===true')
  page.locator('[data-proxy="loopBtn_rec"]').click()
  page.wait_for_function('window.__loopRecReceived===true')
  assert page.evaluate('window.__ble.isConnected')
  page.evaluate("""async()=>{
    const bytes=Uint8Array.from({length:7484},(_,i)=>i&255);
    await window.__ble.uploadResource('nam',bytes,'model.nam',{items:1871});
    const back=await window.__ble.downloadResource('nam');
    if(back.length!==bytes.length||back.some((v,i)=>v!==bytes[i]))throw Error('resource round trip failed');
    window.__statuses=[];window.__ble.device.gatt.disconnect();
  }""")
  page.wait_for_function("window.__statuses.filter(s=>s==='connected').length===1",timeout=30000)
  assert page.evaluate("window.__statuses.includes('reconnecting')")
  assert page.evaluate('window.__ble.configReady')
  assert not errors,errors
  page.evaluate('window.__ble.shouldReconnect=false;window.__ble._handleDisconnect()')
  browser.close()
  print('PASS browser config_mismatch='+str(mismatch)+' no_notifications='+str(no_notify)+' lost_controls='+str(lost_controls)+': config read/update, 35 presets, resource round trip, reconnect, idle silence, actual looper enable/disable/REC'+('' if no_notify else ', CPU display and silent remote edits'))
finally:
 server.shutdown();server.server_close()
