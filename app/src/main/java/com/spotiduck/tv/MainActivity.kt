package com.spotiduck.tv

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Bundle
import android.view.KeyEvent
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import java.io.BufferedReader
import java.io.InputStreamReader

class MainActivity : Activity() {

    private lateinit var webView: WebView
    private lateinit var prefs: SharedPreferences

    companion object {
        private const val PREF_NAME = "spotiduck"
        private const val PREF_AUTH_TOKEN = "spot_auth_token"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        webView = findViewById(R.id.webview)
        prefs = getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)

        setupWebView(webView)
        webView.addJavascriptInterface(SpotiduckBridge(webView), "SpotiduckPlatform")
        webView.loadUrl(getString(R.string.webview_url))
    }

    private fun setupWebView(webView: WebView) {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.setSupportMultipleWindows(false)

        // Desktop UA so Spotify serves the desktop web player (mirrors google_spoof.js in the APK)
        settings.userAgentString =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
                if (url.startsWith("https://open.spotify.com")) return false
                val intent = Intent(Intent.ACTION_VIEW).apply { data = android.net.Uri.parse(url) }
                startActivity(intent)
                return true
            }

            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                if (!url.startsWith("https://open.spotify.com")) return
                // Restore persisted auth token into localStorage so spotify_bridge.js picks it up.
                val token = prefs.getString(PREF_AUTH_TOKEN, null) ?: return
                view.evaluateJavascript("localStorage.setItem('spot_auth_token', ${esc(token)})", null)
                injectAssets(view)
            }
        }
    }

    private fun esc(s: String): String = "'${s.replace("'", "\\'")}'"

    private fun injectAssets(webView: WebView) {
        listOf(
            "spotify_bridge.js",
            "desktop_spoof.js",
            "classic_login.js",
            "google_spoof.js",
            "playlist_sort.js"
        ).forEach { asset -> runJs(webView, "file:///android_asset/$asset") }
        injectCss(webView)
    }

    private fun runJs(webView: WebView, asset: String) {
        val js = readAsset(asset) ?: return
        webView.evaluateJavascript(js, null)
    }

    private fun injectCss(webView: WebView) {
        val css = readAsset("css_hacks.css") ?: return
        val escaped = css.replace("\n", "\\n").replace("\\", "\\\\").replace("'", "\\'").replace("\"", "\\\"")
        webView.evaluateJavascript(
            "(function(){var s=document.createElement('style');s.textContent='$escaped';document.head.appendChild(s);})()",
            null
        )
    }

    private fun readAsset(name: String): String? {
        return try {
            BufferedReader(InputStreamReader(assets.open(name))).use { it.readText() }
        } catch (_: Exception) {
            null
        }
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        return when (keyCode) {
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
            KeyEvent.KEYCODE_MEDIA_NEXT,
            KeyEvent.KEYCODE_MEDIA_PREVIOUS,
            KeyEvent.KEYCODE_MEDIA_STOP -> {
                SpotiduckMediaBrowserService.lastMediaSession?.controller?.dispatchMediaButtonEvent(event)
                true
            }
            else -> super.onKeyDown(keyCode, event)
        }
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    /** Minimal JS->native bridge exposing platform controls to the web player. */
    private inner class SpotiduckBridge(private val webView: WebView) {
        @JavascriptInterface
        fun play() = dispatch(android.view.KeyEvent.KEYCODE_MEDIA_PLAY)

        @JavascriptInterface
        fun pause() = dispatch(android.view.KeyEvent.KEYCODE_MEDIA_PAUSE)

        @JavascriptInterface
        fun next() = dispatch(android.view.KeyEvent.KEYCODE_MEDIA_NEXT)

        @JavascriptInterface
        fun previous() = dispatch(android.view.KeyEvent.KEYCODE_MEDIA_PREVIOUS)

        @JavascriptInterface
        fun setToken(token: String) {
            prefs.edit().putString(PREF_AUTH_TOKEN, token).apply()
        }

        private fun dispatch(keyCode: Int) =
            webView.post { SpotiduckMediaBrowserService.lastMediaSession?.controller?.dispatchMediaButtonEvent(
                android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN, keyCode)) }
    }
}
