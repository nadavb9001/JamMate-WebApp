from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
base=(ROOT/'css/main.css').read_text()+'\n'+(ROOT/'css/mobile-neon.css').read_text()
selectjs=(ROOT/'js/ui/CustomSelect.js').read_text().replace('export function upgradeSelects','function upgradeSelects').replace('export function disposeSelects','function disposeSelects')
manager=(ROOT/'js/ui/ThemeManager.js').read_text().replace('export function ', 'function ')
shell=(ROOT/'js/ui/mobile-shell.js').read_text().replace("import { upgradeSelects, disposeSelects } from './CustomSelect.js';",'').replace("import { currentJamMateTheme } from './ThemeManager.js';",'').replace('export const FX_ORDER','const FX_ORDER').replace('export const BANKS','const BANKS').replace('export function installMobileShell','function installMobileShell')+'\nwindow.__make=installMobileShell;'
for w,h in [(320,568),(390,844)]:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':w,'height':h},is_mobile=True,has_touch=True)
  errs=[];page.on('pageerror',lambda err:errs.append(str(err)))
  page.set_content('''<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><div id="statusLed"></div><div id="masterKnob"></div><div id="bpmKnob"></div><select id="presetBank"><option>Clean</option></select><select id="presetNum"><option>1</option></select><section id="setup-tab"><div class="panel" id="legacyThemePanel"><label>Theme <select data-jm-theme-select><option value="metal">Ultra Modern Metal</option><option value="neon">Neon</option><option value="medieval">Medieval</option></select></label></div></section><section id="tuner-tab"></section><section id="loader-tab"></section><section id="nam-tab"></section>''')
  page.add_style_tag(content=base)
  page.evaluate("""() => {document.documentElement.dataset.jmTheme='metal';for(const id of ['jmMetalStyle','jmMedievalStyle']){const el=document.createElement('style');el.id=id;el.media='not all';document.head.appendChild(el);}}""")
  page.add_script_tag(content=selectjs)
  page.add_script_tag(content=manager)
  page.evaluate('installThemeManager()')
  page.add_script_tag(content=shell)
  page.evaluate('''() => {document.getElementById('masterKnob').knob={value:75,min:0,max:100,draw(){}};document.getElementById('bpmKnob').knob={value:120,min:0,max:255,draw(){}};const app={effectStates:Array.from({length:18},()=>({enabled:false})),effectParams:[],config:{tabs:Array.from({length:18},()=>({title:'FX',params:{knobs:[],dropdowns:[]}}))},toggleEffectEnabled(){},onEffectParamChanged(){},sendGlobalUpdate(){}};window.JamMateMobile=window.__make(app);}''')
  page.locator('[data-screen=setup]').click()
  assert page.locator('#jmPage .jm-theme-mobile-label').count()==1
  assert page.locator('#jmPage .jm-theme-mobile-label .csel-trigger').count()==1
  assert page.locator('#legacyThemePanel').is_hidden()
  menu=page.locator('.jm-theme-mobile-label .csel-trigger');menu.click()
  page.locator('.csel-panel--open .csel-item',has_text='Medieval').click()
  assert page.locator('html').get_attribute('data-jm-theme')=='medieval'
  assert page.locator('#jmMedievalStyle').get_attribute('media')=='all'
  assert page.locator('#jmMetalStyle').get_attribute('media')=='not all'
  menu.click();page.locator('.csel-panel--open .csel-item',has_text='Neon').click()
  assert page.locator('html').get_attribute('data-jm-theme')=='neon'
  menu.click();page.locator('.csel-panel--open .csel-item',has_text='Ultra Modern Metal').click()
  assert page.locator('html').get_attribute('data-jm-theme')=='metal'
  assert not errs,errs
  assert page.evaluate('document.documentElement.scrollWidth')<=w
  print('PASS three-theme mobile custom dropdown',w,h)
  browser.close()
