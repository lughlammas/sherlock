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
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Adapter layer: JS ↔ classical UCI process (liblughnasadh.so).
 * Spawns the bundled arm64 PIE via ProcessBuilder; stdin/stdout only.
 */
public class UciEngineBridge {
    private static final String TAG = "SherlockUci";
    private static final String LIB_NAME = "liblughnasadh.so";

    private final Context appContext;
    private final WebView webView;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newCachedThreadPool();

    private Process process;
    private OutputStreamWriter stdin;
    private final AtomicBoolean alive = new AtomicBoolean(false);

    public UciEngineBridge(Context context, WebView webView) {
        this.appContext = context.getApplicationContext();
        this.webView = webView;
    }

    @JavascriptInterface
    public boolean isAvailable() {
        return true;
    }

    @JavascriptInterface
    public synchronized String start() {
        quitInternal();
        try {
            File bin = resolveEngineBinary();
            if (bin == null || !bin.exists()) {
                return jsonErr("Engine binary not found (liblughnasadh.so)");
            }
            if (!bin.canExecute()) {
                // best-effort; nativeLibraryDir is usually already +x
                //noinspection ResultOfMethodCallIgnored
                bin.setExecutable(true);
            }

            ProcessBuilder pb = new ProcessBuilder(bin.getAbsolutePath());
            pb.redirectErrorStream(true);
            pb.directory(bin.getParentFile());
            process = pb.start();
            stdin = new OutputStreamWriter(process.getOutputStream(), StandardCharsets.UTF_8);
            alive.set(true);

            final Process proc = process;
            io.execute(() -> readStdout(proc));
            io.execute(() -> waitForExit(proc));

            JSONObject ok = new JSONObject();
            ok.put("ok", true);
            ok.put("path", bin.getAbsolutePath());
            return ok.toString();
        } catch (Exception e) {
            Log.e(TAG, "start failed", e);
            alive.set(false);
            return jsonErr(e.getMessage() != null ? e.getMessage() : "start failed");
        }
    }

    @JavascriptInterface
    public synchronized void send(String line) {
        if (!alive.get() || stdin == null || line == null) return;
        try {
            stdin.write(line);
            if (!line.endsWith("\n")) stdin.write("\n");
            stdin.flush();
        } catch (Exception e) {
            Log.e(TAG, "send failed: " + line, e);
            dispatchError(e.getMessage() != null ? e.getMessage() : "send failed");
        }
    }

    @JavascriptInterface
    public synchronized void stop() {
        send("stop");
    }

    @JavascriptInterface
    public synchronized void quit() {
        quitInternal();
    }

    private void quitInternal() {
        alive.set(false);
        try {
            if (stdin != null) {
                try {
                    stdin.write("quit\n");
                    stdin.flush();
                } catch (Exception ignored) {
                }
                try {
                    stdin.close();
                } catch (Exception ignored) {
                }
            }
        } finally {
            stdin = null;
        }
        if (process != null) {
            final Process p = process;
            process = null;
            io.execute(() -> {
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
        // Preferred: extracted jniLibs path (executable on modern Android)
        String nativeDir = appContext.getApplicationInfo().nativeLibraryDir;
        if (nativeDir != null) {
            File f = new File(nativeDir, LIB_NAME);
            if (f.exists()) return f;
        }
        // Fallback: copy from nativeLibraryDir alternatives / filesDir
        File fallback = new File(appContext.getFilesDir(), LIB_NAME);
        if (fallback.exists()) return fallback;
        return nativeDir != null ? new File(nativeDir, LIB_NAME) : fallback;
    }

    private void readStdout(Process proc) {
        try (BufferedReader reader =
                new BufferedReader(
                        new InputStreamReader(proc.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                dispatchLine(line);
            }
        } catch (Exception e) {
            if (alive.get()) {
                Log.e(TAG, "stdout reader ended", e);
                dispatchError(e.getMessage() != null ? e.getMessage() : "stdout error");
            }
        }
    }

    private void waitForExit(Process proc) {
        try {
            int code = proc.waitFor();
            alive.set(false);
            dispatchExit(code);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private void dispatchLine(String line) {
        final String escaped = jsonString(line);
        main.post(
                () ->
                        webView.evaluateJavascript(
                                "window.__sherlockOnUciLine && window.__sherlockOnUciLine("
                                        + escaped
                                        + ");",
                                null));
    }

    private void dispatchExit(int code) {
        main.post(
                () ->
                        webView.evaluateJavascript(
                                "window.__sherlockOnUciExit && window.__sherlockOnUciExit("
                                        + code
                                        + ");",
                                null));
    }

    private void dispatchError(String message) {
        final String escaped = jsonString(message);
        main.post(
                () ->
                        webView.evaluateJavascript(
                                "window.__sherlockOnUciError && window.__sherlockOnUciError("
                                        + escaped
                                        + ");",
                                null));
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
        quitInternal();
        io.shutdownNow();
    }
}
