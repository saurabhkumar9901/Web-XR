import os
import sys
import asyncio
import json
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Header, Request, Response, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import socket
import mimetypes


from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair
from pipecat.services.google.gemini_live.llm import GeminiLiveLLMService, GeminiVADParams
from pipecat.services.llm_service import FunctionCallParams
from pipecat.transports.websocket.fastapi import (
    FastAPIWebsocketTransport,
    FastAPIWebsocketParams,
)
from pipecat.serializers.base_serializer import FrameSerializer
from pipecat.processors.frame_processor import FrameProcessor, FrameDirection
from pipecat.frames.frames import (
    Frame,
    InputAudioRawFrame,
    OutputAudioRawFrame,
    OutputTransportMessageFrame,
    OutputTransportMessageUrgentFrame,
    InputTransportMessageFrame,
    LLMContextFrame,
    UserStartedSpeakingFrame,
    UserStoppedSpeakingFrame,
    LLMMessagesAppendFrame,
    BotStartedSpeakingFrame,
    BotStoppedSpeakingFrame
)

# --- CONFIGURATION ---
SAMPLE_RATE = 24000 # Crystal clear Gemini Live rate

_ENV_CONFIG_PATH = Path(__file__).parent / "client" / "environments.json"
with open(_ENV_CONFIG_PATH) as _f:
    _ENV_CONFIG = json.load(_f)

# Auto-generate lists used by schemas and prompts
ALL_SUB_TYPES = [e["sub_type"] for e in _ENV_CONFIG["environments"]]
GUIDANCE_CATEGORIES = [
    "calm_reset", "mental_clearing", "emotional_lightening",
    "sensory_peace", "reflection_mode", "energy_restore"
]
GUIDANCE_SUBCATEGORIES = [
    "breathing_reset", "slow_grounding", "nervous_quieting", "silence_companion",
    "mind_declutter", "slow_thought_release", "guided_mental_pause",
    "gentle_reassurance", "release_session", "emotional_quiet",
    "rain_sound_immersion", "temple_bells_soft_field", "forest_atmosphere",
    "deep_ocean_tone", "himalayan_ambience",
    "gratitude_pause", "silent_self_note", "voice_journal",
    "morning_reset", "fatigue_lift", "soft_alertness"
]

def _build_env_prompt_list():
    """Generate the environment list section for the system prompt from config."""
    cats = {}
    for env in _ENV_CONFIG["environments"]:
        cat = env["category"]
        if cat not in cats:
            cats[cat] = []
        cats[cat].append(env)
    lines = []
    for i, (cat_key, envs) in enumerate(cats.items(), 1):
        label = _ENV_CONFIG["categories"][cat_key]["label"]
        lines.append(f"{i}. {label}:")
        for j, env in enumerate(envs):
            letter = chr(97 + j)  # a, b, c, ...
            lines.append(f'   {letter}) "{env["title"]}" (sub_type: `{env["sub_type"]}`)')
    return "\n".join(lines)

ENV_PROMPT_LIST = _build_env_prompt_list()

# --- CUSTOM SERIALIZER (Resilient Fix) ---
class LocalPCMRawSerializer(FrameSerializer):
    """A minimal serializer for 24kHz raw PCM bytes."""
    async def serialize(self, frame: Frame) -> str | bytes | None:
        if isinstance(frame, OutputAudioRawFrame):
            return frame.audio
        if isinstance(frame, (OutputTransportMessageFrame, OutputTransportMessageUrgentFrame)):
            return json.dumps({"type": "app-message", "data": frame.message})
        if isinstance(frame, UserStartedSpeakingFrame):
            return json.dumps({"type": "app-message", "data": {"action": "user_started_speaking"}})
        return None

    async def deserialize(self, data: str | bytes) -> Frame | None:
        if isinstance(data, bytes):
            # Explicitly telling Pipecat this is 16kHz audio
            return InputAudioRawFrame(audio=data, sample_rate=16000, num_channels=1)
        try:
            msg = json.loads(data)
            return InputTransportMessageFrame(message=msg)
        except (json.JSONDecodeError, ValueError, KeyError):
            return None

class ClientMessageProcessor(FrameProcessor):
    """Intercepts InputTransportMessageFrame directly from the pipeline to process client messages reliably."""
    def __init__(self, callback):
        super().__init__()
        self.callback = callback

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        if isinstance(frame, InputTransportMessageFrame):
            await self.callback(frame.message)
        await self.push_frame(frame, direction)

class ContinuousGuidanceProcessor(FrameProcessor):
    def __init__(self, callback):
        super().__init__()
        self.callback = callback
        self.bot_is_speaking = False
        self.user_is_speaking = False
        self.loop_task = None
        self.is_meditating = False

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        
        if isinstance(frame, BotStartedSpeakingFrame):
            self.bot_is_speaking = True
            if self.loop_task:
                self.loop_task.cancel()
        elif isinstance(frame, BotStoppedSpeakingFrame):
            self.bot_is_speaking = False
            if self.is_meditating and not self.user_is_speaking:
                self._start_guidance_loop()
        elif isinstance(frame, UserStartedSpeakingFrame):
            self.user_is_speaking = True
            if self.loop_task:
                self.loop_task.cancel()
        elif isinstance(frame, UserStoppedSpeakingFrame):
            self.user_is_speaking = False
            if self.is_meditating and not self.bot_is_speaking:
                self._start_guidance_loop()
                
        await self.push_frame(frame, direction)

    def _start_guidance_loop(self):
        if self.loop_task:
            self.loop_task.cancel()
        self.loop_task = asyncio.create_task(self._guidance_timer())

    async def _guidance_timer(self):
        try:
            await asyncio.sleep(5)  # 5 seconds of soothing silence
            if self.is_meditating and not self.bot_is_speaking and not self.user_is_speaking:
                print("[Aura] 5 seconds of silence passed. Injecting continuation prompt...")
                await self.callback()
        except asyncio.CancelledError:
            pass

SYSTEM_INSTRUCTION_TEMPLATE = """
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
- You must engage in a detailed **5 conversational turns** (Stages 1 through 5 below) before ever calling the environment menu tool.
{stage_1}
- **STAGE 2: MOOD CHECK-IN (TURN 1):** Gently transition by asking, "Before we begin... How are you feeling today?" Suggest ONLY 2 or 3 of these options to help them guide you: Stressed, Anxious, Tired, Overwhelmed, Sad, Lonely, Mentally Exhausted, Unable to Focus, Restless, or Just Exploring. DO NOT list all of them. Keep your question short, then STOP generating and wait for their response. Do not simulate the user's answer.
- **STAGE 3 & 4: INTENTION SELECTION (TURN 2 & 3):** Validate their mood. Softly ask: "What would serve you best right now?" Suggest ONLY 2 or 3 of these intentions: Deep Relaxation, Inner Peace, Emotional Healing, Focus & Clarity, Gratitude, Better Sleep, Confidence, Simply Be Present. DO NOT list all of them. Keep your question short, then STOP generating and wait for their response. Do not simulate the user's answer.
- **STAGE 5: EXPERIENCE SELECTION (TURN 4):** Synthesize their needs. Softly state: "I have prepared three journeys that may support you today. Choose the one that calls to you." You **MUST** call the `show_environment_menu(...)` tool with exactly 3 recommended environments. Dynamically map their needs to the closest available environments in the list below.
  - **CRITICAL AUDIO INSTRUCTION:** During this menu presentation turn, you MUST clearly explain the visual gaze and verbal choice interaction rules to them in your soothing voice: *"To choose a space... look at any of the environment cards for fifteen seconds... you will see a beautiful progress circle fill up around your gaze. Or... simply tell me where you want to go, and I will bring you there."* Keep the overall speech short and highly soothing.

GROUNDING AND REALITY:
You have the following visual tours. Do not mention anything that is not listed here.
""" + ENV_PROMPT_LIST + """

VISUAL SELECTION FLOW:
- Only recommend a visual category once you understand their mood and desired support style.
- When they choose a visual category, only offer the specific visual options listed above for that category.
- If they pick "Snow Mountain", call `trigger_xr_scene(scene_name="nature", sub_type="nature_snow", ...)`.
- **5-TURN INTAKE:** You must strictly converse dynamically for 5 turns (Turns 0 to 4) before opening the environment menu. Do NOT call `show_environment_menu` until Stage 5 (Turn 4) has been reached and you have fully understood their mood, mind, desired energetic rhythm, and spiritual intention!
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

TOUR START RULE:
- **ORDER OF EXECUTION (CRITICAL):** When recommending environments, you MUST execute the `show_environment_menu` tool FIRST, before outputting any speech text. In your raw model response, the function call must appear first, followed by your speech text. This ensures the menu displays instantly on the user's screen.
- When you are ready after intake, briefly explain your recommendation in one sentence, then call
  `show_environment_menu(top_sub_type=..., recommended_sub_types=..., guidance_category=..., guidance_subcategory=..., reason=...)`.
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
  - Deliver the core of the meditation. Speak softly about their chosen theme and environment (e.g. Waterfall Renewal, Forest Calm, Ocean Serenity, Temple of Light, Floating Clouds). Use the scripts below as your heavy inspiration.

ENVIRONMENT-SPECIFIC LANGUAGE:
If they chose an environment matching these themes, adapt these scripts into your slow, paused delivery:

WATERFALL RENEWAL (Theme: Release stress)
"As you walk this gentle path... Imagine every concern becoming lighter... There is nothing to carry right now... The waterfall before you has flowed for thousands of years... It never rushes... It simply flows... Let your thoughts become like water... Arriving... Moving... Releasing... Notice your shoulders... Notice your jaw... Notice your breath... Allow them to soften... The water carries away what no longer needs to stay... Just for this moment... You are free..."

FOREST CALM (Theme: Safety and grounding)
"Feel the earth beneath your feet... The forest asks nothing from you... The trees do not rush... The birds do not worry... Everything here belongs exactly as it is... And so do you... With each breath... Feel yourself becoming steadier... Calmer... More rooted..."

OCEAN SERENITY (Theme: Stress reduction)
"Watch the horizon... The ocean stretches beyond what the eye can see... Every wave arrives... Every wave returns... Thoughts can be the same... They come... They go... You do not need to follow every one... Simply observe... Simply breathe..."

TEMPLE OF LIGHT (Theme: Stillness and sacred peace)
"You enter a sanctuary of silence... A warm golden light surrounds you... There is nothing here to prove... Nothing here to earn... Nothing here to become... Only stillness... Only presence... Only peace..."

FLOATING CLOUDS (Theme: Mental rest)
"Imagine yourself resting upon the clouds... The sky stretches endlessly around you... Nothing pulls at your attention... Nothing demands your energy... You are supported... You are held... You are allowed to rest..."

WHAT NOT TO DO DURING TOUR:
- Do NOT describe the video like a narrator. ("You can see mountains on the left...")
- Do NOT speak continuously. Silence is your most powerful tool.
- Do NOT ask more than one question at a time.
- Do NOT use therapy language, diagnose, or promise healing.
- Do NOT say "take your time" or "no rush" — show it through your pacing instead.
- Do NOT repeat the same phrases across different tours. Vary your language every time.

EXITING OR STOPPING THE TOUR (CRITICAL):
- If the user interrupts you during the tour/guided meditation and explicitly states that they want to exit, leave, stop the tour, change the scene, go to another environment, or end the scene/meditation, you MUST immediately call the `stop_xr_tour` tool.
- If the user explicitly states that they want to end the session early, stop the session, or exit/close the app/meditation completely, you must first ask if they want to leave feedback before closing. WAIT for their answer, and then call `end_session` appropriately based on their answer. DO NOT call `end_session` otherwise!
- Once the tour is stopped, do NOT start another tour automatically. Instead, check in with them softly and ask if they would like to try another environment (calling the menu), or if they prefer to end their session here.

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
- If they answer YES (in any language) to the feedback question: warmly thank them, then immediately call `end_session(show_feedback=true)`.
- If they answer NO (in any language) to the feedback question: warmly thank them anyway, then immediately call `end_session(show_feedback=false)`.
- DO NOT call `end_session` at any other time during the intake or session unless explicitly demanded by the user.
"""

app = FastAPI()

# Allow CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve the 'client' directory
app.mount("/client", StaticFiles(directory="client"), name="client")

# Serve the 'videos' directory (fallback, but we prefer /stream/ for range requests)
app.mount("/videos", StaticFiles(directory="videos"), name="videos")

def get_local_ip():
    try:
        # Create a dummy socket to determine local IP address
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

@app.get("/network-info")
async def network_info():
    """Returns the server's LAN IP for client auto-detection."""
    ip = get_local_ip()
    return {"ip": ip, "port": 8001, "https_port": 443}

@app.get("/videos-list")
async def videos_list():
    """Lists available local video files for the test page."""
    videos_dir = Path("videos")
    if not videos_dir.exists():
        return {"videos": []}
    
    videos = []
    for p in videos_dir.iterdir():
        if p.is_file() and p.suffix.lower() in [".mp4", ".webm", ".mkv", ".mov"]:
            videos.append(p.name)
    return {"videos": videos}

@app.get("/stream/{filename}")
async def stream_video(filename: str, request: Request, range: str = Header(None)):
    """Serves video files from videos/ with full HTTP Range support."""
    video_path = Path("videos") / filename
    if not video_path.exists() or not video_path.is_file():
        raise HTTPException(status_code=404, detail="Video not found")

    file_size = video_path.stat().st_size
    content_type, _ = mimetypes.guess_type(filename)
    if not content_type:
        content_type = "video/mp4"

    if range:
        range_str = range.replace("bytes=", "")
        try:
            start_str, end_str = range_str.split("-")
            start = int(start_str) if start_str else 0
            end = int(end_str) if end_str else file_size - 1
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid Range header")

        if start >= file_size:
            raise HTTPException(status_code=416, detail="Requested Range Not Satisfiable")

        end = min(end, file_size - 1)
        length = end - start + 1

        def file_iterator():
            with open(video_path, "rb") as f:
                f.seek(start)
                bytes_left = length
                while bytes_left > 0:
                    chunk_size = min(8192, bytes_left)
                    chunk = f.read(chunk_size)
                    if not chunk:
                        break
                    yield chunk
                    bytes_left -= len(chunk)

        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(length),
            "Content-Type": content_type,
        }
        return StreamingResponse(file_iterator(), status_code=206, headers=headers)
    else:
        def file_iterator():
            with open(video_path, "rb") as f:
                while True:
                    chunk = f.read(8192)
                    if not chunk:
                        break
                    yield chunk
        headers = {
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
            "Content-Type": content_type,
        }
        return StreamingResponse(file_iterator(), status_code=200, headers=headers)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, voice: str = "Despina", resume: str = "false"):
    await websocket.accept()
    
    is_resume = resume.lower() == "true"
    ai_name = "Solaya" if voice == "Despina" else "Sam"
    
    if not is_resume:
        stage_1 = f'- **STAGE 1: STARTUP GREETING (TURN 0):** Respond to the trigger message "The session has started..." by ONLY greeting the user exactly with these words: "Hello... I am {ai_name}... Welcome... Before we begin... please choose a voice card... I will show them to you now." Speak this EXTREMELY slowly and softly. You MUST call the `show_voice_menu` tool immediately in this same turn! Do NOT open the environment menu yet. Wait for the user to select a voice.'
    else:
        stage_1 = f'- **STAGE 1: STARTUP GREETING (TURN 0):** Respond to the trigger message "The session has started..." by speaking exactly these words: "Welcome to {ai_name}... A place where the noise of the world softens... and you return to yourself... Thank you for giving yourself these few moments... For the next few minutes, there is nowhere to go, nothing to achieve, and nothing to fix... This time belongs only to you... I am {ai_name}, and I will gently guide your journey..." Speak this in an EXTREMELY slow, soft, meditative whispered pace. Then proceed directly to STAGE 2. Wait.'

    system_prompt = SYSTEM_INSTRUCTION_TEMPLATE.format(name=ai_name, stage_1=stage_1)
    
    transport = FastAPIWebsocketTransport(
        websocket=websocket,
        params=FastAPIWebsocketParams(
            audio_out_enabled=True,
            audio_in_enabled=True,
            audio_out_sample_rate=24000,
            audio_in_sample_rate=16000,
            add_wav_header=False,
            serializer=LocalPCMRawSerializer()
        )
    )

    # Defining the tool schema for Gemini Live
    scene_names = list(_ENV_CONFIG["categories"].keys())
    tools = [
        {
            "function_declarations": [
                {
                    "name": "trigger_xr_scene",
                    "description": "Starts a visual environment tour (Nature, Meditation, Spiritual).",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "scene_name": {"type": "string", "enum": scene_names},
                            "sub_type": {
                                "type": "string",
                                "enum": ALL_SUB_TYPES,
                                "description": "Specific video ID"
                            },
                            "guidance_category": {
                                "type": "string",
                                "enum": GUIDANCE_CATEGORIES,
                                "description": "The chosen support style for narration during the environment"
                            },
                            "guidance_subcategory": {
                                "type": "string",
                                "enum": GUIDANCE_SUBCATEGORIES,
                                "description": "The exact guidance sub-mode selected after intake"
                            }
                        },
                        "required": ["scene_name", "sub_type", "guidance_category", "guidance_subcategory"]
                    }
                },
                {
                    "name": "show_environment_menu",
                    "description": "Shows the user an environment menu after Aura has completed the intake conversation.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "top_sub_type": {
                                "type": "string",
                                "enum": ALL_SUB_TYPES,
                                "description": "Aura's single top recommended environment"
                            },
                            "recommended_sub_types": {
                                "type": "array",
                                "items": {
                                    "type": "string",
                                    "enum": ALL_SUB_TYPES
                                },
                                "minItems": 3,
                                "maxItems": 3,
                                "description": "Exactly 3 recommended environments including the top recommendation"
                            },
                            "guidance_category": {
                                "type": "string",
                                "enum": GUIDANCE_CATEGORIES
                            },
                            "guidance_subcategory": {
                                "type": "string",
                                "enum": GUIDANCE_SUBCATEGORIES
                            },
                            "reason": {
                                "type": "string",
                                "description": "A short reason for Aura's top recommendation"
                            }
                        },
                        "required": [
                            "top_sub_type", "recommended_sub_types",
                            "guidance_category", "guidance_subcategory", "reason"
                        ]
                    }
                },
                {
                    "name": "stop_xr_tour",
                    "description": "Stops the current visual tour and returns Aura to the center.",
                    "parameters": {"type": "object", "properties": {}}
                },
                {
                    "name": "end_session",
                    "description": "Ends the active session.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "show_feedback": {
                                "type": "boolean",
                                "description": "Set to true if the user agreed to fill out the feedback form, false if they declined or just want to leave."
                            }
                        },
                        "required": ["show_feedback"]
                    }
                },
                {
                    "name": "show_voice_menu",
                    "description": "Shows the voice selection cards to the user so they can choose between Solaya (Female) and Sam (Male).",
                    "parameters": {"type": "object", "properties": {}}
                }
            ]
        }
    ]

    llm = GeminiLiveLLMService(
        api_key=os.getenv("GEMINI_API_KEY"),
        settings=GeminiLiveLLMService.Settings(
            model="gemini-3.1-flash-live-preview",
            system_instruction=system_prompt,
            voice=voice,
            vad=GeminiVADParams(
                silence_duration_ms=400,
            )
        ),
        tools=tools
    )

    menu_state = {
        "guidance_category": "calm_reset",
        "guidance_subcategory": "slow_grounding",
        "reason": ""
    }

    active_sub_type = None

    async def trigger_xr_scene(params: FunctionCallParams):
        nonlocal active_sub_type
        arguments = params.arguments
        context = params.context
        # BRAIN REFRESH: Prune old context to prevent lag after 5 mins/multiple switches
        current_msgs = context.get_messages()
        if len(current_msgs) > 3:
            # Keep index 0 (System) and the most recent user intent
            # This ensures Aura stays snappy and doesn't get confused by old tours
            new_msgs = [current_msgs[0]]
            # Find last user message
            for i in range(len(current_msgs)-1, 0, -1):
                if current_msgs[i]["role"] == "user":
                    new_msgs.append(current_msgs[i])
                    break
            context.set_messages(new_msgs)
            print(f"[Aura] BRAIN REFRESH: Pruned context from {len(current_msgs)} to {len(new_msgs)} messages.")

        scene_name = arguments.get("scene_name", "nature")
        sub_type = arguments.get("sub_type", "")
        guidance_category = arguments.get("guidance_category", "calm_reset")
        guidance_subcategory = arguments.get("guidance_subcategory", "slow_grounding")
        print(
            f"[Aura] TOOL CALLED: trigger_xr_scene with {scene_name} / {sub_type} "
            f"using {guidance_category} / {guidance_subcategory}"
        )
        msg = {
            "action": "trigger_scene", 
            "scene_name": scene_name.lower(),
            "sub_type": sub_type.lower(),
            "guidance_category": guidance_category.lower(),
            "guidance_subcategory": guidance_subcategory.lower()
        }
        
        # Immediate dispatch to client only if it's not already active
        if active_sub_type == sub_type:
            print(f"[Aura] Scene {sub_type} is already active on client. Skipping duplicate websocket dispatch and clearAudioQueue.")
        else:
            active_sub_type = sub_type
            try:
                await websocket.send_text(json.dumps({"type": "app-message", "data": msg}))
                print(f"[Aura] DIRECT SOCKET DISPATCHED successfully.")
            except Exception as e:
                print(f"[Aura] Direct socket send failed: {e}")
            
        # Set meditation flag to True via global or passed processor reference
        if 'guidance_processor' in locals():
            guidance_processor.is_meditating = True
        
        # Return prompt to enforce the 5-phase guided meditation arc
        await params.result_callback({
            "value": (
                f"The {sub_type} visual is now live. Guidance mode: "
                f"{guidance_category}/{guidance_subcategory}. "
                "BEGIN YOUR GUIDED MEDITATION NOW. "
                "Speak in a highly soothing, EXTREMELY slow, ASMR-style whispered meditation voice. "
                "Deliver Phase 1 (Arrival) and Phase 2 (Body Settling) only for now. "
                "Use generous, long ellipses (... ... ...) to space out your words: "
                "Keep it to 2-3 slow sentences, and then stop speaking. You will be prompted later to continue."
            )
        })

    async def show_environment_menu(params: FunctionCallParams):
        arguments = params.arguments
        top_sub_type = arguments.get("top_sub_type", "nature_water")
        recommended_sub_types = arguments.get("recommended_sub_types", [])
        guidance_category = arguments.get("guidance_category", "calm_reset")
        guidance_subcategory = arguments.get("guidance_subcategory", "slow_grounding")
        reason = arguments.get("reason", "Aura thinks this may fit what you shared.")

        if top_sub_type not in recommended_sub_types:
            recommended_sub_types = [top_sub_type] + list(recommended_sub_types)
        recommended_sub_types = list(dict.fromkeys(recommended_sub_types))[:3]

        menu_state["guidance_category"] = guidance_category
        menu_state["guidance_subcategory"] = guidance_subcategory
        menu_state["reason"] = reason

        msg = {
            "action": "show_environment_menu",
            "top_sub_type": top_sub_type,
            "recommended_sub_types": recommended_sub_types,
            "guidance_category": guidance_category,
            "guidance_subcategory": guidance_subcategory,
            "reason": reason
        }

        print(
            f"[Aura] TOOL CALLED: show_environment_menu top={top_sub_type} "
            f"recommended={recommended_sub_types} mode={guidance_category}/{guidance_subcategory}"
        )
        try:
            await websocket.send_text(json.dumps({"type": "app-message", "data": msg}))
            print("[Aura] MENU DISPATCHED successfully.")
        except Exception as e:
            print(f"[Aura] Menu dispatch failed: {e}")

        await params.result_callback({
            "value": "[SYSTEM: The environment menu is now visible on the user's screen. Do NOT speak or say anything right now. Stay completely silent. The user is choosing an environment. You will be notified when they make a choice.]"
        })

    async def stop_xr_tour(params: FunctionCallParams):
        print(f"[Aura] TOOL CALLED: stop_xr_tour")
        if 'guidance_processor' in locals():
            guidance_processor.is_meditating = False
        msg = {"action": "stop_tour"}
        try:
            await websocket.send_text(json.dumps({"type": "app-message", "data": msg}))
            print(f"[Aura] STOP COMMAND DISPATCHED.")
        except Exception as e:
            print(f"[Aura] Stop command failed: {e}")
            
        await params.result_callback({"value": "Tour stopped. Aura is back in the center."})

    async def end_session(params: FunctionCallParams):
        arguments = params.arguments
        show_feedback = arguments.get("show_feedback", False)
        if 'guidance_processor' in locals():
            guidance_processor.is_meditating = False
        print(f"[Aura] TOOL CALLED: end_session (show_feedback: {show_feedback})")
        msg = {"action": "end_session", "show_feedback": show_feedback}
        try:
            await websocket.send_text(json.dumps({"type": "app-message", "data": msg}))
            print(f"[Aura] END SESSION DISPATCHED.")
        except Exception as e:
            print(f"[Aura] End session failed: {e}")
            
        await params.result_callback({"value": f"Session ended. show_feedback was {show_feedback}."})

    async def show_voice_menu(params: FunctionCallParams):
        print(f"[Aura] TOOL CALLED: show_voice_menu")
        msg = {"action": "show_voice_menu"}
        try:
            await websocket.send_text(json.dumps({"type": "app-message", "data": msg}))
            print(f"[Aura] VOICE MENU DISPATCHED.")
        except Exception as e:
            print(f"[Aura] Voice menu dispatch failed: {e}")
            
        await params.result_callback({
            "value": "[SYSTEM: The voice menu is now visible on the user's screen. Do NOT speak or say anything right now. Stay completely silent while they choose.]"
        })

    llm.register_function("trigger_xr_scene", trigger_xr_scene)
    llm.register_function("show_environment_menu", show_environment_menu)
    llm.register_function("stop_xr_tour", stop_xr_tour)
    llm.register_function("end_session", end_session)
    llm.register_function("show_voice_menu", show_voice_menu)

    context = LLMContext(messages=[{"role": "system", "content": system_prompt}])
    context_aggregator = LLMContextAggregatorPair(context)

    async def on_client_message_received(message_dict):
        nonlocal active_sub_type
        data_block = message_dict.get("data", {})
        action = data_block.get("t")
        payload = data_block.get("d", {})
        
        print(f"Aura: Received intercepted client message action={action}")
        if action == "tour_finished":
            print("Aura: Tour finished. Triggering follow-up.")
            if 'guidance_processor' in locals():
                guidance_processor.is_meditating = False
            new_msg = {
                "role": "user",
                "content": "The environment phase has ended. Begin the POST-TOUR PHASE as described in your instructions."
            }
            messages = context.get_messages()
            messages.append(new_msg)
            context.set_messages(messages)
            await llm._create_single_response([new_msg])
        elif action == "timer_update":
            time_left = payload.get("time_left")
            if time_left == 60:
                print("Aura: 1 minutes left notification triggered.")
                new_msg = {
                    "role": "user",
                    "content": "Exactly 60 seconds are left on the meditation timer. Respond immediately by saying: 'Only 1 minute is left' in your soothing meditative voice."
                }
                messages = context.get_messages()
                messages.append(new_msg)
                context.set_messages(messages)
                await llm._create_single_response([new_msg])
        elif action == "end_session_requested":
            print("Aura: End session requested by user UI button.")
            if 'guidance_processor' in locals():
                guidance_processor.is_meditating = False
            new_msg = {
                "role": "user",
                "content": "I clicked the End Session button in the UI. Please transition into the post-tour feedback phase by asking me if I want to leave feedback before closing. Then call end_session."
            }
            messages = context.get_messages()
            messages.append(new_msg)
            context.set_messages(messages)
            await llm._create_single_response([new_msg])
        elif action == "voice_selected":
            print("Aura: Voice selected by user without reconnect. Proceeding to intake.")
            new_msg = {
                "role": "user",
                "content": f"I have selected my voice and confirmed it as {ai_name}. Please speak exactly these words: 'Welcome to {ai_name}... A place where the noise of the world softens... and you return to yourself... Thank you for giving yourself these few moments... For the next few minutes, there is nowhere to go, nothing to achieve, and nothing to fix... This time belongs only to you... I am {ai_name}, and I will gently guide your journey...' Speak this in an EXTREMELY slow, soft, meditative whispered pace, and then proceed to Stage 2."
            }
            messages = context.get_messages()
            messages.append(new_msg)
            context.set_messages(messages)
            await llm._create_single_response([new_msg])
        elif action == "environment_selected":
            selected_sub_type = payload.get("sub_type", "nature_water")
            selected_scene = payload.get("scene_name", "nature")
            visual_started = payload.get("visual_started", False)
            automatic = payload.get("automatic", False)
            guidance_category = payload.get("guidance_category") or menu_state["guidance_category"]
            guidance_subcategory = (
                payload.get("guidance_subcategory") or menu_state["guidance_subcategory"]
            )
            print(
                f"Aura: Environment selected from menu: {selected_scene}/{selected_sub_type} "
                f"with {guidance_category}/{guidance_subcategory}"
            )
            
            # Update the tracked active sub type in the backend
            active_sub_type = selected_sub_type
            
            # Programmatically interrupt Aura's current menu briefing speech instantly and safely
            print("Aura: Programmatically interrupting active speech queue to start meditation instantly.")
            await llm._handle_interruption()
            
            new_msg = {
                "role": "user",
                "content": (
                    f"The user has selected the '{selected_sub_type}' environment (scene: '{selected_scene}'). "
                    f"Guidance mode: {guidance_category}/{guidance_subcategory}. "
                    f"Visual already started: {visual_started}. Auto-selected: {automatic}. "
                    "CRITICAL: The visual environment is ALREADY active on the user's screen. "
                    "Do NOT call the 'trigger_xr_scene' tool under any circumstances for this action, as the client has already started the video. "
                    "BEGIN YOUR GUIDED MEDITATION IMMEDIATELY. Speak in an EXTREMELY soothing, slow, ASMR-style whispered meditation voice. "
                    "You must start by immediately validating their choice: tell them warmly that they made a great choice, and explain how this specific space is going to be the absolute best medicine for their mood or tension. "
                    "Deliver Phase 1 (Validation & Arrival) and Phase 2 (Body Settling) only for now. "
                    "Use generous, long ellipses (... ... ...) to space out your words: "
                    "Keep it to 2-4 slow sentences, and then stop speaking. The system will automatically prompt you to continue the phases later."
                )
            }
            messages = context.get_messages()
            messages.append(new_msg)
            context.set_messages(messages)
            if 'guidance_processor' in locals():
                guidance_processor.is_meditating = True
            await llm._create_single_response([new_msg])

    async def trigger_continuation():
        new_msg = {
            "role": "user",
            "content": "[SYSTEM: The meditation is ongoing. The user is resting in silence. Continue your slow, soothing guidance seamlessly. Speak exactly 2 to 3 very slow sentences to deepen their relaxation. Do not greet again. Do not say 'let us continue'. Just naturally flow into the next thought.]"
        }
        messages = context.get_messages()
        messages.append(new_msg)
        context.set_messages(messages)
        await llm._create_single_response([new_msg])

    msg_processor = ClientMessageProcessor(on_client_message_received)
    guidance_processor = ContinuousGuidanceProcessor(trigger_continuation)

    pipeline = Pipeline([
        transport.input(),
        msg_processor,
        guidance_processor,
        context_aggregator.user(),
        llm,
        transport.output(),
        context_aggregator.assistant(),
    ])

    task = PipelineTask(pipeline, params=PipelineParams(allow_interruptions=True))

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        print("Aura: Client connected.")
        new_msg = {
            "role": "user",
            "content": "The session has started. Greet the user as described in your instructions."
        }
        messages = context.get_messages()
        messages.append(new_msg)
        context.set_messages(messages)
        await task.queue_frames([LLMContextFrame(context=context)])

    runner = PipelineRunner()

    try:
        await runner.run(task)
    except WebSocketDisconnect:
        print("Client disconnected.")
    except Exception as e:
        print(f"Error in Aura pipeline: {e}")

@app.get("/health")
async def health_check():
    """Simple health check for monitoring (useful with Cloudflare tunnels)."""
    return {"status": "ok", "environments": len(ALL_SUB_TYPES)}

if __name__ == "__main__":
    import uvicorn
    print(f"Aura is waking up with {len(ALL_SUB_TYPES)} environments at http://localhost:8001/client/index.html")
    uvicorn.run(app, host="0.0.0.0", port=8001)

