package com.solaya.quest

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import java.io.File

/**
 * Main settings screen for Solaya Quest.
 *
 * Displays server status, video count, and a tunnel URL input field.
 * The "Launch Solaya" button opens the Quest Browser to the locally-served web client.
 */
class MainActivity : AppCompatActivity() {

    companion object {
        private const val PREFS_NAME = "solaya_prefs"
        private const val KEY_TUNNEL_URL = "tunnel_url"
        private const val LOCAL_URL = "http://127.0.0.1:${SolayaApp.SERVER_PORT}/client/index.html"
    }

    private lateinit var serverStatus: TextView
    private lateinit var videosStatus: TextView
    private lateinit var launchButton: Button
    private lateinit var adbInstructions: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // Bind views
        serverStatus = findViewById(R.id.serverStatus)
        videosStatus = findViewById(R.id.videosStatus)
        launchButton = findViewById(R.id.launchButton)
        adbInstructions = findViewById(R.id.adbInstructions)

        // Request Microphone Permission
        if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(android.Manifest.permission.RECORD_AUDIO), 1)
        }

        // Launch button — starts server and opens Quest Browser
        launchButton.setOnClickListener {
            // Start the foreground service to keep the server alive
            val serviceIntent = Intent(this, LocalServerService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent)
            } else {
                startService(serviceIntent)
            }

            // Open Quest Browser to Local URL
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(LOCAL_URL))
            startActivity(intent)
        }

        // Start the server (may already be running from Application class)
        (application as SolayaApp).startLocalServer()
    }

    override fun onResume() {
        super.onResume()
        updateStatusDisplay()
    }

    private fun updateStatusDisplay() {
        val app = application as SolayaApp

        // Server status
        if (app.isServerRunning()) {
            serverStatus.text = getString(R.string.server_status_running)
            serverStatus.setTextColor(getColor(R.color.status_running))
        } else {
            serverStatus.text = getString(R.string.server_status_stopped)
            serverStatus.setTextColor(getColor(R.color.status_stopped))
        }

        // Video count
        val videosDir = app.getVideosDirectory()
        val videoFiles = getVideoFiles(videosDir)
        val videoCount = videoFiles.size

        if (videoCount > 0) {
            val totalSize = videoFiles.sumOf { it.length() }
            val sizeStr = formatFileSize(totalSize)
            videosStatus.text = getString(R.string.videos_found, videoCount, sizeStr)
            videosStatus.setTextColor(getColor(R.color.text_secondary))
            adbInstructions.visibility = View.GONE
        } else {
            videosStatus.text = "0 videos found in:\n${videosDir.absolutePath}\n\nPlease check ADB path."
            videosStatus.setTextColor(getColor(R.color.warning_amber))
            adbInstructions.visibility = View.VISIBLE
        }
    }

    private fun getVideoFiles(dir: File): List<File> {
        if (!dir.exists() || !dir.isDirectory) return emptyList()
        val videoExtensions = setOf("mp4", "webm", "mkv", "mov")
        return dir.listFiles()
            ?.filter { it.isFile && it.extension.lowercase() in videoExtensions }
            ?.sortedBy { it.name }
            ?: emptyList()
    }

    private fun formatFileSize(bytes: Long): String {
        return when {
            bytes >= 1_073_741_824 -> String.format("%.1f GB", bytes / 1_073_741_824.0)
            bytes >= 1_048_576 -> String.format("%.1f MB", bytes / 1_048_576.0)
            bytes >= 1024 -> String.format("%.1f KB", bytes / 1024.0)
            else -> "$bytes B"
        }
    }
}
