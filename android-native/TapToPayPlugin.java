package com.remaprohub.pos;

import android.content.Context;
import android.content.pm.PackageManager;
import android.nfc.NfcAdapter;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "TapToPay")
public class TapToPayPlugin extends Plugin {
    private boolean nfcSupported() {
        Context context = getContext();
        return context != null
            && context.getPackageManager().hasSystemFeature(PackageManager.FEATURE_NFC)
            && NfcAdapter.getDefaultAdapter(context) != null;
    }

    private boolean nfcEnabled() {
        Context context = getContext();
        NfcAdapter adapter = context == null ? null : NfcAdapter.getDefaultAdapter(context);
        return adapter != null && adapter.isEnabled();
    }

    @PluginMethod
    public void capabilities(PluginCall call) {
        boolean supported = nfcSupported();
        boolean enabled = supported && nfcEnabled();
        boolean sdkLinked = false;

        JSObject result = new JSObject();
        result.put("provider", "worldline");
        result.put("platform", "android");
        result.put("androidApi", Build.VERSION.SDK_INT);
        result.put("nfcSupported", supported);
        result.put("nfcEnabled", enabled);
        result.put("sdkLinked", sdkLinked);
        result.put("available", supported && enabled && sdkLinked);
        result.put("reason", !supported ? "NFC_NOT_SUPPORTED"
            : !enabled ? "NFC_DISABLED"
            : !sdkLinked ? "WORLDLINE_SDK_NOT_LINKED"
            : "");
        call.resolve(result);
    }

    @PluginMethod
    public void startPayment(PluginCall call) {
        String intentId = call.getString("intentId", "");
        String provider = call.getString("provider", "worldline");
        String currency = call.getString("currency", "CHF");
        Integer amountMinor = call.getInt("amountMinor", 0);

        if (intentId == null || intentId.trim().isEmpty()) { call.reject("PAYMENT_INTENT_REQUIRED"); return; }
        if (!"worldline".equalsIgnoreCase(provider)) { call.reject("UNSUPPORTED_TAP_TO_PAY_PROVIDER"); return; }
        if (amountMinor == null || amountMinor <= 0) { call.reject("PAYMENT_AMOUNT_REQUIRED"); return; }
        if (currency == null || currency.trim().length() != 3) { call.reject("PAYMENT_CURRENCY_INVALID"); return; }
        if (!nfcSupported()) { call.reject("NFC_NOT_SUPPORTED"); return; }
        if (!nfcEnabled()) { call.reject("NFC_DISABLED"); return; }

        /*
         * WORLDLINE INTEGRATION POINT:
         * obtain a short-lived server session, hand the intent/amount/currency
         * to the official Tap on Mobile SDK, let Worldline own card/PIN UI,
         * then confirm capture authoritatively server-side.
         */
        call.reject("WORLDLINE_SDK_NOT_LINKED");
    }
}
