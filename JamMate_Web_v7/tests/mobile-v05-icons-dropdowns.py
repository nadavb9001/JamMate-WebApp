from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
css=(ROOT/'css/main.css').read_text()+'\n'+(ROOT/'css/mobile-neon.css').read_text()
selectjs=(ROOT/'js/ui/CustomSelect.js').read_text().replace('export function upgradeSelects','function upgradeSelects').replace('export function disposeSelects','function disposeSelects')
js=(ROOT/'js/ui/mobile-shell.js').read_text().replace("import { upgradeSelects, disposeSelects } from './CustomSelect.js';",'').replace("import { currentJamMateTheme } from './ThemeManager.js';",'const currentJamMateTheme=()=>"metal";').replace('export const FX_ORDER','const FX_ORDER').replace('export const BANKS','const BANKS').replace('export function installMobileShell','function installMobileShell')+'\nwindow.__make=installMobileShell;'
for width,height in ((320,568),(390,844)):
  with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':width,'height':height},is_mobile=True,has_touch=True)
    errors=[]
    page.on('pageerror',lambda err:errors.append(str(err)))
    page.set_content('''<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><div id="statusLed"></div>
    <div id="masterKnob"></div><div id="bpmKnob"></div>
    <select id="presetBank"><option>Clean</option><option>Crunch</option><option>Overdrive</option><option>Distortion</option><option>Modulated</option><option>Custom1</option><option>Custom2</option></select>
    <select id="presetNum"><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select>
    <section id="nam-tab"><select id="legacyStyle"><option value="1">A</option><option value="2">B</option></select></section>
    <section id="setup-tab"></section><section id="tuner-tab"></section><section id="loader-tab"></section>''')
    page.add_style_tag(content=css)
    page.add_script_tag(content=selectjs)
    page.add_script_tag(content=js)
    page.evaluate('''() => {
       document.getElementById('masterKnob').knob={value:75,min:0,max:100,draw(){}};
       document.getElementById('bpmKnob').knob={value:120,min:0,max:255,draw(){}};
       window.__calls=[];
       const app={effectStates:Array.from({length:18},()=>({enabled:true})),effectParams:Array.from({length:18},()=>({knob0:15,dropdown0:0})),
       config:{tabs:Array.from({length:18},(_,i)=>({title:'Effect '+i,params:{knobs:['Gain'],dropdowns:['Mode']}})), dropdowns:{Mode:['Classic','Modern','Wide','Extreme']}},
       toggleEffectEnabled(i){this.effectStates[i].enabled=!this.effectStates[i].enabled;},
       onEffectParamChanged(fx,i,v){window.__calls.push([fx,i,v]);this.effectParams[fx].dropdown0=v;},
       sendGlobalUpdate(){},sendDrumUpdate(){},sendPresetLoadRequest(){}};
       window.JamMateMobile=window.__make(app);
    }''')
    assert page.locator('.jm-menu-tile svg.jm-svg-icon').count()==7
    assert page.locator('.jm-save svg.jm-svg-icon').count()==1
    page.locator('.jm-preset-fields .csel-trigger').first.click()
    assert page.locator('.csel-panel--open').count()==1
    rect=page.locator('.csel-panel--open').bounding_box()
    assert rect['height']<=210 and rect['y']>=0 and rect['y']+rect['height']<=height+1,rect
    page.locator('.csel-panel--open .csel-item',has_text='Overdrive').click()
    assert page.evaluate('document.getElementById("presetBank").selectedIndex')==2
    page.locator('[data-screen="fx"]').click()
    assert page.locator('.jm-effect-glyph svg.jm-svg-icon').count()==18
    page.locator('[data-open-fx="0"]').click()
    page.locator('.jm-param .csel-trigger').click()
    rect=page.locator('.csel-panel--open').bounding_box()
    assert rect['height']<=210 and rect['y']>=0 and rect['y']+rect['height']<=height+1,rect
    page.locator('.csel-panel--open .csel-item',has_text='Modern').click()
    assert page.evaluate('window.__calls.length')==1
    assert page.evaluate('window.__calls[0]')==[0,2,1]
    page.locator('#jmBack').click()
    assert page.locator('.jm-effect-glyph svg.jm-svg-icon').count()==18
    page.locator('#jmBack').click()
    page.locator('[data-screen="nam"]').click()
    assert page.locator('#nam-tab').count()==1
    page.locator('#jmBack').click()
    assert page.evaluate('document.getElementById("nam-tab").isConnected')
    assert page.evaluate('document.getElementById("legacyStyle").isConnected')
    assert page.evaluate('document.documentElement.scrollWidth')<=width+1
    assert not errors,errors
    page.close();browser.close()
    print('PASS mobile-v05',width,height,'SVG icons; small in-viewport dropdowns; legacy panels survive; BLE callback once')
