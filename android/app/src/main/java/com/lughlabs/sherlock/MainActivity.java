package com.lughlabs.sherlock;

import android.annotation.SuppressLint;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

/**
 * S H E R L O C K — WebView GUI + native Lughnasadh 0.2 UCI bridge.
 * No desktop websocket. Prep / analysis only.
 */
public class MainActivity extends AppCompatActivity {
    private WebView web;
    private UciEngineBridge bridge;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        setContentView(web);

        bridge = new UciEngineBridge(this, web);
        web.addJavascriptInterface(bridge, "SherlockUci");

        final WebViewAssetLoader loader =
                new WebViewAssetLoader.Builder()
                        .setDomain("appassets.androidplatform.net")
                        .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                        .build();

        web.setWebViewClient(
                new WebViewClientCompat() {
                    @Override
                    public WebResourceResponse shouldInterceptRequest(
                            WebView view, WebResourceRequest request) {
                        return loader.shouldInterceptRequest(request.getUrl());
                    }
                });

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);

        getOnBackPressedDispatcher()
                .addCallback(
                        this,
                        new OnBackPressedCallback(true) {
                            @Override
                            public void handleOnBackPressed() {
                                if (web != null && web.canGoBack()) {
                                    web.goBack();
                                } else {
                                    setEnabled(false);
                                    getOnBackPressedDispatcher().onBackPressed();
                                }
                            }
                        });

        web.loadUrl("https://appassets.androidplatform.net/index.html");
    }

    @Override
    protected void onDestroy() {
        if (bridge != null) bridge.destroy();
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
