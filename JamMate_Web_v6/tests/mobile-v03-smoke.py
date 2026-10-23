from playwright.sync_api import sync_playwright
from pathlib import Path
import json
base=Path(__file__).resolve().parent.parent
js=(base/'js/ui/mobile-shell.js').read_text().replace('export const FX_ORDER','const FX_ORDER').replace('export const BANKS','const BANKS').replace('export function installMobileShell','function installMobileShell') + '\nwindow.__createJamMate=installMobileShell;\n'
css=(base/'css/mobile-neon.css').read_text()
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 for w,h in [(390,844),(320,700),(375,667),(430,932)]:
  ctx=b.new_context(viewport={'width':w,'height':h},is_mobile=True,has_touch=True,device_scale_factor=1)
  page=ctx.new_page();errs=[];page.on('pageerror', lambda e:errs.append(str(e)))
  page.set_content('<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><div id="statusLed"></div><div id="masterKnob"></div><div id="bpmKnob"></div><select id="presetBank">'+''.join(f'<option>{n}</option>' for n in ['Clean','Crunch','Overdrive','Distortion','Modulated','Custom1','Custom2'])+'</select><select id="presetNum">'+''.join(f'<option>{n}</option>' for n in range(1,6))+'</select><div id="setup-tab">SETUP CONTROLS</div>')
  page.add_style_tag(content=css)
  page.evaluate('''() => {
    document.getElementById('masterKnob').knob={value:75,min:0,max:100,draw(){}};
    document.getElementById('bpmKnob').knob={value:120,min:0,max:255,draw(){}};
  }''')
  page.add_script_tag(content=js)
  page.evaluate('''() => {
     const app={effectStates:Array.from({length:18},()=>({enabled:false})),effectParams:Array.from({length:18},()=>({knob0:33})),config:{tabs:Array.from({length:18},(_,i)=>({title:'Effect '+i,params:{knobs:['Level','Rate'],dropdowns:[]}})),dropdowns:{}}, sendGlobalUpdate(){}, sendDrumUpdate(){}, toggleEffectEnabled(i){this.effectStates[i].enabled=!this.effectStates[i].enabled;}, onEffectParamChanged(){}};
     window.JamMateMobile=window.__createJamMate(app);
  }''')
  page.wait_for_timeout(100)
  d=page.evaluate('''() => ({vw:innerWidth,docW:document.documentElement.scrollWidth,hero:document.querySelector('.jm-preset').getBoundingClientRect().height,select:document.querySelector('[data-jm-bank-select]').getBoundingClientRect().height,homeEasy:document.querySelector('.jm-home .jm-easy-switch'),foot:document.querySelector('.jm-foot').getBoundingClientRect().bottom})''')
  assert d['docW']<=w+1,d;assert d['select']>=50;assert d['homeEasy']==None
  assert page.locator('[data-jm-bank-select]').count()==1
  assert 'PRESET' not in page.locator('.jm-preset').inner_text()
  assert 'Clean 1' not in page.locator('.jm-preset').inner_text()
  folder=base.parent/'previews';folder.mkdir(exist_ok=True)
  if w in (390,320):page.screenshot(path=str(folder/f'home_{w}.png'))
  page.locator('[data-screen="setup"]').click()
  assert page.locator('[data-action=\"easy\"]').count()==1
  assert page.locator('[data-action="fullscreen"]').count()==1
  if w==390:page.screenshot(path=str(folder/'setup_390.png'))
  page.locator('[data-action=\"easy\"]').click()
  assert page.locator('.jm-home .jm-effect').count()==18
  assert page.locator('.jm-home .jm-easy-switch').count()==0
  if w==390:page.screenshot(path=str(folder/'easy_390.png'))
  page.locator('[data-screen="setup"]').click()
  assert page.locator('[data-action=\"easy\"]').get_attribute('aria-pressed')=='true'
  page.locator('#jmClose').click()
  page.locator('[data-open-fx="0"]').first.click()
  assert page.locator('#jmModalBody .jm-param').count()==2
  if w==390:page.screenshot(path=str(folder/'easy_param_390.png'))
  print('PASS',w,h,d,'errors',errs)
  ctx.close()
 b.close()
