# spotitv Architecture & Bridge Protocol

> Reverse-engineered from `SpotiDuck-v1.2.4-02cce00.apk` — Native Android TV WebView wrapper for `open.spotify.com`

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Android TV App                           │
│  ┌──────────────────┐    ┌──────────────────────────────────┐   │
│  │  MainActivity    │    │  SpotiduckMediaBrowserService    │   │
│  │  (WebView Host)  │◄───│  (MediaSession + MediaBrowser)   │   │
│  └────────┬─────────┘    └──────────────┬───────────────────┘   │
│           │                             │                       │
│           ▼                             ▼                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    WebView                               │   │
│  │  https://open.spotify.com/  +  Injected Assets           │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Spotify Web Player (React SPA)               │
│  • Encrypted GraphQL (Pathfinder) over HTTPS                    │
│  • Playback via connect-state WebSocket/gRPC                    │
│  • Widevine L1 DRM                                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Injected Assets (assets/)

| File | Purpose |
|------|---------|
| `desktop_spoof.js` | Spoof UA, navigator, screen, client hints to desktop Chrome/Windows |
| `google_spoof.js` | Additional UA/client-hints spoofing (redundant with desktop_spoof) |
| `spotify_bridge.js` | **Core bridge** — fetch interception, playback control, library/search API, native ↔ JS bridge |
| `classic_login.js` | Injects "Email + Password Classic Login" link on login page |
| `facebook_consent.js` | Auto-clicks Facebook consent button if present |
| `playlist_sort.js` | Playlist sorting/filtering utilities |
| `tv_cursor.js` | Virtual D-pad mouse cursor for TV remotes |
| `css_hacks.css` | UI cleanup: hide banners, ads, download prompts; style now-playing bar; glass effect |
| `adblock_hosts.txt` | 1300+ ad/tracking domains blocked via hosts mapping |

---

## Native ↔ JavaScript Bridge

### Android Side: `SpotiduckBridge` (MainActivity.kt)

```kotlin
@JavascriptInterface
fun play() = dispatch(KEYCODE_MEDIA_PLAY)

@JavascriptInterface
fun pause() = dispatch(KEYCODE_MEDIA_PAUSE)

@JavascriptInterface
fun next() = dispatch(KEYCODE_MEDIA_NEXT)

@JavascriptInterface
fun previous() = dispatch(KEYCODE_MEDIA_PREVIOUS)

@JavascriptInterface
fun setToken(token: String) {  // Called from JS after login
    prefs.edit().putString(PREF_AUTH_TOKEN, token).apply()
}
```

Exposed to JS as `window.SpotiduckPlatform`.

### JavaScript Side: `AndBridge` (expected in `spotify_bridge.js`)

| Method | Direction | Payload | Purpose |
|--------|-----------|---------|---------|
| `recMediaStatus(JSON)` | JS → Native | `{artist, track, playing, repeat, shuffle, fav, cover, duration, position}` | Full playback state |
| `recMediaPosition(pos)` | JS → Native | `number` (ms) | Throttled position (≥3s delta) |
| `playLoaded()` | JS → Native | — | Player ready signal |
| `wakeUp()` / `wakeOff()` | JS → Native | — | Wake lock control |
| `manageTShut(enable)` / `manageTSleep(enable)` | JS → Native | `boolean` | Screen timeout control |
| `deferMessage('reload' \| 'unlock')` | JS → Native | `string` | Request page reload / unlock |
| `setExpanded(bool)` | JS → Native | `boolean` | Player expanded state |
| `setSearchActive(bool)` | JS → Native | `boolean` | Search focus state |
| `cssInjected()` | JS → Native | — | CSS injection complete |
| `onUserInfoCaptured(username, name, avatar)` | JS → Native | `string, string, string` | User profile |
| `onMediaItemsLoaded(parentId, JSON)` | JS → Native | `string, string` | Library browser results |
| `onSearchCompleted(query, JSON)` | JS → Native | `string, string` | Search results |
| `nativeFetch(url, method, headers, body)` | JS → Native | `string, string, string, string` | **Proxy fetch** for `connect-state` & `melody/v1/msg` (bypasses CORS) |

---

## Spotify Web API Calls (from `spotify_bridge.js`)

All catalog/search/playback uses **Persisted GraphQL (Pathfinder v2)**:

```
POST https://api-partner.spotify.com/pathfinder/v2/query
Headers:
  Authorization: Bearer <accessToken>        → captured as spot_auth_token
  Client-Token: <clientToken>                → captured as spot_cli_token
  app-platform: WebPlayer
  spotify-app-version: 1.2.40.0
Body: { variables, operationName, extensions: { persistedQuery: { sha256Hash } } }
```

### Operations & Fallback Hashes

| Operation | Hash (fallback) | Purpose |
|-----------|-----------------|---------|
| `searchDesktop` | `4801118d4a100f756e833d33984436a3899cff359c532f8fd3aaf174b60b3b49` | Search (tracks, artists, albums, playlists) |
| `libraryV3` | `0082bf82412db50128add72dbdb73e2961d59100b9cbf41fb25c568bd8bc358b` | Library root (playlists, albums, artists, podcasts) |
| `fetchLibraryTracks` | `087278b20b743578a6262c2b0b4bcd20d879c503cc359a2285baf083ef944240` | Liked Songs tracks |
| `fetchPlaylist` | `346811f856fb0b7e4f6c59f8ebea78dd081c6e2fb01b77c954b26259d5fc6763` | Playlist tracks |
| `getAlbum` | `b9bfabef66ed756e5e13f68a942deb60bd4125ec1f1be8cc42769dc0259b4b10` | Album tracks |
| `queryArtistOverview` | `5b9e64f43843fa3a9b6a98543600299b0a2cbbbccfdcdcef2402eb9c1017ca4c` | Artist top tracks |

**Dynamic hash capture:** Bridge intercepts `pathfinder/v2/query` responses, extracts `operationName` + `sha256Hash`, caches in `localStorage` (`sp_hash_<opName>`).

### Playback Command (Connect API)

```
POST https://gew4-spclient.spotify.com/connect-state/v1/player/command/from/{devId}/to/{devId}
Headers:
  Authorization: Bearer <accessToken>
  Client-Token: <clientToken>
  Content-Type: application/json
Body:
{
  "command": {
    "context": { "uri": "spotify:track:...", "url": "context://...", "metadata": {}, "pages": [...] },
    "play_origin": { "feature_identifier": "your_library", "feature_version": "1.2.40.0", "referrer_identifier": "your_library" },
    "options": { "license": "tft", "skip_to": { "track_uri": "..." }, "player_options_override": {} },
    "endpoint": "play"
  }
}
```

---

## Auth Token Flow

```
1. User logs in on open.spotify.com (WebView)
2. Spotify sets cookies: sp_dc, sp_key, __Host-device_id
3. Web player fetches → Authorization: Bearer <accessToken> header captured by fetch interceptor
4. Bridge stores in localStorage:
   - spot_auth_token = "Bearer <accessToken>"
   - spot_cli_token = "<clientToken>"
   - spot_dev_id = "<device_id>"
5. On subsequent loads (MainActivity.onPageFinished):
   - Read token from SharedPreferences (PREF_AUTH_TOKEN)
   - Inject: localStorage.setItem('spot_auth_token', <token>)
6. Bridge restores tokens from localStorage on init (lines 34-37)
```

---

## Key Spoofing (desktop_spoof.js + google_spoof.js)

| Property | Spoofed Value |
|----------|---------------|
| `navigator.userAgent` | `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36` |
| `navigator.platform` | `Win32` |
| `navigator.vendor` | `Google Inc.` |
| `navigator.webdriver` | `false` |
| `navigator.userAgentData` | Mocked `{ brands: [...], platform: "Windows", mobile: false }` + `getHighEntropyValues()` |
| `screen.width/height` | `1920 / 1080` |
| `innerWidth/innerHeight` | `1920 / 978` |
| `navigator.hardwareConcurrency` | `16` |
| `navigator.deviceMemory` | `16` |
| `navigator.maxTouchPoints` | `0` |

**Why:** Spotify serves mobile web player (touch-only, no keyboard shortcuts) to Android UA. Desktop UA gets full-featured player with keyboard/media-key support.

---

## MediaSession Integration (SpotiduckMediaBrowserService.kt)

```kotlin
// MediaSession for D-pad / remote transport controls
MediaSession(this, "SpotiduckTV").apply {
    setCallback(object : MediaSession.Callback() {
        override fun onPlay() = sendMediaAction("play")
        override fun onPause() = sendMediaAction("pause")
        override fun onSkipToNext() = sendMediaAction("next")
        override fun onSkipToPrevious() = sendMediaAction("previous")
        override fun onStop() = sendMediaAction("stop")
    })
    setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS or MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS)
}
```

**Flow:** Remote key → MediaSession.Callback → Broadcast `com.spotiduck.tv.MEDIA_ACTION` → MainActivity receives → `SpotiduckBridge.dispatch()` → WebView `evaluateJavascript` → `spotify_bridge.js` → `actPlayPause()` / `actSkipForward()` etc.

---

## UI Customization (css_hacks.css)

### Hidden Elements
- GDPR/cookie banners (`#onetrust-consent-sdk`, `[data-encore-id=banner]`)
- Tooltips (`[role="tooltip"]`, `[data-tippy-root]`)
- Shuffle mode submenu
- Nav bar: Download, Upgrade, Premium, Explore buttons
- Footer download prompt
- "Open in Desktop app" buttons
- "Getting started" onboarding shelf
- Sidebar "Download App" CTA

### Now-Playing Bar
- Full-width, fixed bottom, safe-area inset for Android nav bar
- **Glass effect** (expanded mode): gradient blur backdrop from album art colors
- Portrait mode: vertical stack, larger controls

### Tracklist Rows
- Reduced horizontal padding
- Scaled non-playlist action buttons (1.3x, 0.6 opacity)
- Play button shifted left (-8px), overflow visible

---

## TV Cursor (tv_cursor.js)

Virtual mouse cursor controlled via D-pad:
- Fluid pointer physics with acceleration
- Edge auto-scrolling on container under cursor
- Realistic `PointerEvent`/`MouseEvent` dispatch for hover/click
- Modal/history back handling

---

## Ad Blocking (adblock_hosts.txt)

1300+ domains mapped to `0.0.0.0`, including:
- Spotify ad endpoints: `ads-fa.scdn.co`, `ads-fa.spotify.com`, `adstudio.spotify.com`, `adeventtracker.spotify.com`, `aet.spotify.com`
- Major ad networks: Google, Meta, Unity, AppLovin, IronSource, Vungle, etc.
- Analytics/tracking: `google-analytics.com`, `googletagmanager.com`, `scorecardresearch.com`

---

## Why WebView + Bridge Is The Only Working Path

| Approach | Feasible? | Reason |
|----------|-----------|--------|
| **Reverse-engineer REST API** | ❌ | No public catalog API; all endpoints require rotating `accessToken` + `Client-Token` + GraphQL hashes |
| **Server-side browser automation (Playwright)** | ⚠️ Fragile | Breaks on every Spotify deploy; expensive (headful browser per user); Widevine L1 requires real device |
| **Official Spotify SDK** | ❌ | No TV SDK; Connect SDK requires partnership |
| **WebView + Bridge (spotitv)** | ✅ **Only working** | Runs inside Spotify's authenticated context; captures tokens dynamically; proxies connect-state via native fetch |

---

## Extension Points

| Feature | Implementation |
|---------|----------------|
| **Native Leanback Browse** | `BrowseFragment` + `MediaBrowserService.onLoadChildren` → `webView.evaluateJavascript("fetchMediaItems('playlists')")` → parse `AndBridge.onMediaItemsLoaded` |
| **Voice Search** | `MediaSession.Callback.onPlayFromSearch()` → `searchMediaItems(query)` |
| **Offline Cache** | Cache `mediaLib` JSON in `SharedPreferences` |
| **EQ/Audio Quality** | Inject JS calling `SpotiDuck.Platform.AudioQualityAPI` |
| **Cast Picker** | Already exposed via `openConnect()` in bridge |

---

## Build & Install

```bash
# Requirements: Java 17+, Android SDK (cmdline-tools, platform android-36, build-tools 36.0.0)
export JAVA_HOME=/path/to/jdk
export ANDROID_HOME=/path/to/android-sdk
export PATH=$JAVA_HOME/bin:$PATH

./gradlew :app:assembleDebug
# Output: app/build/outputs/apk/debug/app-debug.apk

# Install via ADB
adb connect <TV_IP>
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

---

## Known Limitations (from README)

- No sign-in flow UI — bridge exposes `setToken`; wire to `spot_auth_token`/`spot_cli_token` storage when adding auth
- No Leanback browse UI — WebView is entire screen; `BrowseFragment` layer can be added
- No arm64 native libs (dropped `libdatastore_shared_counter.so` — unused)
- PIP, Firebase/Analytics, Dagger, Datastore removed (YAGNI for TV build)