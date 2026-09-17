from pathlib import Path

p=Path('app/index.html')
s=p.read_text(encoding='utf-8')

old="""function setAppLanguage(lang){
  lang=I18N[lang]?lang:'fr';
  state.preferences=state.preferences||{};
  state.preferences.language=lang;
  try{localStorage.setItem('remaprohub-data',JSON.stringify(state));}catch(e){console.error('language persistence',e)}
  document.documentElement.lang=lang;"""
new="""function setAppLanguage(lang){
  lang=I18N[lang]?lang:'fr';
  state.preferences=state.preferences||{};
  state.preferences.language=lang;
  try{
    localStorage.setItem('remaprohub-language',lang);
    localStorage.setItem('remaprohub-data',JSON.stringify(state));
  }catch(e){console.error('language persistence',e)}
  document.documentElement.lang=lang;
  const appLanguage=document.getElementById('appLanguage');
  const profileLanguage=document.getElementById('profileLanguage');
  if(appLanguage&&appLanguage.value!==lang)appLanguage.value=lang;
  if(profileLanguage&&profileLanguage.value!==lang)profileLanguage.value=lang;"""
if old not in s:
    raise SystemExit('setAppLanguage signature block not found; refusing unsafe patch')
s=s.replace(old,new,1)

old_personal="state.preferences.language=document.getElementById('profileLanguage').value;saveState();toast('Profil personnel enregistré')"
new_personal="setAppLanguage(document.getElementById('profileLanguage').value);saveState();toast('Profil personnel enregistré')"
if old_personal not in s:
    raise SystemExit('savePersonalInfo language writer not found')
s=s.replace(old_personal,new_personal,1)

old_prefs="state.preferences.language=document.getElementById('appLanguage').value;state.preferences.numberFormat="
new_prefs="setAppLanguage(document.getElementById('appLanguage').value);state.preferences.numberFormat="
if old_prefs not in s:
    raise SystemExit('savePreferences language writer not found')
s=s.replace(old_prefs,new_prefs,1)

old_boot="""  function bootstrapLanguage(){
    const lang=state?.preferences?.language;
    document.documentElement.lang=validLang(lang)?lang:'fr';
  }"""
new_boot="""  function bootstrapLanguage(){
    let lang=null;
    try{lang=localStorage.getItem('remaprohub-language')}catch(e){}
    if(!validLang(lang))lang=state?.preferences?.language;
    lang=validLang(lang)?lang:'fr';
    state.preferences=state.preferences||{};
    state.preferences.language=lang;
    document.documentElement.lang=lang;
    try{__translationCache.clear();__translationReverse=null;}catch(e){}
    try{renderAll()}catch(e){console.error('language bootstrap renderAll',e)}
    try{applyLanguage()}catch(e){console.error('language bootstrap applyLanguage',e)}
    try{applyFullLanguage()}catch(e){console.error('language bootstrap applyFullLanguage',e)}
  }"""
if old_boot not in s:
    raise SystemExit('bootstrapLanguage block not found')
s=s.replace(old_boot,new_boot,1)

old_listener="""    if(el&&(el.matches?.('[data-rmp-language-selector]')||el.id==='profileLanguage'))setAppLanguage(el.value);"""
new_listener="""    if(el&&(el.matches?.('[data-rmp-language-selector]')||el.id==='profileLanguage')){
      setAppLanguage(el.value);
      try{applyLanguage()}catch(err){console.error('language change applyLanguage',err)}
      try{applyFullLanguage()}catch(err){console.error('language change applyFullLanguage',err)}
    }"""
if old_listener not in s:
    raise SystemExit('language change listener not found')
s=s.replace(old_listener,new_listener,1)

p.write_text(s,encoding='utf-8')
print('Language runtime patched successfully')
