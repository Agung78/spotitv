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
        val cookieManager = android.webkit.CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)
        cookieManager.setAcceptThirdPartyCookies(webView, true)

        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.setSupportMultipleWindows(false)
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true

        webView.isFocusable = true
        webView.isFocusableInTouchMode = true
        webView.requestFocus()

        // Desktop UA so Spotify serves the desktop web player
        settings.userAgentString =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
                val host = android.net.Uri.parse(url).host?.lowercase() ?: ""
                if (host.endsWith("spotify.com") || host.endsWith("google.com") ||
                    host.endsWith("apple.com") || host.endsWith("facebook.com")) {
                    return false
                }
                return try {
                    val intent = Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url))
                    startActivity(intent)
                    true
                } catch (_: Exception) {
                    false
                }
            }

            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)

                val cookies = android.webkit.CookieManager.getInstance().getCookie(url) ?: ""
                if (cookies.contains("sp_dc=")) {
                    if (url.contains("accounts.spotify.com")) {
                        view.loadUrl(getString(R.string.webview_url))
                        return
                    }
                }

                if (url.contains("accounts.spotify.com") || url.contains("/login")) {
                    runJs(view, "classic_login.js")
                    runJs(view, "google_spoof.js")
                    return
                }

                if (!url.startsWith("https://open.spotify.com")) return

                val token = prefs.getString(PREF_AUTH_TOKEN, null)
                if (token != null) {
                    view.evaluateJavascript("localStorage.setItem('spot_auth_token', ${esc(token)})", null)
                }

                view.evaluateJavascript(
                    "window.SF_CONFIG = { guiMode: 'csshack', isCanvasDisabled: false, isFullScreenEnabled: false, isAmoled: false, dockLeftSidebar: false };",
                    null
                )
                injectAssets(view)
            }
        }
    }

    private fun esc(s: String): String = "'${s.replace("'", "\\'")}'"

    private fun injectAssets(webView: WebView) {
        listOf(
            "desktop_spoof.js",
            "spotify_bridge.js",
            "playlist_sort.js",
            "tv_navigation.js"
        ).forEach { asset -> runJs(webView, asset) }
        injectCss(webView)
    }

    private fun runJs(webView: WebView, asset: String) {
        val js = readAsset(asset) ?: return
        webView.evaluateJavascript(js, null)
    }

    private fun injectCss(webView: WebView) {
        val css = readAsset("css_hacks.css") ?: return
        val quoted = org.json.JSONObject.quote(css)
        webView.evaluateJavascript(
            "(function(){var s=document.getElementById('sf-custom-style');if(!s){s=document.createElement('style');s.id='sf-custom-style';(document.head||document.documentElement).appendChild(s);}s.textContent=$quoted;})()",
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
            KeyEvent.KEYCODE_BACK -> {
                webView.evaluateJavascript("window.__spotitv_back ? window.__spotitv_back() : false") { result ->
                    if (result != "true") {
                        if (webView.canGoBack()) {
                            webView.goBack()
                        } else {
                            finish()
                        }
                    }
                }
                true
            }
            KeyEvent.KEYCODE_DPAD_UP -> {
                webView.evaluateJavascript("window.__spotitv_nav && window.__spotitv_nav('up')", null)
                true
            }
            KeyEvent.KEYCODE_DPAD_DOWN -> {
                webView.evaluateJavascript("window.__spotitv_nav && window.__spotitv_nav('down')", null)
                true
            }
            KeyEvent.KEYCODE_DPAD_LEFT -> {
                webView.evaluateJavascript("window.__spotitv_nav && window.__spotitv_nav('left')", null)
                true
            }
            KeyEvent.KEYCODE_DPAD_RIGHT -> {
                webView.evaluateJavascript("window.__spotitv_nav && window.__spotitv_nav('right')", null)
                true
            }
            KeyEvent.KEYCODE_DPAD_CENTER,
            KeyEvent.KEYCODE_ENTER,
            KeyEvent.KEYCODE_NUMPAD_ENTER -> {
                webView.evaluateJavascript("window.__spotitv_activate && window.__spotitv_activate()", null)
                true
            }
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
