/* ReMaPro Hub language runtime hardening. */
(function(){
 const KEY='remaprohub-language';
 function valid(l){return typeof I18N!=='undefined'&&I18N&&I18N[l]?l:'fr'}
 function sync(l){for(const id of ['appLanguage','profileLanguage']){const e=document.getElementById(id);if(e&&e.value!==l)e.value=l}}
 const base=window.setAppLanguage;if(typeof base!=='function')return;
 window.setAppLanguage=function(l){l=valid(l);state.preferences=state.preferences||{};state.user=state.user||{};state.preferences.language=l;state.user.language=l;try{localStorage.setItem(KEY,l);localStorage.setItem('remaprohub-data',JSON.stringify(state))}catch(e){console.error('language persistence',e)}const r=base(l);sync(l);document.documentElement.lang=l;return r};
 const l=valid(localStorage.getItem(KEY)||state?.preferences?.language||state?.user?.language||'fr');if(state?.preferences)state.preferences.language=l;if(state?.user)state.user.language=l;sync(l);
})();
