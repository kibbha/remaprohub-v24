export const PAYMENT_METHODS=['cash','card','twint','voucher','invoice','other'];

export function normalizePosSettings(input) {
  const payments=Object.fromEntries(PAYMENT_METHODS.map(method=>[method,input?.payments?.[method]!==false]));
  const warning=Number(input?.kdsWarningMinutes),critical=Number(input?.kdsCriticalMinutes);
  const kdsWarningMinutes=Number.isInteger(warning)&&warning>=1&&warning<=120?warning:12;
  return{
    payments,
    kdsWarningMinutes,
    kdsCriticalMinutes:Number.isInteger(critical)&&critical>kdsWarningMinutes&&critical<=180?critical:Math.max(20,kdsWarningMinutes+1)
  };
}

export const paymentAllowed=(settings,method)=>settings?.payments?.[String(method||'').toLowerCase()]!==false;
