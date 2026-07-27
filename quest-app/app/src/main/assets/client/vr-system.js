// ========== VR SYSTEM MODULE (Enhanced Visuals) ==========
// Premium 3D UI components, starfield, ambient particles for WebXR VR
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ---- Helpers ----
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  let curY = y;
  for (const word of words) {
    const test = line + word + ' ';
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line.trim(), x, curY);
      line = word + ' ';
      curY += lineH;
    } else {
      line = test;
    }
  }
  ctx.fillText(line.trim(), x, curY);
}

// ---- Starfield Background ----
export function createStarfield(count = 3000) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    // Distribute on a large sphere shell
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 80 + Math.random() * 120;
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    // Subtle color variation (cool blues, warm whites, soft purples)
    const colorChoice = Math.random();
    if (colorChoice < 0.4) {
      colors[i * 3] = 0.7 + Math.random() * 0.3;
      colors[i * 3 + 1] = 0.8 + Math.random() * 0.2;
      colors[i * 3 + 2] = 1.0;
    } else if (colorChoice < 0.7) {
      colors[i * 3] = 0.9 + Math.random() * 0.1;
      colors[i * 3 + 1] = 0.85 + Math.random() * 0.15;
      colors[i * 3 + 2] = 0.75 + Math.random() * 0.15;
    } else {
      colors[i * 3] = 0.6 + Math.random() * 0.2;
      colors[i * 3 + 1] = 0.5 + Math.random() * 0.2;
      colors[i * 3 + 2] = 0.9 + Math.random() * 0.1;
    }
    sizes[i] = 0.08 + Math.random() * 0.25;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: 0.15,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    depthWrite: false
  });

  const stars = new THREE.Points(geo, mat);
  stars.userData.sizes = sizes;
  stars.userData.positions = positions;
  return stars;
}

// ---- Ambient Floating Particles (close to user) ----
export function createAmbientParticles(count = 200) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const velocities = [];

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 10;
    positions[i * 3 + 1] = Math.random() * 4;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 10;
    velocities.push({
      x: (Math.random() - 0.5) * 0.003,
      y: 0.001 + Math.random() * 0.004,
      z: (Math.random() - 0.5) * 0.003
    });
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    size: 0.03,
    color: 0xbcffcc,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const particles = new THREE.Points(geo, mat);
  particles.userData.velocities = velocities;
  particles.userData.count = count;
  return particles;
}

export function animateAmbientParticles(particles, time) {
  if (!particles || !particles.visible) return;
  const pos = particles.geometry.attributes.position.array;
  const vels = particles.userData.velocities;
  const count = particles.userData.count;

  for (let i = 0; i < count; i++) {
    pos[i * 3] += vels[i].x + Math.sin(time + i * 0.5) * 0.001;
    pos[i * 3 + 1] += vels[i].y;
    pos[i * 3 + 2] += vels[i].z + Math.cos(time + i * 0.3) * 0.001;

    // Reset particles that drift too high
    if (pos[i * 3 + 1] > 5) {
      pos[i * 3 + 1] = -0.5;
      pos[i * 3] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 10;
    }
  }
  particles.geometry.attributes.position.needsUpdate = true;
}

// ---- Ground Glow Ring ----
export function createGroundGlow() {
  const geo = new THREE.RingGeometry(1.5, 4, 64);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x1a3a2a,
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.01;
  return ring;
}

// ---- Glass Button Helper ----
export function createVRButton(text, w = 0.4, h = 0.12, opts = {}) {
  const cw = 256, ch = 80;
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d');

  let currentText = text;

  function draw(isHovered = false) {
    ctx.clearRect(0, 0, cw, ch);
    
    // Glow
    if (isHovered) {
      ctx.shadowColor = opts.glowColor || 'rgba(188, 255, 204, 0.4)';
      ctx.shadowBlur = 20;
    }

    // Background
    if (opts.bg) {
        ctx.fillStyle = isHovered ? (opts.hoverBg || '#ffffff') : opts.bg;
    } else {
        const grad = ctx.createLinearGradient(0, 0, 0, ch);
        grad.addColorStop(0, isHovered ? 'rgba(188, 255, 204, 0.25)' : 'rgba(255, 255, 255, 0.12)');
        grad.addColorStop(1, isHovered ? 'rgba(188, 255, 204, 0.15)' : 'rgba(255, 255, 255, 0.08)');
        ctx.fillStyle = grad;
    }
    
    roundRect(ctx, 4, 4, cw - 8, ch - 8, ch / 2 - 4);
    ctx.fill();

    ctx.shadowBlur = 0;

    // Border
    ctx.strokeStyle = isHovered ? (opts.bg ? opts.bg : 'rgba(188, 255, 204, 0.8)') : (opts.border || 'rgba(255, 255, 255, 0.3)');
    ctx.lineWidth = 2;
    roundRect(ctx, 4, 4, cw - 8, ch - 8, ch / 2 - 4);
    ctx.stroke();

    // Text
    if (opts.color) {
        ctx.fillStyle = isHovered ? (opts.hoverColor || opts.bg) : opts.color;
    } else {
        ctx.fillStyle = isHovered ? '#ffffff' : 'rgba(255, 255, 255, 0.9)';
    }
    ctx.font = '700 24px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(currentText, cw / 2, ch / 2);
  }

  draw(false);
  const tex = new THREE.CanvasTexture(canvas);
  const geo = new THREE.PlaneGeometry(w, h);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData = { 
    canvas, 
    ctx, 
    texture: tex, 
    draw, 
    isInteractable: true,
    setText: (newText) => {
      currentText = newText;
      draw(false);
      tex.needsUpdate = true;
    }
  };
  return mesh;
}


// ---- Text Panel (Enhanced with glow border) ----
export function createTextPanel(text, opts = {}) {
  const cw = opts.canvasW || 512, ch = opts.canvasH || 192;
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d');

  drawTextPanelContent(ctx, text, cw, ch, opts);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  const ww = opts.worldW || 1.2, wh = opts.worldH || (ww * ch / cw);
  const geo = new THREE.PlaneGeometry(ww, wh);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthTest: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 999;
  mesh.userData = { canvas, ctx, texture: tex, canvasW: cw, canvasH: ch, worldW: ww, worldH: wh };
  return mesh;
}

function drawTextPanelContent(ctx, text, cw, ch, opts) {
  ctx.clearRect(0, 0, cw, ch);

  // Outer glow
  ctx.shadowColor = opts.glowColor || 'rgba(188, 255, 204, 0.15)';
  ctx.shadowBlur = 30;

  // Background with gradient
  const grad = ctx.createLinearGradient(0, 0, 0, ch);
  grad.addColorStop(0, opts.bg || 'rgba(12, 18, 30, 0.92)');
  grad.addColorStop(1, opts.bg2 || 'rgba(8, 12, 22, 0.95)');
  ctx.fillStyle = grad;
  roundRect(ctx, 2, 2, cw - 4, ch - 4, 16);
  ctx.fill();

  ctx.shadowBlur = 0;

  // Border with gradient
  const borderGrad = ctx.createLinearGradient(0, 0, cw, 0);
  borderGrad.addColorStop(0, opts.border || 'rgba(188, 255, 204, 0.2)');
  borderGrad.addColorStop(0.5, opts.border || 'rgba(188, 255, 204, 0.35)');
  borderGrad.addColorStop(1, opts.border || 'rgba(188, 255, 204, 0.2)');
  ctx.strokeStyle = borderGrad;
  ctx.lineWidth = 1.5;
  roundRect(ctx, 2, 2, cw - 4, ch - 4, 16);
  ctx.stroke();

  // Text
  ctx.fillStyle = opts.color || 'rgba(255, 255, 255, 0.95)';
  ctx.font = opts.font || '300 22px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  if (opts.isTitle) {
      ctx.letterSpacing = '2px';
      ctx.textTransform = 'uppercase';
  }
  
  wrapText(ctx, text, cw / 2, ch / 2, cw - 80, opts.lineHeight || 34);
}


export function updateTextPanel(mesh, text, opts = {}) {
  const { canvas, ctx, texture, canvasW: cw, canvasH: ch } = mesh.userData;
  drawTextPanelContent(ctx, text, cw, ch, opts);
  texture.needsUpdate = true;
}

// ---- Environment Card (Zen · Video Thumbnail Edition) ----
export function createEnvCard(env, isTop, isRec) {
  const CARD_W = 0.80;
  const CARD_H = CARD_W * (3 / 2);   // 1.20m — tall portrait
  const VID_H  = CARD_H * 0.60;      // top 60% = live video preview

  const group = new THREE.Group();
  group.userData.envData = env;

  // ── SOUL COLOURS ──────────────────────────────────────────────────────
  const SOUL = {
    Nature:     { bg:'rgba(3,13,7,0.97)',   mist:'rgba(74,222,128,',  border:'rgba(74,222,128,' },
    Meditation: { bg:'rgba(4,5,15,0.97)',   mist:'rgba(129,140,248,', border:'rgba(129,140,248,' },
    Spiritual:  { bg:'rgba(13,5,8,0.97)',   mist:'rgba(249,168,212,', border:'rgba(249,168,212,' },
  };
  const soul = SOUL[env.category] || SOUL.Nature;

  // ── 1. STATIC CARD BACKGROUND (Replacing Live Video) ──────────────────
  const cw = 640, ch = Math.round(640 * CARD_H / CARD_W);
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d');
  const vidPx = Math.round(ch * 0.60);

  // Premium background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 0, ch);
  bgGrad.addColorStop(0, soul.bg.replace('0.97)', '0.5)'));
  bgGrad.addColorStop(0.5, soul.bg.replace('0.97)', '0.85)'));
  bgGrad.addColorStop(1, soul.bg);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, cw, ch);

  // mandala
  const mx = cw / 2, my = vidPx + (ch - vidPx) * 0.45;
  for (let r = 1; r <= 3; r++) {
    ctx.strokeStyle = `${soul.mist}${0.04 + r * 0.018})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(mx, my, r * 20, 0, Math.PI * 2); ctx.stroke();
    for (let p = 0; p < 6; p++) {
      const a = (p / 6) * Math.PI * 2;
      ctx.beginPath(); ctx.arc(mx + Math.cos(a)*r*20, my + Math.sin(a)*r*20, r*11, 0, Math.PI*2); ctx.stroke();
    }
  }

  // border
  if (isTop) {
    const bg2 = ctx.createLinearGradient(0,0,cw,ch);
    bg2.addColorStop(0,'rgba(251,191,36,0.9)'); bg2.addColorStop(0.5,'rgba(253,224,71,0.5)'); bg2.addColorStop(1,'rgba(251,191,36,0.9)');
    ctx.strokeStyle = bg2; ctx.lineWidth = 3;
  } else if (isRec) {
    ctx.strokeStyle = `${soul.border}0.52)`; ctx.lineWidth = 2;
  } else {
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1.5;
  }
  roundRect(ctx, 2, 2, cw-4, ch-4, 22); ctx.stroke();

  // gold top line
  if (isTop) {
    const tl = ctx.createLinearGradient(40,0,cw-40,0);
    tl.addColorStop(0,'transparent'); tl.addColorStop(0.5,'rgba(251,191,36,0.9)'); tl.addColorStop(1,'transparent');
    ctx.strokeStyle = tl; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(40,3); ctx.lineTo(cw-40,3); ctx.stroke();
  }

  // badge
  if (isTop || isRec) {
    const bt = isTop ? '\u2726  AURA\'S CHOICE' : '\u25C6  RECOMMENDED';
    const bc = isTop ? 'rgba(251,191,36,' : soul.mist;
    ctx.font = 'bold 11px Inter, system-ui, sans-serif';
    const bw = ctx.measureText(bt).width + 22;
    ctx.fillStyle = `${bc}0.14)`; roundRect(ctx,16,16,bw,26,13); ctx.fill();
    ctx.strokeStyle = `${bc}0.5)`; ctx.lineWidth = 1; roundRect(ctx,16,16,bw,26,13); ctx.stroke();
    ctx.fillStyle = isTop ? 'rgba(251,191,36,0.95)' : `${soul.mist}0.9)`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(bt, 28, 29);
  }

  // PLAY icon on video area
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath(); ctx.arc(cw/2, vidPx*0.5, 28, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath(); ctx.moveTo(cw/2-9, vidPx*0.5-12); ctx.lineTo(cw/2+15, vidPx*0.5); ctx.lineTo(cw/2-9, vidPx*0.5+12); ctx.fill();

  // category eyebrow
  ctx.font = '700 10px Inter, system-ui, sans-serif';
  ctx.fillStyle = `${soul.mist}0.68)`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(env.category.toUpperCase(), cw/2, vidPx+14);

  // title
  ctx.font = '700 32px Inter, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.97)';
  ctx.fillText(env.title, cw/2, vidPx+32);

  // description
  ctx.font = '300 14px Inter, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.44)';
  wrapText(ctx, env.description, cw/2, vidPx+76, cw-80, 21);

  // gaze hint
  ctx.font = '500 11px Inter, system-ui, sans-serif';
  ctx.fillStyle = `${soul.mist}0.42)`;
  ctx.textBaseline = 'middle';
  ctx.fillText(isTop ? '\u2726  Gaze 15s \u00B7 Begin Journey' : 'Gaze 15 seconds to select', cw/2, ch-28);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  const overlayMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(CARD_W, CARD_H),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthTest: false })
  );
  overlayMesh.position.z = 0.003;
  overlayMesh.renderOrder = 998;
  group.add(overlayMesh);

  // ── 3. HIT PLANE (transparent raycasting target) ───────────────────────
  const hitPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(CARD_W, CARD_H),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, side: THREE.DoubleSide, depthTest: false })
  );
  hitPlane.position.z = 0.005;
  hitPlane.renderOrder = 999;
  hitPlane.userData.envData = env;
  hitPlane.userData.isInteractable = true;
  group.add(hitPlane);

  return group;
}



// ---- Video Sphere (360/cinema dome) ----
export function createVideoSphere(videoElement) {
  // Use radius 12 to bring the sphere well within the WebXR far clipping plane
  // and optimize segments (64x32) for mobile VR performance.
  const geo = new THREE.SphereGeometry(12, 64, 32);
  geo.scale(-1, 1, 1);
  const tex = new THREE.VideoTexture(videoElement);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;

  // Enable maximum Anisotropic Filtering supported by the GPU to sharpen details at angles
  const globalRenderer = window._AURA_SCENE_DATA ? window._AURA_SCENE_DATA.renderer : null;
  if (globalRenderer) {
    tex.anisotropy = globalRenderer.capabilities.getMaxAnisotropy();
  } else {
    tex.anisotropy = 4;
  }

  // Set depthWrite to false and renderOrder to -10 to prevent depth buffer conflicts
  // and ensure the sphere renders strictly behind all foreground elements.
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide, depthWrite: false, transparent: true });
  const mesh = new THREE.Mesh(geo, mat);
  // Rotate -90° on Y so the equirectangular center (u=0.5, at -X after scale flip) faces -Z (VR forward)
  mesh.rotation.y = -Math.PI / 2;
  mesh.renderOrder = -10;
  mesh.visible = false;
  mesh.userData.videoTexture = tex;
  return mesh;
}

// ---- Controller ray (enhanced with gradient) ----
export function createControllerRay() {
  const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -4)];
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({
    color: 0xbcffcc,
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending
  });
  return new THREE.Line(geo, mat);
}

// ---- Raycasting ----
const _raycaster = new THREE.Raycaster();
const _tempMatrix = new THREE.Matrix4();

export function raycastFromController(controller, targets) {
  _tempMatrix.identity().extractRotation(controller.matrixWorld);
  _raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  _raycaster.ray.direction.set(0, 0, -1).applyMatrix4(_tempMatrix);
  return _raycaster.intersectObjects(targets, false);
}

export function raycastFromGaze(camera, targets) {
  _raycaster.ray.origin.copy(camera.position);
  camera.getWorldDirection(_raycaster.ray.direction);
  return _raycaster.intersectObjects(targets, false);
}

// ---- VR Feedback panel (enhanced) ----
export function createFeedbackPanel() {
  const cw = 640, ch = 500;
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d');

  function draw(ratings) {
    ctx.clearRect(0, 0, cw, ch);

    // Premium Abstract Glassmorphic Background
    const grad = ctx.createRadialGradient(cw/2, ch/2, 0, cw/2, ch/2, cw);
    grad.addColorStop(0, 'rgba(30, 20, 60, 0.95)');
    grad.addColorStop(1, 'rgba(10, 5, 20, 0.98)');
    ctx.fillStyle = grad;
    roundRect(ctx, 0, 0, cw, ch, 30);
    ctx.fill();

    // Subtle glowing background orbs
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, 0, 0, cw, ch, 30);
    ctx.clip();
    const orb1 = ctx.createRadialGradient(cw*0.8, ch*0.2, 0, cw*0.8, ch*0.2, 200);
    orb1.addColorStop(0, 'rgba(255, 100, 150, 0.15)');
    orb1.addColorStop(1, 'transparent');
    ctx.fillStyle = orb1; ctx.fillRect(0, 0, cw, ch);
    const orb2 = ctx.createRadialGradient(cw*0.2, ch*0.8, 0, cw*0.2, ch*0.8, 250);
    orb2.addColorStop(0, 'rgba(100, 200, 255, 0.15)');
    orb2.addColorStop(1, 'transparent');
    ctx.fillStyle = orb2; ctx.fillRect(0, 0, cw, ch);
    ctx.restore();

    // Premium Border glow
    const borderGrad = ctx.createLinearGradient(0, 0, cw, ch);
    borderGrad.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
    borderGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.05)');
    borderGrad.addColorStop(1, 'rgba(255, 255, 255, 0.2)');
    ctx.strokeStyle = borderGrad;
    ctx.lineWidth = 2;
    roundRect(ctx, 0, 0, cw, ch, 30);
    ctx.stroke();

    // Title
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 32px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Session Complete', cw / 2, 40);

    ctx.font = '300 16px Inter, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillText('Thank you for sharing this space with Aura.', cw / 2, 80);

    const items = ['I felt calmer', 'Environment fit', 'Aura felt warm', 'Questions were gentle', 'I\'d return'];
    items.forEach((label, i) => {
      const y = 130 + i * 58;

      // Row background
      const rowGrad = ctx.createLinearGradient(30, y, cw - 30, y);
      rowGrad.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
      rowGrad.addColorStop(1, 'rgba(255, 255, 255, 0.03)');
      ctx.fillStyle = rowGrad;
      roundRect(ctx, 30, y, cw - 60, 46, 12);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      roundRect(ctx, 30, y, cw - 60, 46, 12);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = '500 15px Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 50, y + 23);

      const stars = ratings[i] || 5;
      ctx.textAlign = 'right';
      for (let s = 1; s <= 5; s++) {
        // Premium star gradient
        ctx.fillStyle = s <= stars ? '#ffcc00' : 'rgba(255, 255, 255, 0.1)';
        ctx.font = '24px sans-serif';
        ctx.fillText('★', cw - 45 - (5 - s) * 32, y + 24);
      }
    });

    // Start Over button (Premium Pill)
    const btnGrad = ctx.createLinearGradient(cw / 2 - 90, 0, cw / 2 + 90, 0);
    btnGrad.addColorStop(0, '#00c6ff');
    btnGrad.addColorStop(1, '#0072ff');
    ctx.fillStyle = btnGrad;
    roundRect(ctx, cw / 2 - 90, ch - 65, 180, 46, 23);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    roundRect(ctx, cw / 2 - 90, ch - 65, 180, 46, 23);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 16px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Begin New Journey', cw / 2, ch - 42);
  }

  draw([5, 5, 5, 5, 5]);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  const geo = new THREE.PlaneGeometry(1.5, 1.5 * ch / cw);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthTest: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 1001;
  mesh.visible = false;
  mesh.userData = { canvas, ctx, texture: tex, draw, isInteractable: true, isFeedback: true };
  return mesh;
}

// ---- VR Welcome Panel (Immersive Curved Style) ----
export function createWelcomePanel() {
    const cw = 1600, ch = 960;
    const canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, cw, ch);

    // Subtle dark background panel 
    const bg = ctx.createLinearGradient(0, 0, 0, ch);
    bg.addColorStop(0, 'rgba(20, 25, 35, 0.85)');
    bg.addColorStop(1, 'rgba(10, 15, 25, 0.95)');
    ctx.fillStyle = bg;
    roundRect(ctx, 0, 0, cw, ch, 40);
    ctx.fill();

    // Outer border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 4;
    roundRect(ctx, 0, 0, cw, ch, 40);
    ctx.stroke();

    // Title
    ctx.fillStyle = '#ffffff';
    ctx.font = '500 36px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText("What's Inside Aura", cw / 2, 70);

    // ---- Large Display Cards ----
    const drawLargeCard = (x, y, w, h, title, subtitle, theme) => {
        ctx.save();
        ctx.translate(x, y);

        // Card Base
        ctx.fillStyle = 'rgba(5, 10, 15, 0.9)';
        roundRect(ctx, 0, 0, w, h, 24);
        ctx.fill();

        // Clipping path for artwork
        ctx.save();
        roundRect(ctx, 0, 0, w, h, 24);
        ctx.clip();

        // ---- Detailed Procedural Illustrations ----
        if (theme === 'mountain') {
            // Night sky gradient
            const sky = ctx.createLinearGradient(0, 0, 0, h);
            sky.addColorStop(0, '#0a0e27'); sky.addColorStop(0.4, '#1a1145');
            sky.addColorStop(0.7, '#2d1b69'); sky.addColorStop(1, '#1a0a3e');
            ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);

            // Stars
            for (let i = 0; i < 60; i++) {
                const sx = Math.random() * w, sy = Math.random() * h * 0.6;
                const sr = Math.random() * 2 + 0.5;
                ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.6 + 0.2})`;
                ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
            }

            // Aurora borealis
            for (let a = 0; a < 3; a++) {
                ctx.strokeStyle = `rgba(${100 + a*60}, ${200 + a*20}, ${255 - a*40}, 0.15)`;
                ctx.lineWidth = 20 + a * 10;
                ctx.beginPath();
                ctx.moveTo(-20, 80 + a * 50);
                for (let px = 0; px <= w; px += 20) {
                    ctx.lineTo(px, 80 + a * 50 + Math.sin(px * 0.015 + a) * 40);
                }
                ctx.stroke();
            }

            // Mountain silhouettes
            ctx.fillStyle = '#120830';
            ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(0, h*0.55); ctx.lineTo(w*0.15, h*0.3);
            ctx.lineTo(w*0.3, h*0.5); ctx.lineTo(w*0.45, h*0.25); ctx.lineTo(w*0.6, h*0.45);
            ctx.lineTo(w*0.75, h*0.35); ctx.lineTo(w*0.9, h*0.5); ctx.lineTo(w, h*0.4);
            ctx.lineTo(w, h); ctx.fill();

            ctx.fillStyle = '#1a0f40';
            ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(0, h*0.65);
            ctx.lineTo(w*0.2, h*0.45); ctx.lineTo(w*0.4, h*0.6); ctx.lineTo(w*0.55, h*0.4);
            ctx.lineTo(w*0.7, h*0.55); ctx.lineTo(w*0.85, h*0.48); ctx.lineTo(w, h*0.58);
            ctx.lineTo(w, h); ctx.fill();

        } else if (theme === 'voice') {
            // Deep blue gradient
            const bg2 = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, w*0.8);
            bg2.addColorStop(0, '#0a2463'); bg2.addColorStop(1, '#040e29');
            ctx.fillStyle = bg2; ctx.fillRect(0, 0, w, h);

            // Concentric sound rings
            for (let r = 0; r < 5; r++) {
                const radius = 30 + r * 35;
                ctx.strokeStyle = `rgba(79, 172, 254, ${0.4 - r * 0.07})`;
                ctx.lineWidth = 3 - r * 0.4;
                ctx.beginPath(); ctx.arc(w/2, h/2 - 20, radius, 0, Math.PI * 2); ctx.stroke();
            }

            // Sound wave bars
            ctx.fillStyle = 'rgba(79, 172, 254, 0.6)';
            const bars = 24;
            for (let b = 0; b < bars; b++) {
                const bx = w * 0.15 + (b / bars) * w * 0.7;
                const bh = 15 + Math.sin(b * 0.5) * 30 + Math.random() * 20;
                ctx.fillRect(bx - 3, h/2 - 20 - bh/2, 6, bh);
            }

            // Center orb glow
            const orb = ctx.createRadialGradient(w/2, h/2 - 20, 5, w/2, h/2 - 20, 50);
            orb.addColorStop(0, 'rgba(0, 242, 254, 0.8)');
            orb.addColorStop(1, 'rgba(0, 242, 254, 0)');
            ctx.fillStyle = orb;
            ctx.beginPath(); ctx.arc(w/2, h/2 - 20, 50, 0, Math.PI*2); ctx.fill();

        } else if (theme === 'nature') {
            // Forest night scene
            const sky2 = ctx.createLinearGradient(0, 0, 0, h);
            sky2.addColorStop(0, '#071a0e'); sky2.addColorStop(0.6, '#0d2818');
            sky2.addColorStop(1, '#0a1f0f');
            ctx.fillStyle = sky2; ctx.fillRect(0, 0, w, h);

            // Stars
            for (let i = 0; i < 30; i++) {
                ctx.fillStyle = `rgba(255,255,255,${Math.random()*0.4+0.1})`;
                ctx.beginPath(); ctx.arc(Math.random()*w, Math.random()*h*0.4, Math.random()+0.5, 0, Math.PI*2); ctx.fill();
            }

            // Pine tree silhouettes
            for (let t = 0; t < 8; t++) {
                const tx = w * 0.05 + t * w * 0.12 + Math.random() * 20;
                const th = 80 + Math.random() * 120;
                const tb = h * 0.75 - Math.random() * 30;
                ctx.fillStyle = `rgba(5, ${30 + Math.random()*20}, ${10 + Math.random()*10}, 0.9)`;
                ctx.beginPath();
                ctx.moveTo(tx, tb); ctx.lineTo(tx - th*0.3, tb + th);
                ctx.lineTo(tx + th*0.3, tb + th); ctx.fill();
            }

            // Campfire glow
            const fire = ctx.createRadialGradient(w/2, h*0.82, 5, w/2, h*0.82, 80);
            fire.addColorStop(0, 'rgba(255, 180, 50, 0.8)');
            fire.addColorStop(0.3, 'rgba(255, 120, 20, 0.4)');
            fire.addColorStop(1, 'rgba(255, 80, 0, 0)');
            ctx.fillStyle = fire;
            ctx.beginPath(); ctx.arc(w/2, h*0.82, 80, 0, Math.PI*2); ctx.fill();

            // Fireflies
            for (let f = 0; f < 15; f++) {
                const glow = ctx.createRadialGradient(Math.random()*w, h*0.4+Math.random()*h*0.4, 0, Math.random()*w, h*0.4+Math.random()*h*0.4, 8);
                glow.addColorStop(0, 'rgba(200, 255, 100, 0.6)');
                glow.addColorStop(1, 'rgba(200, 255, 100, 0)');
                ctx.fillStyle = glow;
                ctx.fillRect(0, 0, w, h);
            }

        } else if (theme === 'spiritual') {
            // Warm sunset gradient
            const sunset = ctx.createLinearGradient(0, 0, 0, h);
            sunset.addColorStop(0, '#1a0a2e'); sunset.addColorStop(0.3, '#2d1052');
            sunset.addColorStop(0.6, '#6b2fa0'); sunset.addColorStop(1, '#1a0a2e');
            ctx.fillStyle = sunset; ctx.fillRect(0, 0, w, h);

            // Moon
            const moonGlow = ctx.createRadialGradient(w*0.7, h*0.2, 10, w*0.7, h*0.2, 80);
            moonGlow.addColorStop(0, 'rgba(255, 240, 210, 0.9)');
            moonGlow.addColorStop(0.3, 'rgba(255, 220, 180, 0.3)');
            moonGlow.addColorStop(1, 'rgba(255, 200, 150, 0)');
            ctx.fillStyle = moonGlow;
            ctx.beginPath(); ctx.arc(w*0.7, h*0.2, 80, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#fff5e6';
            ctx.beginPath(); ctx.arc(w*0.7, h*0.2, 25, 0, Math.PI*2); ctx.fill();

            // Temple dome silhouette
            ctx.fillStyle = '#120520';
            ctx.beginPath();
            ctx.moveTo(w*0.2, h*0.95); ctx.lineTo(w*0.2, h*0.55);
            ctx.quadraticCurveTo(w*0.5, h*0.15, w*0.8, h*0.55);
            ctx.lineTo(w*0.8, h*0.95); ctx.fill();

            // Spire
            ctx.fillStyle = '#1a0830';
            ctx.beginPath();
            ctx.moveTo(w*0.48, h*0.35); ctx.lineTo(w*0.5, h*0.1);
            ctx.lineTo(w*0.52, h*0.35); ctx.fill();

            // Window arches
            ctx.fillStyle = 'rgba(255, 200, 100, 0.4)';
            for (let wi = 0; wi < 3; wi++) {
                const wx = w*0.35 + wi * w*0.1;
                ctx.beginPath();
                ctx.arc(wx, h*0.65, 12, Math.PI, 0);
                ctx.lineTo(wx + 12, h*0.75);
                ctx.lineTo(wx - 12, h*0.75);
                ctx.fill();
            }
        }

        ctx.restore();

        // Text area background gradient
        const textBg = ctx.createLinearGradient(0, h - 140, 0, h);
        textBg.addColorStop(0, 'rgba(5, 10, 15, 0)');
        textBg.addColorStop(1, 'rgba(5, 10, 15, 1)');
        ctx.fillStyle = textBg;
        ctx.fillRect(0, h - 180, w, 180);

        // Text
        ctx.fillStyle = '#fff';
        ctx.font = '500 24px Inter, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(title, 30, h - 70);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '300 18px Inter, system-ui, sans-serif';
        wrapText(ctx, subtitle, 30, h - 35, w - 60, 24);

        // Border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1.5;
        roundRect(ctx, 0, 0, w, h, 24);
        ctx.stroke();
        
        ctx.restore();
    };

    // Draw the 4 cards
    drawLargeCard(40, 120, 480, 780, 'Meditation Series', 'Guided journeys for anxiety relief, self-love & inner peace.', 'mountain');
    drawLargeCard(550, 120, 500, 375, 'Emotional AI Voice', 'Speak naturally — Aura listens with empathy & understanding.', 'voice');
    drawLargeCard(550, 525, 500, 375, 'Nature Sanctuaries', 'Forest campfires, mountain streams & glowing fireflies.', 'nature');
    drawLargeCard(1080, 120, 480, 780, '360° Spiritual Immersion', 'Sacred temple tours, Ganga Aarti & ancient chants.', 'spiritual');

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    
    // Wide cinematic plane — guaranteed centered in front of user
    const geo = new THREE.PlaneGeometry(4.0, 2.4);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthTest: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 1000;
    
    return mesh;
}

// ---- 3D Meditation Platform (Premium High-Fidelity Asset) ----
export function createMeditationPlatform() {
    const group = new THREE.Group();

    // Fallback/base glowing circle beneath the user
    const glowGeo = new THREE.CircleGeometry(1.5, 32);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.8 });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.01;
    group.add(glow);

    // ---- Add Lighting for the GLB Model ----
    // GLB models use MeshStandardMaterial, which is 100% invisible without lights.
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8); // Soft white ambient light
    group.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff0dd, 1.2); // Warm directional light
    dirLight.position.set(2, 5, 3);
    group.add(dirLight);

    // Initialize the GLTF Loader for true realism
    const loader = new GLTFLoader();
    
    // Attempt to load the premium realistic model
    loader.load(
        'assets/models/meditation_platform.glb',
        (gltf) => {
            const model = gltf.scene;
            
            // Adjust scaling and position depending on the source model
            model.scale.set(1, 1, 1);
            model.position.set(0, 0, 0);

            // Enhance materials for realism in WebXR
            model.traverse((child) => {
                if (child.isMesh) {
                    // For realism, we usually want these enabled if lighting is added later
                    child.castShadow = false; 
                    child.receiveShadow = false;
                    
                    // If the material is too dark in standard WebXR lighting, optionally tweak it:
                    if (child.material) {
                        child.material.envMapIntensity = 1.0; 
                    }
                }
            });

            // Add the realistic model to our group
            group.add(model);
        },
        undefined,
        (error) => {
            console.warn('[Aura] Premium 3D platform not found at "assets/models/meditation_platform.glb". Displaying fallback shadow.');
        }
    );

    return group;
}
