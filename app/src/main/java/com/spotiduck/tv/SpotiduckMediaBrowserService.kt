package com.spotiduck.tv

import android.app.Service
import android.content.Intent
import android.media.session.MediaSession
import android.os.Bundle
import android.service.media.MediaBrowserService
import android.service.media.MediaBrowserService.BrowserRoot

class SpotiduckMediaBrowserService : MediaBrowserService() {

    companion object {
        var lastMediaSession: MediaSession? = null
            private set
    }

    private lateinit var session: MediaSession

    override fun onCreate() {
        super.onCreate()
        session = MediaSession(this, "SpotiduckTV").apply {
            setCallback(object : MediaSession.Callback() {
                override fun onPlay() = sendMediaAction("play")
                override fun onPause() = sendMediaAction("pause")
                override fun onSkipToNext() = sendMediaAction("next")
                override fun onSkipToPrevious() = sendMediaAction("previous")
                override fun onStop() = sendMediaAction("stop")
            })
            setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS or MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS)
            lastMediaSession = this
        }
        this.session = session
    }

    override fun onGetRoot(clientPackageName: String, clientUid: Int, rootHints: Bundle?): BrowserRoot? =
        BrowserRoot(getString(R.string.app_name), null)

    override fun onLoadChildren(parentId: String, result: MediaBrowserService.Result<List<android.media.browse.MediaBrowser.MediaItem>>) {
        result.detach()
    }

    override fun onDestroy() {
        session.release()
        lastMediaSession = null
        super.onDestroy()
    }

    private fun sendMediaAction(action: String) {
        val intent = Intent("com.spotiduck.tv.MEDIA_ACTION").apply { putExtra("action", action) }
        sendBroadcast(intent)
    }
}
