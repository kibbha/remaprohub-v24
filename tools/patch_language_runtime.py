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
  state.user=state.user||{};
  state.preferences.language=lang;
  state.user.language=lang;
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

p.write_text(s,encoding='utf-8')
print('Language runtime patched successfully')
