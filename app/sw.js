const CACHE='remaprohub-v27-shell-e23e96e07644';
const ASSETS=['./','./index.html','./styles.css','./icons.svg','./manifest.json','./assets-remaprohub-logo.png','./src/app.js','./src/i18n.js','./src/store.js'];
const assetPaths=new Set(ASSETS.map(path=>new URL(path,self.registration.scope).pathname));
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(names=>Promise.all(names.filter(name=>name.startsWith('remaprohub-')&&name!==CACHE).map(name=>caches.delete(name)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin||(!assetPaths.has(url.pathname)&&request.mode!=='navigate'))return;event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)))}return response}).catch(async()=>await caches.match(request)||await caches.match('./index.html')))});
