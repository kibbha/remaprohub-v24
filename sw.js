const CACHE='remapro-pos-shell-v0270-beta-hardening-20260923';
const CORE=['./','./index.html','./manifest.webmanifest','./runtime-config.js','./src/app.js','./src/cloud.js','./src/db.js','./src/printer.js','./src/layout.js','./src/academy-content.js','./src/academy.js','./src/i18n.js','./src/ui.js','./src/styles.css','./assets/icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('remapro-pos-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  event.respondWith(fetch(event.request).then(response=>{
    const copy=response.clone();
    caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{});
    return response;
  }).catch(()=>caches.match(event.request).then(hit=>hit||caches.match('./index.html'))));
});
