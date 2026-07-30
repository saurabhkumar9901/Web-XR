package com.solaya.quest

import ai.pipecat.client.PipecatClient
import ai.pipecat.client.PipecatClientOptions
import ai.pipecat.client.PipecatEventCallbacks
import ai.pipecat.client.gemini_live_websocket.GeminiLiveWebsocketTransport
import ai.pipecat.client.gemini_live_websocket.GeminiServiceOptions
import ai.pipecat.client.gemini_live_websocket.PipecatClientGeminiLiveWebsocket
import ai.pipecat.client.types.*
import android.content.Context
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.isActive
import org.json.JSONObject
import org.json.JSONArray

class PipecatManager(
    private val context: Context,
    private val webSocketServer: LocalServer
) {
    companion object {
        private const val TAG = "PipecatManager"
    }

    private var client: PipecatClientGeminiLiveWebsocket? = null
    var isConnected = false
        private set

    private var isMeditating = false
    private var botIsSpeaking = false
    private var userIsSpeaking = false
    private var guidanceLoopJob: Job? = null
    private var guidanceCounter = 0
    private var activeSubType = ""
    private val coroutineScope = CoroutineScope(Dispatchers.IO)

    fun startSession(voice: String, isResume: Boolean = false, isMeditation: Boolean = false, subType: String = "", gCat: String = "", gSub: String = "") {
        if (client != null) return

        val aiName = if (voice == "Despina" || voice == "Aoede") "Solaya" else "Sam"
        val systemInstructionStr = AuraConfig.buildSystemPrompt(context, aiName, isResume, isMeditation, subType, gCat, gSub)
        val tools = AuraConfig.buildTools(context)

        val apiKey = BuildConfig.GEMINI_API_KEY
        if (apiKey.isEmpty() || apiKey == "YOUR_API_KEY_HERE") {
            Log.e(TAG, "API Key is missing!")
            return
        }

        val options = GeminiServiceOptions.withDefaults(
            apiKey = apiKey,
            voice = voice,
            systemInstruction = Value.Object("parts" to Value.Array(listOf(Value.Object("text" to Value.Str(systemInstructionStr))))),
            tools = tools,
            initialUserMessage = "The session has started..."
        )

        val callbacks = object : PipecatEventCallbacks() {
            override fun onBackendError(message: String) {
                Log.e(TAG, "Backend Error: $message")
            }

            override fun onBotReady(data: BotReadyData) {
                Log.d(TAG, "Bot is ready")
                isConnected = true
            }

            override fun onBotStartedSpeaking() {
                botIsSpeaking = true
                guidanceLoopJob?.cancel()
                val msg = JSONObject().apply { put("type", "app-message") }
                val data = JSONObject().apply { put("action", "bot_started_speaking") }
                sendToClient(msg, data)
            }

            override fun onBotStoppedSpeaking() {
                botIsSpeaking = false
                if (isMeditating && !userIsSpeaking) {
                    startGuidanceLoop()
                }
                val msg = JSONObject().apply { put("type", "app-message") }
                val data = JSONObject().apply { put("action", "bot_stopped_speaking") }
                sendToClient(msg, data)
            }

            override fun onUserStartedSpeaking() {
                userIsSpeaking = true
                guidanceLoopJob?.cancel()
            }

            override fun onUserStoppedSpeaking() {
                userIsSpeaking = false
                if (isMeditating && !botIsSpeaking) {
                    startGuidanceLoop()
                }
            }

            override fun onRemoteAudioLevel(level: Float, participant: ai.pipecat.client.types.Participant) {
                val msg = JSONObject().apply { put("type", "app-message") }
                val data = JSONObject().apply {
                    put("action", "bot_audio_level")
                    put("level", level.toDouble())
                }
                sendToClient(msg, data)
            }

            override fun onDisconnected() {
                Log.d(TAG, "Disconnected")
                isConnected = false
                guidanceLoopJob?.cancel()
                client?.release()
                client = null
            }
            
            override fun onLLMFunctionCall(data: LLMFunctionCallData) {
                Log.d(TAG, "Function call received: ${data.functionName} args: ${data.args}")
                try {
                    val arguments = JSONObject()
                    val argsObj = data.args
                    if (argsObj is Map<*, *>) {
                        for ((k, v) in argsObj) {
                            arguments.put(k.toString(), v)
                        }
                    } else {
                        // Fallback if it's a string or JsonObject wrapper
                        val argsStr = argsObj.toString()
                        if (argsStr.trim().startsWith("{")) {
                            val parsed = JSONObject(argsStr.replace("=", ":"))
                            parsed.keys().forEach { arguments.put(it, parsed.get(it)) }
                        } else if (argsStr.trim().startsWith("[")) {
                            // The pipecat-android SDK drops keys and only provides values in LLMFunctionCallData.
                            // We must use heuristics to map the values back to their intended keys.
                            val arr = JSONArray(argsStr)
                            if (data.functionName == "show_environment_menu") {
                                for (i in 0 until arr.length()) {
                                    val str = arr.optString(i, "")
                                    if (str.length > 25 && str.contains(" ")) {
                                        arguments.put("reason", str)
                                    } else if (str.contains(",")) {
                                        arguments.put("recommended_sub_types", str)
                                    } else if (AuraConfig.GUIDANCE_CATEGORIES.contains(str)) {
                                        arguments.put("guidance_category", str)
                                    } else if (AuraConfig.GUIDANCE_SUBCATEGORIES.contains(str)) {
                                        arguments.put("guidance_subcategory", str)
                                    } else {
                                        arguments.put("top_sub_type", str)
                                    }
                                }
                            } else if (data.functionName == "trigger_xr_scene") {
                                for (i in 0 until arr.length()) {
                                    val str = arr.optString(i, "")
                                    if (AuraConfig.GUIDANCE_CATEGORIES.contains(str)) {
                                        arguments.put("guidance_category", str)
                                    } else if (AuraConfig.GUIDANCE_SUBCATEGORIES.contains(str)) {
                                        arguments.put("guidance_subcategory", str)
                                    } else if (str == "nature" || str == "meditation" || str == "spiritual") {
                                        arguments.put("scene_name", str)
                                    } else {
                                        arguments.put("sub_type", str)
                                    }
                                }
                            } else if (data.functionName == "end_session") {
                                for (i in 0 until arr.length()) {
                                    val str = arr.optString(i, "")
                                    if (str == "true" || str == "false") {
                                        arguments.put("show_feedback", str.toBoolean())
                                    }
                                }
                            } else {
                                for (i in 0 until arr.length()) {
                                    arguments.put("arg$i", arr.optString(i, ""))
                                }
                            }
                        }
                    }
                    var callId = ""
                    try {
                        val fields = data::class.java.declaredFields
                        for (f in fields) {
                            f.isAccessible = true
                            val value = f.get(data)
                            if (value is String && value.startsWith("fc_")) {
                                callId = value
                                break
                            }
                        }
                        if (callId.isEmpty()) {
                            // Try finding it in any property
                            val methods = data::class.java.declaredMethods
                            for (m in methods) {
                                if (m.name.startsWith("get") && m.parameterCount == 0) {
                                    val value = m.invoke(data)
                                    if (value is String && value.startsWith("fc_")) {
                                        callId = value
                                        break
                                    }
                                }
                            }
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Error extracting callId via reflection", e)
                    }
                    if (callId.isEmpty()) {
                        Log.w(TAG, "Could not extract tool call ID from LLMFunctionCallData! The bot will be stuck waiting for a response.")
                    } else {
                        Log.d(TAG, "Extracted tool call ID: $callId")
                        val responseText = when (data.functionName) {
                            "show_voice_menu" -> "[SYSTEM: The voice menu is now visible on the user's screen. Do NOT speak or say anything right now. Stay completely silent while they choose.]"
                            "show_environment_menu" -> "[SYSTEM: The environment menu is now visible on the user's screen. You may now speak your short recommendation or explanation.]"
                            "trigger_xr_scene" -> {
                                val subType = arguments.optString("sub_type", "visual")
                                val gCat = arguments.optString("guidance_category", "calm_reset")
                                val gSub = arguments.optString("guidance_subcategory", "slow_grounding")
                                "The $subType visual is now live. Guidance mode: $gCat/$gSub. BEGIN YOUR GUIDED MEDITATION NOW. Speak in a highly soothing, EXTREMELY slow, ASMR-style whispered meditation voice. Deliver Phase 1 (Arrival) and Phase 2 (Body Settling) only for now. Use generous, long ellipses (... ... ...) to space out your words: Keep it to 2-3 slow sentences, and then stop speaking. You will be prompted later to continue."
                            }
                            "stop_xr_tour" -> "Tour stopped. Aura is back in the center."
                            "end_session" -> "Session ended."
                            else -> "success"
                        }
                        
                        val toolResponse = Value.Object(
                            "functionResponses" to Value.Array(listOf(
                                Value.Object(
                                    "id" to Value.Str(callId),
                                    "name" to Value.Str(data.functionName),
                                    "response" to Value.Object("value" to Value.Str(responseText))
                                )
                            ))
                        )
                        client?.sendClientMessage("toolResponse", toolResponse)
                        sendClientMessageToGemini(responseText)
                    }
                    handleToolCall(data.functionName, arguments)
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing function call args", e)
                }
            }
        }

        val transport = GeminiLiveWebsocketTransport(context)
        client = PipecatClientGeminiLiveWebsocket(
            transport,
            PipecatClientOptions(callbacks = callbacks, enableMic = true)
        )

        client?.connect(options)?.withErrorCallback {
            Log.e(TAG, "Connection failed: ${it.description}")
        }
    }

    private fun startGuidanceLoop() {
        guidanceLoopJob?.cancel()
        guidanceLoopJob = coroutineScope.launch {
            while (isActive && isMeditating) {
                delay(7000)
                if (!botIsSpeaking) {
                    guidanceCounter++
                    Log.d(TAG, "7 seconds of silence passed. Injecting continuation prompt $guidanceCounter...")
                    sendClientMessageToGemini("[SYSTEM: The meditation is ongoing in the $activeSubType environment. The user has been silent. (Continuation #$guidanceCounter). Continue your guidance organically, weaving the environment imagery into their relaxation. Speak exactly 1 to 2 very slow, delightful sentences, and then stop speaking. Do not greet again.]")
                    delay(5000) // Give the bot time to start speaking before we resume the 7s countdown
                }
            }
        }
    }

    private fun handleToolCall(name: String, arguments: JSONObject) {
        Log.d(TAG, "Tool called: $name args: $arguments")
        val msg = JSONObject().apply { put("type", "app-message") }
        val data = JSONObject()
        
        when (name) {
            "trigger_xr_scene" -> {
                data.put("action", "trigger_scene")
                val sceneName = arguments.optString("scene_name", "nature").lowercase()
                val subType = arguments.optString("sub_type", "").lowercase()
                activeSubType = subType
                data.put("scene_name", sceneName)
                data.put("sub_type", subType)
                data.put("guidance_category", arguments.optString("guidance_category", "calm_reset").lowercase())
                data.put("guidance_subcategory", arguments.optString("guidance_subcategory", "slow_grounding").lowercase())
                isMeditating = true
                sendToClient(msg, data)
            }
            "show_environment_menu" -> {
                data.put("action", "show_environment_menu")
                data.put("top_sub_type", arguments.optString("top_sub_type", "nature_water"))
                val recsString = arguments.optString("recommended_sub_types", "")
                val recsArray = JSONArray()
                recsString.split(",").map { it.trim() }.filter { it.isNotEmpty() }.forEach {
                    recsArray.put(it)
                }
                data.put("recommended_sub_types", recsArray)
                data.put("guidance_category", arguments.optString("guidance_category", "calm_reset"))
                data.put("guidance_subcategory", arguments.optString("guidance_subcategory", "slow_grounding"))
                data.put("reason", arguments.optString("reason", ""))
                sendToClient(msg, data)
            }
            "stop_xr_tour" -> {
                data.put("action", "stop_tour")
                isMeditating = false
                guidanceLoopJob?.cancel()
                sendToClient(msg, data)
            }
            "end_session" -> {
                data.put("action", "end_session")
                data.put("show_feedback", arguments.optBoolean("show_feedback", false))
                isMeditating = false
                guidanceLoopJob?.cancel()
                sendToClient(msg, data)
            }
            "show_voice_menu" -> {
                data.put("action", "show_voice_menu")
                sendToClient(msg, data)
            }
        }
    }

    private fun sendToClient(msg: JSONObject, data: JSONObject) {
        msg.put("data", data as Any)
        CoroutineScope(Dispatchers.IO).launch {
            webSocketServer.sendToAllWebSockets(msg.toString())
        }
    }

    fun sendClientMessageToGemini(text: String) {
        val actionMessage = Value.Object(
            "turns" to Value.Array(listOf(
                Value.Object(
                    "role" to Value.Str("user"),
                    "parts" to Value.Array(listOf(
                        Value.Object("text" to Value.Str(text))
                    ))
                )
            )),
            "turnComplete" to Value.Bool(true)
        )
        client?.sendClientMessage("clientContent", actionMessage)
    }

    fun handleIncomingAppMessage(outerData: JSONObject) {
        val data = outerData.optJSONObject("data") ?: outerData
        val action = data.optString("t")
        val payload = data.optJSONObject("d") ?: JSONObject()

        Log.d(TAG, "handleIncomingAppMessage: $action")
        when (action) {
            "tour_finished" -> {
                isMeditating = false
                guidanceLoopJob?.cancel()
                sendClientMessageToGemini("The environment phase has ended. Begin the POST-TOUR PHASE as described in your instructions.")
            }
            "timer_update" -> {
                val timeLeft = payload.optInt("time_left", 0)
                if (timeLeft == 60) {
                    sendClientMessageToGemini("Exactly 60 seconds are left on the meditation timer. Respond immediately by saying: 'Only 1 minute is left' in your soothing meditative voice.")
                }
            }
            "end_session_requested" -> {
                isMeditating = false
                guidanceLoopJob?.cancel()
                sendClientMessageToGemini("I clicked the End Session button in the UI. Please transition into the post-tour feedback phase by asking me if I want to leave feedback before closing. Then call end_session.")
            }
            "voice_selected" -> {
                sendClientMessageToGemini("I have selected my voice and confirmed it. Please gently greet me, introduce yourself, and ask how I am feeling today. Suggest ONLY 2 or 3 mood options (e.g., Stressed, Tired, Restless). Speak this in an EXTREMELY slow, soft, meditative whispered pace, and then wait for my response.")
            }
            "environment_selected" -> {
                val sceneName = payload.optString("scene_name", "nature")
                val subType = payload.optString("sub_type", "nature_water")
                activeSubType = subType
                val guidanceCategory = payload.optString("guidance_category", "calm_reset")
                val guidanceSubcategory = payload.optString("guidance_subcategory", "slow_grounding")
                isMeditating = true
                sendClientMessageToGemini(
                    "The user has selected the '$subType' environment (scene: '$sceneName'). " +
                    "Guidance mode: $guidanceCategory/$guidanceSubcategory. " +
                    "CRITICAL: The visual environment is ALREADY active on the user's screen. " +
                    "Do NOT call the 'trigger_xr_scene' tool under any circumstances for this action, as the client has already started the video. " +
                    "BEGIN YOUR GUIDED MEDITATION IMMEDIATELY. Speak in an EXTREMELY soothing, slow, ASMR-style whispered meditation voice. " +
                    "You must start by immediately validating their choice: tell them warmly that they made a great choice, and explain how this specific space is going to be the absolute best medicine for their mood or tension. " +
                    "Deliver Phase 1 (Validation & Arrival) and Phase 2 (Body Settling) only for now. " +
                    "Use generous, long ellipses (... ... ...) to space out your words: " +
                    "Keep it to 2-4 slow sentences, and then stop speaking. The system will automatically prompt you to continue the phases later."
                )
            }
        }
    }

    fun stopSession() {
        guidanceLoopJob?.cancel()
        client?.disconnect()
        client = null
        isConnected = false
    }
}
