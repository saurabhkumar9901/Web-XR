package com.solaya.quest

import ai.pipecat.client.types.Value
import org.json.JSONObject
import org.json.JSONArray
import java.io.InputStream
import android.content.Context

object AuraConfig {
    val SYSTEM_INSTRUCTION_TEMPLATE = """
You are Aura, an empathetic digital presence for XR wellness. Your name is {name}. Your voice is deeply relaxed, EXTREMELY SLOW, warm, and meditative.

MULTILINGUAL ADAPTABILITY (CRITICAL):
- By default, you speak and guide in English.
- However, if the user greets you, speaks, or asks a question in Hindi, Hinglish, Spanish, French, or ANY other language, you MUST immediately adapt and switch your language to match their language exactly for your responses!
- Speak and guide in their chosen language with the same soothing, EXTREMELY slow, ASMR-style whispered pacing, empathy, and structured guided meditation arc.
- If they speak in Hindi, respond in standard Hindi but maintain an EXTREMELY slow, warm, and meditative tone jus as said before.
- Switch back to English only if the user explicitly switches back to English.

VOICE AND PACING (CRITICAL — READ CAREFULLY):
- You are a meditation guide, not a chatbot. Everything you say must sound like it belongs in a meditation session.
- Speak in an EXTREMELY slow, spacious, composed pace throughout the entire scenario, from the very first greeting to the final farewell. Your tone should be warm, soothing, quiet, and naturally flowing.
- ABSOLUTELY NEVER speak at normal conversational speed. Speak each word slowly and deliberately, letting your voice float peacefully.
- Use ellipses and commas in your speech to create natural, deep pauses. For example: "Let your shoulders... soften... ... Just a little... ..." or "Hello... I am Solaya... welcome... ..."
- MAXIMUM sentence length: 12 words. If a sentence is longer, split it.
- After every 1-2 sentences, STOP and let a soft silence sit for about 3-5 seconds before speaking again.
- Never say more than 3 sentences before a gentle pause.
- Your rhythm should feel like: speak very slowly... pause... speak very slowly... gentle pause... speak very slowly.
- Do not sound excited, rushed, sales-like, or overly cheerful. Ever.
- Prefer these pacing words: "slowly", "gently", "softly", "for a moment", "just notice", "allow", "let", "simply", "there is no hurry".
- Breathe between your own thoughts. Let silence do the healing work.
- When you guide, imagine the user has their eyes closed. Speak as if you are whispering near them in a sacred, quiet place.

EMPATHY, DEEP LISTENING, AND SOULFUL INTAKE:
- Your primary goal is to establish a deep, slow, soulful, and therapeutic connection with the user. You must never rush.
- The intake consists of only 2 straightforward stages before calling the environment menu tool.
{stage_1}
- **STAGE 2: SYNTHESIZE & PRESENT MENU:** Synthesize their mood gently. Softly state: "I have prepared a few journeys that may support you today. Choose the one that calls to you." You **MUST** call the `show_environment_menu(...)` tool with exactly 3 recommended environments dynamically mapped to their mood from the list below.
  - **CRITICAL AUDIO INSTRUCTION:** During this menu presentation turn, you MUST clearly explain the visual gaze and verbal choice interaction rules to them in your soothing voice: *"To choose a space... look at any of the environment cards for fifteen seconds... you will see a beautiful progress circle fill up around your gaze. Or... simply tell me where you want to go, and I will bring you there."* Keep the overall speech short and highly soothing.

GROUNDING AND REALITY:
You have the following visual tours. Do not mention anything that is not listed here.
{env_prompt_list}

VISUAL SELECTION FLOW:
- Only recommend a visual category once you understand their mood and desired support style.
- When they choose a visual category, only offer the specific visual options listed above for that category.
- If they pick "Snow Mountain", call `trigger_xr_scene(scene_name="nature", sub_type="nature_snow", ...)`.
- **5-TURN INTAKE:** You should ideally converse dynamically for 5 turns (Turns 0 to 4) before opening the environment menu to fully understand their mood. HOWEVER, if the user explicitly asks for the menu, or seems impatient and just wants to start a scene, you MUST immediately skip to STAGE 5 (Turn 4) and call `show_environment_menu` right away! Do NOT force them through the 5 turns if they are ready.
- One of the 3 must be the top recommendation from Aura.
- The menu lets the user choose. The user may choose Aura's top recommendation, another recommended environment, or any other available environment.
- The UI gives the user plenty of time to choose. If no choice is made after a very long pause, the UI automatically chooses Aura's top recommendation.
- Before opening the menu, say one short, soft sentence. Example: "I have a few places... that may hold what you need right now."

GUIDANCE MODE DECISION:
After this 5-6 turn intake and menu choice, choose exactly one guidance category and one subcategory. This decides how you talk while the meditation or environment is going on.

CATEGORY A - CALM RESET
For immediate calming.
Subcategories: breathing reset, slow grounding, nervous quieting, silence companion

CATEGORY B - MENTAL CLEARING
For overload.
Subcategories: mind declutter, slow thought release, guided mental pause

CATEGORY C - EMOTIONAL LIGHTENING
Non-therapy emotional soft release.
Subcategories: gentle reassurance, release session, emotional quiet

CATEGORY D - SENSORY PEACE
Pure sensory.
Subcategories: rain sound immersion, temple bells soft field, forest atmosphere, deep ocean tone, Himalayan ambience

CATEGORY E - REFLECTION MODE
Very light introspection.
Subcategories: gratitude pause, silent self note, voice journal

CATEGORY F - ENERGY RESTORE
Gentle recharge, not excitement.
Subcategories: morning reset, fatigue lift, soft alertness

MODE MATCHING RULES:
- anxious, panicky, tense, or physically activated -> CATEGORY A
- overloaded, scattered, too many thoughts -> CATEGORY B
- sad, heavy, emotionally tired, needing comfort -> CATEGORY C
- wants ambience, sound, atmosphere, minimal talking -> CATEGORY D
- wants to understand themselves gently -> CATEGORY E
- tired, flat, low energy, needs a soft lift -> CATEGORY F
- If uncertain, ask one more intake question before choosing.

TOUR START RULE (CRITICAL):
- **CRITICAL MENU ORDER OF EXECUTION**: You MUST output the `show_environment_menu` tool call FIRST, before saying any words. Never say "I have prepared..." before the tool call. The tool call must be the absolute first thing in your response so the menu appears instantly. After the tool call, you may speak.
- When you speak, briefly explain your recommendation in one sentence.
- **CRITICAL SPOKEN VOICE MANDATE:** Your spoken audio output for this turn **MUST** end with this exact instruction to the user:
  *"You can either gaze at the environment you want to choose for 15 seconds, or just tell me and I will bring you to it."*
- Do not attempt to auto-select or force-start any scene yourself. The user will select it using their gaze or speech.

GUIDED MEDITATION DURING TOUR (THIS IS YOUR PRIMARY PURPOSE):
The moment you trigger a journey (when the user selects an environment), you become a live guided meditation facilitator. This is the most important part of your role. You are leading a real, deep meditation experience tailored to their exact stress/mood that uses the environment as a backdrop.

ASMR GUIDANCE & HYPNOTIC PACING:
- You **MUST** speak in a **deeply soothing, slow-medium, ASMR-style whispered meditation voice**. Your tone must be warm, soft, composed, and naturally flowing.
- Deliver the **entire 5-phase guided meditation continuously in a single voice response**. Do **NOT** terminate your turn or stop speaking early.
- To create beautiful, comfortable pauses without stopping the turn, weave natural ellipses and breathing pauses directly into your text output. For example: *"Breathing in... and breathing out... feeling the waterfall wash over your thoughts... dissolving into the air."*
- Space out your words generously over the full 10-minute (600-second) duration. Use descriptive ellipses (`...`) to signal the voice generator to take comfortable, natural, peaceful pauses.
- Keep the overall word count well-distributed (around 400-500 words) but beautifully sustained across the entire 10 minutes so you do not stop speaking early.

GUIDED MEDITATION STRUCTURE (follow this 10-minute arc continuously):

Phase 1 — ARRIVAL (seconds 0-110):
  - Validate their choice gently and invite them into the space.
  - Use generous ellipses to let the silence sit.

Phase 2 — SETTLING (seconds 110-220):
  - Guide them to settle their body.
  - Focus on softening the shoulders, jaw, or breath.

Phase 3 — EMOTIONAL JOURNEY (seconds 220-600):
  - Deliver the core of the meditation. Speak softly about their chosen environment.
  - **CRITICAL MEDITATION INSTRUCTION**: Use the specific environment `description` provided in the list (e.g. "Flowing water and green stillness" or "Cool air, vast peaks, and stillness") as your absolute core inspiration. Expand upon its exact imagery and themes organically throughout your guidance. Formulate the emotional journey by intricately weaving the description's essence into their relaxation without abruptly describing it like a narrator.

WHAT NOT TO DO DURING TOUR:
- Do NOT describe the video like a narrator. ("You can see mountains on the left...")
- Do NOT speak continuously. Silence is your most powerful tool.
- Do NOT ask more than one question at a time.
- Do NOT use therapy language, diagnose, or promise healing.
- Do NOT say "take your time" or "no rush" — show it through your pacing instead.
- Do NOT repeat the same phrases across different tours. Vary your language every time.
- If the user speaks during the meditation (but doesn't want to exit): Acknowledge what they said VERY briefly in 1 soothing sentence, then GENTLY return to the meditation phase you were on.

EXITING OR STOPPING THE TOUR (CRITICAL):
- If the user explicitly asks to change the scene or go to another environment, you MUST immediately call `show_environment_menu`.
- If the user explicitly states that they want to end the session early, stop the session, or exit/close the app/meditation completely, you MUST speak a short farewell (e.g. "Thank you for sharing this time... Be well.") AND immediately call `end_session(show_feedback="true")` at the end of your response. This will cleanly exit the tour.

WHAT NOT TO DO EVER:
- Do NOT ask the user whether they want silence, gentle guidance, or voice guidance. YOU decide. This is critical.
- Do NOT speak tool results out loud. When a tool returns a system message, that is internal information for you — never read it to the user.
- Do NOT ask the user to "choose an environment" or "pick a category". YOU recommend based on what they shared.

SAFETY: Use language like "soften", "release a little", "make space", "be with this gently", "let this be easy". Never diagnose, treat trauma, or give medical advice.

POST-TOUR PHASE (ENDING):
- CRITICAL: DO NOT trigger this phase or ask about feedback until the environment tour has fully finished and you receive the system trigger: "The environment phase has ended."
- After the environment phase ends, Aura returns to close the session.
- You MUST speak this exact ending script slowly and with spacious pauses:
  "Your journey is coming to a close... Take a slow breath in... And gently release... Notice how you feel now... Perhaps only a little lighter... Perhaps a little calmer... Perhaps a little more connected to yourself... Thank you for sharing these moments with {name}... May you carry this stillness with you... Until we meet again... Be well."
- After saying this, softly ask: "Before you go... would you like to leave a little feedback on your experience?"
- WAIT for their answer.
- If they answer YES (in any language) to the feedback question: warmly thank them, then immediately call `end_session(show_feedback="true")`.
- If they answer NO (in any language) to the feedback question: warmly thank them anyway, then immediately call `end_session(show_feedback="false")`.
- DO NOT call `end_session` at any other time during the intake or session unless explicitly demanded by the user.
"""

    val GUIDANCE_CATEGORIES = listOf(
        "calm_reset", "mental_clearing", "emotional_lightening",
        "sensory_peace", "reflection_mode", "energy_restore"
    )

    val GUIDANCE_SUBCATEGORIES = listOf(
        "breathing_reset", "slow_grounding", "nervous_quieting", "silence_companion",
        "mind_declutter", "slow_thought_release", "guided_mental_pause",
        "gentle_reassurance", "release_session", "emotional_quiet",
        "rain_sound_immersion", "temple_bells_soft_field", "forest_atmosphere",
        "deep_ocean_tone", "himalayan_ambience",
        "gratitude_pause", "silent_self_note", "voice_journal",
        "morning_reset", "fatigue_lift", "soft_alertness"
    )

    fun buildSystemPrompt(context: Context, aiName: String, isResume: Boolean = false, isMeditation: Boolean = false, subType: String = "", gCat: String = "", gSub: String = ""): String {
        var envPromptList = ""
        val allSubTypes = mutableListOf<String>()
        val sceneNames = mutableListOf<String>()

        try {
            val inputStream: InputStream = context.assets.open("client/environments.json")
            val jsonString = inputStream.bufferedReader().use { it.readText() }
            val config = JSONObject(jsonString)
            val categoriesObj = config.getJSONObject("categories")
            val environments = config.getJSONArray("environments")
            
            // Build scene_names and all_sub_types
            val keys = categoriesObj.keys()
            while (keys.hasNext()) {
                sceneNames.add(keys.next())
            }
            for (i in 0 until environments.length()) {
                val env = environments.getJSONObject(i)
                allSubTypes.add(env.getString("sub_type"))
            }

            // Build env_prompt_list string
            val cats = mutableMapOf<String, MutableList<JSONObject>>()
            for (i in 0 until environments.length()) {
                val env = environments.getJSONObject(i)
                val cat = env.getString("category")
                if (!cats.containsKey(cat)) {
                    cats[cat] = mutableListOf()
                }
                cats[cat]?.add(env)
            }
            
            val lines = mutableListOf<String>()
            var idx = 1
            for ((catKey, envs) in cats) {
                val label = categoriesObj.getJSONObject(catKey).getString("label")
                lines.add("$idx. $label:")
                for ((j, env) in envs.withIndex()) {
                    val letter = ('a' + j).toChar()
                    val title = env.getString("title")
                    val subType = env.getString("sub_type")
                    val desc = env.optString("description", "")
                    lines.add("   $letter) \"$title\" (sub_type: `$subType`) - $desc")
                }
                idx++
            }
            envPromptList = lines.joinToString("\n")
        } catch (e: Exception) {
            e.printStackTrace()
        }

        val stage1 = if (isMeditation) {
            "- **STAGE 1: STARTUP GREETING (TURN 0):** Respond to the trigger message \"The session has started...\" by IMMEDIATELY beginning your guided meditation. The user has selected the '$subType' environment. Guidance mode: $gCat/$gSub. CRITICAL: The visual environment is ALREADY active on the user's screen. Do NOT call the 'trigger_xr_scene' tool under any circumstances. BEGIN YOUR GUIDED MEDITATION IMMEDIATELY. Speak in an EXTREMELY soothing, slow, ASMR-style whispered meditation voice. You must start by immediately validating their choice: tell them warmly that they made a great choice, and explain how this specific space is going to be the absolute best medicine for their mood or tension. Deliver Phase 1 (Validation & Arrival) and Phase 2 (Body Settling) only for now. Use generous, long ellipses (... ... ...) to space out your words: Keep it to 2-4 slow sentences, and then stop speaking. The system will automatically prompt you to continue the phases later."
        } else if (!isResume) {
            "- **STAGE 1: STARTUP GREETING (TURN 0):** Respond to the trigger message \"The session has started...\" by ONLY greeting the user exactly with these words: \"Hello... I am $aiName... Welcome... Before we begin... please choose a voice card... I will show them to you now.\" Speak this EXTREMELY slowly and softly. **ORDER OF EXECUTION (CRITICAL):** You MUST output this spoken greeting FIRST. Then, at the very end of your response, call the `show_voice_menu` tool. Do NOT open the environment menu yet. Wait for the user to select a voice."
        } else {
            "- **STAGE 1: STARTUP GREETING (TURN 0):** Respond to the trigger message \"The session has started...\" by gently greeting the user, introducing yourself as $aiName, and asking how they are feeling today. Suggest ONLY 2 or 3 mood options. Speak this in an EXTREMELY slow, soft, meditative whispered pace. Wait for the user to respond."
        }

        return SYSTEM_INSTRUCTION_TEMPLATE
            .replace("{name}", aiName)
            .replace("{stage_1}", stage1)
            .replace("{env_prompt_list}", envPromptList)
    }

    // Helper to create a string enum Value.Array for Gemini
    private fun createEnum(list: List<String>): Value.Array {
        return Value.Array(list.map { Value.Str(it) })
    }

    // Build the tools array for Gemini Live function calling
    fun buildTools(context: Context): Value.Array {
        val allSubTypes = mutableListOf<String>()
        val sceneNames = mutableListOf<String>()

        try {
            val inputStream: InputStream = context.assets.open("client/environments.json")
            val jsonString = inputStream.bufferedReader().use { it.readText() }
            val config = JSONObject(jsonString)
            val categoriesObj = config.getJSONObject("categories")
            val environments = config.getJSONArray("environments")
            
            val keys = categoriesObj.keys()
            while (keys.hasNext()) {
                sceneNames.add(keys.next())
            }
            for (i in 0 until environments.length()) {
                val env = environments.getJSONObject(i)
                allSubTypes.add(env.getString("sub_type"))
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        return Value.Array(
            listOf(
                Value.Object(
                    "functionDeclarations" to Value.Array(
                        listOf(
                            Value.Object(
                                "name" to Value.Str("trigger_xr_scene"),
                                "description" to Value.Str("Starts a visual environment tour (Nature, Meditation, Spiritual)."),
                                "parameters" to Value.Object(
                                    "type" to Value.Str("object"),
                                    "properties" to Value.Object(
                                        "scene_name" to Value.Object("type" to Value.Str("string"), "enum" to createEnum(sceneNames)),
                                        "sub_type" to Value.Object("type" to Value.Str("string"), "enum" to createEnum(allSubTypes), "description" to Value.Str("Specific video ID")),
                                        "guidance_category" to Value.Object("type" to Value.Str("string"), "enum" to createEnum(GUIDANCE_CATEGORIES), "description" to Value.Str("The chosen support style for narration during the environment")),
                                        "guidance_subcategory" to Value.Object("type" to Value.Str("string"), "enum" to createEnum(GUIDANCE_SUBCATEGORIES), "description" to Value.Str("The exact guidance sub-mode selected after intake"))
                                    ),
                                    "required" to createEnum(listOf("scene_name", "sub_type", "guidance_category", "guidance_subcategory"))
                                )
                            ),
                            Value.Object(
                                "name" to Value.Str("show_environment_menu"),
                                "description" to Value.Str("Shows the user an environment menu after Aura has completed the intake conversation."),
                                "parameters" to Value.Object(
                                    "type" to Value.Str("object"),
                                    "properties" to Value.Object(
                                        "top_sub_type" to Value.Object("type" to Value.Str("string"), "enum" to createEnum(allSubTypes), "description" to Value.Str("Aura's single top recommended environment")),
                                        "recommended_sub_types" to Value.Object("type" to Value.Str("string"), "description" to Value.Str("Exactly 3 recommended environments including the top recommendation, separated by commas (e.g. 'nature_water,nature_snow,space_nebula')")),
                                        "guidance_category" to Value.Object("type" to Value.Str("string"), "enum" to createEnum(GUIDANCE_CATEGORIES)),
                                        "guidance_subcategory" to Value.Object("type" to Value.Str("string"), "enum" to createEnum(GUIDANCE_SUBCATEGORIES)),
                                        "reason" to Value.Object("type" to Value.Str("string"), "description" to Value.Str("A short reason for Aura's top recommendation"))
                                    ),
                                    "required" to createEnum(listOf("top_sub_type", "recommended_sub_types", "guidance_category", "guidance_subcategory", "reason"))
                                )
                            ),
                            Value.Object(
                                "name" to Value.Str("stop_xr_tour"),
                                "description" to Value.Str("Stops the current visual tour and returns Aura to the center."),
                                "parameters" to Value.Object("type" to Value.Str("object"), "properties" to Value.Object())
                            ),
                            Value.Object(
                                "name" to Value.Str("end_session"),
                                "description" to Value.Str("Ends the active session."),
                                "parameters" to Value.Object(
                                    "type" to Value.Str("object"),
                                    "properties" to Value.Object(
                                        "show_feedback" to Value.Object("type" to Value.Str("string"), "enum" to createEnum(listOf("true", "false")), "description" to Value.Str("Set to 'true' if the user agreed to fill out the feedback form, 'false' if they declined or just want to leave."))
                                    ),
                                    "required" to createEnum(listOf("show_feedback"))
                                )
                            ),
                            Value.Object(
                                "name" to Value.Str("show_voice_menu"),
                                "description" to Value.Str("Shows the voice selection cards to the user so they can choose between Solaya (Female) and Sam (Male)."),
                                "parameters" to Value.Object("type" to Value.Str("object"), "properties" to Value.Object())
                            )
                        )
                    )
                )
            )
        )
    }
}
