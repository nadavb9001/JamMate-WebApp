const CACHE='jammate-ui-v03';
const SHELL=['./','./index.html','./manifest.webmanifest','./css/mobile-neon.css','./css/main.css','./css/components.css','./css/nam-v2b.css','./js/app.js','./js/ui/mobile-shell.js'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('jammate-ui-')&&k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',event=>{
 const r=event.request;
 if(r.method!=='GET'||new URL(r.url).origin!==self.location.origin)return;
 event.respondWith(fetch(r).catch(()=>caches.match(r,{ignoreSearch:true})));
});
