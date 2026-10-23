const CACHE='jammate-ui-v09-bpm';
const SHELL=['./','./index.html','./manifest.webmanifest','./css/mobile-neon.css','./css/medieval.css','./css/metal.css','./js/ui/ThemeManager.js','./assets/medieval-filigree.svg','./assets/medieval-crest.svg','./assets/metal-grain.svg','./css/main.css','./css/components.css','./css/nam-v2b.css','./js/app.js','./js/ui/mobile-shell.js','./js/ui/IIRDesigner.js','./js/ui/CustomSelect.js'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('jammate-ui-')&&k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',event=>{
 const r=event.request;
 if(r.method!=='GET'||new URL(r.url).origin!==self.location.origin)return;
 event.respondWith(fetch(r).catch(()=>caches.match(r,{ignoreSearch:true})));
});
