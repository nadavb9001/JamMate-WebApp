"""Functional browser regression of restored IIR EQ and Looper enable/level UI."""
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
CSS='\n'.join((ROOT/'css'/n).read_text() for n in ('main.css','components.css','mobile-neon.css'))
SELECT=(ROOT/'js/ui/CustomSelect.js').read_text().replace('export function upgradeSelects','function upgradeSelects').replace('export function disposeSelects','function disposeSelects')
KNOB=(ROOT/'js/ui/Knob.js').read_text().replace('export class Knob','class Knob')
IIR=(ROOT/'js/ui/IIRDesigner.js').read_text().replace('export class IIRDesigner','class IIRDesigner')
VIEW=(ROOT/'js/ui/View.js').read_text().replace("import { Knob } from './Knob.js';",'').replace("import { IIRDesigner } from './IIRDesigner.js';",'').replace("import { upgradeSelects } from './CustomSelect.js';",'').replace('export const View','const View')
SHELL=(ROOT/'js/ui/mobile-shell.js').read_text().replace("import { upgradeSelects, disposeSelects } from './CustomSelect.js';",'').replace("import { currentJamMateTheme } from './ThemeManager.js';",'').replace('export const FX_ORDER','const FX_ORDER').replace('export const BANKS','const BANKS').replace('export function installMobileShell','function installMobileShell')+'\nwindow.__make=installMobileShell;'
CONFIG='window.__cfg = '+(ROOT/'js/config.js').read_text().split('export const APP_CONFIG = ',1)[1].split(';\n',1)[0]+';'
HTML='''<meta name="viewport" content="width=device-width,initial-scale=1"><div id="statusLed"></div><div id="statusMessage"></div><div id="effects-tab" style="display:none"><div id="effectControls"></div></div><div id="masterKnob"></div><div id="bpmKnob"></div><div id="loopLevelKnob"></div><input type="checkbox" id="looperEnable"><input type="checkbox" id="autoArm"><input type="checkbox" id="bounceMode"><select id="trackSelect"><option value="0">T1</option><option value="1">T2</option></select><select id="loopSync"><option value="0">Manual</option><option value="1">Beat</option><option value="2">Bar</option><option value="3">Drum Start</option></select><select id="loopLength"><option value="0">Free</option><option value="4">4</option></select><select id="playbackMode"><option value="0">Parallel</option></select><select id="drumStyle"><option>Rock</option></select><input type="checkbox" id="drumEnable"><select id="presetBank"><option>Clean</option></select><select id="presetNum"><option>1</option></select><div id="setup-tab" class="tab-content"><div class="panel"><button id="whiteNoiseBtn">Noise</button><button id="toneBtn">Tone</button><div id="whiteNoiseLevelKnob"></div><div id="toneLevelKnob"></div><input id="toneFreqInput" value="670" type="number"></div></div>'''
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,height in [(320,568),(390,844)]:
  page=browser.new_page(viewport={'width':width,'height':height},is_mobile=True,has_touch=True)
  errors=[];page.on('pageerror',lambda err:errors.append(str(err)))
  page.set_content(HTML)
  page.add_style_tag(content=CSS)
  for script in (SELECT,KNOB,IIR,VIEW,CONFIG,SHELL):page.add_script_tag(content=script)
  page.evaluate('''() => {
    window.currentJamMateTheme=()=>'neon';
    document.getElementById('masterKnob').knob={value:75,min:0,max:100,draw(){}};
    document.getElementById('bpmKnob').knob={value:120,min:0,max:255,draw(){}};
    document.getElementById('loopLevelKnob').knob={value:50,draw(){}};
    window.__events=[];
    const app={config:window.__cfg,effectStates:Array.from({length:18},()=>({enabled:false})),effectParams:Array.from({length:18},()=>({})),currentEQPoints:null,
      utilState:{noise:{enabled:false,level:10},tone:{enabled:false,level:30,freq:670}},loopLevel:50,looperEnabled:false,autoArm:true,loopSync:2,
      selectEffect(idx){this.currentEffect=idx;View.showEffectControls(this.config.tabs[idx],idx,this.effectParams[idx],this.effectStates,
        (i,v)=>window.__events.push(['fx',i,v]),(b,en,f,g,q)=>window.__events.push(['eq',b,en,f,g,q]));},
      onEffectParamChanged(fx,i,v){window.__events.push(['param',fx,i,v]);},toggleEffectEnabled(){},
      sendGlobalUpdate(){},sendDrumUpdate(){window.__events.push(['drum']);},sendLoopConfig(){window.__events.push(['loopConfig']);},
      sendLoopButton(b){window.__events.push(['button',b]);},sendUtilUpdate(n){window.__events.push(['util',n])}}
    window.__app=app;View.init(app);window.JamMateMobile=window.__make(app);
  }''')
  page.locator('[data-screen="fx"]').click()
  page.locator('[data-open-fx="5"]').click()
  assert page.locator('#jmPage #iirCanvas').count()==1
  page.wait_for_timeout(100)
  dims=page.locator('#iirCanvas').evaluate('el=>({width:el.width,height:el.height,visible:el.offsetWidth})')
  assert dims['width']>100 and dims['height']>150,dims
  assert page.locator('#jmPage #biquadCount').count()==1
  page.locator('#jmBack').click()
  assert page.locator('#effects-tab #effectControls').count()==1
  page.evaluate('window.JamMateMobile.setEasy(true)')
  page.locator('[data-open-fx="5"]').click()
  assert page.locator('#jmModalBody #iirCanvas').count()==1
  page.locator('#jmClose').click()
  assert page.locator('#effects-tab #effectControls').count()==1
  page.evaluate('window.JamMateMobile.setEasy(false)')
  page.locator('[data-screen="looper"]').click()
  assert page.locator('[data-loop-level]').count()==1
  page.locator('[data-loop-level]').evaluate('el=>{el.value="83";el.dispatchEvent(new Event("change",{bubbles:true}))}')
  assert page.evaluate('window.__app.loopLevel')==83
  assert page.evaluate('window.__events.some(x=>x[0]==="loopConfig")')
  # Manual choice clears auto-arm and the legacy checkbox in one command.
  page.evaluate('''() => {const src=document.querySelector('#loopSync');src.value='0';const ui=document.querySelector('[data-bind="loopSync"]');ui.value='0';ui.dispatchEvent(new Event('change',{bubbles:true}));}''')
  assert page.evaluate('window.__app.autoArm')==False
  assert page.evaluate('document.querySelector("[data-check=autoArm]").checked')==False
  page.evaluate('window.JamMateMobile.showScreen("setup")')
  assert page.locator('[data-util-slider]').count()==3
  page.locator('[data-util-slider="toneFreq"]').evaluate('el=>{el.value="500";el.dispatchEvent(new Event("change",{bubbles:true}))}')
  assert 600<page.evaluate('window.__app.utilState.tone.freq')<650
  assert page.evaluate('window.__events.some(x=>x[0]==="util"&&x[1]===1)')
  assert not errors,errors
  print('PASS EQ graph and original controls, Easy Mode, Looper Level/manual, Setup sliders',width,height)
  page.close()
 browser.close()
