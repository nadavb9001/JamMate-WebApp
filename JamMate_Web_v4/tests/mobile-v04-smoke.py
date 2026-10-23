from playwright.sync_api import sync_playwright
from pathlib import Path
import json
base=Path(__file__).resolve().parent.parent
js=(base/'js/ui/mobile-shell.js').read_text().replace('export const FX_ORDER','const FX_ORDER').replace('export const BANKS','const BANKS').replace('export function installMobileShell','function installMobileShell') + '\nwindow.__createJamMate=installMobileShell;\n'
css=(base/'css/mobile-neon.css').read_text()
legacy='''
<div id="statusLed"></div><div id="masterKnob"></div><div id="bpmKnob"></div>
<select id="presetBank">'''+''.join(f'<option>{n}</option>' for n in ['Clean','Crunch','Overdrive','Distortion','Modulated','Custom1','Custom2'])+'''</select>
<select id="presetNum">'''+''.join(f'<option>{n}</option>' for n in range(1,6))+'''</select>
<div id="tuner-tab"><div class="panel tuner-display"><label class="checkbox jumbo"><input type="checkbox" id="tunerEnable"/> Enable Tuner</label><div class="string-display" id="stringDisplay">E2</div><div class="muted">Target 82.4 Hz</div><div class="tuner-gauge"><div class="tuner-center"></div><div class="tuner-needle"></div></div><div class="freq-display">82.4 Hz</div><div class="cents-display">-3 cents</div></div></div>
<div id="setup-tab"><div class="panel"><h2 class="panel-title">Utilities</h2><div class="utility-row"><button id="whiteNoiseBtn">White Noise</button><label class="field"><span>Noise Level</span><input type="range" value="23"/></label></div></div><div class="panel"><h2 class="panel-title">Daisy Control</h2><div class="two-grid"><button id="reset-btn">Reset DSP</button><button id="flash-btn">Flash DSP</button></div></div></div>
<div id="loader-tab"><div class="panel"><div class="file-upload-btn"><button>Load WAV File</button></div></div><canvas class="waveform-canvas"></canvas><canvas class="spectrum-canvas"></canvas><div class="panel send-panel"><label class="field"><span>Points to send</span><select id="irPoints"><option>512</option><option>1024</option></select></label><button id="btnSendIR">Send IR to Device</button></div></div>
<div id="nam-tab"><div class="nam-layout"><div class="nam-topbar panel"><div class="jm-nam-auth"><button id="btnNamLogin">Connect TONE3000</button></div><div class="nam-search-row"><input class="nam-search" placeholder="Search models"/><button id="btnNamSearch">Search</button><button id="btnNamBrowseT3K">Browse TONE3000</button></div><div class="nam-filter-row"><label class="nam-filter-field">Gear<select><option>All</option></select></label><label class="nam-filter-field">Sort<select><option>Trending</option></select></label></div></div><div class="nam-library-head"><h3>Explore models</h3></div><div id="namGrid" class="nam-grid"><div class="nam-welcome">Choose your sound</div></div><div class="panel nam-local-row"><strong>Local NAM model</strong><button>Choose .nam</button></div></div></div>
'''
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 for w,h in [(320,568),(375,667),(390,844),(430,932)]:
  ctx=browser.new_context(viewport={'width':w,'height':h},is_mobile=True,has_touch=True,device_scale_factor=1)
  page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content('<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'+legacy)
  page.add_style_tag(content=css)
  page.evaluate('''() => {
    document.getElementById('masterKnob').knob={value:75,min:0,max:100,draw(){}};
    document.getElementById('bpmKnob').knob={value:120,min:0,max:255,draw(){}};
  }''')
  page.add_script_tag(content=js)
  page.evaluate('''() => {
   const app={effectStates:Array.from({length:18},()=>({enabled:false})),effectParams:Array.from({length:18},()=>({knob0:33,knob1:45})),
    config:{tabs:Array.from({length:18},(_,i)=>({title:'Effect '+i,params:{knobs:['Level','Threshold'],dropdowns:['Mode']}})),dropdowns:{Mode:['Classic','Modern']}},
    sendGlobalUpdate(){},sendDrumUpdate(){},toggleEffectEnabled(i){this.effectStates[i].enabled=!this.effectStates[i].enabled;},
    onEffectParamChanged(fx,index,val){if(index===0)this.effectStates[fx].enabled=!!val;else if(index===3)this.effectParams[fx].dropdown0=val;else this.effectParams[fx]['knob'+(index-1)]=val;}};
   window.JamMateMobile=window.__createJamMate(app);
  }''')
  page.locator('[data-screen="fx"]').click()
  assert page.locator('.jm-effects-fit .jm-effect').count()==18
  assert 'TOUCH TO EDIT' not in page.locator('.jm-scroll').inner_text()
  sizing=page.evaluate('''() => {
    const row=document.querySelector('.jm-fx-page'),tile=document.querySelector('.jm-effect'),foot=document.querySelector('.jm-foot');
    const tiles=[...document.querySelectorAll('.jm-effect')];
    return {doc:document.documentElement.scrollWidth,viewport:innerWidth,
      bottom:Math.max(...tiles.map(el=>el.getBoundingClientRect().bottom)),footerTop:foot.getBoundingClientRect().top,
      tileH:tile.getBoundingClientRect().height,pageH:row.getBoundingClientRect().height};}''')
  assert sizing['doc']<=w+1,sizing
  assert sizing['bottom']<=sizing['footerTop']+1,sizing
  assert sizing['tileH']>=48,sizing
  page.locator('[data-toggle-fx="0"]').click()
  assert page.locator('#jmHud').evaluate('el=>el.classList.contains("is-visible")')
  assert page.locator('.jm-hud-value').inner_text()=='ON'
  page.locator('[data-open-fx="0"]').click()
  assert page.locator('.jm-param').count()==3
  page.locator('[data-knob="0"]').fill('78')
  assert page.locator('.jm-hud-value').inner_text()=='78'
  page.locator('#jmBack').click()
  if w==390:
    page.evaluate("document.getElementById('jmHud').style.display='none'")
    path=base.parent/'previews';path.mkdir(exist_ok=True)
    page.screenshot(path=str(path/'fx_grid_390.png'))
  # Legacy pages are mounted, not simulated replacement sections.
  for name in ['tuner','setup','files','nam']:
   page.locator('#jmBack').click() if page.locator('#jmPage').get_attribute('data-view')!='home' else None
   page.locator(f'[data-screen="{name}"]').click()
   assert page.locator('.jm-mounted-title').inner_text()==name.upper()
   assert page.locator('.jm-embedded-tab').count()==1
   assert page.evaluate('document.documentElement.scrollWidth')<=w+1
   if name=='setup':
    page.locator('#reset-btn').click()
    assert page.locator('.jm-hud-title').inner_text()=='DSP RESET'
    assert page.locator('.jm-hud-value').inner_text()=='Requested'
   if w==390:
    page.evaluate("document.getElementById('jmHud').style.display='none'")
    page.screenshot(path=str(base.parent/'previews'/f'{name}_390.png'))
  assert not errors,(w,errors)
  print('PASS',w,h,sizing,'legacy themed, HUD, no errors')
  ctx.close()
 browser.close()
