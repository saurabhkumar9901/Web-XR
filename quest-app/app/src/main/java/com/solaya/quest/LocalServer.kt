package com.solaya.quest

import android.content.Context
import android.util.Log
import fi.iki.elonen.NanoWSD
import fi.iki.elonen.NanoHTTPD
import fi.iki.elonen.NanoHTTPD.Response
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileInputStream
import java.io.IOException
import java.net.URLDecoder
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Lightweight local HTTP & WebSocket server for Solaya Quest.
 *
 * Routes:
 *   /ws             → WebSocket connection for WebXR client
 *   /client/path    → serves web client files from APK assets/client/
 *   /stream/{file}  → serves video files from Quest storage with byte-range support (HTTP 206)
 *   /config         → returns JSON with localhost WebSocket URL
 *   /videos-list    → returns JSON array of available video filenames
 */
class LocalServer(
    private val context: Context,
    port: Int = 8080
) : NanoWSD(port) {
    
    var pipecatManager: PipecatManager? = null
    private val webSockets = CopyOnWriteArrayList<SolayaWebSocket>()

    companion object {
        private const val TAG = "LocalServer"

        /** Map file extensions to MIME types */
        private val MIME_TYPES = mapOf(
            "html" to "text/html",
            "htm" to "text/html",
            "js" to "application/javascript",
            "mjs" to "application/javascript",
            "css" to "text/css",
            "json" to "application/json",
            "mp4" to "video/mp4",
            "webm" to "video/webm",
            "mkv" to "video/x-matroska",
            "mov" to "video/quicktime",
            "mp3" to "audio/mpeg",
            "wav" to "audio/wav",
            "ogg" to "audio/ogg",
            "png" to "image/png",
            "jpg" to "image/jpeg",
            "jpeg" to "image/jpeg",
            "gif" to "image/gif",
            "svg" to "image/svg+xml",
            "woff" to "font/woff",
            "woff2" to "font/woff2",
            "ttf" to "font/ttf",
            "ico" to "image/x-icon",
        )
    }

    /** The Cloudflare tunnel URL, set from the Android app's settings UI */
    var tunnelUrl: String = ""

    /** Directory where video files are stored on Quest */
    private val videosDir: File
        get() = (context.applicationContext as SolayaApp).getVideosDirectory()

    override fun serveHttp(session: IHTTPSession): Response {
        val uri = session.uri ?: "/"
        val method = session.method

        // Handle CORS preflight
        if (method == Method.OPTIONS) {
            return newCorsResponse(
                newFixedLengthResponse(Response.Status.OK, "text/plain", "")
            )
        }

        Log.d(TAG, "${method.name} $uri")

        return try {
            when {
                uri == "/config" -> serveConfig()
                uri == "/videos-list" -> serveVideosList()
                uri == "/network-info" -> serveNetworkInfo()
                uri.startsWith("/stream/") -> serveVideo(session, uri.removePrefix("/stream/"))
                uri.startsWith("/client/") -> serveAsset(uri.removePrefix("/client/"))
                uri == "/" || uri == "/index.html" -> serveAsset("index.html")
                uri == "/favicon.ico" -> newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "")
                else -> newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "Not Found: $uri")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error serving $uri", e)
            newFixedLengthResponse(
                Response.Status.INTERNAL_ERROR,
                "text/plain",
                "Internal Server Error: ${e.message}"
            )
        }
    }

    override fun openWebSocket(handshake: IHTTPSession): WebSocket {
        val voice = try {
            handshake.parameters["voice"]?.firstOrNull() ?: "Aoede"
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing voice parameter", e)
            "Aoede"
        }
        val isResume = try {
            handshake.parameters["resume"]?.firstOrNull() == "true"
        } catch (e: Exception) {
            false
        }
        val isMeditation = try {
            handshake.parameters["meditation"]?.firstOrNull() == "true"
        } catch (e: Exception) {
            false
        }
        val subType = handshake.parameters["subType"]?.firstOrNull() ?: ""
        val gCat = handshake.parameters["gCat"]?.firstOrNull() ?: ""
        val gSub = handshake.parameters["gSub"]?.firstOrNull() ?: ""
        
        try {
            if (pipecatManager?.isConnected == true) {
                pipecatManager?.stopSession()
                // Wait 500ms for async audio teardown to release hardware lock
                android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                    try {
                        pipecatManager?.startSession(voice, isResume, isMeditation, subType, gCat, gSub)
                    } catch (e: Exception) {
                        android.util.Log.e(TAG, "Error starting session", e)
                    }
                }, 500)
            } else {
                android.os.Handler(android.os.Looper.getMainLooper()).post {
                    try {
                        pipecatManager?.startSession(voice, isResume, isMeditation, subType, gCat, gSub)
                    } catch (e: Exception) {
                        android.util.Log.e(TAG, "Error starting session", e)
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error posting startSession", e)
        }
        
        return SolayaWebSocket(handshake)
    }

    fun sendToAllWebSockets(message: String) {
        webSockets.forEach { ws ->
            try {
                if (ws.isOpen) {
                    ws.send(message)
                }
            } catch (e: IOException) {
                Log.e(TAG, "Error sending to websocket", e)
            }
        }
    }

    inner class SolayaWebSocket(handshakeRequest: IHTTPSession) : WebSocket(handshakeRequest) {
        override fun onOpen() {
            Log.d(TAG, "WebSocket opened")
            webSockets.add(this)
        }

        override fun onClose(code: NanoWSD.WebSocketFrame.CloseCode?, reason: String?, initiatedByRemote: Boolean) {
            Log.d(TAG, "WebSocket closed")
            webSockets.remove(this)
            if (webSockets.isEmpty()) {
                android.os.Handler(android.os.Looper.getMainLooper()).post {
                    pipecatManager?.stopSession()
                }
            }
        }

        override fun onPong(pong: NanoWSD.WebSocketFrame?) {
            // Nothing
        }

        override fun onException(exception: IOException?) {
            Log.e(TAG, "WebSocket exception", exception)
            webSockets.remove(this)
        }

        override fun onMessage(message: NanoWSD.WebSocketFrame) {
            try {
                val json = JSONObject(message.textPayload)
                pipecatManager?.handleIncomingAppMessage(json)
            } catch (e: Exception) {
                Log.e(TAG, "Error handling websocket message", e)
            }
        }
    }

    // ──────────────────────────────────────────────
    //  /config — Returns tunnel WebSocket URL
    // ──────────────────────────────────────────────

    private fun serveConfig(): Response {
        val json = JSONObject().apply {
            if (tunnelUrl.isNotBlank()) {
                put("wsUrl", tunnelUrl)
            }
        }
        return newCorsResponse(
            NanoHTTPD.newFixedLengthResponse(Response.Status.OK, "application/json", json.toString())
        )
    }

    // ──────────────────────────────────────────────
    //  /videos-list — Lists available video files
    // ──────────────────────────────────────────────

    private fun serveVideosList(): Response {
        val videoExtensions = setOf("mp4", "webm", "mkv", "mov")
        val videos = JSONArray()

        if (videosDir.exists() && videosDir.isDirectory) {
            videosDir.listFiles()
                ?.filter { it.isFile && it.extension.lowercase() in videoExtensions }
                ?.sortedBy { it.name }
                ?.forEach { videos.put(it.name) }
        }

        val json = JSONObject().put("videos", videos)
        return newCorsResponse(
            NanoHTTPD.newFixedLengthResponse(Response.Status.OK, "application/json", json.toString())
        )
    }

    // ──────────────────────────────────────────────
    //  /network-info — Server info endpoint
    // ──────────────────────────────────────────────

    private fun serveNetworkInfo(): Response {
        val json = JSONObject().apply {
            put("ip", "localhost")
            put("port", 8080)
            put("mode", "quest-local")
        }
        return newCorsResponse(
            NanoHTTPD.newFixedLengthResponse(Response.Status.OK, "application/json", json.toString())
        )
    }

    // ──────────────────────────────────────────────
    //  /stream/{filename} — Video with byte-range support
    // ──────────────────────────────────────────────

    private fun serveVideo(session: IHTTPSession, rawFilename: String): Response {
        val filename = URLDecoder.decode(rawFilename, "UTF-8")
        val videoFile = File(videosDir, filename)

        if (!videoFile.exists() || !videoFile.isFile) {
            Log.w(TAG, "Video not found: ${videoFile.absolutePath}")
            return NanoHTTPD.newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "Video not found: $filename")
        }

        val fileSize = videoFile.length()
        val mimeType = getMimeType(filename)
        val rangeHeader = session.headers["range"]

        return if (rangeHeader != null && rangeHeader.startsWith("bytes=")) {
            // ── Byte-range request (HTTP 206 Partial Content) ──
            serveVideoRange(videoFile, fileSize, mimeType, rangeHeader)
        } else {
            // ── Full file request (HTTP 200) ──
            val fis = FileInputStream(videoFile)
            val response = NanoHTTPD.newFixedLengthResponse(Response.Status.OK, mimeType, fis, fileSize)
            response.addHeader("Accept-Ranges", "bytes")
            response.addHeader("Content-Length", fileSize.toString())
            newCorsResponse(response)
        }
    }

    /**
     * Serves a byte range of a video file.
     * Supports formats: "bytes=0-1023", "bytes=1024-", "bytes=-500"
     */
    private fun serveVideoRange(
        videoFile: File,
        fileSize: Long,
        mimeType: String,
        rangeHeader: String
    ): Response {
        val rangeSpec = rangeHeader.removePrefix("bytes=").trim()
        val dashIndex = rangeSpec.indexOf('-')

        val start: Long
        val end: Long

        when {
            // "bytes=-500" → last 500 bytes
            dashIndex == 0 -> {
                val suffix = rangeSpec.substring(1).toLongOrNull() ?: 0L
                start = maxOf(0L, fileSize - suffix)
                end = fileSize - 1
            }
            // "bytes=1024-" → from 1024 to end
            dashIndex == rangeSpec.length - 1 -> {
                start = rangeSpec.substring(0, dashIndex).toLongOrNull() ?: 0L
                end = fileSize - 1
            }
            // "bytes=0-1023" → specific range
            else -> {
                start = rangeSpec.substring(0, dashIndex).toLongOrNull() ?: 0L
                end = rangeSpec.substring(dashIndex + 1).toLongOrNull() ?: (fileSize - 1)
            }
        }

        if (start >= fileSize) {
            val resp = NanoHTTPD.newFixedLengthResponse(
                Response.Status.RANGE_NOT_SATISFIABLE,
                "text/plain",
                "Range Not Satisfiable"
            )
            resp.addHeader("Content-Range", "bytes */$fileSize")
            return newCorsResponse(resp)
        }

        val actualEnd = minOf(end, fileSize - 1)
        val contentLength = actualEnd - start + 1

        val fis = FileInputStream(videoFile)
        if (start > 0) {
            fis.skip(start)
        }

        val response = NanoHTTPD.newFixedLengthResponse(
            Response.Status.PARTIAL_CONTENT,
            mimeType,
            fis,
            contentLength
        )
        response.addHeader("Content-Range", "bytes $start-$actualEnd/$fileSize")
        response.addHeader("Accept-Ranges", "bytes")
        response.addHeader("Content-Length", contentLength.toString())

        return newCorsResponse(response)
    }

    // ──────────────────────────────────────────────
    //  /client/* — Web client files from APK assets
    // ──────────────────────────────────────────────

    private fun serveAsset(path: String): Response {
        val assetPath = "client/$path"
        return try {
            val inputStream = context.assets.open(assetPath)
            val bytes = inputStream.readBytes()
            inputStream.close()

            val mimeType = getMimeType(path)
            val response = NanoHTTPD.newFixedLengthResponse(
                Response.Status.OK,
                mimeType,
                ByteArrayInputStream(bytes),
                bytes.size.toLong()
            )
            newCorsResponse(response)
        } catch (e: Exception) {
            Log.w(TAG, "Asset not found: $assetPath")
            NanoHTTPD.newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "Not found: $path")
        }
    }

    // ──────────────────────────────────────────────
    //  Helpers
    // ──────────────────────────────────────────────

    private fun getMimeType(filename: String): String {
        val ext = filename.substringAfterLast('.', "").lowercase()
        return MIME_TYPES[ext] ?: "application/octet-stream"
    }

    private fun newCorsResponse(response: Response): Response {
        response.addHeader("Access-Control-Allow-Origin", "*")
        response.addHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
        response.addHeader("Access-Control-Allow-Headers", "Range, Content-Type")
        response.addHeader("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length")
        return response
    }
}
