const CACHE='remaprohub-v27-shell-academy-5e287e54e0';
const ASSETS=['./','./index.html','./bootstrap.js','./runtime-config.js','./privacy-policy.html','./account-deletion.html','./styles.css','./icons.svg','./manifest.json','./icon.svg','./assets-remaprohub-logo.png','./src/app.js','./src/restored.js','./src/i18n.js','./src/store.js','./src/ai.js','./src/cloud.js','./src/legal.js','./src/billing.js','./src/security.js','./src/intelligence.js','./src/pos.js','./src/pos-layout.js','./src/delivery-ai.js','./src/academy-content.js','./src/academy.js'];
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
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)))}return response})));
});
