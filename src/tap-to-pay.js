import {recordDiagnostic} from './telemetry.js';

const nativePlatform=()=>Boolean(globalThis.Capacitor?.isNativePlatform?.());
const nativeTapPlugin=()=>globalThis.Capacitor?.Plugins?.TapToPay||null;

const baseCapability=(overrides={})=>({
  provider:'worldline',
  platform:nativePlatform()?'android':'web',
  native:nativePlatform(),
  nfcSupported:false,
  nfcEnabled:false,
  sdkLinked:false,
  available:false,
  reason:nativePlatform()?'TAP_TO_PAY_PLUGIN_UNAVAILABLE':'NATIVE_ANDROID_REQUIRED',
  ...overrides
});

export async function tapToPayCapabilities(){
  if(!nativePlatform())return baseCapability();
  const plugin=nativeTapPlugin();
  if(!plugin?.capabilities)return baseCapability();
  try{
    const result=await plugin.capabilities();
    return baseCapability({
      ...result,
      native:true,
      nfcSupported:result?.nfcSupported===true,
      nfcEnabled:result?.nfcEnabled===true,
      sdkLinked:result?.sdkLinked===true,
      available:result?.available===true,
      reason:String(result?.reason||'')
    });
  }catch(error){
    void recordDiagnostic('tap_to_pay.capabilities_error',{message:error?.message||String(error)});
    return baseCapability({reason:error?.message||'CAPABILITY_CHECK_FAILED'});
  }
}

export async function startTapToPayPayment({intentId,provider='worldline',method='card',amountMinor,currency='CHF'}={}){
  if(!nativePlatform())throw new Error('NATIVE_ANDROID_REQUIRED');
  const plugin=nativeTapPlugin();
  if(!plugin?.startPayment)throw new Error('TAP_TO_PAY_PLUGIN_UNAVAILABLE');
  const minor=Math.trunc(Number(amountMinor)||0);
  if(!intentId)throw new Error('PAYMENT_INTENT_REQUIRED');
  if(minor<=0)throw new Error('PAYMENT_AMOUNT_REQUIRED');
  const result=await plugin.startPayment({
    intentId:String(intentId),
    provider:String(provider||'worldline'),
    method:String(method||'card'),
    amountMinor:minor,
    currency:String(currency||'CHF').toUpperCase()
  });
  if(result?.started!==true)throw new Error(String(result?.reason||'TAP_TO_PAY_NOT_STARTED'));
  return result;
}

export function tapToPayErrorMessage(error){
  const code=String(error?.code||error?.message||error||'');
  if(code.includes('WORLDLINE_SDK_NOT_LINKED'))return 'Tap to Pay est préparé, mais le SDK Worldline doit encore être activé avec le contrat partenaire.';
  if(code.includes('NFC_DISABLED'))return 'Activez le NFC de cet appareil pour utiliser Tap to Pay.';
  if(code.includes('NFC_NOT_SUPPORTED'))return 'Cet appareil ne possède pas le NFC requis pour Tap to Pay.';
  if(code.includes('NATIVE_ANDROID_REQUIRED'))return 'Tap to Pay nécessite l’application Android ReMaPro POS sur un appareil NFC compatible.';
  return 'Tap to Pay indisponible : '+(error?.message||String(error||'erreur inconnue'));
}
