import{recordDiagnostic}from'./telemetry.js';
const SETTINGS_KEY='rmp.security.settings';
const EMAIL_KEY='rmp.security.email';
const DEVELOPER_KEY='rmp.security.developer';
const DEFAULTS={biometricEnabled:false,lockMinutes:5,lockOnBackground:true};

const nativeBiometric=()=>globalThis.Capacitor?.isNativePlatform?.()?globalThis.Capacitor?.Plugins?.NativeBiometric:null;
const secureStorage=()=>globalThis.Capacitor?.isNativePlatform?.()?globalThis.Capacitor?.Plugins?.SecureStoragePlugin:null;
const normalizeDeveloperAlias=value=>String(value||'').trim().toLowerCase();

export function securitySettings(){
  try{
    const raw=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'null')||{};
    const lockMinutes=[0,1,5,15,30].includes(+raw.lockMinutes)?+raw.lockMinutes:DEFAULTS.lockMinutes;
    return {...DEFAULTS,...raw,lockMinutes,biometricEnabled:!!raw.biometricEnabled,lockOnBackground:raw.lockOnBackground!==false};
  }catch(error){recordDiagnostic('security.settings_parse_error',{message:error?.message||String(error)});return {...DEFAULTS}}
}
export function updateSecuritySettings(patch={}){
  const current=securitySettings(),next={...current,...patch};
  next.biometricEnabled=!!next.biometricEnabled;
  next.lockOnBackground=next.lockOnBackground!==false;
  next.lockMinutes=[0,1,5,15,30].includes(+next.lockMinutes)?+next.lockMinutes:DEFAULTS.lockMinutes;
  localStorage.setItem(SETTINGS_KEY,JSON.stringify(next));
  return next;
}
export function rememberedSecurityEmail(){return String(localStorage.getItem(EMAIL_KEY)||'').trim().toLowerCase()}
export function rememberSecurityEmail(email){
  const value=String(email||'').trim().toLowerCase();
  if(value)localStorage.setItem(EMAIL_KEY,value);else localStorage.removeItem(EMAIL_KEY);
  return value;
}
export function validDeveloperAlias(alias){return /^[a-z0-9._-]{3,32}$/.test(normalizeDeveloperAlias(alias))}
export async function loadDeveloperAccess(){
  const plugin=secureStorage();let raw='';
  if(plugin)try{raw=String((await plugin.get({key:DEVELOPER_KEY}))?.value||'')}catch(error){recordDiagnostic('security.secure_storage_read_error',{key:'developer',message:error?.message||String(error)})}
  if(!raw)raw=String(localStorage.getItem(DEVELOPER_KEY)||'');
  try{
    const value=JSON.parse(raw||'null');
    if(!value?.enabled||!validDeveloperAlias(value.alias)||!String(value.email||'').includes('@'))return null;
    return {enabled:true,alias:normalizeDeveloperAlias(value.alias),email:String(value.email).trim().toLowerCase()};
  }catch(error){recordDiagnostic('security.developer_access_parse_error',{message:error?.message||String(error)});return null}
}
export async function saveDeveloperAccess({alias,email,enabled=true}={}){
  const value={enabled:!!enabled,alias:normalizeDeveloperAlias(alias),email:String(email||'').trim().toLowerCase()};
  if(!value.enabled)return clearDeveloperAccess();
  if(!validDeveloperAlias(value.alias)||!value.email.includes('@'))throw new Error('DEVELOPER_ACCESS_INVALID');
  const raw=JSON.stringify(value),plugin=secureStorage();
  if(plugin){await plugin.set({key:DEVELOPER_KEY,value:raw});localStorage.removeItem(DEVELOPER_KEY)}
  else localStorage.setItem(DEVELOPER_KEY,raw);
  return value;
}
export async function clearDeveloperAccess(){
  localStorage.removeItem(DEVELOPER_KEY);
  const plugin=secureStorage();if(plugin)try{await plugin.remove({key:DEVELOPER_KEY})}catch(error){recordDiagnostic('security.secure_storage_remove_error',{key:'developer',message:error?.message||String(error)})}
  return null;
}
export function developerAliasMatches(input,profile){return!!profile?.enabled&&normalizeDeveloperAlias(input)===normalizeDeveloperAlias(profile.alias)}
export async function biometricAvailability(){
  const plugin=nativeBiometric();
  if(!plugin)return{isAvailable:false,deviceIsSecure:false,strongBiometryIsAvailable:false};
  try{return await plugin.isAvailable()}catch(error){recordDiagnostic('security.biometric_availability_error',{message:error?.message||String(error)});return{isAvailable:false,deviceIsSecure:false,strongBiometryIsAvailable:false}}
}
export async function verifyBiometric(){
  const plugin=nativeBiometric();
  if(!plugin)throw new Error('BIOMETRIC_UNAVAILABLE');
  const status=await biometricAvailability();
  if(!status?.isAvailable)throw new Error('BIOMETRIC_UNAVAILABLE');
  await plugin.verifyIdentity({
    reason:'Déverrouiller ReMaPro Hub',
    title:'ReMaPro Hub',
    subtitle:'Authentification requise',
    description:'Confirmez votre identité pour accéder à l’application.',
    negativeButtonText:'Utiliser le mot de passe',
    useFallback:true
  });
  return true;
}
export function shouldRelock(hiddenAt,now=Date.now(),settings=securitySettings()){
  if(!settings.lockOnBackground||!hiddenAt)return false;
  const delay=Math.max(0,+settings.lockMinutes||0)*60_000;
  return now-hiddenAt>=delay;
}
