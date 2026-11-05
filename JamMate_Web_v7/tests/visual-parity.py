"""Compare v7/v8 rendered graphics; only runtime/transport code may differ."""
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from io import BytesIO
from PIL import Image,ImageChops
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-gpu'])
  for width,height in [(390,844),(1280,900)]:
   pages=[]
   for version in (7,8):
    page=browser.new_page(viewport={'width':width,'height':height})
    page.goto(f'http://127.0.0.1:{server.server_port}/JamMate_Web_v{version}/',wait_until='networkidle')
    page.evaluate('document.fonts.ready');pages.append(page)
   for theme in ['neon','metal','medieval']:
    for version,page in zip((7,8),pages):page.evaluate("async ({theme,version})=>{const q=version===7?'16-uart-tx':'8.3';const m=await import('./js/ui/ThemeManager.js?v='+q);m.setJamMateTheme(theme);}",dict(theme=theme,version=version))
    for screen in ['home','fx','drums','looper','setup','tuner']:
     for page in pages:
      page.evaluate('window.JamMateMobile.setEasy(false)')
      if screen!='home':page.locator(f'[data-screen="{screen}"]').first.click(force=True)
     pages[0].evaluate("""()=>{document.querySelectorAll('#jmMobile .jm-ring,#jmMobile .jm-metric-row,#jmBeatLed,#jmBeatText').forEach(el=>el.remove());document.querySelectorAll('#jmMobile .jm-note').forEach(el=>{if(el.textContent.includes('Beat timing'))el.remove();});}""")
     for page in pages:
      page.evaluate('document.fonts.ready')
      page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
     images=[Image.open(BytesIO(page.screenshot(animations='disabled'))).convert('RGB') for page in pages]
     diff=ImageChops.difference(*images)
     if diff.getbbox():
      images[0].save('/tmp/jm-v7.png');images[1].save('/tmp/jm-v8.png')
     assert all(high<=4 for low,high in diff.getextrema()),f'Graphics changed beyond 4/255 rasterization tolerance: {width} {theme} {screen}, box {diff.getbbox()}'
   for page in pages:page.close()
  browser.close()
 print('PASS rendered parity except requested removal of live telemetry (4/255 rasterization tolerance): home, FX, drums, looper, setup, tuner; mobile/desktop, three themes')
finally:
 server.shutdown();server.server_close()
