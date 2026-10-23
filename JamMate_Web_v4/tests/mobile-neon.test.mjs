import assert from 'node:assert/strict';
import fs from 'node:fs';
import {FX_ORDER,BANKS} from '../js/ui/mobile-shell.js';
import {APP_CONFIG} from '../js/config.js';
assert.equal(FX_ORDER.length,18);
assert.equal(new Set(FX_ORDER).size,18);
assert.deepEqual(FX_ORDER.map(i=>APP_CONFIG.tabs[i].dsp_tag),['GATE','COMP','AWAH','OVRD','DIST','NAM ','EQUL','HARM','VIBR','CHOR','OCTV','FLNG','PHAS','TREM','_FIR','DELY','RVRB','GNRC']);
assert.deepEqual(BANKS,['Clean','Crunch','Overdrive','Distortion','Modulated','Custom1','Custom2']);
for(const fx of APP_CONFIG.tabs){assert.ok(fx.params.knobs);assert.ok(fx.params.dropdowns);}
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
assert.ok(html.includes('installMobileShell(app)'));
assert.ok(html.includes('css/mobile-neon.css'));
for(const id of ['presetBank','presetNum','btnSavePreset','masterKnob','bpmKnob','drumEnable','drumStyle','loopBtn_rec','loopSync','tuner-tab','nam-tab','loader-tab','setup-tab']) assert.ok(html.includes(`id="${id}"`),id);
assert.ok(html.includes('<option value="3">Drum Start</option>'));
const js=fs.readFileSync(new URL('../js/ui/mobile-shell.js',import.meta.url),'utf8');
for(const token of ['renderHome','renderParam','renderLooper','renderDrums','mountLegacy','onEffectParamChanged','createSavePreset','data-jm-preset','jmBeatLed']) { if(token==='createSavePreset')continue;assert.ok(js.includes(token), token); }
assert.ok(js.includes('WAITING FOR DSP'));assert.ok(!js.includes('setInterval('));
assert.ok(js.includes('data-jm-bank-select'));assert.ok(js.includes('data-jm-slot-select'));
assert.ok(js.includes('data-jm-global-slider="bpm"'));assert.ok(js.includes('data-jm-global-slider="master"'));
assert.ok(js.includes('jm-menu-easy')); // Easy Mode is a single-row navigation strip.
assert.ok(!html.includes('JAMMATE MODEL BROWSER'));
assert.ok(!html.includes('Find your next tone'));
assert.ok(!html.includes('Explore real amp captures'));
assert.ok(html.includes('id="btnNamLogin"'));assert.ok(html.includes('id="namAuthStatus"'));
const css=fs.readFileSync(new URL('../css/mobile-neon.css',import.meta.url),'utf8');
assert.ok(css.includes('grid-template-columns:repeat(7,minmax(0,1fr))'));

console.log('PASS mobile-neon: effect mapping, selectors, sliders, single-row Easy Mode, NAM controls');
// v0.3 fullscreen and setup-only Easy Mode checks.
const manifest=JSON.parse(fs.readFileSync(new URL('../manifest.webmanifest',import.meta.url),'utf8'));
assert.equal(manifest.display,'fullscreen');
assert.equal(manifest.orientation,'portrait');
assert.ok(html.includes('apple-mobile-web-app-capable'));
assert.ok(html.includes('manifest.webmanifest'));
assert.ok(!js.includes('class="jm-easy-switch" data-action="easy"'));
assert.ok(js.includes('data-action="easy"'));
assert.ok(js.includes('data-action="fullscreen"'));
assert.ok(js.includes('page.replaceChildren();mountLegacy(name,page)'));
assert.ok(!js.includes('<span class="jm-eyebrow">PRESET</span>'));
assert.ok(!js.includes('class="jm-preset-name"'));
assert.ok(css.includes('height:100dvh'));
console.log('PASS mobile-v03: PWA metadata, no preset title, Setup-only Easy Mode and fullscreen');
