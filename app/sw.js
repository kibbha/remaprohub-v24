const CACHE='remaprohub-v27-shell-7852629a98e2';
const ASSETS=["./","./index.html","./bootstrap.js","./runtime-config.js","./privacy-policy.html","./account-deletion.html","./order.html","./order.css","./order.js","./styles.css","./icons.svg","./manifest.json","./icon.svg","./src/academy-content.js","./src/academy.js","./src/accounting.js","./src/ai.js","./src/app.js","./src/billing.js","./src/cloud.js","./src/delivery-ai.js","./src/floor-plan.js","./src/i18n.js","./src/integrations.js","./src/intelligence.js","./src/legal.js","./src/pos-layout.js","./src/pos.js","./src/restored.js","./src/security.js","./src/service-overview.js","./src/store.js","./src/telemetry.js","./src/workspace-storage.js"];
const assetPaths=new Set(ASSETS.map(path=>new URL(path,self.registration.scope).pathname));
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(names=>Promise.all(names.filter(name=>name.startsWith('remaprohub-')&&name!==CACHE).map(name=>caches.delete(name)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put('./index.html',copy)))}return response}).catch(()=>caches.match('./index.html')));
    return;
  }
  if(!assetPaths.has(url.pathname))return;
  if(url.pathname.endsWith('/runtime-config.js')){
    event.respondWith(fetch(request).then(response=>{
      if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)))}
      return response;
    }).catch(()=>caches.match(request)));
    return;
  }
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)))}return response})));
});
