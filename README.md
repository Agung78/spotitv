# spotitv

Native Android TV port of [SpotiDuck](https://github.com/23fpsz/SpotiDuck-Releases), reverse-engineered from
`SpotiDuck-v1.2.4-02cce00.apk` (this repo).

## What was salvaged from the APK

Static analysis of `classes.dex` + `assets/` showed:

- WebView wrapper around the Spotify web player (`open.spotify.com`)
- Bridge + spoof assets injected into the page: `spotify_bridge.js`, `desktop_spoof.js`, `classic_login.js`, `google_spoof.js`, `playlist_sort.js`, `css_hacks.css`, `adblock_hosts.txt`
- `MediaBrowserService` + `MediaActionReceiver` + PIP media actions → D-pad / remote transport control (TV-relevant)
- `android.car.EXTENSIONS`, `android.hardware.type.embedded` hints
- Cut from the port (YAGNI for a TV build): Dagger, Firebase/analytics, datastore native lib, `androidx.window`, PIP, login UI chrome

## Project structure

```
spotitv/
  app/src/main/
    AndroidManifest.xml          # TV launcher (LEANBACK_LAUNCHER) + MediaBrowserService
    java/com/spotiduck/tv/
      MainActivity.kt            # WebView, desktop UA, JS bridge, asset injection, token persistence
      SpotiduckMediaBrowserService.kt  # Media session for remote transport keys
    res/
      layout/activity_main.xml   # fullscreen WebView
      values/themes.xml          # dark Spotify theme
      drawable/ic_spotify.xml    # vector icon
      mipmap-anydpi-v26/         # adaptive launcher icons
    assets/                      # copied from the APK (bridge + spoof JS, CSS, hosts)
  gradle/libs.versions.toml      # AGP 8.7.0, Kotlin 2.0.20, compileSdk 36, minSdk 26
```

## Build

Requires Java 17+ and the Android SDK (`cmdline-tools`, platform `android-36`, build-tools `36.0.0`).

```bash
export JAVA_HOME=/path/to/jdk          # e.g. ~/.gradle/jdks/eclipse_adoptium-21-aarch64-os_x.2/jdk-21.0.7+6/Contents/Home
export ANDROID_HOME=/path/to/android-sdk
export PATH=$JAVA_HOME/bin:$PATH

./gradlew :app:assembleDebug
```

Output: `app/build/outputs/apk/debug/app-debug.apk`

The wrapper is checked in (`gradlew`, `gradle/wrapper/`). First run downloads AGP + Kotlin + AndroidX from Google/Maven Central.

## Install on Android TV

You need the TV on your Wi-Fi with Developer options → USB debugging on (Settings → System → About → Build ×7 → Developer options → USB debugging).

Using the `tv-home/` tooling (Python ADB client, no `adb` binary needed — avoids macOS Local Network blocking):

```bash
# From the tv-home/ repo:
./tools/find-tv.sh                                          # finds the TV, saves IP to tools/.tv_host
./tools/install.sh /path/to/spotitv/app/build/outputs/apk/debug/app-debug.apk
```

Or with plain `adb` if you have it:

```bash
adb connect <TV_IP>
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Launch from the Leanback home screen ("SpotiDuck TV"). D-pad media keys (play/pause, next, previous) route through the `MediaBrowserService` media session into the WebView.

## Auth persistence

`SpotiduckBridge.setToken(token)` now saves the token to `SharedPreferences` (`spotiduck`/`spot_auth_token`). On every `open.spotify.com` page load, `MainActivity` restores it into `localStorage` so the injected `spotify_bridge.js` (which reads `spot_auth_token` / `spot_cli_token` from `localStorage`) picks it up and the user stays logged in across restarts.

Call `SpotiduckPlatform.setToken(token)` from your JS when a token is captured.

## Known scope limits

- No sign-in flow yet — the bridge exposes `setToken`; wire it to the APK's `spot_auth_token`/`spot_cli_token` storage when you add auth.
- No Leanback browse UI — the WebView is the entire screen. A `BrowseFragment` layer can be added on top later if you want a native TV shell around the web player.
- No arm64 native libs included (the APK's `libdatastore_shared_counter.so` was dropped; nothing in the port depends on it).
