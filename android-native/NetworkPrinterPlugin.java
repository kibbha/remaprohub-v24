package com.remaprohub.pos;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;

@CapacitorPlugin(name = "NetworkPrinter")
public class NetworkPrinterPlugin extends Plugin {
    private byte[] bytesFrom(JSArray data) throws Exception {
        if (data == null || data.length() == 0) throw new IllegalArgumentException("PRINTER_DATA_REQUIRED");
        byte[] out = new byte[data.length()];
        for (int i = 0; i < data.length(); i++) {
            Object raw = data.get(i);
            int value = raw instanceof Number ? ((Number) raw).intValue() : Integer.parseInt(String.valueOf(raw));
            if (value < 0 || value > 255) throw new IllegalArgumentException("PRINTER_BYTE_OUT_OF_RANGE");
            out[i] = (byte) value;
        }
        return out;
    }

    private String host(PluginCall call) {
        String value = call.getString("host", "");
        value = value == null ? "" : value.trim();
        if (value.isEmpty() || value.length() > 253) throw new IllegalArgumentException("PRINTER_HOST_REQUIRED");
        return value;
    }

    private int port(PluginCall call) {
        Integer value = call.getInt("port", 9100);
        int port = value == null ? 9100 : value;
        if (port < 1 || port > 65535) throw new IllegalArgumentException("PRINTER_PORT_INVALID");
        return port;
    }

    private int timeout(PluginCall call) {
        Integer value = call.getInt("timeoutMs", 4000);
        return Math.max(500, Math.min(15000, value == null ? 4000 : value));
    }

    @PluginMethod
    public void probe(PluginCall call) {
        new Thread(() -> {
            try (Socket socket = new Socket()) {
                socket.connect(new InetSocketAddress(host(call), port(call)), timeout(call));
                JSObject result = new JSObject();
                result.put("reachable", true);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("NETWORK_PRINTER_UNREACHABLE", error);
            }
        }, "remapro-network-printer-probe").start();
    }

    @PluginMethod
    public void print(PluginCall call) {
        new Thread(() -> {
            try (Socket socket = new Socket()) {
                String host = host(call);
                int port = port(call);
                int timeout = timeout(call);
                byte[] payload = bytesFrom(call.getArray("data"));
                socket.connect(new InetSocketAddress(host, port), timeout);
                socket.setSoTimeout(timeout);
                socket.setTcpNoDelay(true);
                try (OutputStream output = socket.getOutputStream()) {
                    output.write(payload);
                    output.flush();
                }
                JSObject result = new JSObject();
                result.put("ok", true);
                result.put("bytes", payload.length);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("NETWORK_PRINTER_SEND_FAILED", error);
            }
        }, "remapro-network-printer-send").start();
    }
}
