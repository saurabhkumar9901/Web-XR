// --------- THREE.JS VISUALIZER (WebXR VR Enhanced) ---------
// VR module is loaded separately via vr-init.js
// THREE is provided globally by vr-init.js via importmap
const canvasContainer = document.getElementById('canvas-container');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5;

const renderer = new THREE.WebGLRenderer({
  alpha: true,
  antialias: true,
  precision: 'highp',
  powerPreference: 'high-performance'
});
renderer.setClearColor(0x000000, 0); // Force fully transparent background for XRMediaBinding
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
canvasContainer.appendChild(renderer.domElement);

const particleCount = 4000;
const geometry = new THREE.BufferGeometry();
const positions = new Float32Array(particleCount * 3);
const basePositions = new Float32Array(particleCount * 3);
const colors = new Float32Array(particleCount * 3);
const colorBase = new THREE.Color(0xdcebf5);

for (let i = 0; i < particleCount; i++) {
  const phi = Math.acos(-1 + (2 * i) / particleCount);
  const theta = Math.sqrt(particleCount * Math.PI) * phi;
  const r = 2.0;
  const x = r * Math.cos(theta) * Math.sin(phi);
  const y = r * Math.sin(theta) * Math.sin(phi);
  const z = r * Math.cos(phi);
  positions[i * 3] = x; basePositions[i * 3] = x;
  positions[i * 3 + 1] = y; basePositions[i * 3 + 1] = y;
  positions[i * 3 + 2] = z; basePositions[i * 3 + 2] = z;
  colors[i * 3] = colorBase.r + (Math.random() * 0.1);
  colors[i * 3 + 1] = colorBase.g + (Math.random() * 0.1);
  colors[i * 3 + 2] = colorBase.b + (Math.random() * 0.1);
}
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

// Generate a soft circular particle texture (prevents blocky squares in VR)
const particleCanvas = document.createElement('canvas');
particleCanvas.width = 64;
particleCanvas.height = 64;
const pCtx = particleCanvas.getContext('2d');
const pGrad = pCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
pGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
pGrad.addColorStop(0.4, 'rgba(255, 255, 255, 0.6)');
pGrad.addColorStop(0.7, 'rgba(255, 255, 255, 0.15)');
pGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
pCtx.fillStyle = pGrad;
pCtx.fillRect(0, 0, 64, 64);
const particleTexture = new THREE.CanvasTexture(particleCanvas);

const material = new THREE.PointsMaterial({
  size: 0.05,
  map: particleTexture,
  vertexColors: true,
  transparent: true,
  opacity: 0.85,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  sizeAttenuation: true
});
const sphere = new THREE.Points(geometry, material);
scene.add(sphere);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// --------- AUDIO ENGINE ---------
let audioCtx;
let analyser;
let dataArray;
let targetVolume = 0;
let currentVolume = 0;
let nextPlayTime = 0;
let ambientNodes = null;
let activeAudioSources = [];
const SPEAKER_SAMPLE_RATE = 24000; // Native Gemini Live output
const MIC_SAMPLE_RATE = 16000;     // Native Gemini Live input
const SAMPLE_RATE = 24000;         // Backwards compatibility alias

function initAudio() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SPEAKER_SAMPLE_RATE });
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  dataArray = new Uint8Array(analyser.frequencyBinCount);
  analyser.connect(audioCtx.destination);
}

function startAmbientMusic() {
  if (!audioCtx || ambientNodes) return;

  const master = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  const compressor = audioCtx.createDynamicsCompressor();
  const now = audioCtx.currentTime;

  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.018, now + 6);
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(720, now);
  filter.Q.setValueAtTime(0.45, now);

  compressor.threshold.setValueAtTime(-32, now);
  compressor.knee.setValueAtTime(18, now);
  compressor.ratio.setValueAtTime(4, now);
  compressor.attack.setValueAtTime(0.5, now);
  compressor.release.setValueAtTime(1.8, now);

  const notes = [110, 165, 220, 277.18];
  const oscillators = notes.map((frequency, index) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const lfo = audioCtx.createOscillator();
    const lfoGain = audioCtx.createGain();

    osc.type = index === 0 ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(frequency, now);
    osc.detune.setValueAtTime((index - 1.5) * 3, now);
    gain.gain.setValueAtTime(index === 0 ? 0.42 : 0.18, now);

    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.035 + index * 0.012, now);
    lfoGain.gain.setValueAtTime(4 + index * 1.5, now);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.detune);

    osc.connect(gain);
    gain.connect(filter);
    osc.start(now);
    lfo.start(now);
    return { osc, gain, lfo, lfoGain };
  });

  filter.connect(compressor);
  compressor.connect(master);
  master.connect(audioCtx.destination);
  ambientNodes = { master, filter, compressor, oscillators };
}

function stopAmbientMusic() {
  if (!ambientNodes || !audioCtx) return;
  const now = audioCtx.currentTime;
  const nodes = ambientNodes;
  ambientNodes = null;

  nodes.master.gain.cancelScheduledValues(now);
  nodes.master.gain.setValueAtTime(Math.max(nodes.master.gain.value, 0.0001), now);
  nodes.master.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);

  setTimeout(() => {
    nodes.oscillators.forEach(({ osc, lfo }) => {
      try { osc.stop(); } catch (e) { }
      try { lfo.stop(); } catch (e) { }
    });
    try { nodes.master.disconnect(); } catch (e) { }
    try { nodes.filter.disconnect(); } catch (e) { }
    try { nodes.compressor.disconnect(); } catch (e) { }
  }, 1700);
}

function playPCMChunk(pcmData) {
  const int16Array = new Int16Array(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength / 2);
  const buffer = audioCtx.createBuffer(1, int16Array.length, SPEAKER_SAMPLE_RATE);
  const now = buffer.getChannelData(0);
  for (let i = 0; i < int16Array.length; i++) {
    now[i] = int16Array[i] / 32768.0;
  }

  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(analyser);

  let startTime = Math.max(audioCtx.currentTime, nextPlayTime);

  // Real-time audio queue alignment:
  // Removed aggressive latency drift snap-back which caused overlapping audio chunks (stuttering/breaking)
  // when used over networks like Cloudflared that may burst buffer WebSocket frames.

  source.start(startTime);
  nextPlayTime = startTime + buffer.duration;
  activeAudioSources.push(source);

  // Prevent massive Web Audio graph memory leaks by disconnecting dead nodes
  source.onended = () => {
    source.disconnect();
    const idx = activeAudioSources.indexOf(source);
    if (idx > -1) activeAudioSources.splice(idx, 1);
  };
}

function clearAudioQueue() {
  activeAudioSources.forEach(source => {
    try { source.stop(); source.disconnect(); } catch (e) { }
  });
  activeAudioSources = [];
  nextPlayTime = 0;
}

// --------- WEBSOCKET & JOURNEY LOGIC ---------
const joinBtn = document.getElementById('join-btn');
const menuBtn = document.getElementById('menu-btn');
const endBtn = document.getElementById('end-btn');
const introScreen = document.getElementById('intro-screen');
const voiceSelectionScreen = document.getElementById('voice-selection-screen');
const voiceCards = document.querySelectorAll('.voice-card');
const statusText = document.getElementById('status');
const videoContainer = document.getElementById('video-container');
const tourVideo = document.getElementById('tour-video');
tourVideo.crossOrigin = "anonymous";
const environmentMenu = document.getElementById('environment-menu');
const recommendedGrid = document.getElementById('recommended-grid');
const allEnvironmentsGrid = document.getElementById('all-environments-grid');
const menuReason = document.getElementById('menu-reason');
const menuMode = document.getElementById('menu-mode');
const menuModeLabel = document.getElementById('menu-mode-label');
const menuTimer = document.getElementById('menu-timer');
const feedbackScreen = document.getElementById('feedback-screen');
const ratingList = document.getElementById('rating-list');
const feedbackCloseBtn = document.getElementById('feedback-close-btn');
// feedbackAgainBtn removed — element does not exist in HTML (#feedback-again-btn)
let ws;
let tourState = "idle"; // idle, intro, tour, finished
let audioPlayedInIntro = false;
let introFallbackTimer = null;
let feedbackShownForCurrentTour = false;
let menuCountdownTimer = null;
let menuAutoSelectTimer = null;
let menuHelpTimer = null;
let environmentTimer = null;
let postTourFeedbackTimer = null;
let topRecommendedEnvironment = null;
let environmentPhaseStarted = false;
let sessionTimerStarted = false; // Tracks if the 10-min session countdown has begun (survives scene changes)
let micMuted = false;
let activeMicStream = null;
let activeMicSource = null;
let activeMicProcessor = null;
let closingForReset = false;
let journeyStarted = false;
window._AURA_JOURNEY_STARTED = () => journeyStarted;

const bgMusic = new Audio('assets/visuals/Flutes_bg.mp3');
bgMusic.loop = true;
bgMusic.volume = 0.6;

const MENU_BRIEFING_DELAY_SECONDS = 12;
const MENU_FINAL_CHOICE_PAUSE_SECONDS = 30;
const ENVIRONMENT_SECONDS = 600;
const POST_TOUR_SECONDS = 35;

// --- Environment Registry: loaded from environments.json (single source of truth) ---
let ENVIRONMENTS = [];
let _envConfigPromise = null;

async function _loadEnvironmentConfig() {
  try {
    const resp = await fetch('/client/environments.json');
    const config = await resp.json();
    const cats = config.categories;
    ENVIRONMENTS = config.environments.map(env => ({
      sceneName: cats[env.category].scene_name,
      category: cats[env.category].label,
      subType: env.sub_type,
      title: env.title,
      description: env.description,
      videoSrc: env.videoSrc.startsWith('http')
        ? env.videoSrc
        : env.videoSrc.startsWith('/')
          ? window.location.origin + env.videoSrc
          : (config.cdn_base_url
            ? (config.cdn_base_url.endsWith('/') ? config.cdn_base_url : config.cdn_base_url + '/') + env.videoSrc.split('/').pop()
            : env.videoSrc)
    }));
    console.log(`[Aura] Loaded ${ENVIRONMENTS.length} environments from config.`);
    window._AURA_ENVIRONMENTS = ENVIRONMENTS; // Keep VR integration in sync
  } catch (e) {
    console.error('[Aura] Failed to load environments.json, using empty list:', e);
  }
}
// Load immediately and store the promise so other code can await it
_envConfigPromise = _loadEnvironmentConfig();

// ---- Expose globals for VR integration ----
window._AURA_ENVIRONMENTS = ENVIRONMENTS;

let latestMenuGuidance = {
  guidanceCategory: 'calm_reset',
  guidanceSubcategory: 'slow_grounding'
};
let latestMenuData = null;
const feedbackRatings = {};
const FEEDBACK_ITEMS = [
  { key: 'calmer', label: 'I felt calmer after the journey' },
  { key: 'environment_fit', label: 'The environment felt right for me' },
  { key: 'aura_warmth', label: 'Aura felt warm and supportive' },
  { key: 'gentle_questions', label: 'The questions felt gentle and helpful' },
  { key: 'return', label: 'I would like to return to this experience' }
];

function sendClientMessage(action, data = {}) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    const message = {
      label: "rtvi-ai",
      type: "client-message",
      id: "msg_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
      data: {
        t: action,
        d: data
      }
    };
    console.log(`[Aura] SENDING RTVI MESSAGE [${action}]:`, message);
    ws.send(JSON.stringify(message));
  } else {
    console.warn(`[Aura] Could not send message ${action}; websocket not open.`);
  }
}


async function startJourney(options = {}) {
  journeyStarted = true;
  joinBtn.disabled = true;

  // Flush audio queue alignment completely on new session start
  clearAudioQueue();

  introScreen.classList.add('hidden');
  voiceSelectionScreen.classList.add('hidden');
  statusText.innerText = "Connecting to Aura...";
  menuBtn.style.display = 'none';
  endBtn.style.display = 'none';
  hideFeedbackScreen();
  clearFinalFlowTimers();

  initAudio();
  if (audioCtx.state === 'suspended') await audioCtx.resume();
  startAmbientMusic();
  bgMusic.play().catch(e => console.warn("[Aura] BG Music play failed at start:", e));

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const voiceParam = options.voice ? `voice=${options.voice}` : `voice=Despina`;
  const resumeParam = options.resume ? `&resume=true` : `&resume=false`;
  ws = new WebSocket(`${protocol}//${window.location.host}/ws?${voiceParam}${resumeParam}`);
  ws.binaryType = 'arraybuffer';

  ws.onopen = async () => {
    statusText.innerText = "Listening to your presence...";
    joinBtn.style.display = 'none';
    menuBtn.style.display = 'none';

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: MIC_SAMPLE_RATE
        }
      });
      activeMicStream = stream;
      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      activeMicSource = source;
      activeMicProcessor = processor;

      source.connect(processor);
      processor.connect(audioCtx.destination);

      processor.onaudioprocess = (e) => {
        if (micMuted) return; // Mute microphone transmission during guided meditation

        if (ws.readyState === WebSocket.OPEN) {
          const inputData = e.inputBuffer.getChannelData(0);

          // Simple linear interpolation downsampling from 24kHz to 16kHz (ratio 1.5)
          const ratio = 1.5;
          const outputLength = Math.round(inputData.length / ratio);
          const pcmData = new Int16Array(outputLength);
          for (let i = 0; i < outputLength; i++) {
            const index = i * ratio;
            const indexFloor = Math.floor(index);
            const indexCeil = Math.min(inputData.length - 1, indexFloor + 1);
            const weight = index - indexFloor;
            const interpolatedValue = inputData[indexFloor] * (1 - weight) + inputData[indexCeil] * weight;
            pcmData[i] = Math.max(-1, Math.min(1, interpolatedValue)) * 0x7FFF;
          }
          ws.send(pcmData.buffer);
        }
      };
    } catch (err) {
      console.error("Mic Error:", err);
      statusText.innerText = "Microphone access denied.";
    }
  };

  ws.onmessage = (event) => {
    let rawData = event.data;
    let msg = null;

    if (typeof rawData === 'string') {
      try { msg = JSON.parse(rawData); } catch (e) { }
    } else {
      // Try to decode binary as string to see if it's actually JSON
      try {
        const dec = new TextDecoder().decode(rawData);
        if (dec.startsWith('{') || dec.startsWith('[')) {
          msg = JSON.parse(dec);
          console.log("[Aura] RECOVERED JSON FROM BINARY:", msg);
        }
      } catch (e) { }
    }

    if (msg) {
      console.log("[Aura] DATA MESSAGE:", msg);
      const data = (msg.type === "app-message" && msg.data) ? msg.data : msg;
      if (data.action === "user_started_speaking") {
        console.log("[Aura] User started speaking, flushing audio queue.");
        clearAudioQueue();
      } else if (data.action === "trigger_scene") {
        console.log("[Aura] TRIGGER DETECTED:", data.scene_name, data.sub_type, data.guidance_category, data.guidance_subcategory);
        
        // Auto-generated VIDEO_MAP matching handleSceneChange logic to check if we are already in/loading this scene
        const VIDEO_MAP = {};
        if (Array.isArray(ENVIRONMENTS)) {
          ENVIRONMENTS.forEach(env => { VIDEO_MAP[env.subType] = env.videoSrc; });
        }
        const FALLBACK_BY_SCENE = {
          spiritual: 'assets/visuals/varanasi_river.webm',
          meditation: 'assets/visuals/office_meditation_2d.mp4',
          nature: 'assets/visuals/nature_waterfall_2d.mp4'
        };
        const targetSrc = VIDEO_MAP[data.sub_type] || FALLBACK_BY_SCENE[data.scene_name] || 'assets/visuals/office_meditation_2d.mp4';
        const isAlreadyPlaying = tourVideo.src.endsWith(targetSrc) && (tourState === 'tour' || tourState === 'intro');

        if (!isAlreadyPlaying) {
          clearAudioQueue(); // Safe flush at boundary!
        }
        hideEnvironmentMenu();
        handleSceneChange(data.scene_name, data.sub_type, data.guidance_category, data.guidance_subcategory);
      } else if (data.action === "show_environment_menu") {
        console.log("[Aura] MENU DETECTED:", data);
        clearAudioQueue(); // Safe flush at boundary!
        showEnvironmentMenu(data);
      } else if (data.action === "show_voice_menu") {
        console.log("[Aura] VOICE MENU DETECTED");
        clearAudioQueue();
        showVoiceMenu();
      } else if (data.action === "stop_tour") {
        console.log("[Aura] STOP REQUESTED BY BACKEND");
        clearAudioQueue(); // Safe flush at boundary!
        finalizeJourney({ notifyBackend: false });
      } else if (data.action === "end_session") {
        console.log("[Aura] END SESSION REQUESTED BY BACKEND", data);
        clearAudioQueue(); // Safe flush at boundary!
        environmentPhaseStarted = false;
        resetToIdle();
        if (data.show_feedback) {
          showFeedbackScreen();
        } else {
          returnToStart();
        }
      }
    } else if (rawData instanceof ArrayBuffer || rawData instanceof Uint8Array || rawData instanceof Blob) {
      // It's pure audio
      playPCMChunk(new Uint8Array(rawData));
    }
  };

  ws.onclose = () => {
    if (closingForReset) {
      closingForReset = false;
      return;
    }
    statusText.innerText = "Connection lost.";
    joinBtn.style.display = 'block';
    joinBtn.disabled = false;
  };
}
window._AURA_START_JOURNEY = startJourney;


function formatMode(value) {
  return (value || '').replace(/_/g, ' ');
}

function getEnvironment(subType) {
  return ENVIRONMENTS.find((env) => env.subType === subType);
}

function clearFinalFlowTimers() {
  if (menuCountdownTimer) clearInterval(menuCountdownTimer);
  if (menuAutoSelectTimer) clearInterval(menuAutoSelectTimer);
  if (menuHelpTimer) clearTimeout(menuHelpTimer);
  if (environmentTimer) clearTimeout(environmentTimer);
  if (postTourFeedbackTimer) clearTimeout(postTourFeedbackTimer);
  menuCountdownTimer = null;
  menuAutoSelectTimer = null;
  menuHelpTimer = null;
  environmentTimer = null;
  postTourFeedbackTimer = null;
}

function stopLiveSession() {
  stopAmbientMusic();
  bgMusic.pause();
  bgMusic.currentTime = 0;
  if (activeMicProcessor) {
    try { activeMicProcessor.disconnect(); } catch (e) { }
    activeMicProcessor = null;
  }
  if (activeMicSource) {
    try { activeMicSource.disconnect(); } catch (e) { }
    activeMicSource = null;
  }
  if (activeMicStream) {
    activeMicStream.getTracks().forEach((track) => track.stop());
    activeMicStream = null;
  }
  if (ws && ws.readyState === WebSocket.OPEN) {
    closingForReset = true;
    ws.close();
  }
  ws = null;
}

function clearMenuTimers() {
  if (menuCountdownTimer) clearInterval(menuCountdownTimer);
  if (menuAutoSelectTimer) clearInterval(menuAutoSelectTimer);
  if (menuHelpTimer) clearTimeout(menuHelpTimer);
  menuCountdownTimer = null;
  menuAutoSelectTimer = null;
  menuHelpTimer = null;
}

let countdownInterval = null;
let timerTimeLeft = 600;

function startCountdownTimer() {
  stopCountdownTimer();

  // Only reset to 600s on the FIRST environment start. On scene changes, continue from remaining time.
  if (!sessionTimerStarted) {
    timerTimeLeft = 600;
    sessionTimerStarted = true;
  }

  const timerElement = document.getElementById('countdown-timer');
  const timeDisplay = document.getElementById('timer-time');

  if (timerElement) {
    timerElement.classList.add('visible');
  }

  if (timeDisplay) {
    const mins = Math.floor(timerTimeLeft / 60);
    const secs = timerTimeLeft % 60;
    timeDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  countdownInterval = setInterval(() => {
    if (timerTimeLeft <= 1) {
      stopCountdownTimer();
      finalizeJourney();
      return;
    }

    timerTimeLeft -= 1;

    if (timeDisplay) {
      const mins = Math.floor(timerTimeLeft / 60);
      const secs = timerTimeLeft % 60;
      timeDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    if (timerTimeLeft === 60) {
      console.log('[Aura] 120 seconds remaining - notifying backend');
      sendClientMessage('timer_update', { time_left: 60 });
    }
  }, 1000);
}

function stopCountdownTimer() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  const timerElement = document.getElementById('countdown-timer');
  if (timerElement) {
    timerElement.classList.remove('visible');
  }
}

function updateMenuTimer(message = 'Take a few moments to look at the options.') {
  menuTimer.textContent = message;
}

function getRecommendedMenuEnvironments() {
  const recommendedSubTypes = latestMenuData && Array.isArray(latestMenuData.recommended_sub_types)
    ? latestMenuData.recommended_sub_types
    : [];
  const topSubType = latestMenuData?.top_sub_type || recommendedSubTypes[0] || topRecommendedEnvironment?.subType || 'nature_water';
  return [topSubType, ...recommendedSubTypes]
    .filter((value, index, arr) => value && arr.indexOf(value) === index)
    .slice(0, 3)
    .map(getEnvironment)
    .filter(Boolean);
}

function scheduleAutoSelectAfterBriefing(briefingRequestedAt) {
  if (menuAutoSelectTimer) clearInterval(menuAutoSelectTimer);

  menuAutoSelectTimer = setInterval(() => {
    if (!environmentMenu.classList.contains('visible')) {
      clearMenuTimers();
      return;
    }
    if (!audioCtx) return;

    const briefingAudioStarted = nextPlayTime > briefingRequestedAt + 1;
    const quietAfterBriefing = audioCtx.currentTime >= nextPlayTime + MENU_FINAL_CHOICE_PAUSE_SECONDS;
    if (!briefingAudioStarted || !quietAfterBriefing) return;

    clearMenuTimers();
    if (!environmentMenu.classList.contains('visible')) return;
    const env = topRecommendedEnvironment || getEnvironment('nature_water');
    statusText.innerText = `Aura is choosing ${env.title}, the best match for you.`;
    selectEnvironment(env, { automatic: true });
  }, 500);
}

function startMenuAutoSelect(topEnv) {
  clearMenuTimers();
  topRecommendedEnvironment = topEnv;
  updateMenuTimer('Take a few moments to look at the options.');

  menuHelpTimer = setTimeout(() => {
    if (!environmentMenu.classList.contains('visible')) return;
    const recommended = getRecommendedMenuEnvironments().map((env) => ({
      sub_type: env.subType,
      title: env.title,
      category: env.category,
      description: env.description
    }));
    updateMenuTimer('Aura is briefly describing the top recommendations.');
    sendClientMessage('menu_recommendations_briefing', {
      top_sub_type: topEnv.subType,
      top_title: topEnv.title,
      recommended_environments: recommended,
      guidance_category: latestMenuGuidance.guidanceCategory,
      guidance_subcategory: latestMenuGuidance.guidanceSubcategory
    });
    scheduleAutoSelectAfterBriefing(audioCtx ? audioCtx.currentTime : 0);
  }, MENU_BRIEFING_DELAY_SECONDS * 1000);
}

function startEnvironmentTimer() {
  // Clear any existing environment timer before starting a new one
  if (environmentTimer) { clearTimeout(environmentTimer); environmentTimer = null; }
  environmentPhaseStarted = true;

  // Use the remaining countdown time instead of the full ENVIRONMENT_SECONDS,
  // so switching scenes doesn't restart the session clock.
  const remainingMs = timerTimeLeft * 1000;
  console.log(`[Aura] Environment timer set for ${timerTimeLeft}s (remaining session time).`);
  environmentTimer = setTimeout(() => {
    console.log('[Aura] Environment phase complete (session time expired).');
    finalizeJourney();
  }, remainingMs);
}

function createEnvironmentCard(env, menuData, isRecommended, index = 0) {
  const isTop = env.subType === menuData.top_sub_type;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'environment-card';
  button.setAttribute('data-cat', env.sceneName);
  button.style.animationDelay = `${index * 65}ms`;
  if (isTop) button.classList.add('top');
  if (isRecommended) button.classList.add('recommended');

  // Styled background replacing live video preview
  const preview = document.createElement('div');
  preview.className = 'card-preview';
  preview.style.background = 'linear-gradient(135deg, rgba(30, 40, 50, 0.8), rgba(10, 15, 25, 1))';
  preview.style.width = '100%';
  preview.style.height = '100%';

  // Gradient overlays
  const gradTop = document.createElement('div');
  gradTop.className = 'card-gradient-top';
  const gradBot = document.createElement('div');
  gradBot.className = 'card-gradient-bottom';

  // Content layer
  const content = document.createElement('div');
  content.className = 'card-content';

  // Top row: badge + category pill
  const topRow = document.createElement('div');
  topRow.className = 'card-top-row';

  const badge = document.createElement('span');
  if (isTop) {
    badge.className = 'card-badge badge-top';
    badge.textContent = '⭐ Top Pick';
  } else if (isRecommended) {
    badge.className = 'card-badge badge-rec';
    badge.textContent = '✦ Recommended';
  } else {
    badge.className = 'card-badge badge-none';
  }

  const pill = document.createElement('span');
  pill.className = 'card-category-pill';
  pill.textContent = env.category;

  topRow.appendChild(badge);
  topRow.appendChild(pill);

  // Bottom row: title + description + CTA
  const bottom = document.createElement('div');
  bottom.className = 'card-bottom';

  const title = document.createElement('span');
  title.className = 'card-title';
  title.textContent = env.title;

  const desc = document.createElement('span');
  desc.className = 'card-description';
  desc.textContent = env.description;

  const cta = document.createElement('div');
  cta.className = 'card-cta';
  cta.textContent = isTop ? '✦ Begin Journey' : 'Select →';

  bottom.appendChild(title);
  bottom.appendChild(desc);
  bottom.appendChild(cta);

  content.appendChild(topRow);
  content.appendChild(bottom);

  button.appendChild(preview);
  button.appendChild(gradTop);
  button.appendChild(gradBot);
  button.appendChild(content);

  button.addEventListener('pointerdown', (e) => { e.preventDefault(); selectEnvironment(env); });
  button.addEventListener('click', (e) => { e.preventDefault(); selectEnvironment(env); });
  return button;
}

async function showEnvironmentMenu(data) {
  // Clear any active flow/feedback timers
  clearFinalFlowTimers();

  // If a tour is currently running, hide it and return to the lobby so the menu is visible
  if (tourState === 'tour' || environmentPhaseStarted) {
    console.log('[Aura] Tour active while opening environment menu — resetting tour state.');
    environmentPhaseStarted = false;
    resetToIdle();
  }

  // Ensure environments are loaded before rendering cards
  if (_envConfigPromise) await _envConfigPromise;
  latestMenuData = data;
  window._AURA_LATEST_MENU_DATA = data; // Expose for VR
  const recommendedSubTypes = Array.isArray(data.recommended_sub_types)
    ? data.recommended_sub_types
    : [];
  const topSubType = data.top_sub_type || recommendedSubTypes[0] || 'nature_water';
  const topEnv = getEnvironment(topSubType) || getEnvironment('nature_water');
  const recommendationSet = new Set([topSubType, ...recommendedSubTypes].slice(0, 3));

  latestMenuGuidance = {
    guidanceCategory: data.guidance_category || 'calm_reset',
    guidanceSubcategory: data.guidance_subcategory || 'slow_grounding'
  };

  menuReason.textContent = data.reason || 'Aura has prepared a few options for you.';
  menuModeLabel.textContent = `Guidance mode: ${formatMode(latestMenuGuidance.guidanceCategory)} / ${formatMode(latestMenuGuidance.guidanceSubcategory)}`;
  recommendedGrid.innerHTML = '';
  allEnvironmentsGrid.innerHTML = '';

  const recommended = [topSubType, ...recommendedSubTypes]
    .filter((value, index, arr) => value && arr.indexOf(value) === index)
    .slice(0, 3)
    .map(getEnvironment)
    .filter(Boolean);

  recommended.forEach((env, i) => {
    recommendedGrid.appendChild(createEnvironmentCard(env, { ...data, top_sub_type: topSubType }, true, i));
  });

  ENVIRONMENTS.forEach((env, i) => {
    allEnvironmentsGrid.appendChild(
      createEnvironmentCard(env, { ...data, top_sub_type: topSubType }, recommendationSet.has(env.subType), i)
    );
  });

  environmentMenu.classList.add('visible');
  environmentMenu.setAttribute('aria-hidden', 'false');
  statusText.innerText = "Aura opened the environment menu for you.";

  // Preload top recommended video so playback starts instantly
  if (topEnv && topEnv.videoSrc) {
    const existing = document.querySelector('link[data-aura-preload]');
    if (existing) existing.remove();
    const preloadLink = document.createElement('link');
    preloadLink.rel = 'preload';
    preloadLink.as = 'video';
    preloadLink.href = topEnv.videoSrc;
    preloadLink.setAttribute('data-aura-preload', 'true');
    document.head.appendChild(preloadLink);
  }

  startMenuAutoSelect(topEnv);
}

function hideEnvironmentMenu() {
  clearMenuTimers();
  environmentMenu.classList.remove('visible');
  environmentMenu.setAttribute('aria-hidden', 'true');
}

function renderFeedbackRatings() {
  ratingList.innerHTML = '';
  FEEDBACK_ITEMS.forEach((item) => {
    if (!feedbackRatings[item.key]) feedbackRatings[item.key] = 5;

    const row = document.createElement('div');
    row.className = 'rating-row';

    const label = document.createElement('div');
    label.className = 'rating-label';
    label.textContent = item.label;

    const stars = document.createElement('div');
    stars.className = 'stars';
    stars.setAttribute('aria-label', `${item.label} rating`);

    for (let value = 1; value <= 5; value++) {
      const star = document.createElement('button');
      star.type = 'button';
      star.className = 'star-btn';
      star.textContent = '★';
      star.setAttribute('aria-label', `${value} stars`);
      if (value <= feedbackRatings[item.key]) star.classList.add('active');
      star.addEventListener('click', () => {
        feedbackRatings[item.key] = value;
        renderFeedbackRatings();
        console.log('[Aura] Feedback updated:', feedbackRatings);
      });
      stars.appendChild(star);
    }

    row.appendChild(label);
    row.appendChild(stars);
    ratingList.appendChild(row);
  });
}

function showFeedbackScreen() {
  if (postTourFeedbackTimer) clearTimeout(postTourFeedbackTimer);
  postTourFeedbackTimer = null;
  feedbackShownForCurrentTour = true;
  hideEnvironmentMenu();
  menuBtn.style.display = 'none';
  endBtn.style.display = 'none';
  renderFeedbackRatings();
  feedbackScreen.classList.add('visible');
  feedbackScreen.setAttribute('aria-hidden', 'false');
  statusText.innerText = 'Session complete.';
  console.log('[Aura] Feedback screen shown:', feedbackRatings);
}

function hideFeedbackScreen() {
  feedbackScreen.classList.remove('visible');
  feedbackScreen.setAttribute('aria-hidden', 'true');
}

function returnToStart() {
  clearFinalFlowTimers();
  stopLiveSession();
  hideFeedbackScreen();
  hideEnvironmentMenu();
  journeyStarted = false;
  resetToIdle();
  sessionTimerStarted = false; // Reset so next overall session starts fresh at 10:00

  introScreen.classList.remove('hidden');
  joinBtn.style.display = 'inline-block';
  joinBtn.disabled = false;
  menuBtn.style.display = 'none';
  endBtn.style.display = 'none';
  statusText.innerText = 'Waking up Aura...';
}
// Expose for VR interaction
window._AURA_RETURN_TO_START = returnToStart;

function selectEnvironment(env, options = {}) {
  if (!env || env._selectionInProgress) return;
  env._selectionInProgress = true;

  // Clear any existing flow timers (like feedback timer from previous tour)
  clearFinalFlowTimers();

  // Keep mic unmuted so user can say they want to exit or interrupt Aura
  micMuted = false;
  console.log("[Aura] Microphone remains active so user can request to exit.");
  const switchingEnvironment = tourState === "tour" || environmentPhaseStarted;
  feedbackShownForCurrentTour = false;
  sendClientMessage('environment_selected', {
    scene_name: env.sceneName,
    sub_type: env.subType,
    title: env.title,
    guidance_category: latestMenuGuidance.guidanceCategory,
    guidance_subcategory: latestMenuGuidance.guidanceSubcategory,
    recommendation_reason: latestMenuData?.reason || '',
    visual_started: true,
    automatic: Boolean(options.automatic),
    switching_environment: switchingEnvironment
  });
  hideFeedbackScreen();
  hideEnvironmentMenu();
  const prefix = options.automatic ? 'Aura chose' : 'Preparing';
  statusText.innerText = `${prefix} ${env.title}...`;
  handleSceneChange(
    env.sceneName,
    env.subType,
    latestMenuGuidance.guidanceCategory,
    latestMenuGuidance.guidanceSubcategory
  );
  setTimeout(() => { env._selectionInProgress = false; }, 1200);
}
// Expose for VR interaction
window._AURA_SELECT_ENVIRONMENT = selectEnvironment;

function showFallbackEnvironmentMenu() {
  if (tourState !== "tour" && environmentPhaseStarted) return;
  showEnvironmentMenu(latestMenuData || {
    top_sub_type: 'nature_water',
    recommended_sub_types: ['nature_water', 'office_meditation', 'nature_snow'],
    guidance_category: latestMenuGuidance.guidanceCategory,
    guidance_subcategory: latestMenuGuidance.guidanceSubcategory,
    reason: 'Choose the space that feels most useful right now.'
  });
}

tourVideo.onended = () => {
  console.log("Tour video finished");
  finalizeJourney();
};

tourVideo.ontimeupdate = () => {
  if (
    tourState === "tour" &&
    !tourVideo.loop &&
    Number.isFinite(tourVideo.duration) &&
    tourVideo.duration > 0 &&
    tourVideo.currentTime >= tourVideo.duration - 0.35
  ) {
    console.log("Tour video near end. Finalizing journey.");
    finalizeJourney();
  }
};

tourVideo.onwaiting = () => {
  if (tourState === 'intro') {
    statusText.innerText = "Buffering environment... ⏳";
  }
};

tourVideo.oncanplay = () => {
  if (tourState === 'intro') {
    if (statusText.innerText.includes("Buffering")) {
      statusText.innerText = "Environment ready. Starting...";
    }
  }
};

tourVideo.onplaying = () => {
  if (tourState === 'intro') {
    if (statusText.innerText.includes("Buffering") || statusText.innerText.includes("ready")) {
      statusText.innerText = "Environment playing...";
    }
  }
};

function finalizeJourney({ notifyBackend = true, endedByUser = false } = {}) {
  if (feedbackShownForCurrentTour) return;
  if (environmentTimer) clearTimeout(environmentTimer);
  environmentTimer = null;
  environmentPhaseStarted = false;
  resetToIdle();
  statusText.innerText = 'Aura is checking in with you...';
  endBtn.textContent = 'End Session';
  endBtn.style.display = 'block';
  setTimeout(() => {
    // Give time for Aura to return to center before speaking
    if (notifyBackend) {
      console.log("Tour finished. Sending notification to backend.");
      sendClientMessage('tour_finished', { ended_by_user: endedByUser });
    }
  }, 2000);
}

function resetToIdle() {
  console.log("[Aura] Resetting UI to idle state...");
  micMuted = false;
  console.log("[Aura] Microphone unmuted.");
  tourState = "idle";
  sphere.visible = true; // Restore orb after tour
  stopCountdownTimer();

  // Flush audio queue alignment completely on lobby reset
  nextPlayTime = 0;

  // UI Resets
  videoContainer.classList.remove('visible');
  hideEnvironmentMenu();
  canvasContainer.classList.remove('mini');
  menuBtn.style.display = 'none';
  endBtn.style.display = 'none';
  document.body.className = ''; // Reset theme
  statusText.innerText = "Aura: Listening...";

  // Stop video
  tourVideo.onerror = null;
  tourVideo.pause();
  tourVideo.loop = false;
  tourVideo.src = "";

  // Reset Aura Sphere Color to default
  const colorBase = new THREE.Color(0xdcebf5);
  const colors = geometry.attributes.color.array;
  for (let i = 0; i < particleCount; i++) {
    colors[i * 3] = colorBase.r + (Math.random() * 0.1);
    colors[i * 3 + 1] = colorBase.g + (Math.random() * 0.1);
    colors[i * 3 + 2] = colorBase.b + (Math.random() * 0.1);
  }
  geometry.attributes.color.needsUpdate = true;

  // Large resize after animation finishes
  setTimeout(() => {
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
  }, 2000);
}

function checkNarrationEnd() {
  if (tourState !== "intro") return;

  // Detect if audio has started playing at least once
  if (targetVolume > 0.05) {
    if (!audioPlayedInIntro) console.log("Aura speech detected starting tour sync...");
    audioPlayedInIntro = true;
  }

  // If we've started, wait for it to end
  const silenceThreshold = 1.2;
  if (audioPlayedInIntro && audioCtx.currentTime > nextPlayTime + silenceThreshold) {
    console.log("Silence detected after narration. Starting tour.");
    startTourVideo();
  }
}

function startTourVideo() {
  if (introFallbackTimer) {
    clearTimeout(introFallbackTimer);
    introFallbackTimer = null;
  }
  if (tourState === "tour") return; // Already started

  console.log("[Aura] Beginning the visual journey...");
  tourState = "tour";
  statusText.innerText = ""; // Clear text during the journey
  videoContainer.classList.add('visible');
  menuBtn.style.display = 'block';
  endBtn.textContent = 'End Journey';
  endBtn.style.display = 'block';
  tourVideo.loop = true;
  tourVideo.muted = true;
  tourVideo.volume = 0;

  // Start the environment timer FIRST — unconditionally.
  // In VR, video.play() may reject because #video-container is display:none,
  // but the scene has still started and Aura must receive tour_finished after ENVIRONMENT_SECONDS.
  startEnvironmentTimer();
  startCountdownTimer();

  tourVideo.play().then(() => {
    console.log("[Aura] Video tour started successfully.");
    bgMusic.play().catch(e => console.warn("[Aura] BG Music play failed:", e));
  }).catch(e => {
    // Expected in VR mode (display:none container). Timer already running — safe to ignore.
    console.warn("[Aura] Video play failed (VR mode expected):", e.message);
  });
}

function showVoiceMenu() {
  clearFinalFlowTimers();
  voiceSelectionScreen.classList.remove('hidden');
}

joinBtn.addEventListener('click', () => startJourney());

voiceCards.forEach(card => {
  card.addEventListener('click', (e) => {
    e.preventDefault();
    const selectedVoice = card.getAttribute('data-voice');
    voiceSelectionScreen.classList.add('hidden');

    // Flush audio queue alignment completely before new voice takes over
    nextPlayTime = 0;

    // Check if we need to switch voice
    const url = ws.url;
    const currentVoice = url.includes('voice=Enceladus') ? 'Enceladus' : 'Despina';

    if (selectedVoice !== currentVoice) {
      console.log("[Aura] Switching voice to " + selectedVoice);
      closingForReset = true;
      ws.close();
      setTimeout(() => {
        startJourney({ voice: selectedVoice, resume: true });
      }, 150);
    } else {
      console.log("[Aura] Voice matches, continuing session.");
      sendClientMessage('voice_selected', { voice: selectedVoice });
    }
  });
});
menuBtn.addEventListener('click', showFallbackEnvironmentMenu);
endBtn.addEventListener('click', () => {
  if (tourState === "tour" || tourState === "intro") {
    finalizeJourney({ endedByUser: true });
  } else {
    statusText.innerText = 'Aura is closing the session with you...';
    sendClientMessage('end_session_requested');
    // We let the backend AI explicitly ask for feedback and call end_session
  }
});
feedbackCloseBtn.addEventListener('click', returnToStart);
// feedbackAgainBtn listener removed — see declaration note above

// --------- VISUAL ANIMATION LOOP ---------
let time = 0;
const ORB_DRIFT_SPEED = 0.004;
const ORB_ROTATION_Y_SPEED = 0.00004;
const ORB_ROTATION_X_SPEED = 0.000025;
const ORB_VOLUME_SMOOTHING = 0.045;
const ORB_VOICE_ROTATION = 0.006;
const ORB_BASE_RIPPLE = 0.055;
const ORB_VOICE_RIPPLE = 0.22;

let lastFrameTime = performance.now();
function animate(timestamp) {
  const now = timestamp || performance.now();
  const delta = (now - lastFrameTime) / 1000;
  lastFrameTime = now;

  time += ORB_DRIFT_SPEED;
  sphere.rotation.y += ORB_ROTATION_Y_SPEED;
  sphere.rotation.x += ORB_ROTATION_X_SPEED;

  if (analyser) {
    analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
    targetVolume = sum / dataArray.length;
  }

  currentVolume += (targetVolume - currentVolume) * ORB_VOLUME_SMOOTHING;
  const volumeScale = currentVolume / 100.0;

  // Duck background music when model speaks
  if (bgMusic) {
    const targetBgVol = currentVolume > 5 ? 0.15 : 0.6;
    bgMusic.volume += (targetBgVol - bgMusic.volume) * 0.05;
  }

  // Skip expensive particle animation during video tours — frees GPU for video decoding
  if (tourState !== 'tour' && tourState !== 'intro') {
    sphere.rotation.y += volumeScale * ORB_VOICE_ROTATION;
    const positions = geometry.attributes.position.array;
    for (let i = 0; i < particleCount; i++) {
      const ix = i * 3, iy = i * 3 + 1, iz = i * 3 + 2;
      const basex = basePositions[ix], basey = basePositions[iy], basez = basePositions[iz];
      const noise = Math.sin(time * 2 + basey * 3) * Math.cos(time * 1.5 + basex * 3);
      const displacement = 1.0 + (noise * ORB_BASE_RIPPLE) + (volumeScale * ORB_VOICE_RIPPLE * noise);
      positions[ix] = basex * displacement;
      positions[iy] = basey * displacement;
      positions[iz] = basez * displacement;
    }
    geometry.attributes.position.needsUpdate = true;
  }

  // VR animation hook
  if (window._vrAnimate) window._vrAnimate(delta);

  renderer.render(scene, camera);

  // Check if speech ended to start video
  if (tourState === "intro") {
    checkNarrationEnd();
  }
}
// Use setAnimationLoop for WebXR compatibility (required for VR rendering)
renderer.setAnimationLoop(animate);

let hlsInstance = null;

function loadHlsScript() {
  return new Promise((resolve, reject) => {
    if (window.Hls) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.4.12/hls.min.js";
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function setupVideoSource(videoElement, src) {
  // Clean up any existing Hls instance
  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }

  const isHls = src.toLowerCase().endsWith('.m3u8');

  if (isHls) {
    let canUseHlsJS = false;
    try {
      await loadHlsScript();
      canUseHlsJS = window.Hls && window.Hls.isSupported();
    } catch (e) {
      console.warn("[Aura] Failed to check Hls.js support, falling back:", e);
    }

    if (canUseHlsJS) {
      console.log("[Aura] Hls.js supported. Initializing robust stream with auto error recovery...");
      hlsInstance = new Hls({
        maxBufferSize: 15 * 1000 * 1000, // 15MB buffer for faster load
        enableWorker: true,
        capLevelToPlayerSize: false
      });
      hlsInstance.loadSource(src);
      hlsInstance.attachMedia(videoElement);

      hlsInstance.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        let targetLevelIndex = 0;
        let maxLvlHeight = 0;
        for (let i = 0; i < data.levels.length; i++) {
          const lvl = data.levels[i];
          if (lvl.height && lvl.height <= 1080 && lvl.height > maxLvlHeight) {
            maxLvlHeight = lvl.height;
            targetLevelIndex = i;
          }
        }
        console.log(`[Aura] Pinning HLS stream to quality level index ${targetLevelIndex} (${maxLvlHeight || 'auto'}p) to eliminate dynamic resolution switching artifacts in VR.`);
        hlsInstance.startLevel = targetLevelIndex;
        hlsInstance.currentLevel = targetLevelIndex;
        hlsInstance.loadLevel = targetLevelIndex;
      });

      hlsInstance.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.error("[Aura] HLS Network error, trying to recover...", data);
              hlsInstance.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.error("[Aura] HLS Media error, trying to recover...", data);
              hlsInstance.recoverMediaError();
              break;
            default:
              console.error("[Aura] Fatal HLS error, destroying instance...", data);
              hlsInstance.destroy();
              hlsInstance = null;
              break;
          }
        }
      });
    } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
      console.log("[Aura] Hls.js not supported. Falling back to native HLS.");
      videoElement.src = src;
    } else {
      console.error("[Aura] No HLS playback capabilities found!");
      statusText.innerText = "Error loading HLS video.";
    }
  } else {
    // Normal MP4/MOV/WebM
    console.log("[Aura] Using standard media player source.");
    videoElement.src = src;
  }
}

function handleSceneChange(sceneName, subType, guidanceCategory, guidanceSubcategory) {
  // Clear any active flow/feedback timers immediately when changing scenes to prevent out-of-nowhere popups
  clearFinalFlowTimers();

  console.log("[Aura] EXECUTING SCENE CHANGE TO:", sceneName, subType, guidanceCategory, guidanceSubcategory);
  const modeLabel = guidanceCategory && guidanceSubcategory
    ? ` | ${guidanceCategory.replace(/_/g, ' ')} / ${guidanceSubcategory.replace(/_/g, ' ')}`
    : '';
  statusText.innerText = `Environment: ${sceneName.toUpperCase()} (${subType || 'Default'})${modeLabel}`;
  document.body.className = `theme-${sceneName}`;
  const colorTarget = new THREE.Color();
  if (sceneName === 'nature') colorTarget.setHex(0xbcffcc);
  if (sceneName === 'meditation') colorTarget.setHex(0xccddff);
  if (sceneName === 'spiritual') colorTarget.setHex(0xffccdd);

  const colors = geometry.attributes.color.array;
  for (let i = 0; i < particleCount; i++) {
    colors[i * 3] = colorTarget.r + (Math.random() * 0.1);
    colors[i * 3 + 1] = colorTarget.g + (Math.random() * 0.1);
    colors[i * 3 + 2] = colorTarget.b + (Math.random() * 0.1);
  }
  geometry.attributes.color.needsUpdate = true;

  // Auto-generated VIDEO_MAP from the shared environments.json config.
  // No more manual duplication — adding a new environment is a one-file change.
  const VIDEO_MAP = {};
  ENVIRONMENTS.forEach(env => { VIDEO_MAP[env.subType] = env.videoSrc; });

  const FALLBACK_BY_SCENE = {
    spiritual: 'assets/visuals/varanasi_river.webm',
    meditation: 'assets/visuals/office_meditation_2d.mp4',
    nature: 'assets/visuals/nature_waterfall_2d.mp4'
  };

  const targetSrc = VIDEO_MAP[subType] || FALLBACK_BY_SCENE[sceneName] || 'assets/visuals/office_meditation_2d.mp4';
  console.log(`[Aura] Scene ${sceneName}/${subType} → ${targetSrc}`);

  // Guard: don't reload the same video if already in this scene
  if (tourVideo.src.endsWith(targetSrc) && (tourState === 'tour' || tourState === 'intro')) {
    console.log('[Aura] Same video already active — skipping reset.');
    return;
  }

  tourState = 'intro';
  audioPlayedInIntro = false;
  sphere.visible = false; // Hide orb during video to save GPU
  canvasContainer.classList.add('mini');

  tourVideo.preload = 'auto';
  setupVideoSource(tourVideo, targetSrc).catch(e => {
    console.error("[Aura] Error setting video source:", e);
  });
  tourVideo.onerror = () => {
    console.error('[Aura] VIDEO FAILED TO LOAD:', targetSrc);
    statusText.innerText = 'Error loading video.';
  };

  if (introFallbackTimer) clearTimeout(introFallbackTimer);
  introFallbackTimer = setTimeout(() => {
    if (tourState === 'intro') startTourVideo();
  }, 2000);

  setTimeout(() => {
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
  }, 1800);

  if (sceneName === 'spiritual') {
    console.log('[Aura] Spiritual scene mode active.');
  } else if (sceneName === 'meditation' || sceneName === 'nature') {
    console.log(`[Aura] ${sceneName} scene mode active.`);
  } else {
    // Unknown scene — reset to idle
    tourState = 'idle';
    canvasContainer.classList.remove('mini');
    if (introFallbackTimer) { clearTimeout(introFallbackTimer); introFallbackTimer = null; }
    setTimeout(() => renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight), 1800);
  }
}

// Set global hook so backend can target it directly if needed
window.triggerScene = handleSceneChange;

// Global debug trigger for the user
window.triggerSpiritual = () => {
  console.log("[Manual Debug] Triggering Spiritual mode...");
  window.triggerScene('spiritual', 'varanasi_river');
};

// --------- EXPOSE SCENE FOR VR INIT ---------
// Set global data so the VR module can access scene objects
window._AURA_SCENE_DATA = { scene, renderer, camera, sphere, geometry, particleCount, basePositions, tourVideo, canvasContainer };
console.log('[Aura] Scene data exposed for VR integration.');
