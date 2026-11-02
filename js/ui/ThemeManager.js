/** JamMate's visual skins do not change DSP, BLE, preset data, or current screen.
 * Stylesheets are exclusive to prevent medieval !important rules leaking into
 * Neon or Metal; values are persisted locally. */
const KEY = 'jammate.theme.v1';
const THEMES = Object.freeze(['neon', 'metal', 'medieval']);
let installed = false;
let repaint = null;
function sanitize(theme) { return THEMES.includes(theme) ? theme : 'metal'; }
export function currentJamMateTheme() {
  return sanitize(document.documentElement.dataset.jmTheme);
}
function setSheets(theme) {
  const medieval=document.getElementById('jmMedievalStyle');
  const metal=document.getElementById('jmMetalStyle');
  if (medieval) medieval.media=theme==='medieval' ? 'all' : 'not all';
  if (metal) metal.media=theme==='metal' ? 'all' : 'not all';
}
function syncControls(theme) {
  document.querySelectorAll('[data-jm-theme-select]').forEach(select => {
    if(select.value!==theme) {
      select.value=theme;
      // Update the CustomSelect visible trigger without bubbling a second
      // theme-selection event back into this manager.
      select.dispatchEvent(new Event('change',{bubbles:false}));
    }
  });
}
export function setJamMateTheme(value, {persist=true}={}) {
  const theme=sanitize(value);
  document.documentElement.dataset.jmTheme=theme;
  document.body.dataset.jmTheme=theme;
  // Old user-facing theme classes must not affect the new skins.
  document.body.classList.remove('light-theme', 'vintage-theme', 'color-theme');
  setSheets(theme);
  syncControls(theme);
  if(persist) { try {localStorage.setItem(KEY,theme);}catch (_){} }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',
    theme==='metal'?'#151f2a':theme==='medieval'?'#2c2016':'#030b19');
  repaint?.();
  document.dispatchEvent(new CustomEvent('jammate:theme', {detail:{theme}}));
  return theme;
}
export function installThemeManager(onRepaint) {
  repaint=onRepaint;
  if(!installed) {
    installed=true;
    // Change events bubble from the original legacy control and dynamic mobile
    // Setup control, including the app's custom touch dropdown implementation.
    document.addEventListener('change', e => {
      if(e.target.matches?.('[data-jm-theme-select]')) setJamMateTheme(e.target.value);
    });
  }
  let initial=currentJamMateTheme();
  try {initial=sanitize(localStorage.getItem(KEY) || initial);}catch (_){}
  setJamMateTheme(initial,{persist:false});
}
