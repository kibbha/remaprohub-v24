const toggle=document.querySelector('.menu-toggle');
const nav=document.querySelector('.nav');

if(toggle&&nav){
  const closeMenu=()=>{
    nav.classList.remove('open');
    toggle.setAttribute('aria-expanded','false');
    toggle.setAttribute('aria-label','Ouvrir le menu');
  };

  toggle.addEventListener('click',()=>{
    const open=nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded',String(open));
    toggle.setAttribute('aria-label',open?'Fermer le menu':'Ouvrir le menu');
  });

  nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeMenu));

  document.addEventListener('keydown',e=>{
    if(e.key==='Escape') closeMenu();
  });

  document.addEventListener('click',e=>{
    if(nav.classList.contains('open')&&!nav.contains(e.target)&&!toggle.contains(e.target)) closeMenu();
  });
}
