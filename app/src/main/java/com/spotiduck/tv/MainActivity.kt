package com.spotiduck.tv

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
import android.media.session.PlaybackState
import android.os.Bundle
import android.os.PowerManager
import android.view.KeyEvent
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import java.io.BufferedReader
import java.io.ByteArrayInputStream
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : Activity() {

    private lateinit var webView: WebView
    private lateinit var prefs: SharedPreferences
    private var wakeLock: PowerManager.WakeLock? = null
    private var mediaReceiver: BroadcastReceiver? = null

    companion object {
        private const val PREF_NAME = "spotiduck"
        private const val PREF_AUTH_TOKEN = "spot_auth_token"
        private const val PREF_CLI_TOKEN = "spot_cli_token"
        private const val PREF_DEV_ID = "spot_dev_id"
        private const val MEDIA_ACTION = "com.spotiduck.tv.MEDIA_ACTION"
        private val MEDIA_ACTION_JS = mapOf(
            "play" to "window.actPlayPause&&window.actPlayPause(true)",
            "pause" to "window.actPlayPause&&window.actPlayPause(false)",
            "stop" to "window.actPlayPause&&window.actPlayPause(false)",
            "next" to "window.actSkipForward&&window.actSkipForward()",
            "previous" to "window.actSkipBack&&window.actSkipBack()"
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        webView = findViewById(R.id.webview)
        prefs = getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)

        setupWebView(webView)
        webView.addJavascriptInterface(SpotiduckBridge(webView), "SpotiduckPlatform")
        webView.addJavascriptInterface(AndBridge(), "AndBridge")
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                if (intent.action != MEDIA_ACTION) return
                val js = MEDIA_ACTION_JS[intent.getStringExtra("action")] ?: return
                webView.evaluateJavascript(js, null)
            }
        }
        mediaReceiver = receiver
        registerReceiver(receiver, IntentFilter(MEDIA_ACTION))
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
        webView.webChromeClient = object : android.webkit.WebChromeClient() {
            override fun onPermissionRequest(request: android.webkit.PermissionRequest) {
                runOnUiThread {
                    request.grant(request.resources)
                }
            }
        }

        webView.webViewClient = object : WebViewClient() {
            // Parsed once from adblock_hosts.txt ("0.0.0.0 host" lines, skips # and blanks)
            private val adblockHosts: Set<String> by lazy {
                try {
                    assets.open("adblock_hosts.txt").bufferedReader().useLines { lines ->
                        lines.map { it.trim() }.filter { it.isNotEmpty() && !it.startsWith("#") }
                            .mapNotNull { it.split(Regex("\\s+")).getOrNull(1)?.lowercase() }.toSet()
                    }
                } catch (_: Exception) {
                    emptySet()
                }
            }

            private fun blockedResponse(): WebResourceResponse = WebResourceResponse(
                "text/plain", "utf-8", 200, "OK", emptyMap(),
                ByteArrayInputStream(ByteArray(0))
            )

            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                return try {
                    if ((request.url.host?.lowercase() ?: "") in adblockHosts) blockedResponse() else null
                } catch (_: Exception) {
                    null
                }
            }

            @Deprecated("Deprecated in Java")
            override fun shouldInterceptRequest(view: WebView, url: String): WebResourceResponse? {
                return try {
                    if ((android.net.Uri.parse(url).host?.lowercase() ?: "") in adblockHosts) blockedResponse() else null
                } catch (_: Exception) {
                    null
                }
            }

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

                view.evaluateJavascript(
                    "window.SF_CONFIG = { guiMode: 'csshack', isCanvasDisabled: false, isFullScreenEnabled: false, isAmoled: false, dockLeftSidebar: false };",
                    null
                )
                prefs.getString(PREF_AUTH_TOKEN, null)?.let {
                    view.evaluateJavascript("localStorage.setItem('spot_auth_token', ${esc(it)})", null)
                }
                prefs.getString(PREF_CLI_TOKEN, null)?.let {
                    view.evaluateJavascript("localStorage.setItem('spot_cli_token', ${esc(it)})", null)
                }
                prefs.getString(PREF_DEV_ID, null)?.let {
                    view.evaluateJavascript("localStorage.setItem('spot_dev_id', ${esc(it)})", null)
                }
                injectAssets(view)
                view.evaluateJavascript(
                    "try{var t=localStorage.getItem('spot_auth_token'); if(t) SpotiduckPlatform.setToken(t);}catch(e){}",
                    null
                )
            }
        }
    }

    private fun esc(s: String): String = "'${s.replace("'", "\\'")}'"

    private fun injectAssets(webView: WebView) {
        listOf(
            "desktop_spoof.js",
            "google_spoof.js",
            "spotify_bridge.js",
            "classic_login.js",
            "facebook_consent.js",
            "playlist_sort.js",
            "tv_cursor.js"
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
                webView.evaluateJavascript("window.__spotitv_cursor && window.__spotitv_cursor.keyDown('up')", null)
                true
            }
            KeyEvent.KEYCODE_DPAD_DOWN -> {
                webView.evaluateJavascript("window.__spotitv_cursor && window.__spotitv_cursor.keyDown('down')", null)
                true
            }
            KeyEvent.KEYCODE_DPAD_LEFT -> {
                webView.evaluateJavascript("window.__spotitv_cursor && window.__spotitv_cursor.keyDown('left')", null)
                true
            }
            KeyEvent.KEYCODE_DPAD_RIGHT -> {
                webView.evaluateJavascript("window.__spotitv_cursor && window.__spotitv_cursor.keyDown('right')", null)
                true
            }
            KeyEvent.KEYCODE_DPAD_CENTER,
            KeyEvent.KEYCODE_ENTER,
            KeyEvent.KEYCODE_NUMPAD_ENTER -> {
                webView.evaluateJavascript("window.__spotitv_cursor && window.__spotitv_cursor.click()", null)
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
    override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean {
        return when (keyCode) {
            KeyEvent.KEYCODE_DPAD_UP -> {
                webView.evaluateJavascript("window.__spotitv_cursor && window.__spotitv_cursor.keyUp('up')", null)
                true
            }
            KeyEvent.KEYCODE_DPAD_DOWN -> {
                webView.evaluateJavascript("window.__spotitv_cursor && window.__spotitv_cursor.keyUp('down')", null)
                true
            }
            KeyEvent.KEYCODE_DPAD_LEFT -> {
                webView.evaluateJavascript("window.__spotitv_cursor && window.__spotitv_cursor.keyUp('left')", null)
                true
            }
            KeyEvent.KEYCODE_DPAD_RIGHT -> {
                webView.evaluateJavascript("window.__spotitv_cursor && window.__spotitv_cursor.keyUp('right')", null)
                true
            }
            else -> super.onKeyUp(keyCode, event)
        }
    }

    override fun onDestroy() {
        try {
            mediaReceiver?.let { unregisterReceiver(it) }
        } catch (_: Exception) {
        }
        try {
            if (wakeLock?.isHeld == true) wakeLock?.release()
        } catch (_: Exception) {
        }
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
            try {
                prefs.edit().putString(PREF_AUTH_TOKEN, token).apply()
            } catch (_: Exception) {
            }
        }

        private fun dispatch(keyCode: Int) =
            webView.post { SpotiduckMediaBrowserService.lastMediaSession?.controller?.dispatchMediaButtonEvent(
                android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN, keyCode)) }
    }

    /** Native side of the AndBridge protocol expected by spotify_bridge.js. */
    private inner class AndBridge {
        @Volatile private var expanded = false
        @Volatile private var searchActive = false
        @Volatile private var cssDone = false
        @Volatile private var playerReady = false
        @Volatile private var shutManaged = false
        @Volatile private var sleepManaged = false
        @Volatile private var lastUserInfo = ""
        @Volatile private var lastMediaItems = ""
        @Volatile private var lastSearch = ""

        @JavascriptInterface
        fun recMediaStatus(status: String) {
            try {
                val session = SpotiduckMediaBrowserService.lastMediaSession ?: return
                val playing = status.contains("\"playing\":true")
                val state = if (playing) PlaybackState.STATE_PLAYING else PlaybackState.STATE_PAUSED
                session.setPlaybackState(PlaybackState.Builder().setState(state, 0, 1f).build())
            } catch (_: Exception) {
            }
        }

        @JavascriptInterface
        fun recMediaPosition(pos: String) {
            try {
                val session = SpotiduckMediaBrowserService.lastMediaSession ?: return
                val ms = pos.toLongOrNull() ?: pos.toDoubleOrNull()?.toLong() ?: return
                val cur = session.controller.playbackState
                val state = cur?.state ?: PlaybackState.STATE_PAUSED
                session.setPlaybackState(PlaybackState.Builder().setState(state, ms, 1f).build())
            } catch (_: Exception) {
            }
        }

        @JavascriptInterface
        fun recMediaPosition(pos: Long) {
            try {
                val session = SpotiduckMediaBrowserService.lastMediaSession ?: return
                val cur = session.controller.playbackState
                val state = cur?.state ?: PlaybackState.STATE_PAUSED
                session.setPlaybackState(PlaybackState.Builder().setState(state, pos, 1f).build())
            } catch (_: Exception) {
            }
        }

        @JavascriptInterface
        fun recMediaPosition(pos: Double) {
            try {
                recMediaPosition(pos.toLong())
            } catch (_: Exception) {
            }
        }

        @JavascriptInterface
        fun playLoaded() {
            try {
                playerReady = true
            } catch (_: Exception) {
            }
        }

        @JavascriptInterface
        fun wakeUp() {
            try {
                var lock = wakeLock
                if (lock == null) {
                    lock = (getSystemService(Context.POWER_SERVICE) as PowerManager)
                        .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "SpotiduckTV:Wakelock")
                    lock.setReferenceCounted(false)
                    wakeLock = lock
                }
                if (lock.isHeld != true) lock.acquire()
            } catch (_: Exception) {
            }
        }

        @JavascriptInterface
        fun wakeOff() {
            try {
                val lock = wakeLock
                if (lock != null && lock.isHeld) lock.release()
            } catch (_: Exception) {
            }
        }

        @JavascriptInterface
        fun manageTShut(enable: Boolean) {
            try {
                shutManaged = enable
            } catch (_: Exception) {
            }
        }

        @JavascriptInterface
        fun manageTSleep(enable: Boolean) {
            try {
                sleepManaged = enable
            } catch (_: Exception) {
            }
        }

        @JavascriptInterface
        fun deferMessage(msg: String) {
            try {
                when (msg) {
                    "reload" -> webView.post { try { webView.reload() } catch (_: Exception) { } }
                    "unlock" -> webView.post {
                        try {
                            webView.evaluateJavascript("window.actSkipForward&&window.actSkipForward()", null)
                        } catch (_: Exception) {
                        }
                    }
                }
            } catch (_: Exception) {
            }
        }

        @JavascriptInterface
        fun setExpanded(value: Boolean) {
            try {
                expanded = value
            } catch (_: Exception) {
            }
        }

        @JavascriptInterface
        fun setSearchActive(value: Boolean) {
            try {
                searchActive = value
            } catch (_: Exception) {
            }
        }

        @JavascriptInterface
        fun cssInjected() {
            try {
                cssDone = true
            } catch (_: Exception) {
            }
        }

        @JavascriptInterface
        fun onUserInfoCaptured(username: String, name: String, avatar: String) {
            try {
                lastUserInfo = "$username|$name|$avatar"
                prefs.edit().putString("spot_user_info", lastUserInfo).apply()
            } catch (_: Exception) {
            }
        }

        @JavascriptInterface
        fun onMediaItemsLoaded(parentId: String, json: String) {
            try {
                lastMediaItems = "$parentId|$json"
            } catch (_: Exception) {
            }
        }

        @JavascriptInterface
        fun onSearchCompleted(query: String, json: String) {
            try {
                lastSearch = "$query|$json"
            } catch (_: Exception) {
            }
        }

        @JavascriptInterface
        fun nativeFetch(url: String, method: String, headers: String, body: String): String {
            return try {
                val conn = URL(url).openConnection() as HttpURLConnection
                try {
                    conn.requestMethod = method.ifEmpty { "GET" }
                    conn.connectTimeout = 15000
                    conn.readTimeout = 15000
                    try {
                        val obj = org.json.JSONObject(headers)
                        for (key in obj.keys()) conn.setRequestProperty(key, obj.optString(key))
                    } catch (_: Exception) {
                    }
                    if (body.isNotEmpty() && (method == "POST" || method == "PUT" || method == "PATCH")) {
                        conn.doOutput = true
                        conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
                    }
                    val status = conn.responseCode
                    val stream = if (status in 200..299) conn.inputStream else conn.errorStream
                    val respBody = try {
                        stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
                    } catch (_: Exception) {
                        ""
                    }
                    val headerObj = org.json.JSONObject()
                    for ((k, v) in conn.headerFields) {
                        if (k != null) headerObj.put(k, v.joinToString(","))
                    }
                    org.json.JSONObject().put("status", status).put("headers", headerObj).put("body", respBody).toString()
                } finally {
                    conn.disconnect()
                }
            } catch (e: Exception) {
                try {
                    org.json.JSONObject().put("status", 0).put("headers", org.json.JSONObject())
                        .put("body", e.message ?: "").toString()
                } catch (_: Exception) {
                    "{\"status\":0,\"headers\":{},\"body\":\"\"}"
                }
            }
        }
    }
}
