package com.solaya.quest

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.util.Log
import java.io.File

/**
 * Application class for Solaya Quest.
 * Manages the local HTTP server lifecycle and ensures the video directory exists.
 */
class SolayaApp : Application() {

    companion object {
        const val TAG = "SolayaApp"
        const val NOTIFICATION_CHANNEL_ID = "solaya_server"
        const val SERVER_PORT = 8080
    }

    var localServer: LocalServer? = null
        private set

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        ensureVideoDirectory()
        startLocalServer()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                getString(R.string.notification_channel_name),
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = getString(R.string.notification_content)
                setShowBadge(false)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    /**
     * Creates the video directory on external storage if it doesn't exist.
     * Path: /sdcard/Android/data/com.solaya.quest/files/videos/
     */
    private fun ensureVideoDirectory() {
        val videosDir = getVideosDirectory()
        if (!videosDir.exists()) {
            val created = videosDir.mkdirs()
            Log.i(TAG, "Videos directory created: $created at ${videosDir.absolutePath}")
        } else {
            Log.i(TAG, "Videos directory exists: ${videosDir.absolutePath}")
        }
    }

    fun getVideosDirectory(): File {
        return File(getExternalFilesDir(null), "vr_videos")
    }

    fun startLocalServer() {
        if (localServer?.isAlive == true) {
            Log.i(TAG, "Server already running on port $SERVER_PORT")
            return
        }

        try {
            localServer = LocalServer(this, SERVER_PORT)
            localServer?.start()
            Log.i(TAG, "Local server started on port $SERVER_PORT")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start local server", e)
        }
    }

    fun stopLocalServer() {
        localServer?.stop()
        localServer = null
        Log.i(TAG, "Local server stopped")
    }

    fun isServerRunning(): Boolean {
        return localServer?.isAlive == true
    }
}
