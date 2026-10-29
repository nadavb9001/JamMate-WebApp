"""Regression for FX -> parameter scroll trap and Easy Mode long modal.
Uses the actual CSS and mobile-shell JS in a mocked browser DOM, with the real config.js.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
CSS=(ROOT/'css/main.css').read_text()+'\n'+(ROOT/'css/mobile-neon.css').read_text()
SELECTJS=(ROOT/'js/ui/CustomSelect.js').read_text().replace('export function upgradeSelects','function upgradeSelects').replace('export function disposeSelects','function disposeSelects')
SHELL=(ROOT/'js/ui/mobile-shell.js').read_text().replace("import { upgradeSelects, disposeSelects } from './CustomSelect.js';",'').replace("import { currentJamMateTheme } from './ThemeManager.js';",'').replace('export const FX_ORDER','const FX_ORDER').replace('export const BANKS','const BANKS').replace('export function installMobileShell','function installMobileShell')+'\nwindow.__make=installMobileShell;'
CONFIG='window.__cfg = '+(ROOT/'js/config.js').read_text().split('export const APP_CONFIG = ',1)[1].split(';\n',1)[0]+';'
STUB='''<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><div id="statusLed"></div><div id="masterKnob"></div><div id="bpmKnob"></div><select id="presetBank"><option>Clean</option></select><select id="presetNum"><option>1</option></select>'''

with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  for width,height in [(320,568),(390,844),(430,932)]:
    page=browser.new_page(viewport={'width':width,'height':height},is_mobile=True,has_touch=True)
    errors=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.set_content(STUB)
    page.add_style_tag(content=CSS)
    page.add_script_tag(content=SELECTJS)
    page.add_script_tag(content=CONFIG)
    page.add_script_tag(content=SHELL)
    page.evaluate('''() => {
      window.currentJamMateTheme = () => 'neon';
      document.getElementById('masterKnob').knob={value:75,min:0,max:100,draw(){}};
      document.getElementById('bpmKnob').knob={value:120,min:0,max:255,draw(){}};
      const app={
        config:window.__cfg,
        effectStates:Array.from({length:18},()=>({enabled:true})),
        effectParams:Array.from({length:18},()=>({})),
        toggleEffectEnabled(fx){this.effectStates[fx].enabled=!this.effectStates[fx].enabled},
        onEffectParamChanged(fx,i,value){window.__lastFxChange=[fx,i,value]},
        sendGlobalUpdate(){}, sendDrumUpdate(){}
      };
      window.__app=app;
      window.JamMateMobile=window.__make(app);
    }''')
    # Standard navigation uses a grid that intentionally cannot scroll.
    page.locator('[data-screen="fx"]').click()
    assert page.locator('#jmPage').get_attribute('data-view')=='fx'
    assert page.evaluate('getComputedStyle(document.getElementById("jmPage")).overflowY')=='hidden'
    page.locator('[data-open-fx="6"]').click()
    assert page.locator('#jmPage').get_attribute('data-view')=='params'
    metrics=page.evaluate('''() => {const el=document.getElementById('jmPage');return {total:el.scrollHeight,visible:el.clientHeight,overflow:getComputedStyle(el).overflowY}}''')
    assert metrics['overflow']=='auto',metrics
    assert metrics['total'] > metrics['visible']+150, metrics
    page.locator('#jmPage').evaluate('(el)=>{el.scrollTop=el.scrollHeight;}')
    scrolled=page.locator('#jmPage').evaluate('(el)=>el.scrollTop')
    assert scrolled>150,(width,height,scrolled)
    # Last harmonizer dropdown remains accessible even though it begins offscreen.
    last=page.locator('#jmPage .jm-param .csel-trigger').last
    last.scroll_into_view_if_needed()
    assert last.is_visible()
    last.click()
    assert page.locator('.csel-panel--open').count()==1
    page.locator('#jmBack').click()
    assert page.locator('#jmPage').get_attribute('data-view')=='fx'
    # Easy mode popup also scrolls within its sheet, not the frozen background.
    page.evaluate('window.JamMateMobile.setEasy(true)')
    page.locator('[data-open-fx="6"]').click()
    assert not page.locator('#jmOverlay').is_hidden()
    body=page.locator('#jmModalBody')
    m=body.evaluate('''el=>({total:el.scrollHeight,visible:el.clientHeight,overflow:getComputedStyle(el).overflowY})''')
    assert m['overflow']=='auto' and m['total']>m['visible']+150,m
    body.evaluate('el=>{el.scrollTop=el.scrollHeight;}')
    assert body.evaluate('el=>el.scrollTop')>100
    assert body.locator('.jm-param .csel-trigger').last.is_visible()
    page.locator('#jmClose').click()
    assert page.locator('#jmOverlay').is_hidden()
    for theme in ('metal','medieval'):
      style=page.add_style_tag(content=(ROOT/'css'/f'{theme}.css').read_text())
      page.evaluate('(theme)=>{document.documentElement.dataset.jmTheme=theme;}',theme)
      page.evaluate('window.JamMateMobile.setEasy(false)')
      page.locator('[data-screen="fx"]').click()
      page.locator('[data-open-fx="6"]').click()
      assert page.locator('#jmPage').get_attribute('data-view')=='params'
      assert page.locator('#jmPage').evaluate('el=>getComputedStyle(el).overflowY')=='auto'
      page.locator('#jmPage').evaluate('el=>{el.scrollTop=el.scrollHeight;}')
      assert page.locator('#jmPage').evaluate('el=>el.scrollTop')>100,(theme,width)
      assert page.locator('#jmPage .jm-param .csel-trigger').last.is_visible()
      page.locator('#jmBack').click()
      page.evaluate('window.JamMateMobile.setEasy(true)')
      page.locator('[data-open-fx="6"]').click()
      body=page.locator('#jmModalBody')
      body.evaluate('el=>{el.scrollTop=el.scrollHeight;}')
      assert body.evaluate('el=>el.scrollTop')>100,(theme,width)
      page.locator('#jmClose').click()
      style.evaluate('el=>el.remove()')
    assert not errors,errors
    assert page.evaluate('document.documentElement.scrollWidth')<=width
    print(f'PASS Harmonizer in Neon, Metal, Medieval, standard + Easy Mode: {width}x{height}')
    page.close()
  browser.close()
