from pathlib import Path
from playwright.sync_api import sync_playwright
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parent.parent
soup=BeautifulSoup((ROOT/'index.html').read_text(),'html.parser')
for t in soup.select('script,link[rel="stylesheet"]'):t.decompose()
html=str(soup)
selectjs=(ROOT/'js/ui/CustomSelect.js').read_text().replace('export function upgradeSelects','function upgradeSelects').replace('export function disposeSelects','function disposeSelects')
shelljs=(ROOT/'js/ui/mobile-shell.js').read_text().replace("import { upgradeSelects, disposeSelects } from './CustomSelect.js';",'').replace("import { currentJamMateTheme } from './ThemeManager.js';",'const currentJamMateTheme=()=>"metal";').replace('export const FX_ORDER','const FX_ORDER').replace('export const BANKS','const BANKS').replace('export function installMobileShell','function installMobileShell')+'\nwindow.__make=installMobileShell;'
basecss='\n'.join((ROOT/('css/'+n)).read_text() for n in ['main.css','components.css','nam-v2b.css','mobile-neon.css'])
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 for theme in ['neon','metal','medieval']:
  css=basecss+('\n'+(ROOT/('css/'+theme+'.css')).read_text() if theme!='neon' else '')
  for w,h in [(320,568),(375,667),(390,844),(430,932)]:
   context=browser.new_context(viewport={'width':w,'height':h},is_mobile=True,has_touch=True,device_scale_factor=1)
   page=context.new_page();errors=[];page.on('pageerror',lambda err:errors.append(str(err)))
   page.set_content(html)
   page.add_style_tag(content=css)
   page.add_script_tag(content=selectjs)
   page.add_script_tag(content=shelljs)
   page.evaluate('''() => {
     for(const id of ['masterKnob','bpmKnob']) document.getElementById(id).knob={value:id==='masterKnob'?20:120,min:0,max:id==='masterKnob'?100:255,draw(){}};
     window.__volume=[];window.__commands=[];
     const app={utilState:{noise:{enabled:false,level:10},tone:{enabled:false,level:10,freq:670}},effectStates:Array.from({length:18},()=>({enabled:false})),effectParams:Array.from({length:18},()=>({knob0:33,knob1:45})),
       config:{tabs:Array.from({length:18},(_,i)=>({title:'Effect '+i,params:{knobs:['Level','Threshold'],dropdowns:['Mode']}})),dropdowns:{Mode:['Classic','Modern']}},
       sendGlobalUpdate(){},sendDrumUpdate(){},sendMasterVolumeUpdate(value){window.__volume.push(value);},toggleEffectEnabled(i){this.effectStates[i].enabled=!this.effectStates[i].enabled;},
       onEffectParamChanged(fx,index,val){this.effectParams[fx]['knob'+(index-1)]=val},sendUtilUpdate(){}};
     window.JamMateMobile=window.__make(app);window.JamMateMobile.setEasy(true);
   }''')
   page.wait_for_timeout(90)
   size=page.evaluate('''() => {
      const els=[...document.querySelectorAll('.jm-home-easy .jm-effect')];
      const save=document.querySelector('.jm-home-easy .jm-save'),footer=document.querySelector('.jm-foot');
      const g=document.querySelector('.jm-home-easy .jm-effects-easy');
      const bottom=Math.max(...els.map(el=>el.getBoundingClientRect().bottom));
      const gridBottom=g.getBoundingClientRect().bottom;
      return {count:els.length,docW:document.documentElement.scrollWidth,width:innerWidth,gridBottom,bottom,saveTop:save.getBoundingClientRect().top,saveBottom:save.getBoundingClientRect().bottom,footerTop:footer.getBoundingClientRect().top,
      gridH:g.getBoundingClientRect().height,minTileH:Math.min(...els.map(e=>e.getBoundingClientRect().height))};
   }''')
   assert size['count']==18 and size['docW']<=w+1 and size['gridH']>0 and size['minTileH']>14, (theme,w,h,size)
   assert size['bottom']<=size['saveTop']+2 and size['saveBottom']<=size['footerTop']+1, (theme,w,h,size)
   assert size['gridBottom']<=size['footerTop'],(theme,w,h,size)
   page.locator('[data-jm-global-slider="master"]').fill('37')
   page.wait_for_timeout(180)
   assert page.evaluate('window.__volume.at(-1)')==37, (theme,w,h, page.evaluate('window.__volume'))
   page.evaluate('window.JamMateMobile.setEasy(false)')
   page.locator('[data-screen="nam"]').click()
   r=page.evaluate('''() => {const tab=document.querySelector('#jmMobile #nam-tab'),fields=[...tab.querySelectorAll('.nam-filter-field')],row=tab.querySelector('.nam-filter-row'), file=tab.querySelector('.btn-nam-file');return {fields:fields.map(x=>x.getBoundingClientRect().width),row:row.getBoundingClientRect().width,file:file.getBoundingClientRect().width};}''')
   assert all(abs(q-r['row'])<4 for q in r['fields']), (theme,w,h,r)
   assert abs(r['file']-r['row'])<40,(theme,w,h,r)
   page.locator('#jmBack').click()
   page.locator('[data-screen="files"]').click()
   r=page.evaluate('''() => {const tab=document.querySelector('#jmMobile #loader-tab'),panel=tab.querySelector('.send-panel'),trigger=tab.querySelector('#irPoints').parentElement;return {panel:panel.getBoundingClientRect().width,select:trigger.getBoundingClientRect().width};}''')
   assert r['select']>r['panel']*.8,(theme,w,h,r)
   assert not errors,(theme,w,h,errors)
   print('PASS',theme,w,h,'easy tiles min height',round(size['minTileH']),'volume 37%, NAM/IR full-width')
   context.close()
 browser.close()
