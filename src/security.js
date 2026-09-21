const SETTINGS_KEY='rmp.security.settings';
const EMAIL_KEY='rmp.security.email';
const DEFAULTS={biometricEnabled:false,lockMinutes:5,lockOnBackground:true};

const nativeBiometric=()=>globalThis.Capacitor?.isNativePlatform?.()?globalThis.Capacitor?.Plugins?.NativeBiometric:null;

export function securitySettings(){
  try{
    const raw=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'null')||{};
    const lockMinutes=[0,1,5,15,30].includes(+raw.lockMinutes)?+raw.lockMinutes:DEFAULTS.lockMinutes;
    return {...DEFAULTS,...raw,lockMinutes,biometricEnabled:!!raw.biometricEnabled,lockOnBackground:raw.lockOnBackground!==false};
  }catch{return {...DEFAULTS}}
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
export async function biometricAvailability(){
  const plugin=nativeBiometric();
  if(!plugin)return{isAvailable:false,deviceIsSecure:false,strongBiometryIsAvailable:false};
  try{return await plugin.isAvailable()}catch{return{isAvailable:false,deviceIsSecure:false,strongBiometryIsAvailable:false}}
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
