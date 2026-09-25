const CACHE='remapro-pos-shell-v0285-final-audit-20260923';
const CORE=['./','./index.html','./manifest.webmanifest','./runtime-config.js','./src/app.js','./src/cloud.js','./src/db.js','./src/printer.js','./src/tap-to-pay.js','./src/layout.js','./src/academy-content.js','./src/academy.js','./src/i18n.js','./src/ui.js','./src/telemetry.js','./src/resilience.js','./src/direct-orders.js','./src/styles.css','./assets/icon.svg'];
const corePaths=new Set(CORE.map(path=>new URL(path,self.registration.scope).pathname));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('remapro-pos-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).then(response=>{
      if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put('./index.html',copy)))}
      return response;
    }).catch(()=>caches.match('./index.html')));
    return;
  }
  if(!corePaths.has(url.pathname))return;
  if(url.pathname.endsWith('/runtime-config.js')){
    event.respondWith(fetch(request).then(response=>{
      if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)))}
      return response;
    }).catch(()=>caches.match(request)));
    return;
  }
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{
    if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)))}
    return response;
  })));
});
