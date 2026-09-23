(()=>{
  const root=()=>document.getElementById('app');
  let failed=false;
  const renderFatal=(reason='BOOT_FAILED')=>{
    if(failed)return;
    const host=root();
    if(!host||host.children.length||host.textContent?.trim())return;
    failed=true;
    host.innerHTML='<section id="remapro-boot-fatal" style="min-height:100dvh;display:grid;place-items:center;padding:24px;background:#f5ede4;color:#3f342c;font-family:system-ui,sans-serif"><div style="max-width:520px;text-align:center;background:#fffaf5;border:1px solid #e5d7ca;border-radius:20px;padding:24px;box-shadow:0 18px 45px #52331f18"><strong style="font-family:Georgia,serif;font-size:28px">ReMaPro Hub</strong><h1 style="font-size:18px;margin:14px 0 8px">Impossible de démarrer l’application</h1><p style="font-size:13px;line-height:1.5;color:#75685e">Une ressource de l’application n’a pas pu être chargée. Vos données locales ne sont pas supprimées.</p><small style="display:block;margin:10px 0 18px;color:#9a8778">Code : '+String(reason).replace(/[^A-Z0-9_.:-]/gi,'').slice(0,60)+'</small><div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button id="remapro-boot-retry" style="border:0;border-radius:11px;background:#bd5a34;color:white;padding:11px 16px;font-weight:800">Réessayer</button><button id="remapro-boot-cache" style="border:1px solid #d9c8b9;border-radius:11px;background:white;color:#5c4c40;padding:11px 16px;font-weight:800">Réinitialiser le cache</button></div></div></section>';
    document.getElementById('remapro-boot-retry')?.addEventListener('click',()=>location.reload());
    document.getElementById('remapro-boot-cache')?.addEventListener('click',async()=>{
      try{
        if('caches' in globalThis)for(const name of await caches.keys())if(name.startsWith('remaprohub-'))await caches.delete(name);
        if('serviceWorker' in navigator)for(const reg of await navigator.serviceWorker.getRegistrations())await reg.unregister();
      }catch{}
      location.reload();
    });
  };
  addEventListener('error',event=>setTimeout(()=>renderFatal(event?.error?.name||'SCRIPT_ERROR'),0));
  addEventListener('unhandledrejection',event=>setTimeout(()=>renderFatal(event?.reason?.name||'PROMISE_REJECTION'),0));
  setTimeout(()=>renderFatal('BOOT_TIMEOUT'),8000);
  if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();
