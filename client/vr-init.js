// ========== VR INITIALIZATION & INTEGRATION (Premium Peaceful Edition) ==========
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import {
  createTextPanel, updateTextPanel, createEnvCard,
  createVideoSphere, createControllerRay,
  raycastFromController, raycastFromGaze, createFeedbackPanel,
  createStarfield, createAmbientParticles, animateAmbientParticles,
  createGroundGlow, createWelcomePanel, createVRButton,
  createMeditationPlatform
} from './vr-system.js?v=zen10';

// ---- VR State ----
const vrState = {
  active: false,
  welcomePanel: null,
  menuGroup: null,
  statusPanel: null,
  timerPanel: null,
  feedbackPanel: null,
  videoSphere: null,
  starfield: null,
  ambientParticles: null,
  groundGlow: null,
  lotusRing: null,
  envCards: [],
  interactables: [],
  controllers: [],
  hoveredObj: null,
  gazeTimer: 0,
  GAZE_SELECT_MS: 15000,
  time: 0,
  orbFollowEnabled: true,
  chooseEnvBtn: null,
  endSessionBtn: null,
  mediaBinding: null,
  equirectLayer: null,
};

// Read scene objects from globals set by script.js
const sceneData = window._AURA_SCENE_DATA;
if (!sceneData) {
  console.error('[Aura VR] Scene data not found. script.js must run first.');
  throw new Error('Missing scene data');
}
const { scene, renderer, camera, sphere, geometry, particleCount,
  basePositions, tourVideo, canvasContainer } = sceneData;

{
  // ---- Enable WebXR ----
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  renderer.xr.setFramebufferScaleFactor(2.0); // Super-samples VR for crisp 4K video rendering
  renderer.xr.setFoveation(0); // Disable foveation to prevent Quest WebXR compositor artifacts

  // Helper to filter only visible interactables (including checking ancestors)
  function getVisibleInteractables(interactables) {
    return interactables.filter(obj => {
      let cur = obj;
      while (cur) {
        if (cur.visible === false) return false;
        cur = cur.parent;
      }
      return true;
    });
  }

  // Helper: show status panel with position snap to prevent black-square flash.
  // The panel uses a dark canvas background + renderOrder 999 + depthTest:false,
  // so if it becomes visible at a stale/default position before the slow lerp
  // repositions it, it flashes as a dark rectangle in the center of the scene.
  function showStatusPanel() {
    if (!vrState.statusPanel) return;
    // Snap position to just below the orb (current gaze direction)
    const xrCam = renderer.xr.getCamera();
    const dir = new THREE.Vector3();
    xrCam.getWorldDirection(dir);
    const pos = new THREE.Vector3();
    xrCam.getWorldPosition(pos);
    vrState.statusPanel.position.set(
      pos.x + dir.x * 2.0,
      pos.y + dir.y * 2.0 - 1.0,
      pos.z + dir.z * 2.0 - 0.15
    );
    vrState.statusPanel.lookAt(pos);
    vrState.statusPanel.visible = true;
    const statusEl = document.getElementById('status');
    if (statusEl) {
      updateTextPanel(vrState.statusPanel, statusEl.innerText);
    }
  }

  // ---- VR Button ----
  const vrBtnContainer = document.getElementById('vr-button-container');
  const vrBtn = VRButton.createButton(renderer);
  vrBtnContainer.appendChild(vrBtn);

  // ---- Starfield Background ----
  vrState.starfield = createStarfield(5000);
  vrState.starfield.visible = false;
  scene.add(vrState.starfield);

  // ---- Ambient Floating Particles (DISABLED) ----
  // vrState.ambientParticles = createAmbientParticles(400);
  // scene.add(vrState.ambientParticles);

  // ---- Ground Glow ----
  vrState.groundGlow = createGroundGlow();
  vrState.groundGlow.visible = false;
  scene.add(vrState.groundGlow);

  // ---- Lotus Ring (decorative floor geometry) ----
  const lotusGroup = new THREE.Group();
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const petalGeo = new THREE.CircleGeometry(0.18, 8);
    const petalMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.4 + Math.random() * 0.2, 1.0, 0.6 + Math.random() * 0.2),
      transparent: true, opacity: 0.06,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    const petal = new THREE.Mesh(petalGeo, petalMat);
    petal.position.set(Math.cos(angle) * 1.1, 0.02, Math.sin(angle) * 1.1);
    petal.rotation.x = -Math.PI / 2;
    petal.rotation.z = angle;
    lotusGroup.add(petal);
  }
  lotusGroup.visible = false;
  scene.add(lotusGroup);
  vrState.lotusRing = lotusGroup;

  // ---- Video Sphere ----
  vrState.videoSphere = createVideoSphere(tourVideo);
  scene.add(vrState.videoSphere);

  // ---- Welcome Panel ----
  vrState.welcomePanel = createWelcomePanel();
  vrState.welcomePanel.position.set(0, 1.9, -3.5);
  vrState.welcomePanel.visible = false;
  scene.add(vrState.welcomePanel);

  // ---- Floating Begin Button ----
  vrState.buttonGroup = new THREE.Group();

  const beginBtn = createVRButton('Begin Journey', 0.8, 0.22, { glowColor: '#ff9800', bg: '#ffb300', color: '#1a1a1a' });
  beginBtn.position.set(0, 0, 0);
  beginBtn.userData.isBeginBtn = true;

  vrState.buttonGroup.add(beginBtn);

  // Place clearly lower and further forward so it's not hidden behind the menu
  vrState.buttonGroup.position.set(0, 0.1, -3.2);
  vrState.buttonGroup.visible = false;
  scene.add(vrState.buttonGroup);

  // Register button for interaction
  vrState.interactables.push(beginBtn);

  // ---- Meditation Platform (3D sofa/cushion below user) ----
  vrState.meditationPlatform = createMeditationPlatform();
  vrState.meditationPlatform.position.set(0, -0.1, 0); // Just below feet
  vrState.meditationPlatform.visible = false;
  scene.add(vrState.meditationPlatform);

  // ---- Status Panel (compact, below orb) ----
  vrState.statusPanel = createTextPanel('Listening to your presence...', {
    worldW: 1.0, canvasW: 500, canvasH: 70,
    font: '300 18px Inter, system-ui, sans-serif',
    glowColor: 'rgba(188, 255, 204, 0.15)',
    bg: 'rgba(8, 14, 22, 0.5)', bg2: 'rgba(6, 10, 16, 0.6)',
    border: 'rgba(188, 255, 204, 0.12)',
    lineHeight: 26,
  });
  vrState.statusPanel.position.set(0, 0.3, -2.2);
  vrState.statusPanel.visible = false;
  scene.add(vrState.statusPanel);

  // ---- Timer Panel (compact countdown floating top-right) ----
  vrState.timerPanel = createTextPanel('05:00', {
    worldW: 0.5, canvasW: 200, canvasH: 70,
    font: 'bold 22px monospace, sans-serif',
    color: '#bcffcc',
    bg: 'rgba(8, 14, 22, 0.18)', bg2: 'rgba(6, 10, 16, 0.18)',
    border: 'rgba(188, 255, 204, 0.2)',
  });
  vrState.timerPanel.position.set(0.0, 0.45, -1.8);
  vrState.timerPanel.visible = false;
  scene.add(vrState.timerPanel);

  // ---- Feedback Panel ----
  vrState.feedbackPanel = createFeedbackPanel();
  vrState.feedbackPanel.position.set(0, 1.55, -2.1);
  scene.add(vrState.feedbackPanel);

  // ---- Choose Environment VR Button ----
  vrState.chooseEnvBtn = createVRButton('Choose Environment', 0.55, 0.16, {
    glowColor: '#00e676',
    bg: 'rgba(6, 26, 14, 0.18)',
    hoverBg: 'rgba(0, 230, 118, 0.3)',
    border: 'rgba(0, 230, 118, 0.35)',
    color: 'rgba(0, 230, 118, 0.85)',
    hoverColor: '#ffffff'
  });
  vrState.chooseEnvBtn.position.set(-0.7, 0.45, -1.8);
  vrState.chooseEnvBtn.lookAt(0, 0.45, 0);
  vrState.chooseEnvBtn.visible = false;
  vrState.chooseEnvBtn.userData.isChooseEnvBtn = true;
  scene.add(vrState.chooseEnvBtn);
  vrState.interactables.push(vrState.chooseEnvBtn);

  // ---- End Session / End Journey VR Button ----
  vrState.endSessionBtn = createVRButton('End Session', 0.55, 0.16, {
    glowColor: '#ff1744',
    bg: 'rgba(28, 6, 10, 0.18)',
    hoverBg: 'rgba(255, 23, 68, 0.3)',
    border: 'rgba(255, 23, 68, 0.35)',
    color: 'rgba(255, 23, 68, 0.85)',
    hoverColor: '#ffffff'
  });
  vrState.endSessionBtn.position.set(0.7, 0.45, -1.8);
  vrState.endSessionBtn.lookAt(0, 0.45, 0);
  vrState.endSessionBtn.visible = false;
  vrState.endSessionBtn.userData.isEndSessionBtn = true;
  scene.add(vrState.endSessionBtn);
  vrState.interactables.push(vrState.endSessionBtn);

  // ---- Environment Menu Group ----
  vrState.menuGroup = new THREE.Group();
  vrState.menuGroup.visible = false;
  scene.add(vrState.menuGroup);

  // ---- Controllers ----
  for (let i = 0; i < 2; i++) {
    const ctrl = renderer.xr.getController(i);
    const ray = createControllerRay();
    ctrl.add(ray);
    ctrl.addEventListener('selectstart', () => onVRSelect(ctrl));
    scene.add(ctrl);
    vrState.controllers.push(ctrl);
  }

  // ---- Gaze reticle ----
  const reticleOuter = new THREE.RingGeometry(0.007, 0.013, 40);
  const reticleInner = new THREE.CircleGeometry(0.003, 20);
  const reticleMat = new THREE.MeshBasicMaterial({
    color: 0xbcffcc, transparent: true, opacity: 0.6,
    side: THREE.DoubleSide, depthTest: false, blending: THREE.AdditiveBlending
  });
  const reticle = new THREE.Mesh(reticleOuter, reticleMat);
  const reticleDot = new THREE.Mesh(reticleInner, reticleMat.clone());
  reticleDot.material.opacity = 0.9;
  reticle.add(reticleDot);
  reticle.position.set(0, 0, -1.5);
  reticle.renderOrder = 2000;
  reticle.visible = false;
  camera.add(reticle);
  scene.add(camera);
  vrState._reticleIdleGeo = reticleOuter; // Cache idle geometry to avoid per-frame dispose/recreate

  // ---- Orb glow (soft sprite-based) ----
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = 256; glowCanvas.height = 256;
  const glowCtx = glowCanvas.getContext('2d');
  const gradient = glowCtx.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, 'rgba(188, 255, 204, 0.08)');
  gradient.addColorStop(0.3, 'rgba(188, 255, 204, 0.04)');
  gradient.addColorStop(0.6, 'rgba(150, 220, 255, 0.01)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  glowCtx.fillStyle = gradient;
  glowCtx.fillRect(0, 0, 256, 256);
  const glowTex = new THREE.CanvasTexture(glowCanvas);
  const glowSpriteMat = new THREE.SpriteMaterial({
    map: glowTex, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.35 // Slightly increased glow since points are NormalBlending now
  });
  const orbGlow = new THREE.Sprite(glowSpriteMat);
  orbGlow.scale.set(6, 6, 1);
  orbGlow.renderOrder = 1; // Explicit render order to fix angle glitching
  orbGlow.visible = false;
  sphere.add(orbGlow);

  // Make sure points render on top of the soft glow reliably
  sphere.renderOrder = 2;
  sphere.material.sizeAttenuation = true;

  // ---- Session start ----
  renderer.xr.addEventListener('sessionstart', () => {
    vrState.active = true;
    document.body.classList.add('vr-active');

    // Initialize XRMediaBinding if supported for high-quality video compositor layer
    const session = renderer.xr.getSession();
    if ('XRMediaBinding' in window && session) {
      try {
        vrState.mediaBinding = new XRMediaBinding(session);
        console.log('[Aura VR] XRMediaBinding initialized successfully');
      } catch (e) {
        console.warn('[Aura VR] Failed to initialize XRMediaBinding', e);
      }
    }

    // Show VR ambient elements
    vrState.starfield.visible = true;
    if (vrState.ambientParticles) vrState.ambientParticles.visible = false;
    vrState.groundGlow.visible = false; // Disabled by user request
    vrState.lotusRing.visible = false; // Disabled by user request
    reticle.visible = true;
    orbGlow.visible = false; // Disabled in VR — sprite quad causes black square artifact on Quest WebXR compositor
    vrState.meditationPlatform.visible = false; // Disabled by user request

    // Sync Choose Environment and End Session/Journey buttons visibility on session start
    const htmlMenuBtn = document.getElementById('menu-btn');
    if (htmlMenuBtn && vrState.chooseEnvBtn) {
      vrState.chooseEnvBtn.visible = (htmlMenuBtn.style.display === 'block');
    }
    const htmlEndBtn = document.getElementById('end-btn');
    if (htmlEndBtn && vrState.endSessionBtn) {
      vrState.endSessionBtn.visible = (htmlEndBtn.style.display === 'block');
      vrState.endSessionBtn.userData.setText(htmlEndBtn.textContent);
    }

    // Check if journey already started — show status, else show welcome
    const journeyAlreadyStarted = window._AURA_JOURNEY_STARTED && window._AURA_JOURNEY_STARTED();
    if (journeyAlreadyStarted) {
      showStatusPanel();
      vrState.welcomePanel.visible = false;
      vrState.buttonGroup.visible = false;
    } else {
      vrState.welcomePanel.visible = true;
      vrState.buttonGroup.visible = true;
      vrState.statusPanel.visible = false;
    }

    // Position orb for VR
    sphere.userData.originalSize = sphere.material.size;
    sphere.userData.originalOpacity = sphere.material.opacity;
    sphere.userData.originalBlending = sphere.material.blending;

    sphere.material.size = 0.005;
    sphere.material.opacity = 0.85; // High opacity because NormalBlending doesn't multiply brightness
    sphere.material.blending = THREE.NormalBlending; // Fix WebXR additive brightness glitch
    sphere.material.needsUpdate = true;

    sphere.position.set(0, 1.5, -2.0);
    sphere.scale.set(0.2, 0.2, 0.2);

    const statusEl = document.getElementById('status');
    if (statusEl && vrState.statusPanel.visible) updateTextPanel(vrState.statusPanel, statusEl.innerText);
  });

  // ---- Session end ----
  renderer.xr.addEventListener('sessionend', () => {
    vrState.active = false;
    document.body.classList.remove('vr-active');

    if (vrState.equirectLayer && vrState.mediaBinding) {
      try {
        vrState.equirectLayer.destroy();
      } catch (e) { }
    }
    vrState.mediaBinding = null;
    vrState.equirectLayer = null;

    vrState.statusPanel.visible = false;
    vrState.timerPanel.visible = false;
    vrState.welcomePanel.visible = false;
    vrState.buttonGroup.visible = false;
    vrState.menuGroup.visible = false;
    vrState.feedbackPanel.visible = false;
    vrState.videoSphere.visible = false;
    vrState.starfield.visible = false;
    if (vrState.ambientParticles) vrState.ambientParticles.visible = false;
    vrState.groundGlow.visible = false;
    vrState.lotusRing.visible = false;
    reticle.visible = false;
    orbGlow.visible = false;
    vrState.meditationPlatform.visible = false;
    if (vrState.chooseEnvBtn) vrState.chooseEnvBtn.visible = false;
    if (vrState.endSessionBtn) vrState.endSessionBtn.visible = false;

    if (sphere.userData.originalSize) {
      sphere.material.size = sphere.userData.originalSize;
      sphere.material.opacity = sphere.userData.originalOpacity;
      sphere.material.blending = sphere.userData.originalBlending;
      sphere.material.needsUpdate = true;
    }
    sphere.position.set(0, 0, 0);
    sphere.scale.set(1, 1, 1);
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  // ---- DOM Observers (sync HTML UI → VR UI) ----

  // Status text observer
  const statusEl = document.getElementById('status');
  new MutationObserver(() => {
    if (vrState.active && vrState.statusPanel && vrState.statusPanel.visible) {
      updateTextPanel(vrState.statusPanel, statusEl.innerText);
    }
  }).observe(statusEl, { childList: true, characterData: true, subtree: true });

  // Timer text observer
  const timerTimeEl = document.getElementById('timer-time');
  new MutationObserver(() => {
    if (vrState.active && vrState.timerPanel && vrState.timerPanel.visible) {
      updateTextPanel(vrState.timerPanel, timerTimeEl.innerText);
    }
  }).observe(timerTimeEl, { childList: true, characterData: true, subtree: true });

  // Intro screen observer — hides welcome panel once journey starts
  const introEl = document.getElementById('intro-screen');
  new MutationObserver(() => {
    if (!vrState.active) return;
    const introHidden = introEl.classList.contains('hidden');
    if (introHidden) {
      // Journey started: switch from welcome to status
      vrState.welcomePanel.visible = false;
      vrState.buttonGroup.visible = false;
      showStatusPanel();
      const statusNow = document.getElementById('status');
      if (statusNow) updateTextPanel(vrState.statusPanel, statusNow.innerText);
    } else {
      // Returned to start
      vrState.welcomePanel.visible = true;
      vrState.buttonGroup.visible = true;
      vrState.statusPanel.visible = false;
    }
  }).observe(introEl, { attributes: true, attributeFilter: ['class'] });

  // Environment menu observer
  const envMenuEl = document.getElementById('environment-menu');
  new MutationObserver(() => {
    if (!vrState.active) return;
    if (envMenuEl.classList.contains('visible')) {
      buildVRMenu();
    } else {
      vrState.menuGroup.visible = false;
      vrState.showAllEnvs = false;
      vrState.interactables = vrState.interactables.filter(o => !o.userData.envData && !o.userData.isSeeAllBtn);
    }
  }).observe(envMenuEl, { attributes: true, attributeFilter: ['class'] });

  // Feedback screen observer
  const fbEl = document.getElementById('feedback-screen');
  new MutationObserver(() => {
    if (!vrState.active) return;
    vrState.feedbackPanel.visible = fbEl.classList.contains('visible');
    if (vrState.feedbackPanel.visible) {
      // Remove old, re-add fresh
      vrState.interactables = vrState.interactables.filter(o => !o.userData.isFeedback);
      vrState.interactables.push(vrState.feedbackPanel);
    }
  }).observe(fbEl, { attributes: true, attributeFilter: ['class'] });

  // Video container observer
  const vidContainer = document.getElementById('video-container');
  new MutationObserver(() => {
    if (!vrState.active) return;
    const showing = vidContainer.classList.contains('visible');
    vrState.videoSphere.visible = showing;
    vrState.orbFollowEnabled = !showing;

    // Hide the dark status panel canvas so it doesn't block the video in the center!
    if (vrState.statusPanel) {
      if (showing) { vrState.statusPanel.visible = false; } else { showStatusPanel(); }
    }

    // Handle Compositor Layer (XRMediaBinding)
    // DISABLED: Quest ignores offset-space rotation on equirectLayer, causing video
    // to appear misaligned. Using the VideoTexture sphere (with rotation fix) instead.
    // The Three.js VideoTexture approach provides reliable rotation control.
    /*
    const session = renderer.xr.getSession();
    if (session && vrState.mediaBinding) {
      if (showing) {
        try {
          if (!vrState.equirectLayer) {
            const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
            const offsetSpace = renderer.xr.getReferenceSpace().getOffsetReferenceSpace(
              new XRRigidTransform({x: 0, y: 0, z: 0}, {x: q.x, y: q.y, z: q.z, w: q.w})
            );
            vrState.equirectLayer = vrState.mediaBinding.createEquirectLayer(tourVideo, {
              space: offsetSpace,
              layout: 'mono',
              radius: 200
            });
          }
          session.updateRenderState({
            layers: [vrState.equirectLayer, session.renderState.baseLayer]
          });
          vrState.videoSphere.visible = false; // Hide WebGL texture fallback
        } catch (e) {
          console.warn('[Aura VR] Failed to add equirectLayer, using VideoTexture fallback', e);
          vrState.videoSphere.visible = true;
        }
      } else {
        if (vrState.equirectLayer) {
          try {
            session.updateRenderState({
              layers: [session.renderState.baseLayer]
            });
          } catch (e) { }
        }
        vrState.videoSphere.visible = false;
      }
    }
    */

    if (showing) {
      sphere.material.size = 0.002;
      sphere.position.set(-0.5, 1.9, -1.1);
      sphere.scale.set(0.08, 0.08, 0.08);
      if (vrState.ambientParticles) vrState.ambientParticles.visible = false;
      vrState.starfield.visible = false; // Hide starfield entirely during video to prevent WebXR blending artifacts
      vrState.statusPanel.visible = false;
      vrState.timerPanel.visible = true;
      updateTextPanel(vrState.timerPanel, timerTimeEl.innerText);
      reticle.visible = false; // Hide reticle to prevent center artifacting
    } else {
      sphere.material.size = 0.005;
      sphere.position.set(0, 1.5, -2.0);
      sphere.scale.set(0.2, 0.2, 0.2);
      if (vrState.ambientParticles) {
        vrState.ambientParticles.visible = true;
        vrState.ambientParticles.material.opacity = 0.35;
      }
      vrState.starfield.visible = true;
      vrState.starfield.material.opacity = 0.8;
      reticle.visible = true; // Restore reticle
      const journeyNow = window._AURA_JOURNEY_STARTED && window._AURA_JOURNEY_STARTED();
      if (journeyNow) { showStatusPanel(); } else { vrState.statusPanel.visible = false; }
      vrState.timerPanel.visible = false;
    }
  }).observe(vidContainer, { attributes: true, attributeFilter: ['class'] });

  // Voice Selection Screen observer
  const voiceMenuEl = document.getElementById('voice-selection-screen');
  if (voiceMenuEl) {
    new MutationObserver(() => {
      if (!vrState.active) return;
      if (!voiceMenuEl.classList.contains('hidden')) {
        buildVRVoiceMenu();
      } else {
        vrState.menuGroup.visible = false;
        vrState.interactables = vrState.interactables.filter(o => !o.userData.isVoiceCard);
      }
    }).observe(voiceMenuEl, { attributes: true, attributeFilter: ['class'] });
  }

  // Choose Environment button observer
  const htmlMenuBtn = document.getElementById('menu-btn');
  if (htmlMenuBtn) {
    new MutationObserver(() => {
      if (!vrState.active) return;
      const isVisible = htmlMenuBtn.style.display === 'block';
      if (vrState.chooseEnvBtn) {
        vrState.chooseEnvBtn.visible = isVisible;
      }
    }).observe(htmlMenuBtn, { attributes: true, attributeFilter: ['style', 'class'] });
  }

  // End Session / End Journey button observer
  const htmlEndBtn = document.getElementById('end-btn');
  if (htmlEndBtn) {
    new MutationObserver(() => {
      if (!vrState.active) return;
      const isVisible = htmlEndBtn.style.display === 'block';
      if (vrState.endSessionBtn) {
        vrState.endSessionBtn.visible = isVisible;
        vrState.endSessionBtn.userData.setText(htmlEndBtn.textContent);
      }
    }).observe(htmlEndBtn, { attributes: true, attributeFilter: ['style', 'class'], childList: true, characterData: true, subtree: true });
  }

  // ---- Build VR Voice Menu ----
  function buildVRVoiceMenu() {
    // Clear old Three.js objects
    while (vrState.menuGroup.children.length) {
      vrState.menuGroup.remove(vrState.menuGroup.children[0]);
    }
    vrState.envCards = [];
    vrState.interactables = vrState.interactables.filter(o => !o.userData.envData && !o.userData.isVoiceCard);

    // Title Panel
    const titlePanel = createTextPanel('Choose Your Voice', {
      worldW: 2.2, canvasW: 880, canvasH: 110,
      font: '600 32px Inter, system-ui, sans-serif',
      bg: 'rgba(8, 14, 24, 0.8)', bg2: 'rgba(6, 10, 18, 0.9)',
      glowColor: 'rgba(188, 255, 204, 0.3)',
      border: 'rgba(188, 255, 204, 0.3)',
    });
    titlePanel.position.set(0, 2.1, -2.8);
    vrState.menuGroup.add(titlePanel);

    // Male Card
    const maleCard = createTextPanel('Sam (Male)', {
      worldW: 1.0, canvasW: 400, canvasH: 200,
      font: 'bold 24px Inter, sans-serif',
      bg: 'rgba(30, 40, 50, 0.8)', border: 'rgba(100, 150, 255, 0.5)'
    });
    maleCard.position.set(-0.6, 1.6, -2.5);
    maleCard.lookAt(0, 1.6, 0);
    maleCard.userData.isVoiceCard = true;
    maleCard.userData.voiceName = 'Enceladus';
    vrState.menuGroup.add(maleCard);
    vrState.interactables.push(maleCard);

    // Female Card
    const femaleCard = createTextPanel('Solaya (Female)', {
      worldW: 1.0, canvasW: 400, canvasH: 200,
      font: 'bold 24px Inter, sans-serif',
      bg: 'rgba(30, 40, 50, 0.8)', border: 'rgba(255, 150, 200, 0.5)'
    });
    femaleCard.position.set(0.6, 1.6, -2.5);
    femaleCard.lookAt(0, 1.6, 0);
    femaleCard.userData.isVoiceCard = true;
    femaleCard.userData.voiceName = 'Despina';
    vrState.menuGroup.add(femaleCard);
    vrState.interactables.push(femaleCard);

    vrState.menuGroup.visible = true;
  }

  // ---- Build VR Environment Menu ----
  function buildVRMenu() {
    // Destroy old card preview videos and Hls instances before clearing the scene graph.
    // Without this, every buildVRMenu call leaks video elements that keep downloading.
    vrState.envCards.forEach(card => {
      const vid = card.userData && card.userData._video;
      if (vid) { vid.pause(); vid.src = ''; vid.load(); }
      const hls = card.userData && card.userData._hls;
      if (hls) { hls.destroy(); }
    });

    // Clear old Three.js objects
    while (vrState.menuGroup.children.length) {
      vrState.menuGroup.remove(vrState.menuGroup.children[0]);
    }
    vrState.envCards = [];
    vrState.interactables = vrState.interactables.filter(o => !o.userData.envData);


    const envs = window._AURA_ENVIRONMENTS || [];
    const menuData = window._AURA_LATEST_MENU_DATA || {};
    const topSub = menuData.top_sub_type || '';
    const recSubs = menuData.recommended_sub_types || [];

    // ---- Background Halo behind menu ----
    const haloCan = document.createElement('canvas');
    haloCan.width = 1024; haloCan.height = 600;
    const hCtx = haloCan.getContext('2d');
    const haloGrad = hCtx.createRadialGradient(512, 300, 50, 512, 300, 510);
    haloGrad.addColorStop(0, 'rgba(188,255,204,0.04)');
    haloGrad.addColorStop(1, 'rgba(0,0,0,0)');
    hCtx.fillStyle = haloGrad;
    hCtx.fillRect(0, 0, 1024, 600);
    const haloTex = new THREE.CanvasTexture(haloCan);
    const haloMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(5.5, 3.2),
      new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, depthWrite: false, side: THREE.DoubleSide })
    );
    haloMesh.position.set(0, 1.5, -2.82);
    haloMesh.renderOrder = 990;
    vrState.menuGroup.add(haloMesh);

    // ---- Title Panel ----
    const titlePanel = createTextPanel('Choose Your Environment', {
      worldW: 2.2, canvasW: 880, canvasH: 110,
      font: '600 32px Inter, system-ui, sans-serif',
      bg: 'rgba(8, 14, 24, 0.8)', bg2: 'rgba(6, 10, 18, 0.9)',
      glowColor: 'rgba(188, 255, 204, 0.3)',
      border: 'rgba(188, 255, 204, 0.3)',
    });
    titlePanel.position.set(0, 2.38, -2.8);
    vrState.menuGroup.add(titlePanel);

    // ---- Reason / Guidance Mode ----
    if (menuData.reason) {
      const reasonText = menuData.reason;
      const reasonPanel = createTextPanel(reasonText, {
        worldW: 1.9, canvasW: 780, canvasH: 80,
        font: '300 20px Inter, system-ui, sans-serif',
        color: 'rgba(188, 255, 204, 0.82)',
        bg: 'rgba(8, 14, 24, 0.55)', bg2: 'rgba(6, 10, 18, 0.65)',
        border: 'rgba(188, 255, 204, 0.12)',
        lineHeight: 28,
      });
      reasonPanel.position.set(0, 2.15, -2.78);
      vrState.menuGroup.add(reasonPanel);
    }

    // ---- Section label: Recommended ----
    const recLabel = createTextPanel('✦  RECOMMENDED BY AURA', {
      worldW: 1.4, canvasW: 580, canvasH: 56,
      font: 'bold 13px Inter, system-ui, sans-serif',
      color: 'rgba(188, 255, 204, 0.7)',
      bg: 'rgba(0,0,0,0)', bg2: 'rgba(0,0,0,0)',
      border: 'rgba(0,0,0,0)',
    });
    recLabel.position.set(0, 1.98, -2.75);
    vrState.menuGroup.add(recLabel);

    // ---- Filter Cards (Top 3 vs All) ----
    let displayEnvs = envs;
    if (!vrState.showAllEnvs) {
      // Prioritize top sub, then rec subs, then others if needed to fill 3
      const topEnvs = envs.filter(e => e.subType === topSub);
      const recEnvs = envs.filter(e => recSubs.includes(e.subType) && e.subType !== topSub);
      displayEnvs = [...topEnvs, ...recEnvs].slice(0, 3);
      if (displayEnvs.length === 0) displayEnvs = envs.slice(0, 3); // Fallback
    }

    // ---- Cards in curved arc ----
    const total = displayEnvs.length;
    // Wider radius for bigger 0.80m cards to avoid overlap
    const arcSpan = vrState.showAllEnvs ? Math.PI * 1.1 : Math.PI * 0.55;
    const radius = vrState.showAllEnvs ? 3.4 : 3.0;
    const startAngle = -arcSpan / 2;

    displayEnvs.forEach((env, i) => {
      const isTop = env.subType === topSub;
      const isRec = recSubs.includes(env.subType);
      const card = createEnvCard(env, isTop, isRec); // returns THREE.Group

      const angle = startAngle + (i / Math.max(total - 1, 1)) * arcSpan;
      const yOffset = isTop ? 0.14 : isRec ? 0.07 : 0;
      card.position.set(
        Math.sin(angle) * radius,
        1.55 + yOffset,
        -Math.cos(angle) * radius
      );
      card.lookAt(0, 1.55 + yOffset, 0);

      if (isTop) card.scale.set(1.08, 1.08, 1.08);

      vrState.menuGroup.add(card);
      vrState.envCards.push(card);

      // Cards are now Groups — push the transparent hit plane child to interactables
      card.children.forEach(child => {
        if (child.userData.isInteractable) vrState.interactables.push(child);
      });
    });

    // ---- Gaze instruction ----
    const gazeLabel = createTextPanel('Gaze at an environment for 15 seconds to select it', {
      worldW: 1.6, canvasW: 660, canvasH: 58,
      font: '300 16px Inter, system-ui, sans-serif',
      color: 'rgba(255, 255, 255, 0.45)',
      bg: 'rgba(0,0,0,0)', bg2: 'rgba(0,0,0,0)',
      border: 'rgba(0,0,0,0)',
    });
    gazeLabel.position.set(0, 0.78, -2.7);
    vrState.menuGroup.add(gazeLabel);

    // ---- See All Button ----
    if (!vrState.showAllEnvs && envs.length > displayEnvs.length) {
      const seeAllBtn = createVRButton('See All', 0.5, 0.15, { glowColor: '#00c6ff', bg: '#0072ff', color: '#fff' });
      seeAllBtn.position.set(0, 0.9, -2.7);
      seeAllBtn.userData.isSeeAllBtn = true;
      vrState.menuGroup.add(seeAllBtn);
      vrState.interactables.push(seeAllBtn);
    }

    vrState.menuGroup.visible = true;
  }

  // ---- Interaction ----
  function onVRSelect(controller) {
    if (!vrState.active) return;
    const hits = raycastFromController(controller, getVisibleInteractables(vrState.interactables));
    if (hits.length > 0) handleVRInteraction(hits[0].object);
  }


  function handleVRInteraction(obj) {
    console.log('[Aura VR] Interaction detected on object:', obj.userData);
    if (obj.userData.isBeginBtn && window._AURA_START_JOURNEY) {
      // Hide welcome, start the journey
      vrState.welcomePanel.visible = false;
      vrState.buttonGroup.visible = false;
      showStatusPanel();
      window._AURA_START_JOURNEY();
    } else if (obj.userData.isSeeAllBtn) {
      vrState.showAllEnvs = true;
      buildVRMenu();
    } else if (obj.userData.envData && window._AURA_SELECT_ENVIRONMENT) {
      window._AURA_SELECT_ENVIRONMENT(obj.userData.envData);
    } else if (obj.userData.isFeedback && window._AURA_RETURN_TO_START) {
      window._AURA_RETURN_TO_START();
    } else if (obj.userData.isVoiceCard) {
      console.log("[Aura VR] Voice card interaction triggered for:", obj.userData.voiceName);
      const voice = obj.userData.voiceName;
      const htmlCard = document.querySelector(`.voice-card[data-voice="${voice}"]`);
      if (htmlCard) htmlCard.click();
      else console.error("[Aura VR] Voice card not found in DOM:", voice);
    } else if (obj.userData.isChooseEnvBtn) {
      const htmlBtn = document.getElementById('menu-btn');
      if (htmlBtn) htmlBtn.click();
    } else if (obj.userData.isEndSessionBtn) {
      const htmlBtn = document.getElementById('end-btn');
      if (htmlBtn) htmlBtn.click();
    }
  }

  // ---- VR Animation Loop ----
  window._vrAnimate = function (delta) {
    if (!vrState.active) return;
    vrState.time += delta;

    function clearGazeInteraction() {
      if (vrState.hoveredObj) {
        if (vrState.hoveredObj.userData.draw) {
          vrState.hoveredObj.userData.draw(false);
          vrState.hoveredObj.userData.texture.needsUpdate = true;
        }
        vrState.hoveredObj = null;
      }
      // Gaze broken: reset the loading ring to idle state immediately!
      vrState.gazeTimer = 0;
      if (vrState._reticleIdleGeo) {
        reticle.geometry = vrState._reticleIdleGeo;
      }
      reticleMat.color.setHex(0xffffff);
      reticleMat.opacity = 0.5;
      reticle.scale.lerp(new THREE.Vector3(1, 1, 1), 0.15);
    }

    // ---- Lazy head-follow: orb drifts toward gaze ----
    if (vrState.orbFollowEnabled !== false) {
      const xrCam = renderer.xr.getCamera();
      const camDir = new THREE.Vector3();
      xrCam.getWorldDirection(camDir);
      const camPos = new THREE.Vector3();
      xrCam.getWorldPosition(camPos);

      const targetPos = new THREE.Vector3(
        camPos.x + camDir.x * 2.0,
        camPos.y + camDir.y * 2.0 - 0.1,
        camPos.z + camDir.z * 2.0
      );
      sphere.position.lerp(targetPos, 0.018);

      // Status panel: sits well below the orb, not overlapping
      if (vrState.statusPanel && vrState.statusPanel.visible) {
        const panelTarget = sphere.position.clone();
        panelTarget.y -= 0.9; // Far enough below to never overlap with the orb
        panelTarget.z -= 0.15; // Slightly further back
        vrState.statusPanel.position.lerp(panelTarget, 0.025);
        vrState.statusPanel.lookAt(camPos);
      }

      // Welcome panel: slowly bobs
      if (vrState.welcomePanel && vrState.welcomePanel.visible) {
        vrState.welcomePanel.position.y = 1.5 + Math.sin(vrState.time * 0.5) * 0.015;
        vrState.welcomePanel.lookAt(camPos);
      }
    }

    // Rotate starfield slowly
    if (vrState.starfield && vrState.starfield.visible) {
      vrState.starfield.rotation.y += delta * 0.006;
      vrState.starfield.rotation.x += delta * 0.0015;
    }

    // Ambient particles disabled
    // animateAmbientParticles(vrState.ambientParticles, vrState.time);

    // Pulse ground glow
    if (vrState.groundGlow && vrState.groundGlow.visible) {
      vrState.groundGlow.material.opacity = 0.10 + Math.sin(vrState.time * 0.7) * 0.04;
    }

    // Lotus ring slow rotation
    if (vrState.lotusRing && vrState.lotusRing.visible) {
      vrState.lotusRing.rotation.y += delta * 0.04;
    }

    // Static status panel float (during tour)
    if (vrState.statusPanel && vrState.statusPanel.visible && vrState.orbFollowEnabled === false) {
      vrState.statusPanel.position.y = 0.5 + Math.sin(vrState.time * 0.55) * 0.012;
    }

    // Static dashboard orientation (during tour)
    const xrCam = renderer.xr.getCamera();
    const camPos = new THREE.Vector3();
    xrCam.getWorldPosition(camPos);

    if (vrState.timerPanel && vrState.timerPanel.visible) {
      vrState.timerPanel.lookAt(camPos);
    }
    if (vrState.chooseEnvBtn && vrState.chooseEnvBtn.visible) {
      vrState.chooseEnvBtn.lookAt(camPos);
    }
    if (vrState.endSessionBtn && vrState.endSessionBtn.visible) {
      vrState.endSessionBtn.lookAt(camPos);
    }

    // ---- Gaze-based interaction ----
    const visibleInteractables = getVisibleInteractables(vrState.interactables);
    if (visibleInteractables.length > 0) {
      const xrCam = renderer.xr.getCamera();
      const hits = raycastFromGaze(xrCam, visibleInteractables);
      if (hits.length > 0) {
        const obj = hits[0].object;
        if (vrState.hoveredObj !== obj) {
          // Reset scale of old hovered
          if (vrState.hoveredObj) {
            vrState.hoveredObj.scale.lerp(new THREE.Vector3(1, 1, 1), 1.0);
          }
          vrState.hoveredObj = obj;
          vrState.gazeTimer = 0;
          // Redraw button highlight
          if (obj.userData.draw) {
            obj.userData.draw(true);
            obj.userData.texture.needsUpdate = true;
          }
        }
        vrState.gazeTimer += delta * 1000;
        const progress = Math.min(1.0, vrState.gazeTimer / vrState.GAZE_SELECT_MS);

        // Update sweeping loading ring around gaze!
        const thetaLength = progress * Math.PI * 2;
        const newGeo = new THREE.RingGeometry(0.007, 0.013, 40, 1, 0, Math.max(0.01, thetaLength));
        if (reticle.geometry !== vrState._reticleIdleGeo) reticle.geometry.dispose();
        reticle.geometry = newGeo;
        reticleMat.color.setHex(0x00e676); // Glowing emerald loading indicator green
        reticleMat.opacity = 0.8;
        reticle.scale.set(1.3, 1.3, 1);

        // Scale the parent group if this is a hit-plane child of a card Group
        const scaleTarget = (obj.parent && obj.parent.isGroup) ? obj.parent : obj;
        scaleTarget.scale.lerp(new THREE.Vector3(1.07, 1.07, 1.07), 0.08);
        if (vrState.gazeTimer >= vrState.GAZE_SELECT_MS) {
          // Restore idle reticle state
          if (reticle.geometry !== vrState._reticleIdleGeo) reticle.geometry.dispose();
          reticle.geometry = vrState._reticleIdleGeo;
          reticleMat.color.setHex(0xffffff);
          reticleMat.opacity = 0.5;
          reticle.scale.set(1, 1, 1);

          handleVRInteraction(obj);
          vrState.gazeTimer = 0;
          vrState.hoveredObj = null;
        }
      } else {
        clearGazeInteraction();
      }
    } else {
      clearGazeInteraction();
    }

    // Controller hover highlight
    vrState.controllers.forEach(ctrl => {
      const hits = raycastFromController(ctrl, visibleInteractables);
      vrState.interactables.forEach(obj => {
        const scaleTarget = (obj.parent && obj.parent.isGroup) ? obj.parent : obj;
        if (hits.length > 0 && hits[0].object === obj) {
          scaleTarget.scale.lerp(new THREE.Vector3(1.06, 1.06, 1.06), 0.12);
        } else if (vrState.hoveredObj !== obj) {
          scaleTarget.scale.lerp(new THREE.Vector3(1, 1, 1), 0.1); // reset on group, not hit plane
        }
      });
    });
  };

  console.log('[Aura VR] WebXR premium wellness system initialized.');
}
