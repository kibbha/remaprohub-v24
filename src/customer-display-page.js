import {readCustomerDisplaySnapshot,subscribeCustomerDisplay} from './customer-display.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=(value,currency='CHF')=>new Intl.NumberFormat(navigator.language||'fr-CH',{style:'currency',currency:currency||'CHF'}).format(Number(value)||0);
function render(snapshot){
  if(!snapshot)return;
  document.getElementById('restaurant').textContent=snapshot.restaurantName||'Restaurant';
  const meta=[snapshot.tableLabel,snapshot.covers?(String(snapshot.covers)+' couvert'+(snapshot.covers>1?'s':'')):''].filter(Boolean).join(' · ');
  document.getElementById('status').textContent=meta||'Commande en cours';
  document.getElementById('total').textContent=money(snapshot.total,snapshot.currency);
  const root=document.getElementById('items'),items=Array.isArray(snapshot.items)?snapshot.items:[];
  root.innerHTML=items.length?items.map(x=>'<div class="line"><span class="qty">'+(Number(x.qty)||0)+'×</span><span><strong>'+esc(x.name)+'</strong>'+(x.note?'<small class="note">'+esc(x.note)+'</small>':'')+'</span><strong>'+money(x.lineTotal,snapshot.currency)+'</strong></div>').join(''):'<div class="empty">Votre commande s’affichera ici.</div>';
}
render(readCustomerDisplaySnapshot());subscribeCustomerDisplay(render);
