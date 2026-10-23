"""Playwright regression test for NAM model-card inline expansion.
Run: python tests/test-inline.py (requires playwright and Chromium).
"""
import re
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
HTML = (ROOT / 'tests/nam-inline-harness.html').read_text()
HTML = re.sub(r'<script type="module">.*?</script>', '', HTML, flags=re.DOTALL)
HTML = re.sub(r'<link rel="stylesheet"[^>]*>', '', HTML)
CSS = (ROOT / 'css/nam-v2b.css').read_text()
JS = (ROOT / 'js/ui/NamBrowserV2b.js').read_text()
JS = JS.replace("import { BLEService } from '../services/BLEService.js';", "const BLEService = {isConnected:false};")
JS = JS.replace('export const NamBrowserV2b = {', 'window.NamBrowserV2b = {')
INIT = """() => {
const tones = Array.from({length:12},(_,i)=>({id:i+1,title:`Tone Pack ${i+1}`,user:{display_name:`Maker ${i+1}`},gear:'amp',format:'nam',a2_models_count:3,downloads_count:1200+i*141}));
const loader={isAuthed:()=>true,search:async()=>({data:tones,total:tones.length,total_pages:1}),listToneModels:async id=> [{name:`${id} Clean`,size:'lite',model_url:'https://example.invalid/clean.nam'},{name:`${id} Crunch`,size:'lite',model_url:'https://example.invalid/crunch.nam'}]};
window.NamBrowserV2b.init(loader);
window.browser=window.NamBrowserV2b;
}"""

def load(page):
    page.set_content(HTML, wait_until='domcontentloaded')
    page.add_style_tag(content=CSS)
    page.add_script_tag(content=JS)
    page.evaluate(INIT)

with sync_playwright() as playwright:
    b=playwright.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    context=b.new_context()
    try:
        for width,height in [(1200,850),(390,790)]:
            page=context.new_page()
            page.set_viewport_size({'width':width,'height':height})
            errors=[]
            page.on('pageerror',lambda err: errors.append(str(err)))
            load(page)
            page.wait_for_selector('.nam-tone-card:nth-child(12)')
            # Select tone 7. Desktop panel must follow tone 8 (end of row),
            # while single-column mobile panel follows tone 7.
            card=page.locator('.nam-tone-card').nth(6)
            card.scroll_into_view_if_needed()
            card.click()
            panel=page.locator('#namDetailPanel')
            panel.wait_for(state='visible')
            page.locator('#namModelSelect option').first.wait_for(state='attached')
            assert '7 Clean' in page.locator('#namModelSelect').inner_text()
            idx=page.evaluate('''() => {const grid=document.querySelector('#namGrid');const children=[...grid.children];return {panel:children.indexOf(document.querySelector('#namDetailPanel')),card:children.indexOf(document.querySelectorAll('.nam-tone-card')[6]), after:document.querySelector('#namDetailPanel').previousElementSibling?.dataset?.toneId, parent:document.querySelector('#namDetailPanel').parentElement?.id, expanded:document.querySelectorAll('.nam-tone-card')[6].getAttribute('aria-expanded')}}''')
            assert idx['parent']=='namGrid',idx
            assert idx['after']==('8' if width>680 else '7'),idx
            assert idx['expanded']=='true',idx
            # After selection, the details panel stays near clicked card, not at the top.
            assert page.evaluate("document.querySelector('#namDetailPanel').getBoundingClientRect().top") > page.evaluate("document.querySelectorAll('.nam-tone-card')[6].getBoundingClientRect().top")
            # The model dropdown still selects the correct A2 variant.
            page.locator('#namModelSelect').select_option('1')
            assert page.evaluate('window.browser.selectedModel.name') == '7 Crunch'
            # When BLE is disconnected, the transfer is safely blocked.
            page.get_by_text('Send to JamMate', exact=False).click()
            assert 'Connect JamMate over BLE' in page.locator('#namModelNotice').inner_text()
            # Switching pack repositions to that pack's row and selects its first A2 variant.
            page.locator('.nam-tone-card').nth(2).click()
            page.locator('#namModelSelect option').first.wait_for(state='attached')
            assert '3 Clean' in page.locator('#namModelSelect').inner_text()
            assert page.evaluate("document.querySelector('#namDetailPanel').previousElementSibling?.dataset.toneId") == ('4' if width>680 else '3')
            assert page.locator('.nam-tone-card[aria-expanded="true"]').count()==1
            # Collapsing by clicking same card.
            page.locator('.nam-tone-card').nth(2).click()
            assert panel.is_hidden()
            assert page.locator('.nam-tone-card[aria-expanded="true"]').count()==0
            # Selecting tone after collapse, then perform another search and ensure panel survives.
            page.locator('.nam-tone-card').nth(10).click()
            page.locator('#namModelSelect option').first.wait_for(state='attached')
            assert '11 Clean' in page.locator('#namModelSelect').inner_text()
            page.evaluate('window.browser.search(1)')
            page.wait_for_selector('.nam-tone-card:nth-child(12)')
            assert page.locator('#namDetailPanel').count()==1
            page.locator('.nam-tone-card').nth(9).click()
            page.locator('#namModelSelect option').first.wait_for(state='attached')
            assert '10 Clean' in page.locator('#namModelSelect').inner_text()
            assert panel.is_visible()
            assert not errors, errors
            page.screenshot(path=str(ROOT/f'tests/nam-inline-{width}px.png'),full_page=True)
            print(f'PASS {width}px: inline placement, switch, collapse, search, reselect, no errors')
            page.close()
        # Responsive relayout while selection remains expanded.
        p=context.new_page()
        p.set_viewport_size({'width':1100,'height':900})
        load(p)
        p.locator('.nam-tone-card').nth(6).click()
        p.locator('#namModelSelect option').first.wait_for(state='attached')
        assert p.evaluate("document.querySelector('#namDetailPanel').previousElementSibling.dataset.toneId")=='8'
        p.set_viewport_size({'width':390,'height':790})
        p.wait_for_timeout(100)
        assert p.evaluate("document.querySelector('#namDetailPanel').previousElementSibling.dataset.toneId")=='7'
        print('PASS resize: expansion follows selected row when switching layout')
    finally:
        b.close()

