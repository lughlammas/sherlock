package com.lughlabs.sherlock;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * JS ↔ classical UCI. Supports multiple concurrent liblughnasadh.so processes
 * keyed by engineId (main / white / black) for CASO CRUZADO dual-engine matches.
 */
public class UciEngineBridge {
    private static final String TAG = "SherlockUci";
    private static final String LIB_NAME = "liblughnasadh.so";
    private static final String DEFAULT_ID = "main";

    private final Context appContext;
    private final WebView webView;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newCachedThreadPool();
    private final Map<String, EngineSlot> slots = new ConcurrentHashMap<>();

    public UciEngineBridge(Context context, WebView webView) {
        this.appContext = context.getApplicationContext();
        this.webView = webView;
    }

    @JavascriptInterface
    public boolean isAvailable() {
        return true;
    }

    /** Legacy single-arg start → main slot */
    @JavascriptInterface
    public synchronized String start() {
        return start(DEFAULT_ID);
    }

    @JavascriptInterface
    public synchronized String start(String engineId) {
        final String id = normalizeId(engineId);
        quitInternal(id);
        try {
            File bin = resolveEngineBinary();
            if (bin == null || !bin.exists()) {
                return jsonErr("Engine binary not found (liblughnasadh.so)");
            }
            if (!bin.canExecute()) {
                //noinspection ResultOfMethodCallIgnored
                bin.setExecutable(true);
            }

            ProcessBuilder pb = new ProcessBuilder(bin.getAbsolutePath());
            pb.redirectErrorStream(true);
            pb.directory(bin.getParentFile());
            Process process = pb.start();
            OutputStreamWriter stdin =
                    new OutputStreamWriter(process.getOutputStream(), StandardCharsets.UTF_8);
            EngineSlot slot = new EngineSlot(id, process, stdin);
            slots.put(id, slot);

            io.execute(() -> readStdout(slot));
            io.execute(() -> waitForExit(slot));

            JSONObject ok = new JSONObject();
            ok.put("ok", true);
            ok.put("path", bin.getAbsolutePath());
            ok.put("engineId", id);
            return ok.toString();
        } catch (Exception e) {
            Log.e(TAG, "start failed [" + id + "]", e);
            return jsonErr(e.getMessage() != null ? e.getMessage() : "start failed");
        }
    }

    /** Legacy: send(line) → main */
    @JavascriptInterface
    public synchronized void send(String line) {
        send(DEFAULT_ID, line);
    }

    @JavascriptInterface
    public synchronized void send(String engineId, String line) {
        final String id = normalizeId(engineId);
        EngineSlot slot = slots.get(id);
        if (slot == null || !slot.alive.get() || slot.stdin == null || line == null) return;
        try {
            slot.stdin.write(line);
            if (!line.endsWith("\n")) slot.stdin.write("\n");
            slot.stdin.flush();
        } catch (Exception e) {
            Log.e(TAG, "send failed [" + id + "]: " + line, e);
            dispatchError(id, e.getMessage() != null ? e.getMessage() : "send failed");
        }
    }

    @JavascriptInterface
    public synchronized void stop() {
        stop(DEFAULT_ID);
    }

    @JavascriptInterface
    public synchronized void stop(String engineId) {
        send(normalizeId(engineId), "stop");
    }

    @JavascriptInterface
    public synchronized void quit() {
        quit(DEFAULT_ID);
    }

    @JavascriptInterface
    public synchronized void quit(String engineId) {
        quitInternal(normalizeId(engineId));
    }

    @JavascriptInterface
    public synchronized String startEngine(String engineId) {
        return start(engineId);
    }

    @JavascriptInterface
    public synchronized void sendLine(String engineId, String line) {
        send(engineId, line);
    }

    @JavascriptInterface
    public synchronized void stopEngine(String engineId) {
        stop(engineId);
    }

    @JavascriptInterface
    public synchronized void quitEngine(String engineId) {
        quit(engineId);
    }

    private void quitInternal(String id) {
        EngineSlot slot = slots.remove(id);
        if (slot == null) return;
        slot.alive.set(false);
        try {
            if (slot.stdin != null) {
                try {
                    slot.stdin.write("quit\n");
                    slot.stdin.flush();
                } catch (Exception ignored) {
                }
                try {
                    slot.stdin.close();
                } catch (Exception ignored) {
                }
            }
        } finally {
            slot.stdin = null;
        }
        final Process p = slot.process;
        if (p != null) {
            io.execute(
                    () -> {
                        try {
                            if (!p.waitFor(500, java.util.concurrent.TimeUnit.MILLISECONDS)) {
                                p.destroy();
                                if (!p.waitFor(500, java.util.concurrent.TimeUnit.MILLISECONDS)) {
                                    p.destroyForcibly();
                                }
                            }
                        } catch (Exception ignored) {
                            try {
                                p.destroyForcibly();
                            } catch (Exception ignored2) {
                            }
                        }
                    });
        }
    }

    private File resolveEngineBinary() {
        String nativeDir = appContext.getApplicationInfo().nativeLibraryDir;
        if (nativeDir != null) {
            File f = new File(nativeDir, LIB_NAME);
            if (f.exists()) return f;
        }
        File fallback = new File(appContext.getFilesDir(), LIB_NAME);
        if (fallback.exists()) return fallback;
        return nativeDir != null ? new File(nativeDir, LIB_NAME) : fallback;
    }

    private void readStdout(EngineSlot slot) {
        try (BufferedReader reader =
                new BufferedReader(
                        new InputStreamReader(slot.process.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                dispatchLine(slot.id, line);
            }
        } catch (Exception e) {
            if (slot.alive.get()) {
                Log.e(TAG, "stdout reader ended [" + slot.id + "]", e);
                dispatchError(slot.id, e.getMessage() != null ? e.getMessage() : "stdout error");
            }
        }
    }

    private void waitForExit(EngineSlot slot) {
        try {
            int code = slot.process.waitFor();
            slot.alive.set(false);
            slots.remove(slot.id, slot);
            dispatchExit(slot.id, code);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private void dispatchLine(String engineId, String line) {
        final String id = JSONObject.quote(engineId);
        final String escaped = jsonString(line);
        main.post(
                () ->
                        webView.evaluateJavascript(
                                "window.__sherlockOnUciLine && window.__sherlockOnUciLine("
                                        + id
                                        + ","
                                        + escaped
                                        + ");",
                                null));
    }

    private void dispatchExit(String engineId, int code) {
        final String id = JSONObject.quote(engineId);
        main.post(
                () ->
                        webView.evaluateJavascript(
                                "window.__sherlockOnUciExit && window.__sherlockOnUciExit("
                                        + id
                                        + ","
                                        + code
                                        + ");",
                                null));
    }

    private void dispatchError(String engineId, String message) {
        final String id = JSONObject.quote(engineId);
        final String escaped = jsonString(message);
        main.post(
                () ->
                        webView.evaluateJavascript(
                                "window.__sherlockOnUciError && window.__sherlockOnUciError("
                                        + id
                                        + ","
                                        + escaped
                                        + ");",
                                null));
    }

    private static String normalizeId(String engineId) {
        if (engineId == null || engineId.trim().isEmpty()) return DEFAULT_ID;
        return engineId.trim();
    }

    private static String jsonString(String s) {
        try {
            return JSONObject.quote(s == null ? "" : s);
        } catch (Exception e) {
            return "\"\"";
        }
    }

    private static String jsonErr(String message) {
        try {
            JSONObject o = new JSONObject();
            o.put("ok", false);
            o.put("error", message);
            return o.toString();
        } catch (Exception e) {
            return "{\"ok\":false,\"error\":\"unknown\"}";
        }
    }

    public void destroy() {
        for (String id : slots.keySet().toArray(new String[0])) {
            quitInternal(id);
        }
        io.shutdownNow();
    }

    private static final class EngineSlot {
        final String id;
        final Process process;
        OutputStreamWriter stdin;
        final AtomicBoolean alive = new AtomicBoolean(true);

        EngineSlot(String id, Process process, OutputStreamWriter stdin) {
            this.id = id;
            this.process = process;
            this.stdin = stdin;
        }
    }
}
