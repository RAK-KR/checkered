(function () {
'use strict';
const C = Core.C;
const $ = id => document.getElementById(id);
const IS_TOUCH = ('ontouchstart' in window) || (window.matchMedia && matchMedia('(pointer:coarse)').matches);

/* ---------- save ---------- */
const SAVE_KEY = 'racing_v1';
const save = { best: {}, settings: { track: 0, laps: 3, diff: 1, color: 0, ibGuide: true, mode: 'speed', teamMode: false, volMaster: 80, volSfx: 100, volBgm: 70, muted: false } };
try {
  const s = JSON.parse(localStorage.getItem(SAVE_KEY));
  if (s) { save.best = s.best || {}; Object.assign(save.settings, s.settings || {}); }
} catch (e) { }
if (save.settings.sfx === false) save.settings.volSfx = 0;
if (save.settings.bgm === false) save.settings.volBgm = 0;
delete save.settings.sfx; delete save.settings.bgm;
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { } }

/* ---------- sound ---------- */
const Snd = {
  ctx: null, ok: false,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.bgm = ctx.createGain(); this.bgm.connect(this.master);
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    // engine
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), eg = ctx.createGain();
    o1.type = 'sawtooth'; o2.type = 'square'; lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 2;
    eg.gain.value = 0; o1.connect(lp); o2.connect(lp); lp.connect(eg); eg.connect(this.sfx);
    o1.start(); o2.start();
    this.eng = { o1, o2, lp, g: eg };
    // screech
    const ns = ctx.createBufferSource(); ns.buffer = buf; ns.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2300; bp.Q.value = 4;
    const sg = ctx.createGain(); sg.gain.value = 0; ns.connect(bp); bp.connect(sg); sg.connect(this.sfx); ns.start();
    this.scr = { g: sg, bp };
    // boost rumble
    const nb = ctx.createBufferSource(); nb.buffer = buf; nb.loop = true;
    const blp = ctx.createBiquadFilter(); blp.type = 'lowpass'; blp.frequency.value = 500;
    const bg = ctx.createGain(); bg.gain.value = 0; nb.connect(blp); blp.connect(bg); bg.connect(this.sfx); nb.start();
    this.rum = { g: bg };
    this.ok = true;
    this.applyVolume();
    this.bgmStep = 0; this.bgmNext = ctx.currentTime + 0.1; this.bgmOn = false;
  },
  applyVolume() {
    if (!this.ok) return;
    const st = save.settings, t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(st.muted ? 0 : st.volMaster / 100, t, 0.02);
    this.sfx.gain.setTargetAtTime(st.volSfx / 100, t, 0.02);
    this.bgm.gain.setTargetAtTime(st.volBgm / 100 * 0.6, t, 0.02);
  },
  previewBgm() {
    if (!this.ok) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.connect(g); g.connect(this.bgm); o.start(t); o.stop(t + 0.2);
    const b = ctx.createOscillator(), f = ctx.createBiquadFilter(), bg = ctx.createGain();
    b.type = 'sawtooth'; b.frequency.value = 110; f.type = 'lowpass'; f.frequency.value = 700;
    bg.gain.setValueAtTime(0.16, t); bg.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    b.connect(f); f.connect(bg); bg.connect(this.bgm); b.start(t); b.stop(t + 0.32);
  },
  set(param, v, tc) { if (this.ok) param.setTargetAtTime(v, this.ctx.currentTime, tc || 0.05); },
  tone(f, dur, type, vol, f2, delay) {
    if (!this.ok) return;
    const t = this.ctx.currentTime + (delay || 0);
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(vol || 0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + dur + 0.02);
  },
  burst(dur, freq, vol, type, f2) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.setValueAtTime(freq, t);
    if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfx); s.start(t); s.stop(t + dur + 0.02);
  },
  count() { this.tone(520, 0.25, 'square', 0.14); },
  tap() { this.burst(0.07, 2600, 0.12, 'bandpass'); },
  drag() { this.burst(0.3, 900, 0.14, 'bandpass', 2400); },
  jump() { this.tone(300, 0.35, 'triangle', 0.12, 700); this.burst(0.4, 600, 0.2, 'bandpass', 2000); },
  fall() { this.tone(700, 0.9, 'sawtooth', 0.08, 90); },
  go() { this.tone(1040, 0.6, 'square', 0.16); },
  boost() { this.burst(0.9, 300, 0.5, 'lowpass', 3000); this.tone(180, 0.5, 'sawtooth', 0.08, 420); },
  ib(perfect, combo) {
    const up = Math.min(4, (combo || 1) - 1) * 0.06;
    this.tone(700 * (1 + up), 0.18, 'square', 0.1, 1400 * (1 + up)); this.burst(0.35, 800, 0.25, 'bandpass', 3000);
    if (perfect) { this.tone(1568 * (1 + up), 0.12, 'square', 0.08, null, 0.06); this.tone(2093 * (1 + up), 0.22, 'square', 0.07, null, 0.13); }
  },
  item() { this.tone(880, 0.12, 'square', 0.1); this.tone(1320, 0.2, 'square', 0.1, null, 0.09); },
  wall(p) { const v = Math.min(1, p / 25); this.tone(110, 0.25, 'sine', 0.35 * v + 0.08, 50); this.burst(0.2, 900, 0.25 * v + 0.05); },
  lap() { this.tone(660, 0.14, 'square', 0.1); this.tone(990, 0.3, 'square', 0.1, null, 0.12); },
  finish() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.35, 'square', 0.1, null, i * 0.12)); },
  updateEngine(k, active) {
    if (!this.ok) return;
    const v = k ? Math.abs(k.v) : 0;
    const b = k && (k.boostT > 0 || k.ibT > 0 || k.startT > 0);
    const f = 48 + v * 2.1 + (b ? 18 : 0);
    this.set(this.eng.o1.frequency, f, 0.04); this.set(this.eng.o2.frequency, f * 0.5 + 1.5, 0.04);
    this.set(this.eng.lp.frequency, 500 + v * 30, 0.05);
    this.set(this.eng.g.gain, active ? 0.045 + Math.min(0.04, v / 1000) : 0, 0.08);
    const dr = active && k && k.drift >= 1 && v > 10;
    this.set(this.scr.g.gain, dr ? 0.05 + Math.abs(Math.sin(k.slip)) * 0.06 : 0, 0.04);
    this.set(this.rum.g.gain, active && b ? 0.22 : 0, 0.08);
  },
  /* simple original drum + bass loop */
  bgmTick() {
    if (!this.ok || !this.bgmOn) return;
    const ctx = this.ctx, spb = 60 / 132 / 4;
    const bass = [45, 0, 45, 45, 0, 45, 48, 0, 43, 0, 43, 43, 0, 43, 40, 0];
    while (this.bgmNext < ctx.currentTime + 0.2) {
      const st = this.bgmStep % 16, bar = Math.floor(this.bgmStep / 16) % 4, t = this.bgmNext;
      if (st % 4 === 0) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15); o.connect(g); g.connect(this.bgm); o.start(t); o.stop(t + 0.2); }
      if (st === 4 || st === 12) { const s = ctx.createBufferSource(); s.buffer = this.noise; const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1200; const g = ctx.createGain(); g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12); s.connect(f); f.connect(g); g.connect(this.bgm); s.start(t); s.stop(t + 0.15); }
      if (st % 2 === 1) { const s = ctx.createBufferSource(); s.buffer = this.noise; const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000; const g = ctx.createGain(); g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04); s.connect(f); f.connect(g); g.connect(this.bgm); s.start(t); s.stop(t + 0.06); }
      const n = bass[st];
      if (n) {
        const shift = bar === 3 ? 2 : 0;
        const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = 440 * Math.pow(2, (n + shift - 69) / 12);
        f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(200, t + 0.12);
        g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + spb * 0.95);
        o.connect(f); f.connect(g); g.connect(this.bgm); o.start(t); o.stop(t + spb);
      }
      this.bgmNext += spb; this.bgmStep++;
    }
  },
  startBgm() { if (!this.ok) return; this.bgmOn = true; this.bgmNext = this.ctx.currentTime + 0.05; this.bgmStep = 0; },
  stopBgm() { this.bgmOn = false; }
};

/* ---------- three setup ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: !IS_TOUCH, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, IS_TOUCH ? 1.5 : 2));
$('view').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 1600);
const hemi = new THREE.HemisphereLight(0xffffff, 0x667755, 0.8); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 0.7); sun.position.set(120, 220, 80); scene.add(sun);

function canvasTex(w, h, draw, rx, ry) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  if (rx) t.repeat.set(rx, ry);
  return t;
}
const rng0 = Core.mulberry32(7);
const TEX = {
  road: canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#4b4e53'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) { const v = 60 + rng0() * 40 | 0; g.fillStyle = `rgb(${v},${v + 2},${v + 5})`; g.fillRect(rng0() * w, rng0() * h, 1.5, 1.5); }
    g.fillStyle = '#f2f2f2'; g.fillRect(5, 0, 4, h); g.fillRect(w - 9, 0, 4, h);
    g.fillRect(w / 2 - 2, 0, 4, h * 0.45);
  }),
  curb: canvasTex(16, 64, (g, w, h) => { g.fillStyle = '#d8342b'; g.fillRect(0, 0, w, h / 2); g.fillStyle = '#f4f4f4'; g.fillRect(0, h / 2, w, h / 2); }),
  wall: canvasTex(128, 16, (g, w, h) => { g.fillStyle = '#f0f0f0'; g.fillRect(0, 0, w, h); g.fillStyle = '#2b2b2b'; g.fillRect(0, 0, w / 2, h); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, h - 3, w, 3); }),
  checker: canvasTex(64, 16, (g, w, h) => { for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 4, y * 4, 4, 4); } }),
  kick: canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#ffd400'; g.fillRect(0, 0, w, h); g.fillStyle = '#111'; for (let i = -4; i < 8; i++) { g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16 + 8, 0); g.lineTo(i * 16 + 8 + 32, h); g.lineTo(i * 16 + 32, h); g.closePath(); g.fill(); } }),
  pad: canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#ff7a00'; g.fillRect(0, 0, w, h); g.strokeStyle = '#fff3c4'; g.lineWidth = 9; g.lineJoin = 'miter'; for (const y of [18, 46]) { g.beginPath(); g.moveTo(8, y + 14); g.lineTo(w / 2, y - 6); g.lineTo(w - 8, y + 14); g.stroke(); } }),
  curbNeon: canvasTex(16, 64, (g, w, h) => { g.fillStyle = '#ff3df0'; g.fillRect(0, 0, w, h / 2); g.fillStyle = '#2fe8ff'; g.fillRect(0, h / 2, w, h / 2); }),
  lava: canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#ff5a1a'; g.fillRect(0, 0, w, h); const rr = Core.mulberry32(9); for (let i = 0; i < 40; i++) { g.fillStyle = rr() < 0.5 ? '#ffb02e' : '#c4280e'; g.beginPath(); g.arc(rr() * w, rr() * h, 3 + rr() * 12, 0, 7); g.fill(); } }),
  shadow: canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); })
};
TEX.checker.wrapS = TEX.checker.wrapT = THREE.ClampToEdgeWrapping;
TEX.shadow.wrapS = TEX.shadow.wrapT = THREE.ClampToEdgeWrapping;

const THEMES = {
  green: { sky: 0xbfe2f2, g1: '#5fa04a', g2: '#579844', tree: 0x2f7a3a, trunk: 0x6b4a2b, hill: 0x7aa08a, count: 260, decor: 'pine', hills: 'cone' },
  valley: { sky: 0xf0d9b5, g1: '#b59a5a', g2: '#ab8f50', tree: 0x5c7a35, trunk: 0x5a3d22, hill: 0xb88a5e, count: 160, decor: 'pine', hills: 'cone' },
  coast: { sky: 0x9fd8f5, g1: '#e6d39c', g2: '#dfcb92', tree: 0x3f9a4a, trunk: 0x8a6a42, hill: 0xd2c08f, count: 150, decor: 'palm', hills: 'cone', water: true },
  city: { sky: 0xcfd8e0, g1: '#8a8d92', g2: '#84878c', tree: 0, trunk: 0, hill: 0x9aa3ad, count: 150, decor: 'box', hills: 'tower' },
  canyon: { sky: 0xf2c7a0, g1: '#bf6d40', g2: '#b8673b', tree: 0xa5522e, trunk: 0, hill: 0x9c4a2a, count: 130, decor: 'rock', hills: 'mesa' },
  cherry: { sky: 0xd8ecfa, g1: '#a6dc8e', g2: '#9ed587', tree: 0xffb3cf, trunk: 0x7a4b3a, hill: 0xbfdcae, count: 230, decor: 'blossom', hills: 'cone' },
  jungle: { sky: 0xb4dcc4, g1: '#3f7d3a', g2: '#3a7535', tree: 0x2f6b2a, trunk: 0x5a3e25, hill: 0x4f8a5a, count: 240, decor: 'jungle', hills: 'cone', fog: [90, 430], gapFill: 0x3a9fd8, skirt: 0x5a4632, shoulder: 0x6b7a4a },
  dunes: { sky: 0xf7e3b5, g1: '#ecca8a', g2: '#e5c282', tree: 0x4f9a4a, trunk: 0, hill: 0xe2b874, count: 110, decor: 'cactus', hills: 'pyramid', shoulder: 0xe8d2a0, skirt: 0xd9b77a, gapFill: 0xd9a95e },
  icelake: { sky: 0xd6ecfb, g1: '#e3f3fc', g2: '#dbeefa', ice: true, tree: 0x8fd8ff, trunk: 0, hill: 0xf2f8fc, count: 150, decor: 'crystal', hills: 'cone', shoulder: 0xe8f4fb, road: 0xcfe6f2 },
  sunset: { sky: 0xffb48c, g1: '#f0cf95', g2: '#e9c88e', tree: 0x2f7a46, trunk: 0x6b4a2b, hill: 0xc98a7a, count: 140, decor: 'palm', hills: 'cone', water: 0x5b6fb0, sunC: 0xffc49a, hemiI: 0.72, gapFill: 0x5b6fb0, fog: [150, 600] },
  volcano: { sky: 0x3a1f1f, g1: '#3a3030', g2: '#342b2b', tree: 0x2a2222, trunk: 0, hill: 0x2c2222, count: 150, decor: 'lavarock', hills: 'volcano', fog: [80, 430], gapFill: 'lava', hemiI: 0.55, sunC: 0xff9a6a, sunI: 0.6, shoulder: 0x4a3c3a, skirt: 0x2c2424, road: 0xb8aaa8 },
  galaxy: { sky: 0x070a1c, g1: '#000', g2: '#000', noGround: true, tree: 0, trunk: 0, hill: 0, count: 0, decor: 'none', hills: 'none', space: true, fog: [500, 1500], hemiI: 0.75, hemiC: 0xb8c4ff, skirt: 0x2a2f55, skirtBottom: -70, shoulder: 0x3a3f6a, curb: 'neon' },
  neon: { sky: 0x0c0e22, g1: '#1d1f2c', g2: '#1a1c28', tree: 0, trunk: 0, hill: 0x161a2e, count: 150, decor: 'neon', hills: 'tower', fog: [120, 540], hemiI: 0.45, sunI: 0.35, curb: 'neon', lamps: true, shoulder: 0x2a2d3c },
  blizzard: { sky: 0xcfdde8, g1: '#f3f6f9', g2: '#e9eff4', tree: 0x2b5444, trunk: 0x4a3626, hill: 0xeef3f7, count: 320, decor: 'pine', snow: true, hills: 'cone', shoulder: 0xe4ebf1, skirt: 0xb9c6cf, fog: [110, 480] }
};

let world = null;
function disposeGroup(g) {
  g.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.map && !Object.values(TEX).includes(m.map)) m.map.dispose(); m.dispose(); }); }
  });
  if (g.parent) g.parent.remove(g);
}

const keepAll = () => true;
const TRACK_TINT = {"cherry": "#ff9ec4", "jungle": "#3fae5a", "dunes": "#f2c46b", "icelake": "#9fe3ff", "sunset": "#ff8a5c", "volcano": "#ff4a1a", "galaxy": "#9a7bff", "neon": "#ff3df0", "green": "#5bd46a", "valley": "#e8b84a", "coast": "#39b6ff", "city": "#a8b3c7", "canyon": "#ff7a45", "blizzard": "#bfe6ff"};
function ribbon(tr, latA, latB, y, vLen, mat, keep) {
  keep = keep || keepAll;
  const N = tr.N, pos = new Float32Array((N + 1) * 6), uv = new Float32Array((N + 1) * 4), nrm = new Float32Array((N + 1) * 6), idx = [];
  for (let i = 0; i <= N; i++) {
    const j = i % N, s = i * tr.ds, yy = tr.h[j] + y;
    pos.set([tr.px[j] + tr.nx[j] * latA, yy, tr.pz[j] + tr.nz[j] * latA, tr.px[j] + tr.nx[j] * latB, yy, tr.pz[j] + tr.nz[j] * latB], i * 6);
    uv.set([0, s / vLen, 1, s / vLen], i * 4);
    nrm.set([0, 1, 0, 0, 1, 0], i * 6);
    if (i < N && keep(j, (i + 1) % N)) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, b, d, c); }
  }
  if (tr.hasElev) { const g0 = new THREE.BufferGeometry(); g0.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g0.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g0.setIndex(idx); g0.computeVertexNormals(); return new THREE.Mesh(g0, mat); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return new THREE.Mesh(g, mat);
}
function wallMesh(tr, lat, h, uLen, mat, keep, bottom) {
  keep = keep || keepAll;
  const N = tr.N, pos = new Float32Array((N + 1) * 6), uv = new Float32Array((N + 1) * 4), idx = [];
  const left = lat > 0;
  for (let i = 0; i <= N; i++) {
    const j = i % N, s = i * tr.ds, x = tr.px[j] + tr.nx[j] * lat, z = tr.pz[j] + tr.nz[j] * lat;
    const y0 = bottom != null ? bottom : tr.h[j], y1 = bottom != null ? tr.h[j] : tr.h[j] + h;
    pos.set([x, y0, z, x, y1, z], i * 6);
    uv.set([s / uLen, 0, s / uLen, bottom != null ? Math.max(1, (y1 - y0) / 4) : 1], i * 4);
    if (i < N && keep(j, (i + 1) % N)) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; if (left) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

function buildWorld(ti) {
  if (world) disposeGroup(world.group);
  const tr = Core.getTrack(ti), th = THEMES[tr.def.id] || THEMES.green;
  const group = new THREE.Group();
  scene.background = new THREE.Color(th.sky);
  hemi.intensity = th.hemiI != null ? th.hemiI : 0.8; hemi.color.setHex(th.hemiC || 0xffffff); hemi.groundColor.setHex(th.space ? 0x202848 : 0x667755);
  sun.intensity = th.sunI != null ? th.sunI : 0.7; sun.color.setHex(th.sunC || 0xffffff);
  scene.fog = new THREE.Fog(th.sky, th.fog ? th.fog[0] : 160, th.fog ? th.fog[1] : 620);
  const grass = canvasTex(256, 256, (g, w, h) => {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? th.g1 : th.g2; g.fillRect(0, i * 32, w, 32); }
    const r = Core.mulberry32(3);
    if (th.ice) { g.strokeStyle = 'rgba(120,170,200,.35)'; g.lineWidth = 1.5; for (let i = 0; i < 14; i++) { g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 70; y += (r() - 0.5) * 70; g.lineTo(x, y); } g.stroke(); } }
    for (let i = 0; i < 1500; i++) { g.fillStyle = 'rgba(0,0,0,' + (r() * 0.08) + ')'; g.fillRect(r() * w, r() * h, 2, 2); }
  }, 60, 60);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < tr.N; i++) { minX = Math.min(minX, tr.px[i]); maxX = Math.max(maxX, tr.px[i]); minZ = Math.min(minZ, tr.pz[i]); maxZ = Math.max(maxZ, tr.pz[i]); }
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400, 40, 40), new THREE.MeshLambertMaterial({ map: grass }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(cx, -0.15, cz); if (!th.noGround) group.add(ground);

  const noGap = (a, b) => !tr.gapMask[a] && !tr.gapMask[b];
  const walled = (a, b) => noGap(a, b) && !tr.openMask[a] && !tr.openMask[b];
  const openOnly = (a, b) => noGap(a, b) && (tr.openMask[a] || tr.openMask[b]);
  group.add(ribbon(tr, tr.half, -tr.half, 0.02, 24, new THREE.MeshLambertMaterial({ map: TEX.road, color: th.road || 0xffffff }), noGap));
  const curbMat = th.curb === 'neon' ? new THREE.MeshBasicMaterial({ map: TEX.curbNeon }) : new THREE.MeshLambertMaterial({ map: TEX.curb });
  group.add(ribbon(tr, tr.curb, tr.half, 0.03, 4, curbMat, noGap));
  group.add(ribbon(tr, -tr.half, -tr.curb, 0.03, 4, curbMat, noGap));
  const shoulder = new THREE.MeshLambertMaterial({ color: th.shoulder || 0x8c8c86 });
  group.add(ribbon(tr, tr.wall, tr.curb, 0.025, 10, shoulder, noGap));
  group.add(ribbon(tr, -tr.curb, -tr.wall, 0.025, 10, shoulder, noGap));
  const wallMat = new THREE.MeshLambertMaterial({ map: TEX.wall, side: THREE.DoubleSide });
  group.add(wallMesh(tr, tr.wall, 1.0, 8, wallMat, walled));
  group.add(wallMesh(tr, -tr.wall, 1.0, 8, wallMat, walled));
  const capMat = new THREE.MeshLambertMaterial({ color: 0x222222, side: THREE.DoubleSide });
  group.add(ribbon(tr, tr.wall + 0.5, tr.wall, 1.0, 10, capMat, walled));
  group.add(ribbon(tr, -tr.wall, -tr.wall - 0.5, 1.0, 10, capMat, walled));
  for (const lat of [tr.wall + 0.5, -tr.wall - 0.5]) group.add(wallMesh(tr, lat, 1.0, 8, capMat, walled));
  if (tr.hasElev) {
    const skirtMat = new THREE.MeshLambertMaterial({ color: th.skirt || 0x9aa6ae, side: THREE.DoubleSide });
    group.add(ribbon(tr, tr.wall + 0.5, tr.wall, 0.025, 10, shoulder, openOnly));
    group.add(ribbon(tr, -tr.wall, -tr.wall - 0.5, 0.025, 10, shoulder, openOnly));
    for (const lat of [tr.wall + 0.5, -tr.wall - 0.5]) group.add(wallMesh(tr, lat, 0, 6, skirtMat, noGap, th.skirtBottom != null ? th.skirtBottom : -0.2));
    if (th.skirtBottom != null) group.add(ribbon(tr, -tr.wall - 0.5, tr.wall + 0.5, -0.6, 10, skirtMat, noGap));
    // broken-bridge faces at each gap
    for (const g of tr.gaps) for (const sEdge of [g.a, g.b]) {
      const i = Math.round(sEdge / tr.ds) % tr.N, hh = Core.heightAt(tr, sEdge) + 0.03, w = tr.wall + 0.5;
      const geo = new THREE.PlaneGeometry(w * 2, hh + 0.2);
      const face = new THREE.Mesh(geo, skirtMat);
      const p = Core.pointAt(tr, sEdge, 0);
      const fb = th.skirtBottom != null ? th.skirtBottom : -0.2;
      face.geometry.dispose(); face.geometry = new THREE.PlaneGeometry(w * 2, hh - fb);
      face.position.set(p.x, (hh + fb) / 2, p.z); face.rotation.y = tr.ang[i];
      group.add(face);
    }
    // ramp kickers (warning stripes) and boost pads (orange chevrons)
    const kickMat = new THREE.MeshLambertMaterial({ map: TEX.kick });
    for (const g of tr.gaps) {
      const a = g.lip - Core.C.KICK_LEN;
      group.add(ribbon(tr, tr.half, -tr.half, 0.04, 2, kickMat, (i) => i * tr.ds >= a && i * tr.ds < g.lip - tr.ds));
    }
    const padMat = new THREE.MeshLambertMaterial({ map: TEX.pad, emissive: 0x552200 });
    for (const pd of tr.pads) group.add(ribbon(tr, 4.5 * tr.ws, -4.5 * tr.ws, 0.04, 4, padMat, (i) => i * tr.ds >= pd.a && i * tr.ds < pd.b));
    // snow poles along open (wall-less) edges
    const polePts = [];
    for (let i = 0; i < tr.N; i += 9) if (tr.openMask[i]) for (const sg of [1, -1]) polePts.push([i, sg]);
    if (polePts.length) {
      const pg = new THREE.CylinderGeometry(0.12, 0.12, 1.8, 6); pg.translate(0, 0.9, 0);
      const poles = new THREE.InstancedMesh(pg, th.space ? new THREE.MeshBasicMaterial({ color: 0x2fe8ff }) : new THREE.MeshLambertMaterial({ color: 0xd8342b }), polePts.length);
      const m4p = new THREE.Matrix4();
      polePts.forEach(([i, sg], n) => { const lat = sg * (tr.wall + 0.25); m4p.makeTranslation(tr.px[i] + tr.nx[i] * lat, tr.h[i], tr.pz[i] + tr.nz[i] * lat); poles.setMatrixAt(n, m4p); });
      group.add(poles);
    }
  }

  // start line + gate
  const a0 = tr.ang[0], p0 = { x: tr.px[0], z: tr.pz[0] };
  const sl = new THREE.Mesh(new THREE.PlaneGeometry(tr.half * 2, 3), new THREE.MeshLambertMaterial({ map: TEX.checker }));
  sl.geometry.rotateX(-Math.PI / 2); sl.position.set(p0.x, tr.h[0] + 0.04, p0.z); sl.rotation.y = a0; group.add(sl);
  const gate = new THREE.Group(); gate.position.set(p0.x, tr.h[0], p0.z); gate.rotation.y = a0;
  const pm = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(1, 8, 1), pm); p.position.set(sx * (tr.wall + 1.5), 4, 0); gate.add(p); }
  const bannerTex = canvasTex(512, 64, (g, w, h) => {
    g.fillStyle = '#111'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffd400'; g.fillRect(0, h - 6, w, 6);
    g.font = 'italic 900 40px "Pretendard","Noto Sans KR",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#fff'; g.fillText('체커드   START   체커드', w / 2, h / 2 - 2);
  });
  bannerTex.wrapS = bannerTex.wrapT = THREE.ClampToEdgeWrapping;
  const bw = (tr.wall + 2) * 2;
  const bnMat = new THREE.MeshLambertMaterial({ map: bannerTex });
  const bn = new THREE.Mesh(new THREE.BoxGeometry(bw, 2.2, 0.6), [pm, pm, pm, pm, bnMat, bnMat]);
  bn.position.set(0, 8, 0); gate.add(bn); group.add(gate);

  // decor
  const r = Core.mulberry32(tr.def.seed);
  const waterX = th.water ? maxX + 70 : Infinity;
  if (th.water) {
    const wm = new THREE.Mesh(new THREE.PlaneGeometry(1600, 2400, 20, 30), new THREE.MeshLambertMaterial({ color: th.water === true ? 0x2f8fc9 : th.water }));
    wm.rotation.x = -Math.PI / 2; wm.position.set(waterX + 800, -0.05, cz); group.add(wm);
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(6, 2400), new THREE.MeshLambertMaterial({ color: 0xf2f7f9 }));
    foam.rotation.x = -Math.PI / 2; foam.position.set(waterX + 2, 0.0, cz); group.add(foam);
  }
  const pts = [];
  let tries = 0;
  while (pts.length < th.count && tries < 8000) {
    tries++;
    const x = minX - 140 + r() * (maxX - minX + 280), z = minZ - 140 + r() * (maxZ - minZ + 280);
    const bx = th.decor === 'box' || th.decor === 'neon', w = bx ? 10 + r() * 14 : 0, d = bx ? 10 + r() * 14 : 0;
    if (x + w > waterX - 10) continue;
    const pr = Core.project(tr, x, z, -1);
    if (Math.abs(pr.lat) < 20 + Math.max(w, d) * 0.75 + (th.decor === 'neon' ? 6 : 0)) continue;
    pts.push({ x, z, s: 0.8 + r() * 0.8, w, d, h: 12 + r() * r() * 55, rot: r() * Math.PI * 2, tilt: (r() - 0.5) * 0.3 });
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), eu = new THREE.Euler();
  const place = (mesh, i, p, sx, sy, sz, rx, ry, rz, y) => {
    eu.set(rx || 0, ry || 0, rz || 0); q.setFromEuler(eu); sc.set(sx, sy, sz); ps.set(p.x, y || 0, p.z);
    m4.compose(ps, q, sc); mesh.setMatrixAt(i, m4);
  };
  const lv = new THREE.Vector3();
  const placeLocal = (mesh, i, p, off, scl, k, tiltZ) => {
    lv.set(off[0] * k, off[1] * k, off[2] * k).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.rot);
    eu.set(0, p.rot, tiltZ || 0); q.setFromEuler(eu); sc.set(scl[0] * k, scl[1] * k, scl[2] * k); ps.set(p.x + lv.x, lv.y, p.z + lv.z);
    m4.compose(ps, q, sc); mesh.setMatrixAt(i, m4);
  };
  if (th.decor === 'pine') {
    const trunkG = new THREE.CylinderGeometry(0.35, 0.45, 2.4, 6); trunkG.translate(0, 1.2, 0);
    const leafG = new THREE.ConeGeometry(2.4, 6, 7); leafG.translate(0, 5, 0);
    const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshLambertMaterial({ color: th.trunk }), pts.length);
    const leaves = new THREE.InstancedMesh(leafG, new THREE.MeshLambertMaterial({ color: th.tree }), pts.length);
    pts.forEach((p, i) => { place(trunks, i, p, p.s, p.s, p.s); place(leaves, i, p, p.s, p.s, p.s); });
    group.add(trunks, leaves);
    if (th.snow) {
      const capG = new THREE.ConeGeometry(1.25, 3.1, 7); capG.translate(0, 6.5, 0);
      const caps = new THREE.InstancedMesh(capG, new THREE.MeshLambertMaterial({ color: 0xf7fafc }), pts.length);
      pts.forEach((p, i) => place(caps, i, p, p.s, p.s, p.s));
      group.add(caps);
    }
  } else if (th.decor === 'palm') {
    const trunkG = new THREE.CylinderGeometry(0.25, 0.4, 7, 6); trunkG.translate(0, 3.5, 0);
    const leafG = new THREE.ConeGeometry(3.2, 1.4, 6); leafG.translate(0, 7.2, 0);
    const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshLambertMaterial({ color: th.trunk }), pts.length);
    const leaves = new THREE.InstancedMesh(leafG, new THREE.MeshLambertMaterial({ color: th.tree }), pts.length);
    pts.forEach((p, i) => { place(trunks, i, p, p.s, p.s, p.s, p.tilt, p.rot, 0); place(leaves, i, p, p.s, p.s, p.s, p.tilt, p.rot, 0); });
    group.add(trunks, leaves);
  } else if (th.decor === 'box') {
    const bg = new THREE.BoxGeometry(1, 1, 1); bg.translate(0, 0.5, 0);
    const bm = new THREE.InstancedMesh(bg, new THREE.MeshLambertMaterial({ color: 0xffffff }), pts.length);
    const pal = [0xb9c0c8, 0x8f99a5, 0xd9d4ca, 0x6f7a86, 0xc9b9a3, 0xe8e8e8, 0x4f5a66];
    const col = new THREE.Color();
    pts.forEach((p, i) => { place(bm, i, p, p.w, p.h, p.d, 0, Math.round(p.rot / (Math.PI / 2)) * Math.PI / 2, 0); bm.setColorAt(i, col.setHex(pal[i % pal.length])); });
    group.add(bm);
    const winG = new THREE.BoxGeometry(1.02, 0.08, 1.02);
    const strips = new THREE.InstancedMesh(winG, new THREE.MeshLambertMaterial({ color: 0x2b3440 }), pts.length * 3);
    pts.forEach((p, i) => { for (let j = 0; j < 3; j++) place(strips, i * 3 + j, p, p.w, p.h, p.d, 0, Math.round(p.rot / (Math.PI / 2)) * Math.PI / 2, 0, p.h * (0.3 + j * 0.25)); });
    group.add(strips);
  } else if (th.decor === 'blossom') {
    const trunkG = new THREE.CylinderGeometry(0.3, 0.5, 3.2, 6); trunkG.translate(0, 1.6, 0);
    const blobG = new THREE.IcosahedronGeometry(1.6, 1);
    const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshLambertMaterial({ color: th.trunk }), pts.length);
    const blobs = new THREE.InstancedMesh(blobG, new THREE.MeshLambertMaterial({ color: 0xffffff }), pts.length * 3);
    const pinks = [0xffb3cf, 0xffc8dc, 0xff9cc2, 0xfff0f5], col = new THREE.Color();
    pts.forEach((p, i) => {
      place(trunks, i, p, p.s, p.s, p.s);
      for (let j = 0; j < 3; j++) {
        const a = p.rot + j * 2.1, k = p.s * (0.9 + 0.2 * j);
        placeLocal(blobs, i * 3 + j, p, [Math.cos(a) * 0.9, 3.6 + j * 0.5, Math.sin(a) * 0.9], [k, k * 0.85, k], p.s);
        blobs.setColorAt(i * 3 + j, col.setHex(pinks[(i + j) % pinks.length]));
      }
    });
    group.add(trunks, blobs);
    const petals = [];
    for (let i = 0; i < 400; i++) { const p = pts[i % pts.length]; petals.push(p.x + (r() - 0.5) * 9, 0.05, p.z + (r() - 0.5) * 9); }
    for (let i = 0; i < 1400; i++) { const sx = minX - 60 + r() * (maxX - minX + 120), sz = minZ - 60 + r() * (maxZ - minZ + 120); const pr = Core.project(tr, sx, sz, -1); if (Math.abs(pr.lat) > tr.wall + 1) petals.push(sx, 0.05, sz); }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(petals, 3));
    group.add(new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xffc2d8, size: 0.5 })));
  } else if (th.decor === 'jungle') {
    const trunkG = new THREE.CylinderGeometry(0.4, 0.7, 8, 7); trunkG.translate(0, 4, 0);
    const blobG = new THREE.IcosahedronGeometry(2.6, 1);
    const fernG = new THREE.ConeGeometry(1.6, 1.4, 6); fernG.translate(0, 0.7, 0);
    const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshLambertMaterial({ color: th.trunk }), pts.length);
    const blobs = new THREE.InstancedMesh(blobG, new THREE.MeshLambertMaterial({ color: 0xffffff }), pts.length * 2);
    const ferns = new THREE.InstancedMesh(fernG, new THREE.MeshLambertMaterial({ color: 0x4f9a3a }), pts.length);
    const greens = [0x2f6b2a, 0x3c7f2e, 0x285e2a, 0x4a8a34], col = new THREE.Color();
    pts.forEach((p, i) => {
      place(trunks, i, p, p.s, p.s * 1.1, p.s);
      for (let j = 0; j < 2; j++) { const a = p.rot + j * 3; placeLocal(blobs, i * 2 + j, p, [Math.cos(a) * 1.4, 8.4 + j * 1.2, Math.sin(a) * 1.4], [1, 0.75, 1], p.s); blobs.setColorAt(i * 2 + j, col.setHex(greens[(i + j) % 4])); }
      placeLocal(ferns, i, p, [2.5, 0, 1.5], [1, 1, 1], p.s);
    });
    group.add(trunks, blobs, ferns);
  } else if (th.decor === 'cactus') {
    const bodyG = new THREE.CylinderGeometry(0.55, 0.6, 5, 8); bodyG.translate(0, 2.5, 0);
    const armG = new THREE.CylinderGeometry(0.38, 0.38, 2.2, 8); armG.translate(0, 1.1, 0);
    const linkG = new THREE.CylinderGeometry(0.35, 0.35, 1.1, 8); linkG.rotateZ(Math.PI / 2);
    const cm = new THREE.MeshLambertMaterial({ color: th.tree });
    const bodies = new THREE.InstancedMesh(bodyG, cm, pts.length), arms = new THREE.InstancedMesh(armG, cm, pts.length * 2), links = new THREE.InstancedMesh(linkG, cm, pts.length * 2);
    pts.forEach((p, i) => {
      place(bodies, i, p, p.s, p.s, p.s, 0, p.rot, 0);
      placeLocal(arms, i * 2, p, [1.05, 2.0, 0], [1, 1, 1], p.s); placeLocal(links, i * 2, p, [0.55, 2.0, 0], [1, 1, 1], p.s);
      placeLocal(arms, i * 2 + 1, p, [-1.05, 2.8, 0], [1, 0.8, 1], p.s); placeLocal(links, i * 2 + 1, p, [-0.55, 2.8, 0], [1, 1, 1], p.s);
    });
    group.add(bodies, arms, links);
    const rg = new THREE.DodecahedronGeometry(1, 0);
    const rocks = new THREE.InstancedMesh(rg, new THREE.MeshLambertMaterial({ color: 0xc89a5c }), pts.length);
    pts.forEach((p, i) => placeLocal(rocks, i, p, [3, 0.3, -2], [1.2, 0.7, 1], p.s));
    group.add(rocks);
  } else if (th.decor === 'crystal') {
    const cg = new THREE.OctahedronGeometry(1, 0); cg.scale(0.7, 2.4, 0.7); cg.translate(0, 1.8, 0);
    const cm = new THREE.MeshLambertMaterial({ color: th.tree, emissive: 0x1a4a66, transparent: true, opacity: 0.88 });
    const cr = new THREE.InstancedMesh(cg, cm, pts.length * 3);
    pts.forEach((p, i) => { for (let j = 0; j < 3; j++) { const a = p.rot + j * 2.1, k = (1.4 - j * 0.3) * p.s; placeLocal(cr, i * 3 + j, p, [Math.cos(a) * 1.2 * j, 0, Math.sin(a) * 1.2 * j], [k, k, k], 1, (j - 1) * 0.3); } });
    group.add(cr);
    const sg = new THREE.SphereGeometry(1, 10, 8);
    const snow = new THREE.InstancedMesh(sg, new THREE.MeshLambertMaterial({ color: 0xffffff }), 60);
    for (let i = 0; i < 60; i++) { const p = pts[(i * 7) % pts.length]; placeLocal(snow, i, p, [4, 0, 3], [3, 1.1, 3], p.s); }
    group.add(snow);
  } else if (th.decor === 'lavarock') {
    const rg = new THREE.DodecahedronGeometry(1, 0); rg.translate(0, 0.6, 0);
    const rm = new THREE.InstancedMesh(rg, new THREE.MeshLambertMaterial({ color: 0x2a2222 }), pts.length);
    pts.forEach((p, i) => { const k = 2 + p.s * 3; place(rm, i, p, k * (0.8 + p.tilt), k * (1 + p.h / 30), k, p.tilt, p.rot, p.tilt); });
    group.add(rm);
    const lavaM = new THREE.MeshBasicMaterial({ map: TEX.lava });
    for (let i = 0; i < 26; i++) {
      const p = pts[(i * 5) % pts.length], rr = 6 + r() * 12;
      const pool = new THREE.Mesh(new THREE.CircleGeometry(rr, 18), lavaM);
      pool.rotation.x = -Math.PI / 2; pool.position.set(p.x + 5, 0.03, p.z + 4); group.add(pool);
    }
  } else if (th.decor === 'neon') {
    const bg = new THREE.BoxGeometry(1, 1, 1); bg.translate(0, 0.5, 0);
    const bm = new THREE.InstancedMesh(bg, new THREE.MeshLambertMaterial({ color: 0x1a1d33 }), pts.length);
    const winG = new THREE.BoxGeometry(1.03, 0.06, 1.03);
    const strips = new THREE.InstancedMesh(winG, new THREE.MeshBasicMaterial({ color: 0xffffff }), pts.length * 4);
    const neon = [0xff3df0, 0x2fe8ff, 0xa35bff, 0xffd400, 0x3dff9a], col = new THREE.Color();
    pts.forEach((p, i) => {
      const h = p.h * 1.4 + 10, ry = Math.round(p.rot / (Math.PI / 2)) * Math.PI / 2;
      place(bm, i, p, p.w, h, p.d, 0, ry, 0);
      for (let j = 0; j < 4; j++) { place(strips, i * 4 + j, p, p.w, h, p.d, 0, ry, 0, h * (0.2 + j * 0.2)); strips.setColorAt(i * 4 + j, col.setHex(neon[(i + (j > 1 ? 1 : 0)) % neon.length])); }
    });
    group.add(bm, strips);
  } else if (th.decor === 'rock') {
    const rg = new THREE.DodecahedronGeometry(1, 0); rg.translate(0, 0.6, 0);
    const rm = new THREE.InstancedMesh(rg, new THREE.MeshLambertMaterial({ color: th.tree }), pts.length);
    pts.forEach((p, i) => { const k = 2 + p.s * 3; place(rm, i, p, k * (0.8 + p.tilt), k * (1 + p.h / 30), k, p.tilt, p.rot, p.tilt); });
    group.add(rm);
  }
  // fills under jump gaps (lava / river / sand)
  if (th.gapFill != null) for (const gp of tr.gaps) {
    const mid = (gp.a + gp.b) / 2, i = Math.round(mid / tr.ds) % tr.N, p = Core.pointAt(tr, mid, 0);
    const mat = gp && th.gapFill === 'lava' ? new THREE.MeshBasicMaterial({ map: TEX.lava }) : new THREE.MeshLambertMaterial({ color: th.gapFill });
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(tr.wall * 2 + 40, gp.b - gp.a - 1), mat);
    pl.rotation.x = -Math.PI / 2; pl.rotation.z = -tr.ang[i]; pl.position.set(p.x, 0.02, p.z); group.add(pl);
  }
  // street lamps
  if (th.lamps) {
    const lp = [];
    for (let i = 0; i < tr.N; i += 36) if (!tr.gapMask[i]) for (const sg of [1, -1]) lp.push([i, sg]);
    const poleG = new THREE.CylinderGeometry(0.15, 0.2, 6, 6); poleG.translate(0, 3, 0);
    const headG = new THREE.BoxGeometry(0.5, 0.35, 1.6);
    const poles = new THREE.InstancedMesh(poleG, new THREE.MeshLambertMaterial({ color: 0x2a2d3c }), lp.length);
    const heads = new THREE.InstancedMesh(headG, new THREE.MeshBasicMaterial({ color: 0xfff2c4 }), lp.length);
    lp.forEach(([i, sg], n) => {
      const lat = sg * (tr.wall + 1.2), p = { x: tr.px[i] + tr.nx[i] * lat, z: tr.pz[i] + tr.nz[i] * lat };
      place(poles, n, p, 1, 1, 1, 0, 0, 0, tr.h[i]);
      const hp = { x: tr.px[i] + tr.nx[i] * (lat - sg * 1.2), z: tr.pz[i] + tr.nz[i] * (lat - sg * 1.2) };
      place(heads, n, hp, 1, 1, 1, 0, tr.ang[i], 0, tr.h[i] + 6);
    });
    group.add(poles, heads);
  }
  // space: stars + planets
  if (th.space) {
    const sp = [];
    for (let i = 0; i < 2200; i++) { const u = r() * 2 - 1, a = r() * Math.PI * 2, rr = 1100; sp.push(cx + Math.sqrt(1 - u * u) * Math.cos(a) * rr, u * rr * 0.9 + 60, cz + Math.sqrt(1 - u * u) * Math.sin(a) * rr); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    group.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false })));
    const planet = (x, y, z, rad, c, ring) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(rad, 28, 20), new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.25, fog: false }));
      m.position.set(x, y, z); group.add(m);
      if (ring) { const rg = new THREE.Mesh(new THREE.RingGeometry(rad * 1.4, rad * 2.1, 48), new THREE.MeshBasicMaterial({ color: ring, side: THREE.DoubleSide, transparent: true, opacity: 0.6, fog: false })); rg.position.copy(m.position); rg.rotation.x = 1.2; rg.rotation.y = 0.3; group.add(rg); }
    };
    planet(cx + 520, 260, cz - 380, 90, 0x7b5cff, 0xc7b8ff);
    planet(cx - 600, 140, cz + 300, 45, 0xff7a6b);
    planet(cx - 200, 420, cz - 700, 160, 0x3a8fd8);
    const deep = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshBasicMaterial({ color: 0x0a0f2a, fog: false }));
    deep.rotation.x = -Math.PI / 2; deep.position.set(cx, -260, cz); group.add(deep);
  }
  // horizon
  const hillMat = new THREE.MeshLambertMaterial({ color: th.hill });
  const rad = Math.max(maxX - minX, maxZ - minZ) / 2 + 300;
  for (let i = 0; i < (th.hills === 'none' ? 0 : 26); i++) {
    const a = i / 26 * Math.PI * 2 + r() * 0.2;
    const hx = cx + Math.cos(a) * (rad + r() * 60), hz = cz + Math.sin(a) * (rad + r() * 60);
    if (hx > waterX + 100) continue;
    let m, hh;
    if (th.hills === 'tower') {
      hh = 60 + r() * 140; const w = 25 + r() * 30;
      m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, w), hillMat);
    } else if (th.hills === 'pyramid') {
      hh = 50 + r() * 80;
      m = new THREE.Mesh(new THREE.ConeGeometry(hh * 0.9, hh, 4), hillMat);
    } else if (th.hills === 'volcano') {
      hh = 70 + r() * 90;
      m = new THREE.Mesh(new THREE.CylinderGeometry(hh * 0.12, hh * 0.8, hh, 7), hillMat);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(hh * 0.1, hh * 0.13, 4, 7), new THREE.MeshBasicMaterial({ color: 0xff5a1a, fog: false }));
      top.position.y = hh / 2; m.add(top);
    } else if (th.hills === 'mesa') {
      hh = 50 + r() * 60;
      m = new THREE.Mesh(new THREE.CylinderGeometry(35 + r() * 30, 60 + r() * 40, hh, 6), hillMat);
    } else {
      hh = 40 + r() * 70;
      m = new THREE.Mesh(new THREE.ConeGeometry(60 + r() * 50, hh, 5), hillMat);
    }
    m.position.set(hx, hh / 2 - 2, hz);
    m.rotation.y = r() * 3; group.add(m);
  }
  scene.add(group);
  world = { group, tr, ti, bounds: { minX, maxX, minZ, maxZ } };
  buildMiniBase();
}

/* ---------- karts ---------- */
const kartViews = [];
function paintMat(color, skin) {
  const cid = skin && skin.color != null ? skin.color : null;
  const cd = cid != null && window.Profile ? Profile.colors[cid] : null;
  const m = new THREE.MeshLambertMaterial({ color: cd ? cd.hex : color });
  if (cd && cd.emissive) m.emissive = new THREE.Color(cd.emissive);
  return m;
}
function makeKartMesh(color, name, parent, team, skin) {
  skin = skin || {};
  const bodyId = skin.body || 'std', wheelId = skin.wheel || 'std', helmId = skin.helmet || 'std';
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const mat = paintMat(color, skin);
  const dark = new THREE.MeshLambertMaterial({ color: 0x1e1e1e });
  const light = new THREE.MeshLambertMaterial({ color: 0xeeeeee });
  const chrome = new THREE.MeshLambertMaterial({ color: 0xcfd6dd, emissive: 0x30363c });
  const glow = new THREE.MeshBasicMaterial({ color: 0x3fe8ff });
  const add = (geo, m, x, y, z, rx, ry, rz) => { const b = new THREE.Mesh(geo, m); b.position.set(x, y, z); if (rx || ry || rz) b.rotation.set(rx || 0, ry || 0, rz || 0); body.add(b); return b; };
  const box = (w, h, d, m, x, y, z) => add(new THREE.BoxGeometry(w, h, d), m, x, y, z);
  const cyl = (rt, rb, h, m, x, y, z, rx, ry, rz, seg) => add(new THREE.CylinderGeometry(rt, rb, h, seg || 14), m, x, y, z, rx, ry, rz);
  const seat = () => { box(1.1, 0.85, 0.22, dark, 0, 1.0, -0.85); box(1.4, 0.5, 0.65, dark, 0, 0.65, -1.5); };
  const rearWing = (w, y, z, m) => { box(w, 0.12, 0.5, m || mat, 0, y, z); box(0.12, y - 0.7, 0.12, dark, w * 0.33, (y + 0.7) / 2, z); box(0.12, y - 0.7, 0.12, dark, -w * 0.33, (y + 0.7) / 2, z); };
  // ----- body shapes (cosmetic only, same footprint) -----
  if (bodyId === 'classic') {
    cyl(0.62, 0.7, 3.4, mat, 0, 0.55, 0.1, Math.PI / 2, 0, 0, 18);
    add(new THREE.SphereGeometry(0.62, 16, 12), mat, 0, 0.55, 1.8).scale.set(1, 1, 0.7);
    for (const sx of [1, -1]) cyl(0.26, 0.26, 1.9, mat, sx * 1.05, 0.5, 0.0, Math.PI / 2);
    cyl(0.08, 0.08, 2.3, chrome, 0, 0.36, 2.25, 0, 0, Math.PI / 2);
    seat(); box(1.6, 0.1, 0.4, chrome, 0, 1.15, -1.75);
  } else if (bodyId === 'rocket') {
    box(1.6, 0.34, 2.6, mat, 0, 0.47, -0.2);
    add(new THREE.ConeGeometry(0.62, 2.0, 16), mat, 0, 0.5, 1.95, Math.PI / 2, 0, 0);
    for (const sx of [1, -1]) box(0.34, 0.3, 1.9, mat, sx * 1.05, 0.46, -0.1);
    seat();
    for (const sx of [0.78, -0.78]) box(0.1, 0.75, 0.8, mat, sx, 1.05, -1.85);
    box(1.9, 0.1, 0.45, dark, 0, 0.9, -1.95);
    cyl(0.18, 0.24, 0.5, chrome, 0.4, 0.62, -2.05, Math.PI / 2); cyl(0.18, 0.24, 0.5, chrome, -0.4, 0.62, -2.05, Math.PI / 2);
  } else if (bodyId === 'buggy') {
    box(1.7, 0.3, 3.0, mat, 0, 0.55, 0);
    box(1.9, 0.16, 0.5, dark, 0, 0.5, 1.75);
    seat();
    const bar = (x1, y1, z1, x2, y2, z2) => { const a = new THREE.Vector3(x1, y1, z1), b = new THREE.Vector3(x2, y2, z2), d = b.clone().sub(a);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, d.length(), 6), chrome); m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); body.add(m); };
    for (const sx of [0.75, -0.75]) { bar(sx, 0.7, 0.3, sx, 2.15, -0.2); bar(sx, 2.15, -0.2, sx, 2.15, -1.1); bar(sx, 2.15, -1.1, sx, 0.7, -1.6); }
    bar(0.75, 2.15, -0.2, -0.75, 2.15, -0.2); bar(0.75, 2.15, -1.1, -0.75, 2.15, -1.1);
    box(1.2, 0.3, 0.3, dark, 0, 0.75, 2.05);
  } else if (bodyId === 'wedge' || bodyId === 'proto') {
    const sh = new THREE.Shape(); sh.moveTo(-1.95, 0); sh.lineTo(2.45, 0); sh.lineTo(2.45, 0.12); sh.lineTo(-1.2, 0.62); sh.lineTo(-1.95, 0.62); sh.closePath();
    const eg = new THREE.ExtrudeGeometry(sh, { depth: 2.0, bevelEnabled: false }); eg.translate(0, 0, -1.0); eg.rotateY(-Math.PI / 2);
    add(eg, mat, 0, 0.28, 0);
    seat();
    rearWing(2.3, 1.25, -1.85, bodyId === 'proto' ? dark : mat);
    if (bodyId === 'proto') { for (const sx of [0.55, -0.55]) box(0.08, 0.04, 3.4, glow, sx, 0.71, 0.4).rotation.x = 0.137; box(2.2, 0.05, 0.08, glow, 0, 1.33, -1.6); }
  } else {
    box(1.9, 0.32, 3.1, mat, 0, 0.45, 0);
    box(1.5, 0.28, 0.9, mat, 0, 0.45, 1.85);
    box(2.2, 0.22, 0.3, dark, 0, 0.36, 2.3);
    box(0.42, 0.36, 1.7, mat, 1.12, 0.47, 0.05);
    box(0.42, 0.36, 1.7, mat, -1.12, 0.47, 0.05);
    seat();
    rearWing(2.1, 1.2, -1.75);
  }
  // ----- driver + helmet -----
  box(0.75, 0.7, 0.5, light, 0, 1.05, -0.45);
  const hx = 0, hy = 1.72, hz = -0.4;
  add(new THREE.SphereGeometry(0.42, 14, 10), mat, hx, hy, hz);
  if (helmId === 'visor') {
    add(new THREE.CylinderGeometry(0.44, 0.44, 0.34, 16, 1, true, -Math.PI * 0.45, Math.PI * 0.9), new THREE.MeshLambertMaterial({ color: 0x1a2430, emissive: 0x0a1018, side: THREE.DoubleSide }), hx, hy + 0.02, hz);
    box(0.06, 0.16, 0.5, mat, 0, hy + 0.42, hz);
  } else {
    box(0.6, 0.2, 0.1, dark, hx, hy + 0.03, hz + 0.38);
  }
  if (helmId === 'cat') for (const sx of [1, -1]) { add(new THREE.ConeGeometry(0.16, 0.32, 4), mat, sx * 0.24, hy + 0.42, hz, 0, Math.PI / 4, -sx * 0.35); add(new THREE.ConeGeometry(0.08, 0.18, 4), light, sx * 0.24, hy + 0.4, hz + 0.05, 0, Math.PI / 4, -sx * 0.35); }
  if (helmId === 'horn') for (const sx of [1, -1]) { add(new THREE.ConeGeometry(0.1, 0.5, 8), light, sx * 0.33, hy + 0.38, hz + 0.05, 0.3, 0, -sx * 0.6); }
  if (helmId === 'wing') for (const sx of [1, -1]) { const w = add(new THREE.PlaneGeometry(0.55, 0.3), new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }), sx * 0.55, hy + 0.12, hz - 0.08, 0, Math.PI / 2, sx * 0.4); w.scale.set(1, 1, 1); }
  if (helmId === 'crown') {
    const gold = new THREE.MeshLambertMaterial({ color: 0xf2c230, emissive: 0x6a4a00 });
    cyl(0.3, 0.3, 0.16, gold, hx, hy + 0.44, hz, 0, 0, 0, 12);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; add(new THREE.ConeGeometry(0.07, 0.2, 5), gold, hx + Math.cos(a) * 0.26, hy + 0.6, hz + Math.sin(a) * 0.26); }
  }
  const sw = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.05, 6, 12), dark); sw.position.set(0, 1.05, 0.35); sw.rotation.x = -0.9; body.add(sw);
  // ----- wheels -----
  const wheels = [];
  const wScale = bodyId === 'buggy' ? 1.15 : 1;
  const wWide = wheelId === 'slick' ? 1.45 : 1;
  const wG = new THREE.CylinderGeometry(0.42 * wScale, 0.42 * wScale, 0.38 * wWide, 16); wG.rotateZ(Math.PI / 2);
  const wGr = new THREE.CylinderGeometry(0.5 * wScale, 0.5 * wScale, 0.46 * wWide, 16); wGr.rotateZ(Math.PI / 2);
  const hubM = wheelId === 'gold' ? new THREE.MeshLambertMaterial({ color: 0xf2c230, emissive: 0x6a4a00 }) : wheelId === 'neon' ? glow : wheelId === 'star' ? chrome : new THREE.MeshLambertMaterial({ color: 0x999999 });
  const mkWheel = (geo, x, y, z, front, r) => {
    const piv = new THREE.Group(); piv.position.set(x, y * wScale, z); g.add(piv);
    const w = new THREE.Mesh(geo, dark); piv.add(w);
    const side = Math.sign(x), wd = (front ? 0.38 : 0.46) * wWide;
    if (wheelId === 'star') {
      for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.06, r * 1.5, 0.12), hubM); sp.rotation.x = i / 5 * Math.PI; sp.position.x = side * (wd / 2 + 0.01); w.add(sp); }
    } else if (wheelId === 'neon' || wheelId === 'gold') {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.72, 0.05, 6, 18), hubM); rim.rotation.y = Math.PI / 2; rim.position.x = side * (wd / 2 + 0.01); w.add(rim);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.3, r * 0.3, 0.04, 12), hubM); disc.rotation.z = Math.PI / 2; disc.position.x = side * (wd / 2 + 0.02); w.add(disc);
    } else if (wheelId === 'slick') {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.04, 14), new THREE.MeshLambertMaterial({ color: 0xbfc5cc })); disc.rotation.z = Math.PI / 2; disc.position.x = side * (wd / 2 + 0.01); w.add(disc);
    } else {
      const hub = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.18), hubM); w.add(hub);
    }
    wheels.push({ piv, w, front });
  };
  mkWheel(wG, 1.18, 0.42, 1.2, true, 0.42 * wScale); mkWheel(wG, -1.18, 0.42, 1.2, true, 0.42 * wScale);
  mkWheel(wGr, 1.24, 0.5, -1.15, false, 0.5 * wScale); mkWheel(wGr, -1.24, 0.5, -1.15, false, 0.5 * wScale);
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(3, 4.2), new THREE.MeshBasicMaterial({ map: TEX.shadow, transparent: true, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.05; g.add(sh); const shadow = sh;
  const flame = new THREE.Group();
  const fo = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.6, 8), new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  fo.geometry.rotateX(-Math.PI / 2); fo.geometry.translate(0, 0, -0.8);
  const fi = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.0, 8), new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
  fi.geometry.rotateX(-Math.PI / 2); fi.geometry.translate(0, 0, -0.5);
  for (const sx of [0.4, -0.4]) { const a = fo.clone(), b = fi.clone(); a.position.set(sx, 0.65, -1.85); b.position.set(sx, 0.65, -1.85); flame.add(a, b); }
  flame.visible = false; body.add(flame);
  const flameMats = [fo.material, fi.material];
  let tag = null;
  if (name) {
    const tt = canvasTex(256, 64, (c, w, h) => {
      c.font = '800 34px "Pretendard","Noto Sans KR",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 6; c.strokeStyle = 'rgba(0,0,0,.8)'; c.strokeText(name, w / 2, h / 2); c.fillStyle = team != null ? TEAM_CSS[team] : '#fff'; c.fillText(name, w / 2, h / 2);
    });
    tt.wrapS = tt.wrapT = THREE.ClampToEdgeWrapping;
    tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tt, depthWrite: false, transparent: true }));
    tag.scale.set(4, 1, 1); tag.position.set(0, 3.0, 0); g.add(tag);
  }
  if (team != null) {
    const fm = new THREE.MeshBasicMaterial({ color: TEAM_COL[team], side: THREE.DoubleSide });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), dark); pole.position.set(0.75, 1.75, -1.75); body.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), fm); flag.position.set(0.75, 2.3, -2.15); flag.rotation.y = Math.PI / 2; body.add(flag);
  }
  (parent || scene).add(g);
  return { g, body, wheels, flame, flameMats, flameMode: '', tag, spin: 0, shadow };
}
function clearKarts() {
  while (kartViews.length) disposeGroup(kartViews.pop().g);
  if (ghostView) { disposeGroup(ghostView.g); ghostView = null; }
  if (typeof NET !== 'undefined') for (const px of NET.proxies.values()) if (px.view) { disposeGroup(px.view.g); px.view = null; }
}

/* ---------- ghost (time attack) ---------- */
let ghost = null, ghostView = null;
const gs = {};
const ghostKey = (ti, laps) => 'racing_ghost_' + Core.TRACK_DEFS[ti].id + '_' + laps;
function loadGhost(ti, laps) {
  try {
    const g = JSON.parse(localStorage.getItem(ghostKey(ti, laps)));
    if (g && g.data && g.data.length && !(Core.getTrack(ti).hasElev && (g.stride || 7) !== Core.GHOST_STRIDE)) return Core.prepGhost(g);
  } catch (e) { }
  return null;
}
function storeGhost(ti, laps, g) {
  try { localStorage.setItem(ghostKey(ti, laps), JSON.stringify({ time: g.time, lapTimes: g.lapTimes, data: g.data, color: g.color, skin: g.skin, stride: Core.GHOST_STRIDE })); return true; }
  catch (e) { return false; }
}
const defGhosts = {};
function defaultGhost(ti, laps, diff) {
  const k = ti + '_' + laps + '_' + diff;
  return defGhosts[k] || (defGhosts[k] = Core.makeDefaultGhost(ti, laps, diff));
}
function pickGhost(ti, laps, diff) {
  const mine = loadGhost(ti, laps), def = defaultGhost(ti, laps, diff);
  const g = mine && mine.time <= def.time ? mine : def;
  return { g, mine };
}
function makeGhostMesh(color, skin, label) {
  const v = makeKartMesh(color, label || '고스트', null, null, skin);
  v.g.traverse(o => {
    if (!o.material) return;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
      if (m.blending === THREE.AdditiveBlending) return;
      m.transparent = true; m.depthWrite = false;
      m.opacity = o.isSprite ? 0.7 : Math.min(m.opacity, 0.36);
    });
  });
  return v;
}
function syncGhost(dt) {
  if (!ghost || !ghostView || !race) return;
  const t = race.state === 'countdown' ? 0 : race.time;
  Core.ghostAt(ghost, t, gs);
  const v = ghostView;
  v.g.visible = t < (ghost.n - 1) * Core.GHOST_DT + 1.5;
  v.g.position.set(gs.x, gs.y || 0, gs.z);
  v.g.rotation.y = gs.th;
  v.body.rotation.z = Core.clamp(-gs.slip * 0.22, -0.18, 0.18);
  const moved = v.lastD == null ? 0 : gs.dist - v.lastD; v.lastD = gs.dist;
  v.spin += moved / 0.45;
  for (const w of v.wheels) { w.w.rotation.x = v.spin; if (w.front) w.piv.rotation.y = -gs.steer * 0.45; }
  const b = (gs.flags & 3) !== 0 && !gs.done && race.state !== 'countdown';
  v.flame.visible = b;
  if (b) {
    const ibOnly = (gs.flags & 1) === 0;
    v.flameMats[0].color.setHex(ibOnly ? 0x2fb8ff : 0xff7a1a);
    v.flameMats[1].color.setHex(ibOnly ? 0xe6fbff : 0xfff2a0);
    v.flame.scale.set(1, 1, (ibOnly ? 0.65 : 1) * (0.85 + Math.random() * 0.35));
  }
}
function ghostCum(n) { let s = 0; for (let i = 0; i < n && i < ghost.lapTimes.length; i++) s += ghost.lapTimes[i]; return s; }
function fmtDelta(d) { return (d < 0 ? '-' : '+') + Math.abs(d).toFixed(3); }

/* ---------- skid marks ---------- */
const SKID_MAX = 3000;
const skid = (() => {
  const pos = new Float32Array(SKID_MAX * 6 * 3);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.frustumCulled = false; scene.add(m);
  return { pos, g, m, n: 0 };
})();
function skidReset() { skid.pos.fill(0); skid.g.attributes.position.needsUpdate = true; skid.n = 0; }
function skidQuad(a, b, c, d, y0) {
  const o = (skid.n % SKID_MAX) * 18, y = (y0 || 0) + 0.045, p = skid.pos;
  p.set([a[0], y, a[1], b[0], y, b[1], c[0], y, c[1], b[0], y, b[1], d[0], y, d[1], c[0], y, c[1]], o);
  skid.n++; skid.dirty = true;
}

/* ---------- particles ---------- */
const PMAX = 700;
const parts = (() => {
  const pos = new Float32Array(PMAX * 3), col = new Float32Array(PMAX * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.35, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.frustumCulled = false; scene.add(m);
  const P = []; for (let i = 0; i < PMAX; i++) P.push({ life: 0, x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1 });
  return { pos, col, g, P, i: 0 };
})();
function spawn(x, y, z, vx, vy, vz, life, r, g, b) {
  const p = parts.P[parts.i]; parts.i = (parts.i + 1) % PMAX;
  Object.assign(p, { x, y, z, vx, vy, vz, life, max: life, r, g, b, floor: y - 0.15 });
}
function updateParts(dt) {
  const pos = parts.pos, col = parts.col;
  for (let i = 0; i < PMAX; i++) {
    const p = parts.P[i];
    if (p.life > 0) {
      p.life -= dt; p.vy -= 9 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < p.floor) { p.y = p.floor; p.vy *= -0.3; }
      const f = Math.max(0, p.life / p.max);
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      col[i * 3] = p.r * f; col[i * 3 + 1] = p.g * f; col[i * 3 + 2] = p.b * f;
    } else { pos[i * 3 + 1] = -99; }
  }
  parts.g.attributes.position.needsUpdate = true; parts.g.attributes.color.needsUpdate = true;
}

/* ---------- minimap ---------- */
const mini = $('mini'), mctx = mini.getContext('2d');
let miniBase = null, miniTf = null;
function buildMiniBase() {
  const tr = world.tr, b = world.bounds, W = mini.width, pad = 22;
  const sc = (W - pad * 2) / Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
  const ox = W / 2 - (b.minX + b.maxX) / 2 * sc, oz = W / 2 - (b.minZ + b.maxZ) / 2 * sc;
  miniTf = (x, z) => [W - (x * sc + ox), z * -sc + (W - oz)];
  const c = document.createElement('canvas'); c.width = c.height = W;
  const g = c.getContext('2d');
  g.lineJoin = 'round'; g.lineCap = 'round';
  const path = () => { g.beginPath(); for (let i = 0; i <= tr.N; i += 3) { const j = i % tr.N, [x, y] = miniTf(tr.px[j], tr.pz[j]); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); };
  path(); g.strokeStyle = 'rgba(0,0,0,.7)'; g.lineWidth = 16; g.stroke();
  path(); g.strokeStyle = '#e8e8e8'; g.lineWidth = 9; g.stroke();
  const [sx, sy] = miniTf(tr.px[0], tr.pz[0]);
  g.fillStyle = '#ffd400'; g.fillRect(sx - 7, sy - 7, 14, 14);
  miniBase = c;
}
function drawMini(race, focus) {
  const W = mini.width;
  mctx.clearRect(0, 0, W, W);
  if (miniBase) mctx.drawImage(miniBase, 0, 0);
  const others = NET.inRace && race === globalRace() ? race.karts.concat(netProxyKarts()) : race.karts;
  for (const k of others) {
    if (k === focus || k.hidden) continue;
    const [x, y] = miniTf(k.x, k.z);
    mctx.fillStyle = '#' + k.color.toString(16).padStart(6, '0');
    mctx.strokeStyle = k.team != null && (race.teams || NET.teamRace) ? TEAM_CSS[k.team] : '#000'; mctx.lineWidth = k.team != null && (race.teams || NET.teamRace) ? 4 : 3;
    mctx.beginPath(); mctx.arc(x, y, 7, 0, 7); mctx.fill(); mctx.stroke();
  }
  if (ghost && ghostView && ghostView.g.visible && race === ghostRace) {
    const [x, y] = miniTf(gs.x, gs.z);
    mctx.strokeStyle = 'rgba(255,255,255,.9)'; mctx.lineWidth = 3; mctx.fillStyle = 'rgba(255,255,255,.25)';
    mctx.beginPath(); mctx.arc(x, y, 8, 0, 7); mctx.fill(); mctx.stroke();
  }
  if (focus) {
    const [x, y] = miniTf(focus.x, focus.z);
    mctx.save(); mctx.translate(x, y); mctx.rotate(-focus.th);
    mctx.beginPath(); mctx.moveTo(0, -13); mctx.lineTo(9, 9); mctx.lineTo(-9, 9); mctx.closePath();
    mctx.fillStyle = '#ffd400'; mctx.strokeStyle = '#000'; mctx.lineWidth = 3; mctx.fill(); mctx.stroke();
    mctx.restore();
  }
}

/* ---------- input ---------- */
const held = { up: false, down: false, left: false, right: false, drift: false };
const pin = Core.newInput();
const flags = { accel: false, boost: false, reset: false };
const KEYMAP = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', ShiftLeft: 'drift', ShiftRight: 'drift' };
function press(k, on) {
  if (k === 'boost') { if (on) flags.boost = true; return; }
  if (k === 'reset') { if (on) flags.reset = true; return; }
  if (k === 'up' && on && !held.up) flags.accel = true;
  if (k in held) held[k] = on;
}
window.addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') {
    if (e.code === 'Enter' && e.target.id === 'codeIn') $('btnJoin').click();
    if (e.code === 'Enter' && e.target.id === 'chatIn') sendChat();
    if (e.code === 'Enter' && e.target.id === 'roomTitle') e.target.blur();
    return;
  }
  const k = KEYMAP[e.code];
  if (k) { e.preventDefault(); if (!e.repeat) press(k, true); }
  else if (e.code === 'ControlLeft' || e.code === 'ControlRight' || e.code === 'KeyZ') { e.preventDefault(); if (!e.repeat) press('boost', true); }
  else if (e.code === 'KeyR') { if (!e.repeat) press('reset', true); }
  else if (e.code === 'Escape' && closeTopPanel()) { }
  else if (e.code === 'Escape' || e.code === 'KeyP') { togglePause(); }
  else if (e.code === 'KeyM') { if (!e.repeat) toggleMute(); }
  else if (e.code === 'Space') e.preventDefault();
  if (state === 'menu' && (e.code === 'Enter') && !$('menu').classList.contains('hidden')) $('btnStart').click();
});
window.addEventListener('keyup', e => { if (e.target && e.target.tagName === 'INPUT') return; const k = KEYMAP[e.code]; if (k) { e.preventDefault(); press(k, false); } });
window.addEventListener('blur', () => { for (const k in held) held[k] = false; if (state === 'race' && !paused && !NET.inRace) togglePause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'race' && !paused && !NET.inRace) togglePause(); });
document.querySelectorAll('#touch .tb').forEach(btn => {
  const k = btn.dataset.k; const ids = new Set();
  const down = e => { e.preventDefault(); Snd.init(); try { btn.setPointerCapture(e.pointerId); } catch (x) { } if (!ids.size) press(k, true); ids.add(e.pointerId); btn.classList.add('on'); };
  const up = e => { if (!ids.has(e.pointerId)) return; ids.delete(e.pointerId); if (!ids.size) { press(k, false); btn.classList.remove('on'); } };
  btn.addEventListener('pointerdown', down);
  btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up); btn.addEventListener('lostpointercapture', up);
  btn.addEventListener('contextmenu', e => e.preventDefault());
});
function fillInput() {
  pin.accel = held.up ? 1 : 0; pin.brake = held.down ? 1 : 0;
  pin.steer = (held.right ? 1 : 0) - (held.left ? 1 : 0);
  pin.drift = held.drift;
  if (flags.accel) pin.accelEdge = true;
  if (flags.boost) pin.boostEdge = true;
  if (flags.reset && race && race.state === 'racing') pin.reset = true;
  flags.accel = flags.boost = flags.reset = false;
}

/* ---------- state ---------- */
let state = 'menu', paused = false, race = null, demo = null, resultTimer = -1;
let camYaw = 0, camPos = new THREE.Vector3(), shake = 0, fov = 68, msgT = 0, subT = 0, camInit = false;
let demoFocus = 0, demoSwitch = 8, ghostRace = null, ghostMine = null;

function botSkin(k) {
  const r = Core.mulberry32(k.id * 977 + k.name.charCodeAt(0) * 31 + 5);
  const pick = list => { const l = list.filter(x => !x.ach); return l[Math.floor(r() * l.length)].id; };
  return { body: r() < 0.35 ? 'std' : pick(Profile.catalog.body), wheel: r() < 0.5 ? 'std' : pick(Profile.catalog.wheel), helmet: r() < 0.5 ? 'std' : pick(Profile.catalog.helmet) };
}
function setupRace(r) {
  clearKarts(); skidReset();
  for (const k of r.karts) {
    if (!k.skin) k.skin = k.isPlayer ? (r.playerSkin || Profile.skin()) : botSkin(k);
    const v = makeKartMesh(k.color, k.isPlayer ? null : k.name, null, r.teams ? k.team : null, k.skin);
    v.prevL = null; v.prevR = null;
    kartViews.push(v);
  }
  camInit = false;
}

function newDemo() {
  const s = save.settings;
  if (!world || world.ti !== s.track) buildWorld(s.track);
  ghost = null; ghostRace = null;
  demo = Core.createRace({ track: s.track, laps: 99, diff: 2, seed: (Math.random() * 1e9) | 0, allBots: true });
  demo.time = -0.01;
  setupRace(demo);
  demoFocus = 0; demoSwitch = 8;
}

function startRace() {
  Snd.init();
  const s = save.settings;
  if (!world || world.ti !== s.track) buildWorld(s.track);
  const ta = s.mode === 'ta';
  race = Core.createRace({ track: s.track, laps: s.laps, diff: s.diff, seed: (Math.random() * 1e9) | 0, playerHex: Profile.colorHex(Profile.data.equip.color), solo: ta, record: ta, teams: !ta && s.teamMode });
  race.playerSkin = Profile.skin(); race.pJumps = 0;
  demo = null;
  setupRace(race);
  ghost = null; ghostRace = null; ghostMine = null;
  if (ta) {
    const pg = pickGhost(s.track, s.laps, s.diff);
    ghost = pg.g; ghostMine = pg.mine; ghostRace = race;
    const cg = chosenGhost;
    if (cg && cg.trackId === Core.TRACK_DEFS[s.track].id && cg.laps === s.laps) ghost = cg;
    ghostView = makeGhostMesh(ghost.color != null ? ghost.color : 0xffffff, ghost.skin, ghost.owner ? ghost.owner : '고스트');
    ghostView.lastD = null;
  }
  enterRaceUI(ta);
}
function enterRaceUI(ta) {
  $('rankBox').classList.toggle('hidden', ta);
  $('taBox').classList.toggle('hidden', !ta);
  $('lobby').classList.add('hidden');
  $('btnRestart').classList.toggle('hidden', NET.inRace);
  $('pauseTitle').textContent = NET.inRace ? 'MENU' : 'PAUSE';
  $('btnAgain').textContent = NET.inRace ? '대기실로' : '다시 하기';
  $('btnMenu2').textContent = NET.inRace ? '방 나가기' : '메뉴';
  state = 'race'; paused = false; resultTimer = -1;
  for (const k in held) held[k] = false;
  Object.assign(pin, Core.newInput()); flags.accel = flags.boost = flags.reset = false;
  $('menu').classList.add('hidden'); $('result').classList.add('hidden'); $('pause').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('touch').classList.toggle('hidden', !IS_TOUCH);
  showMsg('', 0); showSub('', 0);
  lastHud = {};
  Snd.startBgm();
}

function toMenu() {
  if (NET.active) netCleanup();
  state = 'menu'; paused = false; race = null; ghost = null; ghostRace = null;
  $('lobby').classList.add('hidden');
  $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
  $('pause').classList.add('hidden'); $('result').classList.add('hidden');
  $('menu').classList.remove('hidden');
  $('boostFx').style.opacity = 0;
  Snd.stopBgm();
  renderMenu();
  newDemo();
}

function togglePause() {
  if (state !== 'race') return;
  if (NET.inRace) { netMenuOpen = !netMenuOpen; $('pause').classList.toggle('hidden', !netMenuOpen); if (netMenuOpen) renderToggles(); return; }
  paused = !paused;
  $('pause').classList.toggle('hidden', !paused);
  for (const k in held) held[k] = false;
  if (paused) { Snd.stopBgm(); renderToggles(); } else { Snd.init(); Snd.startBgm(); }
}

let techT = 0;
function techTag(t) { const el = $('techTag'); el.textContent = t; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); techT = 0.7; }
function showMsg(t, dur) { $('msg').textContent = t; msgT = dur; $('msg').style.opacity = t ? 1 : 0; }
function showSub(t, dur, color) { $('sub').textContent = t; subT = dur; $('sub').style.color = color || ''; }

/* ---------- menu ---------- */
function renderMenu() {
  const s = save.settings;
  const oc0 = $('optConcept'); oc0.innerHTML = '';
  const cc = s.concept || 'all';
  Core.CONCEPTS.forEach(([id, label]) => {
    const n = id === 'all' ? Core.TRACK_DEFS.length : Core.TRACK_DEFS.filter(d => d.concept === id).length;
    if (!n) return;
    const b = document.createElement('button'); b.className = 'opt' + (cc === id ? ' sel' : ''); b.innerHTML = label + '<i>' + n + '</i>';
    b.onclick = () => { s.concept = id; persist(); renderMenu(); }; oc0.appendChild(b);
  });
  const ot = $('optTrack'); ot.innerHTML = '';
  Core.TRACK_DEFS.forEach((d, i) => {
    if (cc !== 'all' && d.concept !== cc) return;
    const b = document.createElement('button'); b.className = 'opt trk' + (s.track === i ? ' sel' : '');
    const pre = s.mode === 'ta' ? 'ta_' : '';
    const rec = save.best[pre + d.id + '_' + s.laps];
    const lap = save.best[pre + d.id + '_lap'];
    b.innerHTML = `<canvas width="128" height="128"></canvas><b>${d.name}${d.hard ? ' <u>HARD</u>' : ''}</b><em>${d.desc}</em><i>${rec ? 'BEST ' + Core.fmtTime(rec) : 'BEST --'}</i>`;
    b.style.setProperty('--tc', TRACK_TINT[d.id] || '#f4eef8');
    drawTrackThumb(b.querySelector('canvas'), i, '#ffffff', 9, TRACK_TINT[d.id] || '#ffd400');
    b.onclick = () => { s.track = i; persist(); renderMenu(); newDemo(); };
    ot.appendChild(b);
  });
  const ol = $('optLaps'); ol.innerHTML = '';
  [1, 2, 3, 5].forEach(n => {
    const b = document.createElement('button'); b.className = 'opt' + (s.laps === n ? ' sel' : ''); b.textContent = n + ' LAP';
    b.onclick = () => { s.laps = n; persist(); renderMenu(); }; ol.appendChild(b);
  });
  const od = $('optDiff'); od.innerHTML = '';
  Core.DIFF.forEach((d, i) => {
    const b = document.createElement('button'); b.className = 'opt' + (s.diff === i ? ' sel' : ''); b.textContent = d.name;
    b.onclick = () => { s.diff = i; persist(); renderMenu(); }; od.appendChild(b);
  });
  const om = $('optMode'); om.innerHTML = '';
  [['스피드전', 'speed'], ['타임어택', 'ta'], ['친구 대결', 'net']].forEach(([t, v]) => {
    const b = document.createElement('button'); b.className = 'opt' + (s.mode === v ? ' sel' : ''); b.textContent = t;
    b.onclick = () => { s.mode = v; persist(); renderMenu(); }; om.appendChild(b);
  });
  $('lblDiff').innerHTML = s.mode === 'ta' ? '<em>GHOST</em>기본 고스트 난이도' : '<em>LEVEL</em>난이도';
  $('modeNote').textContent = s.mode === 'ta'
    ? '혼자 달리며 고스트(최고 기록의 반투명 카트)와 겨룹니다. 내 기록이 기본 고스트보다 빠르면 내 기록 고스트가 나옵니다.'
    : s.mode === 'net' ? '방을 만들고 방 코드(또는 초대 링크)를 친구에게 보내면 최대 8명이 함께 달립니다. 카트 색상은 대기실에서 고릅니다. 인터넷 연결이 필요합니다.'
    : '봇 5대와 함께 순위를 겨룹니다.';
  $('rowDiff').classList.toggle('hidden', s.mode === 'net');
  $('rowTeam').classList.toggle('hidden', s.mode !== 'speed');
  const otm = $('optTeam'); otm.innerHTML = '';
  [['개인전', false], ['팀전', true]].forEach(([tx, v]) => {
    const b = document.createElement('button'); b.className = 'opt' + (!!s.teamMode === v ? ' sel' : ''); b.textContent = tx;
    b.onclick = () => { s.teamMode = v; persist(); renderMenu(); }; otm.appendChild(b);
  });
  renderGhostRow();
  $('teamNote2').textContent = s.teamMode ? '나와 봇 2대(레드팀) 대 봇 3대(블루팀). 등수 점수(1등 10점, 2등 8점, 3등 6점 …)를 팀별로 합산합니다.' : '';
  $('btnStart').textContent = s.mode === 'net' ? '대결 방 입장' : '레이스 시작';
  const og = $('optGuide'); og.innerHTML = '';
  [['켜기', true], ['끄기', false]].forEach(([t, v]) => {
    const b = document.createElement('button'); b.className = 'opt' + (s.ibGuide === v ? ' sel' : ''); b.textContent = t;
    b.onclick = () => { s.ibGuide = v; persist(); renderMenu(); }; og.appendChild(b);
  });
}
const VOLS = [['volMaster', '전체'], ['volSfx', '효과음'], ['volBgm', '배경음']];
function buildVols(box) {
  box.innerHTML = VOLS.map(([k, t]) => `<label class="vol"><span>${t}</span><input type="range" min="0" max="100" step="5" data-k="${k}"><b></b></label>`).join('') +
    '<label class="vol"><span>음소거</span><button class="opt mute" type="button">M</button><b></b></label>';
  box.querySelectorAll('input[type=range]').forEach(inp => {
    const k = inp.dataset.k;
    const upd = () => { inp.nextElementSibling.textContent = inp.value; inp.style.setProperty('--p', inp.value + '%'); };
    inp.addEventListener('input', () => {
      save.settings[k] = +inp.value;
      if (k === 'volMaster' && save.settings.muted && +inp.value > 0) save.settings.muted = false;
      Snd.init(); Snd.applyVolume(); upd(); renderToggles(true);
    });
    inp.addEventListener('change', () => {
      persist();
      if (k === 'volBgm') Snd.previewBgm(); else Snd.item();
    });
  });
  box.querySelector('.mute').onclick = () => { toggleMute(); };
}
function toggleMute() {
  save.settings.muted = !save.settings.muted; persist();
  Snd.init(); Snd.applyVolume(); renderToggles();
  if (state === 'race') showSub(save.settings.muted ? '음소거' : '음소거 해제', 0.8);
}
function renderToggles(skipFocused) {
  document.querySelectorAll('.vols').forEach(box => {
    if (!box.children.length) buildVols(box);
    box.querySelectorAll('input[type=range]').forEach(inp => {
      if (skipFocused && inp === document.activeElement) return;
      inp.value = save.settings[inp.dataset.k];
      inp.nextElementSibling.textContent = inp.value;
      inp.style.setProperty('--p', inp.value + '%');
    });
    const mb = box.querySelector('.mute');
    mb.classList.toggle('sel', !!save.settings.muted);
    mb.textContent = save.settings.muted ? '켜짐' : '꺼짐';
  });
}
$('btnStart').onclick = () => { if (save.settings.mode === 'net') openLobby(); else startRace(); };
$('btnResume').onclick = togglePause;
$('btnRestart').onclick = () => { paused = false; startRace(); };
$('btnMenu').onclick = () => { if (NET.active) leaveRoom(); else toMenu(); };
$('btnMenu2').onclick = () => { if (NET.active) leaveRoom(); else toMenu(); };
$('btnAgain').onclick = () => { if (NET.inRace || NET.active && state === 'result') backToLobby(); else startRace(); };
$('pauseBtn').addEventListener('pointerdown', e => { e.preventDefault(); togglePause(); });
renderToggles();


/* ---------- friend battle (P2P) ---------- */
const NET_VER = 7, PEER_PREFIX = 'rkr-race-v1-', CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', MAX_P = 8;
const NET = { active: false, peer: null, host: false, conns: new Map(), conn: null, pid: 0, players: [], code: '',
  track: 0, laps: 3, nextPid: 1, inRace: false, proxies: new Map(), sendAcc: 0, pingAcc: 0, rtt: new Map(),
  retireT: -1, fins: new Map(), sentFin: false, raceLaps: 3 };
let netMenuOpen = false;
function globalRace() { return race; }
function peerOpts() {
  const m = location.hash.match(/peerlocal=(\d+)/);
  return m ? { host: '127.0.0.1', port: +m[1], path: '/', secure: false, debug: 0 } : { debug: 0 };
}
function loadPeerLib() {
  return new Promise((res, rej) => {
    if (window.Peer) return res();
    const sc = document.createElement('script');
    sc.src = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js';
    sc.onload = () => window.Peer ? res() : rej(new Error('lib'));
    sc.onerror = () => rej(new Error('lib'));
    document.head.appendChild(sc);
  });
}
function genCode() { let c = ''; for (let i = 0; i < 5; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return c; }
function myNick() {
  const v = ($('nick').value || '').replace(/[<>&"']/g, '').trim().slice(0, 8);
  return v || '플레이어';
}
function cleanTitle(t) { return String(t || '').replace(/[<>&"']/g, '').trim().slice(0, 20); }
function cleanName(n) { return String(n || '플레이어').replace(/[<>&"']/g, '').slice(0, 8) || '플레이어'; }
function setStatus(t, err) { $('lbStatus').textContent = t || ''; $('lbStatus').style.color = err ? '#ff5a4a' : ''; }

function openLobby() {
  Snd.init();
  state = 'lobby';
  $('menu').classList.add('hidden'); $('lobby').classList.remove('hidden');
  $('lobbyCard').classList.remove('wide');
  $('lbJoin').classList.remove('hidden'); $('lbRoom').classList.add('hidden');
  $('nick').value = save.settings.nick || (Profile.user ? Profile.user.username.slice(0, 8) : '');
  setStatus('');
  $('btnHost').disabled = false; $('btnJoin').disabled = false;
}
function hex6(c) { return '#' + c.toString(16).padStart(6, '0'); }
function showRoom() {
  $('lbJoin').classList.add('hidden'); $('lbRoom').classList.remove('hidden');
  $('lobbyCard').classList.add('wide');
  $('roomCode').textContent = NET.code;
  const sl = $('slots');
  if (!sl.children.length) {
    for (let i = 0; i < MAX_P; i++) {
      const d = document.createElement('div'); d.className = 'pslot empty';
      d.innerHTML = `<div class="sn">${i + 1}</div><canvas width="240" height="180"></canvas><div class="nm">빈 자리</div><div class="st">&nbsp;</div>`;
      sl.appendChild(d);
    }
  }
  setStatus('');
  renderRoom();
}
function myPlayer() { return NET.players.find(p => p.pid === NET.pid); }
function renderRoom() {
  if ($('lbRoom').classList.contains('hidden')) return;
  const pl = NET.players;
  $('pCount').textContent = pl.length + '/' + MAX_P;
  const ti = $('roomTitle'), tt = $('roomTitleTxt');
  ti.classList.toggle('hidden', !NET.host); tt.classList.toggle('hidden', NET.host);
  if (NET.host) { if (document.activeElement !== ti) ti.value = NET.title || ''; }
  else tt.textContent = NET.title || '';
  [...$('slots').children].forEach((el, i) => {
    const p = pl[i];
    el.className = 'pslot' + (p ? '' : ' empty') + (p && p.pid === NET.pid ? ' me' : '') + (p && p.pid === 0 ? ' host' : '') + (p && p.ready && p.pid !== 0 ? ' ready' : '') + (p && NET.teamMode ? ' t' + p.team : '');
    el.querySelector('.sn').textContent = p && NET.teamMode ? (i + 1) + ' ' + TEAM_EN[p.team] : String(i + 1);
    el.dataset.color = p ? Profile.colorHex(p.color) : '';
    el.dataset.skin = p ? JSON.stringify(playerSkinOf(p)) : '';
    el.querySelector('.nm').textContent = p ? cleanName(p.name) : '빈 자리';
    el.querySelector('.st').textContent = !p ? ' ' : p.pid === 0 ? '방장' : p.ready ? '준비 완료' : '대기 중';
    el.style.borderBottomColor = p ? (NET.teamMode ? TEAM_CSS[p.team] : hex6(Profile.colorHex(p.color))) : '';
    if (!p) { const cv = el.querySelector('canvas'); cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); }
  });
  drawTrackThumb($('trackPrev'), NET.track);
  $('rtName').textContent = Core.TRACK_DEFS[NET.track].name;
  $('rtLaps').textContent = NET.laps + ' LAP';
  const rt = $('roomTrack'); rt.innerHTML = '';
  rt.classList.toggle('hidden', !NET.host);
  if (NET.host) {
    Core.TRACK_DEFS.forEach((d, i) => {
      const b = document.createElement('button'); b.className = 'opt' + (NET.track === i ? ' sel' : ''); b.textContent = d.name;
      b.onclick = () => { NET.track = i; broadcastLobby(); }; rt.appendChild(b);
    });
    [1, 2, 3, 5].forEach(n => {
      const b = document.createElement('button'); b.className = 'opt' + (NET.laps === n ? ' sel' : ''); b.textContent = n + ' LAP';
      b.onclick = () => { NET.laps = n; broadcastLobby(); }; rt.appendChild(b);
    });
  }
  $('rtMode').textContent = NET.teamMode ? '스피드 팀전' : '스피드 개인전';
  const rm = $('roomMode'); rm.innerHTML = '';
  rm.classList.toggle('hidden', !NET.host);
  if (NET.host) [['개인전', false], ['팀전', true]].forEach(([tx, v]) => {
    const b = document.createElement('button'); b.className = 'opt' + (NET.teamMode === v ? ' sel' : ''); b.textContent = tx;
    b.onclick = () => setTeamMode(v); rm.appendChild(b);
  });
  const me = myPlayer();
  $('teamRow').classList.toggle('hidden', !NET.teamMode);
  if (NET.teamMode) {
    const cnt = [0, 1].map(t => pl.filter(p => p.team === t).length);
    const mt = $('myTeam'); mt.innerHTML = '';
    [0, 1].forEach(t => {
      const b = document.createElement('button');
      const full = cnt[t] >= MAX_P / 2 && !(me && me.team === t);
      b.className = 'opt team t' + t + (me && me.team === t ? ' sel' : '') + (full ? ' taken' : '');
      b.textContent = TEAM_NAME[t] + '팀 ' + cnt[t] + '/' + (MAX_P / 2);
      b.onclick = () => { if (!full) requestTeam(t); };
      mt.appendChild(b);
    });
  }
  const used = new Set(pl.filter(p => p.pid !== NET.pid).map(p => p.color));
  const mc = $('myColor'); mc.innerHTML = '';
  Profile.ownedColors().forEach(i => {
    const c = Profile.colorHex(i);
    const b = document.createElement('button');
    b.className = 'opt sw' + (me && me.color === i ? ' sel' : '') + (used.has(i) ? ' taken' : '');
    b.style.background = hex6(c); b.title = Profile.colors[i].name;
    b.onclick = () => { if (!used.has(i)) requestColor(i); };
    mc.appendChild(b);
  });
  const btn = $('btnNetStart');
  if (NET.host) {
    const guests = pl.filter(p => p.pid !== 0);
    const allReady = guests.length > 0 && guests.every(p => p.ready);
    const teamsOk = !NET.teamMode || (pl.some(p => p.team === 0) && pl.some(p => p.team === 1));
    btn.disabled = !allReady || !teamsOk;
    btn.textContent = guests.length === 0 ? '시작 (친구를 기다리는 중)' : !allReady ? '시작 (모두 준비해야 함)' : !teamsOk ? '시작 (양 팀에 1명 이상 필요)' : '게임 시작';
  } else {
    btn.disabled = false;
    btn.textContent = me && me.ready ? '준비 취소' : '준비';
  }
}
function drawTrackThumb(cv, ti, stroke, lw, under) {
  const g = cv.getContext('2d'), tr = Core.getTrack(ti), W = cv.width, pad = 14;
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
  for (let i = 0; i < tr.N; i++) { a = Math.min(a, tr.px[i]); b = Math.max(b, tr.px[i]); c = Math.min(c, tr.pz[i]); d = Math.max(d, tr.pz[i]); }
  const sc = (W - pad * 2) / Math.max(b - a, d - c);
  const T = (x, z) => [W - ((x - (a + b) / 2) * sc + W / 2), W / 2 - (z - (c + d) / 2) * sc];
  g.clearRect(0, 0, W, W);
  g.lineJoin = g.lineCap = 'round';
  g.beginPath(); for (let i = 0; i <= tr.N; i += 4) { const [x, y] = T(tr.px[i % tr.N], tr.pz[i % tr.N]); i ? g.lineTo(x, y) : g.moveTo(x, y); }
  if (under) { g.closePath(); g.strokeStyle = under; g.lineWidth = (lw || 6) + 6; g.stroke(); g.beginPath(); for (let i = 0; i <= tr.N; i += 4) { const [x, y] = T(tr.px[i % tr.N], tr.pz[i % tr.N]); i ? g.lineTo(x, y) : g.moveTo(x, y); } }
  g.closePath(); g.strokeStyle = stroke || '#e8e8e8'; g.lineWidth = lw || 6; g.stroke();
  const [sx, sy] = T(tr.px[0], tr.pz[0]); g.fillStyle = '#ffd400'; g.fillRect(sx - 6, sy - 6, 12, 12);
}
function addChat(name, text, sys) {
  const log = $('chatLog'), d = document.createElement('div');
  if (sys) { d.className = 'sys'; d.textContent = text; }
  else { const b = document.createElement('b'); b.textContent = name; d.appendChild(b); d.appendChild(document.createTextNode(text)); }
  log.appendChild(d);
  while (log.children.length > 60) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
}
function sendChat() {
  const inp = $('chatIn'), text = (inp.value || '').trim().slice(0, 60);
  inp.value = '';
  if (!text || !NET.active) return;
  if (NET.host) { const m = { t: 'chat', p: 0, name: myPlayer().name, text }; sendAll(m); addChat(m.name, text); }
  else netSend({ t: 'chat', text });
}
function sysChat(text) { if (NET.host) { sendAll({ t: 'chat', sys: true, text }); } addChat('', text, true); }
function freeColor(pref, exceptPid, owned) {
  const used = new Set(NET.players.filter(p => p.pid !== exceptPid).map(p => p.color));
  if (pref != null && !used.has(pref)) return pref;
  const cand = (owned || []).concat([0, 1, 2, 3, 4, 5, 6, 7]);
  for (const i of cand) if (!used.has(i)) return i;
  return 0;
}
function cleanSkin(sk) {
  const out = { body: 'std', wheel: 'std', helmet: 'std' };
  if (sk && typeof sk === 'object') for (const cat of ['body', 'wheel', 'helmet']) if (Profile.catalog[cat].some(x => x.id === sk[cat])) out[cat] = sk[cat];
  return out;
}
function cleanOwnedColors(list) { return Array.isArray(list) ? list.map(x => x | 0).filter(x => x >= 0 && x < Profile.colors.length).slice(0, 32) : [0]; }
function playerSkinOf(p) { const sk = cleanSkin(p.skin); sk.color = p.color; return sk; }
function requestColor(i) {
  if (!Profile.owns('color', i)) return;
  if (NET.host) { const me = myPlayer(); if (me) { me.color = freeColor(i, 0); broadcastLobby(); } }
  else netSend({ t: 'color', c: i });
}
function smallerTeam() {
  const c = [0, 1].map(t => NET.players.filter(p => p.team === t).length);
  return c[1] < c[0] ? 1 : 0;
}
function setTeamMode(v) {
  if (!NET.host) return;
  NET.teamMode = v;
  if (v) {
    const c = [0, 0];
    for (const p of NET.players) { if (p.team !== 0 && p.team !== 1) p.team = c[1] < c[0] ? 1 : 0; c[p.team]++; }
    for (const p of NET.players) if (c[p.team] > MAX_P / 2) { c[p.team]--; p.team = 1 - p.team; c[p.team]++; }
  }
  for (const p of NET.players) if (p.pid !== 0) p.ready = false;
  sysChat(v ? '팀전으로 바뀌었습니다. 팀을 고르고 준비해 주세요.' : '개인전으로 바뀌었습니다.');
  broadcastLobby();
}
function requestTeam(t) {
  const me = myPlayer(); if (!me || me.team === t) return;
  if (NET.host) { if (NET.players.filter(p => p.team === t).length < MAX_P / 2) { me.team = t; broadcastLobby(); } }
  else netSend({ t: 'team', v: t });
}
function toggleReady() {
  const me = myPlayer(); if (!me) return;
  me.ready = !me.ready; renderRoom();
  netSend({ t: 'ready', v: me.ready });
}
// --- slot previews: each player's kart, rendered by a small offscreen renderer ---
const SlotR = { r: null, scene: null, cam: null, models: new Map(), last: 0 };
function slotInit() {
  if (SlotR.r) return;
  SlotR.r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  SlotR.r.setPixelRatio(1); SlotR.r.setSize(240, 180);
  SlotR.scene = new THREE.Scene();
  SlotR.scene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 0.9));
  const dl = new THREE.DirectionalLight(0xffffff, 0.75); dl.position.set(4, 8, 6); SlotR.scene.add(dl);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(3.3, 40), new THREE.MeshBasicMaterial({ color: 0x3a3a3a }));
  floor.rotation.x = -Math.PI / 2; SlotR.scene.add(floor);
  SlotR.cam = new THREE.PerspectiveCamera(30, 4 / 3, 0.1, 100);
  SlotR.cam.position.set(5.2, 3.4, 6.6); SlotR.cam.lookAt(0, 0.75, 0);
}
function drawSlots(now) {
  if (now - SlotR.last < 50) return;
  SlotR.last = now; slotInit();
  const t = now / 1000;
  [...$('slots').children].forEach((el, i) => {
    const col = el.dataset.color;
    if (!col) return;
    const key = el.dataset.skin || col;
    let m = SlotR.models.get(key);
    if (!m) { m = makeKartMesh(+col, null, SlotR.scene, null, el.dataset.skin ? JSON.parse(el.dataset.skin) : null); SlotR.models.set(key, m); }
    for (const [k, mm] of SlotR.models) mm.g.visible = k === key;
    m.g.rotation.y = 0.55 + Math.sin(t * 0.7 + i * 0.9) * 0.55;
    m.body.position.y = el.classList.contains('ready') || el.classList.contains('host') ? Math.abs(Math.sin(t * 5 + i)) * 0.1 : 0;
    SlotR.r.render(SlotR.scene, SlotR.cam);
    const cv = el.querySelector('canvas'), ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(SlotR.r.domElement, 0, 0, cv.width, cv.height);
  });
}
function netFail(msg) {
  netCleanup();
  if (state !== 'lobby') { toMenu(); openLobby(); }
  $('lbJoin').classList.remove('hidden'); $('lbRoom').classList.add('hidden');
  $('btnHost').disabled = false; $('btnJoin').disabled = false;
  setStatus(msg, true);
}
function peerErrText(err) {
  const t = err && err.type;
  if (t === 'peer-unavailable') return '방을 찾을 수 없습니다. 코드를 확인해 주세요.';
  if (t === 'browser-incompatible') return '이 브라우저는 대결 모드를 지원하지 않습니다.';
  if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return '연결 서버에 접속하지 못했습니다. 인터넷 연결을 확인해 주세요.';
  return '연결 오류가 발생했습니다. (' + (t || 'unknown') + ')';
}
function netCleanup() {
  for (const c of NET.conns.values()) try { c.close(); } catch (e) { }
  if (NET.conn) try { NET.conn.close(); } catch (e) { }
  if (NET.peer) try { NET.peer.destroy(); } catch (e) { }
  for (const px of NET.proxies.values()) if (px.view) disposeGroup(px.view.g);
  Object.assign(NET, { active: false, peer: null, host: false, conn: null, pid: 0, players: [], code: '', inRace: false, retireT: -1, sentFin: false });
  NET.conns.clear(); NET.proxies.clear(); NET.rtt.clear(); NET.fins.clear();
  netMenuOpen = false;
}
function saveNick() { save.settings.nick = myNick(); persist(); }

async function netHost() {
  saveNick();
  $('btnHost').disabled = true; $('btnJoin').disabled = true;
  setStatus('방을 만드는 중...');
  try { await loadPeerLib(); } catch (e) { return netFail('네트워크 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.'); }
  NET.track = save.settings.track; NET.laps = save.settings.laps;
  const attempt = n => {
    const code = genCode();
    const peer = new Peer(PEER_PREFIX + code, peerOpts());
    peer.on('open', () => {
      Object.assign(NET, { active: true, peer, host: true, code, pid: 0, nextPid: 1 });
      NET.players = [{ pid: 0, name: myNick(), color: Profile.data.equip.color, ready: true, team: 0, skin: cleanSkin(Profile.skin()), owned: Profile.ownedColors() }];
      NET.teamMode = false;
      NET.title = myNick() + '님의 방';
      $('chatLog').innerHTML = ''; addChat('', '방을 만들었습니다. 방 코드나 초대 링크를 친구에게 보내 주세요.', true);
      showRoom(); broadcastLobby();
    });
    peer.on('error', err => {
      if (err.type === 'unavailable-id' && n < 5) { try { peer.destroy(); } catch (e) { } attempt(n + 1); }
      else if (!NET.active || err.type !== 'peer-unavailable') netFail(peerErrText(err));
    });
    peer.on('connection', conn => {
      conn.on('data', m => hostOnMsg(conn, m));
      conn.on('close', () => hostDrop(conn));
      conn.on('error', () => hostDrop(conn));
    });
    peer.on('disconnected', () => { try { if (!peer.destroyed) peer.reconnect(); } catch (e) { } });
  };
  attempt(0);
}
function hostOnMsg(conn, m) {
  if (!m || typeof m !== 'object') return;
  switch (m.t) {
    case 'hello': {
      const deny = why => { try { conn.send({ t: 'deny', why }); } catch (e) { } setTimeout(() => { try { conn.close(); } catch (e) { } }, 400); };
      if (m.ver !== NET_VER) return deny('게임 버전이 서로 다릅니다. 같은 파일로 접속해 주세요.');
      if (NET.inRace) return deny('이미 경기가 진행 중입니다. 끝난 뒤 다시 들어와 주세요.');
      if (NET.players.length >= MAX_P) return deny('방이 가득 찼습니다. (최대 ' + MAX_P + '명)');
      const pid = NET.nextPid++;
      conn.pid = pid; NET.conns.set(pid, conn);
      const nm = cleanName(m.name);
      const owned = cleanOwnedColors(m.owned), want = owned.indexOf(m.color | 0) >= 0 ? (m.color | 0) : owned[0];
      NET.players.push({ pid, name: nm, color: freeColor(want, pid, owned), ready: false, team: smallerTeam(), skin: cleanSkin(m.skin), owned });
      conn.send({ t: 'welcome', pid, code: NET.code });
      broadcastLobby();
      sysChat(nm + '님이 들어왔습니다.');
      Snd.item();
      break;
    }
    case 'pong': if (conn.pid != null) NET.rtt.set(conn.pid, performance.now() - m.c); break;
    case 'color': {
      const p = NET.players.find(q => q.pid === conn.pid);
      if (p) { const c = m.c | 0; if ((p.owned || []).indexOf(c) >= 0 && freeColor(c, p.pid) === c) p.color = c; broadcastLobby(); }
      break;
    }
    case 'ready': { const p = NET.players.find(q => q.pid === conn.pid); if (p) { p.ready = !!m.v; broadcastLobby(); } break; }
    case 'team': {
      const p = NET.players.find(q => q.pid === conn.pid), t = m.v === 1 ? 1 : 0;
      if (p && NET.teamMode && p.team !== t && NET.players.filter(q => q.team === t).length < MAX_P / 2) { p.team = t; p.ready = false; broadcastLobby(); }
      break;
    }
    case 'chat': {
      const p = NET.players.find(q => q.pid === conn.pid); if (!p) break;
      const text = String(m.text || '').slice(0, 60); if (!text.trim()) break;
      const out = { t: 'chat', p: p.pid, name: p.name, text }; sendAll(out); addChat(p.name, text);
      break;
    }
    case 's': if (conn.pid != null) { m.p = conn.pid; sendAll(m, conn.pid); onState(m); } break;
    case 'fin': if (conn.pid != null) { m.p = conn.pid; sendAll(m, conn.pid); onFin(m); } break;
  }
}
function hostDrop(conn) {
  if (conn.pid == null || !NET.conns.has(conn.pid)) return;
  NET.conns.delete(conn.pid);
  const gone = NET.players.find(p => p.pid === conn.pid);
  NET.players = NET.players.filter(p => p.pid !== conn.pid);
  if (gone) sysChat(gone.name + '님이 나갔습니다.');
  const m = { t: 'left', p: conn.pid };
  sendAll(m); onLeft(m);
  broadcastLobby();
}
function sendAll(m, except) { for (const [pid, c] of NET.conns) if (pid !== except && c.open) try { c.send(m); } catch (e) { } }
function netSend(m) {
  if (NET.host) sendAll(m);
  else if (NET.conn && NET.conn.open) try { NET.conn.send(m); } catch (e) { }
}
function broadcastLobby() {
  const m = { t: 'lobby', players: NET.players, track: NET.track, laps: NET.laps, title: NET.title, teamMode: !!NET.teamMode };
  sendAll(m); onLobby(m);
}
function onLobby(m) {
  NET.players = m.players; NET.track = m.track; NET.laps = m.laps; NET.title = String(m.title || '').slice(0, 20); NET.teamMode = !!m.teamMode;
  renderRoom();
}

async function netJoin() {
  const code = ($('codeIn').value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 5) return setStatus('방 코드 5자리를 입력해 주세요.', true);
  saveNick();
  $('btnHost').disabled = true; $('btnJoin').disabled = true;
  setStatus('방에 연결하는 중...');
  try { await loadPeerLib(); } catch (e) { return netFail('네트워크 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.'); }
  const peer = new Peer(undefined, peerOpts());
  NET.peer = peer;
  peer.on('open', () => {
    const conn = peer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' });
    NET.conn = conn;
    const to = setTimeout(() => { if (!conn.open) netFail('연결하지 못했습니다. 서로 다른 네트워크(특히 모바일 데이터)에서는 직접 연결이 막힐 수 있습니다.'); }, 15000);
    conn.on('open', () => { clearTimeout(to); $('chatLog').innerHTML = ''; conn.send({ t: 'hello', name: myNick(), color: Profile.data.equip.color, skin: Profile.skin(), owned: Profile.ownedColors(), ver: NET_VER }); });
    conn.on('data', m => guestOnMsg(m));
    conn.on('close', () => { if (NET.active || NET.conn === conn) netClosed('방장과의 연결이 끊어졌습니다.'); });
  });
  peer.on('error', err => netFail(peerErrText(err)));
}
function guestOnMsg(m) {
  if (!m || typeof m !== 'object') return;
  switch (m.t) {
    case 'welcome': NET.active = true; NET.pid = m.pid; NET.code = m.code; showRoom(); break;
    case 'deny': NET.conn = null; netFail(m.why); break;
    case 'lobby': onLobby(m); break;
    case 'chat': if (m.sys) addChat('', String(m.text || ''), true); else addChat(cleanName(m.name), String(m.text || '').slice(0, 60)); break;
    case 'ping': netSend({ t: 'pong', c: m.c }); break;
    case 'start': setTimeout(() => beginNetRace(m), Math.max(0, m.delay | 0)); break;
    case 's': onState(m); break;
    case 'fin': onFin(m); break;
    case 'left': onLeft(m); break;
  }
}
function netClosed(msg) {
  const wasRacing = state === 'race' || state === 'result';
  NET.conn = null;
  netCleanup();
  if (wasRacing) { toMenu(); }
  openLobby();
  setStatus(msg, true);
}
function leaveRoom() { netCleanup(); toMenu(); }

/* --- race --- */
function hostStart() {
  if (!NET.host || NET.players.length < 2) return;
  if (!NET.players.every(p => p.pid === 0 || p.ready)) return;
  if (NET.teamMode && !(NET.players.some(p => p.team === 0) && NET.players.some(p => p.team === 1))) return;
  const base = 900;
  const m = { t: 'start', track: NET.track, laps: NET.laps, players: NET.players, teamMode: !!NET.teamMode };
  for (const [pid, c] of NET.conns) {
    const half = Math.min(400, (NET.rtt.get(pid) || 120) / 2);
    try { c.send(Object.assign({}, m, { delay: base - half })); } catch (e) { }
  }
  setTimeout(() => beginNetRace(m), base);
}
function proxyKart(p) {
  return { name: cleanName(p.name), color: Profile.colorHex(p.color), x: 0, z: 0, th: 0, slip: 0, steerVis: 0, v: 0,
    drift: 0, gauge: 0, items: 0, boostT: 0, startT: 0, ibT: 0, ibOpen: false, ibPhase: 0, ibPerfect: false, dist: -999, hidden: true, remote: true };
}
function beginNetRace(m) {
  if (!NET.active) return;
  for (const p of NET.players) if (p.pid !== 0) p.ready = false;
  NET.teamRace = !!m.teamMode;
  NET.inRace = true; NET.retireT = -1; NET.sentFin = false; NET.fins.clear(); NET.sendAcc = 0; NET.raceLaps = m.laps;
  if (!world || world.ti !== m.track) buildWorld(m.track);
  const order = m.players;
  const slot = Math.max(0, order.findIndex(p => p.pid === NET.pid));
  const me = order[slot] || { name: myNick(), color: save.settings.color };
  race = Core.createRace({ track: m.track, laps: m.laps, diff: 1, seed: 1, playerHex: Profile.colorHex(me.color || 0), solo: true, gridSlot: slot });
  race.playerSkin = playerSkinOf(me); race.pJumps = 0;
  race.player.name = cleanName(me.name);
  race.player.team = NET.teamRace ? (me.team === 1 ? 1 : 0) : null;
  demo = null; ghost = null; ghostRace = null;
  setupRace(race);
  for (const px of NET.proxies.values()) if (px.view) disposeGroup(px.view.g);
  NET.proxies.clear();
  order.forEach((p, i) => {
    if (p.pid === NET.pid) return;
    const k = proxyKart(p);
    const tmp = Core.createRace({ track: m.track, laps: m.laps, solo: true, gridSlot: i });
    k.x = tmp.player.x; k.z = tmp.player.z; k.th = tmp.player.th; k.dist = tmp.player.dist; k.hidden = false;
    k.team = NET.teamRace ? (p.team === 1 ? 1 : 0) : null;
    const view = makeKartMesh(k.color, k.name, null, k.team, playerSkinOf(p)); view.prevL = view.prevR = null;
    NET.proxies.set(p.pid, { pid: p.pid, k, view, buf: [], finished: false, retired: false, left: false, finishTime: 0 });
  });
  $('result').classList.add('hidden'); $('pause').classList.add('hidden'); netMenuOpen = false;
  for (const k in held) held[k] = false;
  Object.assign(pin, Core.newInput()); flags.accel = flags.boost = flags.reset = false;
  $('hud').classList.remove('hidden');
  $('touch').classList.toggle('hidden', !IS_TOUCH);
  showMsg('', 0); showSub('', 0);
  lastHud = {};
  enterRaceUI(false);
  Snd.startBgm();
}
function packState(P) {
  const f = (P.boostT > 0 || P.startT > 0 ? 1 : 0) | (P.ibT > 0 ? 2 : 0) | (P.drift >= 1 ? 4 : 0) | (P.ibPerfect ? 8 : 0);
  return [Math.round(P.x * 20), Math.round(P.z * 20), Math.round(P.th * 1000), Math.round(P.slip * 1000),
    Math.round(P.steerVis * 100), f, Math.round(P.dist * 10), Math.round(P.v * 10), Math.round(P.y * 20), P.air ? 1 : 0];
}
function onState(m) {
  const px = NET.proxies.get(m.p); if (!px || !Array.isArray(m.d)) return;
  const b = px.buf;
  if (b.length && m.r < b[b.length - 1].r) return;
  b.push({ r: m.r, d: m.d });
  while (b.length > 60) b.shift();
}
function applySample(k, d, d2, w) {
  const L = (o, sc) => (d[o] + ((d2 ? d2[o] : d[o]) - d[o]) * w) / sc;
  k.x = L(0, 20); k.z = L(1, 20);
  const t0 = d[2] / 1000, t1 = (d2 ? d2[2] : d[2]) / 1000;
  k.th = Core.wrapA(t0 + Core.wrapA(t1 - t0) * w);
  k.slip = L(3, 1000); k.steerVis = L(4, 100); k.dist = L(6, 10); k.v = L(7, 10);
  k.y = d.length > 8 ? L(8, 20) : 0; k.air = d[9] === 1; k.s = undefined;
  const f = d[5];
  k.boostT = f & 1 ? 1 : 0; k.ibT = f & 2 ? 1 : 0; k.drift = f & 4 ? 1 : 0; k.ibPerfect = !!(f & 8);
}
function updateProxy(px, rt) {
  const b = px.buf, k = px.k;
  if (px.left) { k.hidden = true; return; }
  if (!b.length) return;
  k.hidden = false;
  if (rt <= b[0].r) { applySample(k, b[0].d, null, 0); return; }
  const last = b[b.length - 1];
  if (rt >= last.r) {
    applySample(k, last.d, null, 0);
    const ex = Math.min(0.15, rt - last.r);
    k.x += Math.sin(k.th) * k.v * ex; k.z += Math.cos(k.th) * k.v * ex;
    return;
  }
  let i = b.length - 2;
  while (i > 0 && b[i].r > rt) i--;
  const a = b[i], c = b[i + 1];
  applySample(k, a.d, c.d, (rt - a.r) / ((c.r - a.r) || 1));
}
function netProxyKarts() { const out = []; for (const px of NET.proxies.values()) out.push(px.k); return out; }
function syncProxies(dt) {
  const ks = [], vs = [];
  for (const px of NET.proxies.values()) {
    if (!px.view) continue;
    px.view.g.visible = !px.k.hidden;
    if (px.k.hidden) continue;
    ks.push(px.k); vs.push(px.view);
  }
  syncKartList(ks, vs, dt);
}
function onFin(m) {
  if (m.p === NET.pid || !race || !NET.inRace) return;
  const px = NET.proxies.get(m.p); if (!px) return;
  px.finished = true; px.retired = !!m.ret; px.finishTime = m.time || 0;
  if (!m.ret && NET.retireT < 0 && !race.player.finished) NET.retireT = Core.C.RETIRE;
  if (state === 'result') showResultsNet();
}
function onLeft(m) {
  const px = NET.proxies.get(m.p);
  if (px) { px.left = true; px.k.hidden = true; if (state === 'result') showResultsNet(); }
}
function netTick(dt) {
  const P = race.player;
  // send own state
  NET.sendAcc += dt;
  if (NET.sendAcc >= 0.05) { NET.sendAcc = 0; netSend({ t: 's', p: NET.pid, r: +race.time.toFixed(3), d: packState(P) }); }
  // host pings
  // remote karts
  const rt = race.time - 0.1;
  for (const px of NET.proxies.values()) updateProxy(px, rt);
  // collisions: local kart against remote karts (each side resolves its own kart)
  if (race.state === 'racing' && !P.finished) {
    const R2 = Core.C.KART_R * 2.2;
    for (const px of NET.proxies.values()) {
      const k = px.k; if (k.hidden || px.finished) continue;
      const dx = k.x - P.x, dz = k.z - P.z, d = Math.hypot(dx, dz);
      if (d < R2 && d > 1e-4) {
        const nx = dx / d, nz = dz / d;
        P.x -= nx * (R2 - d) * 0.5; P.z -= nz * (R2 - d) * 0.5;
        const va = Core.velOf(P), vb = [Math.sin(k.th) * k.v, Math.cos(k.th) * k.v];
        const rel = (vb[0] - va[0]) * nx + (vb[1] - va[1]) * nz;
        if (rel < 0) {
          const j = -(1.3) * rel / 2;
          Core.setVel(P, va[0] - j * nx, va[1] - j * nz);
          if (-rel > 3) { Snd.wall(-rel * 0.6); shake = Math.min(1, shake + -rel / 40); }
        }
      }
    }
  }
  // local finish
  if (P.finished && !NET.sentFin) {
    NET.sentFin = true;
    netSend({ t: 'fin', p: NET.pid, time: P.retired ? 0 : +P.finishTime.toFixed(3), ret: P.retired });
    if (!P.retired && NET.retireT < 0) NET.retireT = Core.C.RETIRE;
  }
  // retire countdown
  if (NET.retireT > 0) {
    NET.retireT -= dt;
    if (NET.retireT <= 0) {
      NET.retireT = 0;
      if (!P.finished) {
        P.finished = true; P.retired = true;
        showMsg('RETIRE', 2.5); showSub('', 0); resultTimer = 2.5;
      }
    }
  }
}
function netOrder() {
  const P = race.player;
  const list = [{ name: P.name, color: P.color, isPlayer: true, dist: P.dist, done: P.finished && !P.retired, time: P.finishTime, retired: P.retired, left: false, team: P.team }];
  for (const px of NET.proxies.values()) list.push({ name: px.k.name, color: px.k.color, isPlayer: false, dist: px.k.dist, done: px.finished && !px.retired, time: px.finishTime, retired: px.retired, left: px.left, team: px.k.team });
  list.sort((a, b) => {
    if (a.left !== b.left) return a.left ? 1 : -1;
    if (a.done && b.done) return a.time - b.time;
    if (a.done) return -1; if (b.done) return 1;
    if (a.retired !== b.retired) return a.retired ? 1 : -1;
    return b.dist - a.dist;
  });
  list.forEach((o, i) => { o.rank = i + 1; });
  return list;
}
function showResultsNet() {
  state = 'result';
  const P = race.player, tr = race.track;
  $('hud').classList.add('hidden'); $('touch').classList.add('hidden'); $('pause').classList.add('hidden');
  $('boostFx').style.opacity = 0; $('ibFx').style.opacity = 0;
  const order = netOrder(), me = order.find(o => o.isPlayer);
  $('resTitle').textContent = P.retired ? 'RETIRE' : (me.rank === 1 ? 'WINNER' : me.rank + (['ST', 'ND', 'RD'][me.rank - 1] || 'TH') + ' PLACE');
  $('resSub').textContent = tr.def.name + ' · ' + race.laps + ' LAP · 친구 대결' + (NET.teamRace ? ' 팀전' : '') + ' · 방 ' + NET.code;
  $('resTable').innerHTML = order.map(o => {
    const t = o.left ? '나감' : o.done ? Core.fmtTime(o.time) : o.retired ? 'RETIRE' : '주행 중';
    return `<tr class="${o.isPlayer ? 'me' : ''}${NET.teamRace ? ' t' + o.team : ''}"><td class="r">${o.rank}</td><td>${o.name}</td><td class="t">${t}</td>${NET.teamRace ? '<td class="t">+' + teamPoints(o) + '</td>' : ''}</tr>`;
  }).join('');
  $('resTeam').classList.toggle('hidden', !NET.teamRace);
  if (NET.teamRace) renderTeamResult(teamTally(order), P.team);
  $('resRec').textContent = '';
  const st = P.stats;
  $('resStats').textContent = statLine(st);
  const tl = NET.teamRace ? teamTally(order) : null;
  grantRewards({ mode: 'net', rank: me.rank, retired: P.retired, laps: race.laps, trackId: tr.def.id,
    team: NET.teamRace ? P.team : null, teamWin: !!(tl && tl.win === P.team), stats: st, jumps: race.pJumps });
  $('btnAgain').textContent = '대기실로';
  $('btnMenu2').textContent = '방 나가기';
  $('result').classList.remove('hidden');
  Snd.stopBgm();
}
function backToLobby() {
  if (!NET.active) return toMenu();
  NET.inRace = false; NET.retireT = -1;
  for (const px of NET.proxies.values()) if (px.view) disposeGroup(px.view.g);
  NET.proxies.clear();
  state = 'lobby'; race = null;
  $('result').classList.add('hidden'); $('hud').classList.add('hidden'); $('touch').classList.add('hidden'); $('pause').classList.add('hidden');
  $('lobby').classList.remove('hidden');
  newDemo();
  state = 'lobby';
  showRoom();
  if (NET.host) broadcastLobby();
}
setInterval(() => { if (NET.active && NET.host) sendAll({ t: 'ping', c: performance.now() }); }, 1000);
$('btnHost').onclick = netHost;
$('btnJoin').onclick = netJoin;
$('btnNetStart').onclick = () => { if (NET.host) hostStart(); else toggleReady(); };
$('roomTitle').addEventListener('change', () => { if (!NET.host) return; NET.title = cleanTitle($('roomTitle').value) || myNick() + '님의 방'; broadcastLobby(); });
$('btnInvite').onclick = () => {
  const url = location.href.split('#')[0] + '#join=' + NET.code;
  const done = ok => setStatus(ok ? '초대 링크를 복사했습니다. 친구에게 보내 주세요.' + (location.protocol === 'file:' ? ' (파일로 실행 중이라 링크로는 열리지 않습니다. 코드 ' + NET.code + '를 알려 주세요.)' : '') : '복사하지 못했습니다. 방 코드 ' + NET.code + '를 알려 주세요.', !ok);
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(() => done(true), () => done(false));
  else done(false);
};
$('btnLeave').onclick = () => { leaveRoom(); };
$('codeIn').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); });

/* ---------- teams ---------- */
function renderTeamResult(tl, myTeam) {
  $('resTitle').textContent = TEAM_EN[tl.win] + ' TEAM WIN';
  $('resTitle').style.color = TEAM_CSS[tl.win];
  $('trR').textContent = tl.score[0]; $('trB').textContent = tl.score[1];
  $('resTeam').className = 'teamres w' + tl.win;
  $('teamNote').textContent = (myTeam != null ? (myTeam === tl.win ? '우리 팀 승리! ' : '우리 팀 패배. ') : '') +
    (tl.tie ? '점수가 같아 가장 높은 순위를 낸 ' + TEAM_NAME[tl.win] + '팀이 이겼습니다.' : '');
}
const TEAM_PTS = [10, 8, 6, 5, 4, 3, 2, 1];
const TEAM_COL = [0xff4a3d, 0x2f8fff], TEAM_CSS = ['#ff4a3d', '#2f8fff'], TEAM_NAME = ['레드', '블루'], TEAM_EN = ['RED', 'BLUE'];
function teamPoints(o) { return o.retired || o.left ? 0 : (TEAM_PTS[o.rank - 1] || 0); }
// list: [{rank, team, retired, left}] -> {score:[r,b], best:[rank,rank], win}
function teamTally(list) {
  const score = [0, 0], best = [99, 99];
  for (const o of list) { if (o.team == null) continue; score[o.team] += teamPoints(o); if (!o.retired && !o.left) best[o.team] = Math.min(best[o.team], o.rank); }
  const win = score[0] !== score[1] ? (score[0] > score[1] ? 0 : 1) : (best[0] < best[1] ? 0 : 1);
  return { score, best, win, tie: score[0] === score[1] };
}
function statLine(st) {
  return '드리프트 ' + st.drifts + '회 · 순간 부스터 ' + st.ib + '회 (퍼펙트 ' + st.perfect + '회)' +
    (st.drifts ? ' · 성공률 ' + Math.round(st.ib / st.drifts * 100) + '%' : '') +
    ' · 톡톡이 ' + (st.taps || 0) + '회 · 드래그 ' + (st.drags || 0) + '회 · 커팅 ' + (st.cuts || 0) + '회';
}
/* ---------- results ---------- */
function showResultsTA() {
  state = 'result';
  const P = race.player, tr = race.track, ti = save.settings.track;
  $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
  $('boostFx').style.opacity = 0; $('ibFx').style.opacity = 0;
  const key = 'ta_' + tr.def.id + '_' + race.laps, lk = 'ta_' + tr.def.id + '_lap';
  const prevMine = ghostMine ? ghostMine.time : null;
  const isPB = prevMine == null || P.finishTime < prevMine;
  const beatGhost = P.finishTime < ghost.time;
  $('resTitle').textContent = isPB ? 'NEW RECORD' : 'TIME ATTACK';
  $('resSub').textContent = tr.def.name + ' · ' + race.laps + ' LAP · 타임어택 · 상대: ' + (ghost.isDefault ? '기본 고스트(' + race.diff.name + ')' : ghost.owner ? ghost.owner + ' (랭킹)' : '내 최고 기록');
  let html = '', cum = 0;
  P.lapTimes.forEach((t, i) => {
    cum += t;
    const gl = ghost.lapTimes[i], d = gl != null ? t - gl : null;
    html += `<tr><td class="r">L${i + 1}</td><td class="t">${Core.fmtTime(t)}</td><td class="t" style="color:${d == null ? '#999' : d < 0 ? '#2fb8ff' : '#ff5a4a'}">${d == null ? '--' : fmtDelta(d)}</td></tr>`;
  });
  const dt = P.finishTime - ghost.time;
  html += `<tr class="me"><td class="r">≡</td><td class="t">${Core.fmtTime(P.finishTime)}</td><td class="t" style="color:${dt < 0 ? '#2fb8ff' : '#ff5a4a'}">${fmtDelta(dt)}</td></tr>`;
  $('resTable').innerHTML = html;
  let rec = '';
  if (isPB) {
    save.best[key] = P.finishTime;
    const ok = storeGhost(ti, race.laps, { time: P.finishTime, lapTimes: P.lapTimes.slice(), data: race.rec.data, color: P.color, skin: race.playerSkin });
    rec = (prevMine == null ? '첫 기록 등록' : '최고 기록 갱신 ' + fmtDelta(P.finishTime - prevMine)) + (ok ? ' · 고스트 저장됨' : ' · 고스트 저장 실패(저장 공간 부족)');
  } else rec = '내 최고 기록 ' + Core.fmtTime(prevMine) + '까지 ' + fmtDelta(P.finishTime - prevMine);
  if (ghost.isDefault) rec += beatGhost ? ' · 기본 고스트 격파!' : '';
  const bl = Math.min(...P.lapTimes);
  if (!save.best[lk] || bl < save.best[lk]) { save.best[lk] = bl; rec += ' · 베스트 랩 ' + Core.fmtTime(bl); }
  persist();
  $('resRec').textContent = rec;
  const st = P.stats;
  $('resStats').textContent = statLine(st);
  grantRewards({ mode: 'ta', retired: false, laps: race.laps, trackId: tr.def.id, pb: isPB, beatDefault: ghost.isDefault && beatGhost,
    beatDefaultHard: ghost.isDefault && beatGhost && save.settings.diff === 2, stats: st, jumps: race.pJumps });
  submitRecord(tr.def.id, race.laps, P, race);
  $('result').classList.remove('hidden');
  Snd.stopBgm();
}
function showResults() {
  $('resTitle').style.color = ''; $('resTeam').classList.add('hidden'); if (!race.rewarded) $('resReward').innerHTML = '';
  if (NET.inRace) return showResultsNet();
  if (race.solo) return showResultsTA();
  state = 'result';
  const P = race.player, tr = race.track;
  $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
  $('boostFx').style.opacity = 0;
  const title = P.retired ? 'RETIRE' : (P.rank === 1 ? 'WINNER' : P.rank + (['ST', 'ND', 'RD'][P.rank - 1] || 'TH') + ' PLACE');
  $('resTitle').textContent = title;
  $('resSub').textContent = tr.def.name + ' · ' + race.laps + ' LAP · ' + race.diff.name + (race.teams ? ' · 팀전' : '');
  let html = '';
  for (const k of race.order) {
    const t = k.finished && !k.retired ? Core.fmtTime(k.finishTime) : (k.retired ? 'RETIRE' : '주행 중');
    const bl = k.lapTimes.length ? Core.fmtTime(Math.min(...k.lapTimes)) : '--';
    html += `<tr class="${k.isPlayer ? 'me' : ''}${race.teams ? ' t' + k.team : ''}"><td class="r">${k.rank}</td><td>${k.name}</td><td class="t">${t}</td><td class="t" style="color:#999">${race.teams ? '+' + teamPoints(k) : bl}</td></tr>`;
  }
  $('resTable').innerHTML = html;
  $('resTeam').classList.toggle('hidden', !race.teams);
  if (race.teams) renderTeamResult(teamTally(race.order), P.team);
  let rec = '';
  if (!P.retired && P.finished) {
    const key = tr.def.id + '_' + race.laps;
    if (!save.best[key] || P.finishTime < save.best[key]) { save.best[key] = P.finishTime; rec = '신기록! '; }
    const bl = Math.min(...P.lapTimes), lk = tr.def.id + '_lap';
    if (!save.best[lk] || bl < save.best[lk]) { save.best[lk] = bl; rec += '베스트 랩 갱신 ' + Core.fmtTime(bl); }
    persist();
  }
  $('resRec').textContent = rec;
  const st = P.stats;
  $('resStats').textContent = statLine(st);
  const tl = race.teams ? teamTally(race.order) : null;
  grantRewards({ mode: 'speed', rank: P.rank, retired: P.retired, diff: save.settings.diff, laps: race.laps, trackId: tr.def.id,
    team: race.teams ? P.team : null, teamWin: !!(tl && tl.win === P.team), stats: st, jumps: race.pJumps });
  $('result').classList.remove('hidden');
  Snd.stopBgm();
}

/* ---------- events ---------- */
function handleEvents(r, isDemo) {
  const P = r.player;
  for (const e of r.events) {
    if (isDemo) continue;
    const me = e.k && e.k === P;
    switch (e.t) {
      case 'count': showMsg(String(e.n), 0.9); Snd.count(); break;
      case 'go': showMsg('GO!', 0.9); Snd.go(); break;
      case 'startBoost': if (me) { showSub('출발 부스터!', 1.2); Snd.boost(); } break;
      case 'boost': if (me) Snd.boost(); break;
      case 'ib': if (me) {
        Snd.ib(e.perfect, e.combo);
        cueGrade = (e.perfect ? 'PERFECT' : 'GOOD') + (e.combo > 1 ? ' x' + e.combo : ''); cueHold = 0.5; cueHitPhase = P.ibPhase;
        fov += e.perfect ? 7 : 4;
      } break;
      case 'item': if (me) { Snd.item(); } break;
      case 'tap': if (me) Snd.tap(); break;
      case 'drag': if (me) Snd.drag(); break;
      case 'jump': if (me) { Snd.jump(); r.pJumps = (r.pJumps || 0) + 1; } break;
      case 'land': if (me) { Snd.wall(e.p * 0.7); shake = Math.min(1, shake + e.p / 40); } break;
      case 'fall': if (me) { showMsg('추락!', 1.2); Snd.fall(); } break;
      case 'respawn': if (me) { showSub('위치 복구', 1.0); } break;
      case 'pad': if (me) { Snd.ib(false, 1); } break;
      case 'wall': if (me) { Snd.wall(e.p); shake = Math.min(1, shake + e.p / 25); } break;
      case 'bump': if (e.k === P || e.k2 === P) { Snd.wall(e.p * 0.6); shake = Math.min(1, shake + e.p / 40); } break;
      case 'lap': case 'finalLap': if (me) {
        showMsg(e.t === 'finalLap' ? 'FINAL LAP' : 'LAP ' + (P.lapsDone + 1), 1.3);
        const lt = Core.fmtTime(P.lapTimes[P.lapTimes.length - 1]);
        if (r.solo && ghost) { const d = r.time - ghostCum(P.lapsDone); showSub(lt + '   ' + fmtDelta(d), 1.8, d < 0 ? '#2fb8ff' : '#ff5a4a'); }
        else showSub(lt, 1.5);
        Snd.lap();
      } break;
      case 'finish': if (me) {
        showMsg('FINISH', 2.5);
        if (r.solo && ghost) { const d = P.finishTime - ghost.time; showSub(Core.fmtTime(P.finishTime) + '   ' + fmtDelta(d), 2.5, d < 0 ? '#2fb8ff' : '#ff5a4a'); }
        else showSub(P.rank + ' 위  ' + Core.fmtTime(P.finishTime), 2.5);
        Snd.finish(); resultTimer = 3;
      } break;
      case 'retire': if (me) { showMsg('RETIRE', 2.5); showSub('', 0); resultTimer = 2.5; } break;
    }
  }
  r.events.length = 0;
}

/* ---------- HUD ---------- */
let lastHud = {};
function setText(id, v) { if (lastHud[id] !== v) { lastHud[id] = v; $(id).innerHTML = v; } }
function updateHud(r) {
  const P = r.player, s = r.karts.length;
  setText('lapNum', Math.min(r.laps, Math.max(1, P.lapsDone + 1)) + '<small>/' + r.laps + '</small>');
  const t = r.state === 'countdown' ? 0 : (P.finished ? P.finishTime : r.time);
  setText('timeNow', Core.fmtTime(t));
  setText('lapList', P.lapTimes.map((x, i) => 'L' + (i + 1) + ' ' + Core.fmtTime(x)).join('<br>'));
  const order = NET.inRace ? netOrder() : r.order;
  const total = order ? order.length : s;
  const myRank = NET.inRace ? (order.find(o => o.isPlayer) || {}).rank : P.rank;
  setText('rankNum', (myRank || total) + '<small>/' + total + '</small>');
  const teamOn = NET.inRace ? NET.teamRace : !!r.teams;
  if (order) setText('rankList', order.map(k => `<div class="${k.isPlayer ? 'me' : ''}${teamOn && k.team != null ? ' t' + k.team : ''}" style="border-left-color:#${k.color.toString(16).padStart(6, '0')}"><span>${k.rank}  ${k.name}</span></div>`).join(''));
  $('teamBox').classList.toggle('hidden', !teamOn);
  $('hud').classList.toggle('team', teamOn);
  if (teamOn && order) {
    const tl = teamTally(order);
    setText('tsR', String(tl.score[0])); setText('tsB', String(tl.score[1]));
    $('teamBox').classList.toggle('rl', tl.score[0] > tl.score[1]); $('teamBox').classList.toggle('bl', tl.score[1] > tl.score[0]);
  }
  setText('speed', Math.round(Math.abs(P.v) * C.KMH) + '<small>km/h</small>');
  $('gaugeFill').style.width = (P.gauge * 100).toFixed(1) + '%';
  $('gauge').classList.toggle('full', P.gauge >= 1);
  $('slot1').classList.toggle('on', P.items >= 1);
  $('slot2').classList.toggle('on', P.items >= 2);
  const rtT = NET.inRace ? NET.retireT : r.retireT;
  const showRet = rtT > 0 && !P.finished;
  $('retire').classList.toggle('hidden', !showRet);
  if (showRet) setText('retire', '리타이어까지 ' + Math.ceil(rtT));
  $('wrong').classList.toggle('hidden', !(P.wrongWay && !P.finished));
  const bst = P.boostT > 0 || P.startT > 0;
  $('boostFx').style.opacity = bst ? 1 : 0;
  $('ibFx').style.opacity = !bst && P.ibT > 0 ? (P.ibPerfect ? 1 : 0.6) : 0;
  updateCue(P);
  if (r.solo && ghost) {
    setText('taLbl', ghost.isDefault ? '기본 고스트 · ' + r.diff.name : ghost.owner ? ghost.owner + ' · 랭킹 고스트' : '내 최고 기록');
    setText('taBest', Core.fmtTime(ghost.time));
    let d = null;
    if (P.finished) d = P.finishTime - ghost.time;
    else if (r.state === 'racing' && P.dist > 5) { const gt = Core.ghostTimeAtDist(ghost, P.dist); d = gt == null ? null : r.time - gt; }
    const el = $('taDelta');
    if (d == null) { setText('taDelta', r.state === 'racing' && !P.finished ? '+' + (r.time - ghost.time).toFixed(3) : '±0.000'); el.className = 'num' + (r.state === 'racing' && !P.finished && r.time > ghost.time ? ' slow' : ''); }
    else { setText('taDelta', fmtDelta(d)); el.className = 'num ' + (d < 0 ? 'fast' : 'slow'); }
  }
}

/* ---------- instant-boost timing cue ---------- */
let cueGrade = '', cueHold = 0, cueHitPhase = 0, cueShown = false;
const cueX = ph => (ph <= 1 ? ph * 0.75 : 0.75 + (ph - 1) * 0.25) * 100;
(function initCue() {
  const z = $('ibZone');
  z.style.left = cueX(C.IB_PERF) + '%';
  z.style.width = (cueX(C.IB_PERF_END) - cueX(C.IB_PERF)) + '%';
})();
function updateCue(P) {
  const open = save.settings.ibGuide && P.ibOpen && !P.ibUsed && !P.finished;
  const show = open || cueHold > 0;
  if (show !== cueShown) { $('ibCue').classList.toggle('hidden', !show); cueShown = show; }
  if (!show) return;
  const ph = open ? P.ibPhase : cueHitPhase;
  $('ibNeedle').style.left = Math.min(100, cueX(ph)) + '%';
  const inZone = ph >= C.IB_PERF && ph <= C.IB_PERF_END;
  $('ibCue').classList.toggle('zone', open && inZone);
  $('ibCue').classList.toggle('hit', cueHold > 0);
  setText('ibGrade', cueHold > 0 ? cueGrade : '↑');
}

/* ---------- render karts ---------- */
function syncKarts(r, dt) { syncKartList(r.karts, kartViews, dt); }
function syncKartList(list, views, dt) {
  list.forEach((k, i) => {
    const v = views[i]; if (!v) return;
    const ky = k.y || 0;
    v.g.position.set(k.x, ky, k.z);
    if (v.tag) { const cdx = k.x - camera.position.x, cdz = k.z - camera.position.z; v.tag.visible = cdx * cdx + cdz * cdz > 100; }
    const trk = world && world.tr;
    let slopeP = 0;
    if (trk && trk.hasElev) {
      const ks = k.s != null ? k.s : ((k.dist % trk.L) + trk.L) % trk.L;
      const gi = Math.round(ks / trk.ds) % trk.N, gH = trk.h[gi];
      const overRoad = !trk.gapMask[gi] && !k.fall;
      v.shadow.visible = overRoad && ky - gH < 25;
      v.shadow.position.y = gH - ky + 0.05;
      const sc = 1 / (1 + Math.max(0, ky - gH) * 0.08); v.shadow.scale.set(sc, sc, 1);
      slopeP = k.air ? Core.clamp(-(k.vy || 0) * 0.025, -0.35, 0.35) : -Math.atan(trk.grade[gi] * Math.cos(k.th - trk.ang[gi]));
    } else if (v.shadow.position.y !== 0.05) { v.shadow.position.y = 0.05; v.shadow.visible = true; v.shadow.scale.set(1, 1, 1); }
    v.g.rotation.y = k.th;
    const roll = Core.clamp(-k.slip * 0.22, -0.18, 0.18) + Core.clamp(-k.steerVis * Math.abs(k.v) / 600, -0.06, 0.06);
    v.body.rotation.z += (roll - v.body.rotation.z) * Math.min(1, dt * 10);
    const pitch = ((k.boostT > 0 || k.startT > 0) ? -0.04 : 0) + slopeP;
    v.body.rotation.x += (pitch - v.body.rotation.x) * Math.min(1, dt * 6);
    v.spin += k.v * dt / 0.45;
    for (const w of v.wheels) { w.w.rotation.x = v.spin; if (w.front) w.piv.rotation.y = -k.steerVis * 0.45; }
    const b = k.boostT > 0 || k.startT > 0 || k.ibT > 0;
    v.flame.visible = b;
    if (b) {
      const ibOnly = k.ibT > 0 && k.boostT <= 0 && k.startT <= 0;
      const mode = ibOnly ? 'ib' : 'boost';
      if (v.flameMode !== mode) {
        v.flameMode = mode;
        v.flameMats[0].color.setHex(ibOnly ? 0x2fb8ff : 0xff7a1a);
        v.flameMats[1].color.setHex(ibOnly ? 0xe6fbff : 0xfff2a0);
      }
      const sc = (ibOnly ? (k.ibPerfect ? 0.9 : 0.65) : 1) * (0.85 + Math.random() * 0.35);
      v.flame.scale.set(1, 1, sc);
    }
    // rear wheel world positions
    const s = Math.sin(k.th), c = Math.cos(k.th);
    const rw = (lx, lz) => [k.x + c * lx + s * lz, k.z - s * lx + c * lz];
    const L = rw(1.24, -1.15), R = rw(-1.24, -1.15);
    const drifting = k.drift >= 1 && !k.air && Math.abs(k.v) > 8 && Math.abs(Math.sin(k.slip)) > 0.12;
    if (drifting) {
      if (v.prevL) {
        const dx = L[0] - v.prevL[0], dz = L[1] - v.prevL[1], ll = Math.hypot(dx, dz);
        if (ll > 0.6) {
          const px = -dz / ll * 0.22, pz = dx / ll * 0.22;
          skidQuad([v.prevL[0] - px, v.prevL[1] - pz], [v.prevL[0] + px, v.prevL[1] + pz], [L[0] - px, L[1] - pz], [L[0] + px, L[1] + pz], ky);
          skidQuad([v.prevR[0] - px, v.prevR[1] - pz], [v.prevR[0] + px, v.prevR[1] + pz], [R[0] - px, R[1] - pz], [R[0] + px, R[1] + pz], ky);
          v.prevL = L; v.prevR = R;
        }
      } else { v.prevL = L; v.prevR = R; }
      if (Math.random() < 0.6) {
        const full = k.gauge > 0.85 || k.items > 0;
        const src = Math.random() < 0.5 ? L : R;
        spawn(src[0], ky + 0.15, src[1], (Math.random() - 0.5) * 4 - s * 3, 2 + Math.random() * 3, (Math.random() - 0.5) * 4 - c * 3, 0.35,
          1, full ? 0.55 : 0.85, full ? 0.15 : 0.3);
      }
    } else { v.prevL = null; v.prevR = null; }
    const ready = k.ibOpen && k.ibPhase >= C.IB_PERF && k.ibPhase <= C.IB_PERF_END;
    if (ready && Math.random() < 0.9) {
      const src = Math.random() < 0.5 ? L : R;
      spawn(src[0], ky + 0.2, src[1], (Math.random() - 0.5) * 3 - s * 2, 3 + Math.random() * 3, (Math.random() - 0.5) * 3 - c * 2, 0.3, 0.55, 0.9, 1);
    }
    if (b && Math.random() < 0.7) {
      const e = rw((Math.random() < 0.5 ? 0.4 : -0.4), -2.4);
      const ibOnly = k.ibT > 0 && k.boostT <= 0 && k.startT <= 0;
      spawn(e[0], ky + 0.65, e[1], -s * 8 + (Math.random() - 0.5) * 2, Math.random() * 1.5, -c * 8 + (Math.random() - 0.5) * 2, 0.25, ibOnly ? 0.3 : 1, ibOnly ? 0.75 : 0.5, ibOnly ? 1 : 0.1);
    }
  });
  if (skid.dirty) { skid.g.attributes.position.needsUpdate = true; skid.dirty = false; }
}

function updateCamera(k, dt, isDemo) {
  const tgtYaw = k.th + Core.wrapA(k.phi - k.th) * 0.35;
  if (!camInit) { camYaw = tgtYaw; }
  camYaw += Core.wrapA(tgtYaw - camYaw) * (1 - Math.exp(-(isDemo ? 3 : 6) * dt));
  const boosting = k.boostT > 0 || k.startT > 0;
  const portrait = innerWidth < innerHeight;
  const dist = (portrait ? 8.5 : 7.2) + (boosting ? 1.2 : 0) + (isDemo ? 3 : 0);
  const hgt = (portrait ? 3.6 : 3.0) + (isDemo ? 1.5 : 0);
  const tx = k.x - Math.sin(camYaw) * dist, tz = k.z - Math.cos(camYaw) * dist;
  const ky = k.y || 0;
  if (!camInit) { camPos.set(tx, ky + hgt, tz); camInit = true; }
  const f = 1 - Math.exp(-12 * dt);
  camPos.x += (tx - camPos.x) * f; camPos.z += (tz - camPos.z) * f; camPos.y += (ky + hgt - camPos.y) * (1 - Math.exp(-(k.fall ? 2 : 7) * dt));
  camera.position.copy(camPos);
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake * 0.6; camera.position.y += (Math.random() - 0.5) * shake * 0.4;
    shake = Math.max(0, shake - dt * 3);
  }
  camera.lookAt(k.x + Math.sin(camYaw) * 5, ky + 1.2, k.z + Math.cos(camYaw) * 5);
  const base = portrait ? 82 : 68;
  const tf = base + (boosting ? 12 : (k.ibT > 0 ? 6 : 0));
  fov += (tf - fov) * Math.min(1, dt * 5);
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
}

/* ---------- loop ---------- */
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const STEP = 1 / 120;
let acc = 0, last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  Snd.bgmTick();
  if (state === 'lobby' && NET.active) drawSlots(now);
  if (garageOpen) drawGarage(now);
  if ((state === 'menu' || state === 'lobby') && demo) {
    acc += dt;
    while (acc >= STEP) { Core.stepRace(demo, STEP, null); acc -= STEP; }
    handleEvents(demo, true);
    demoSwitch -= dt;
    if (demoSwitch <= 0) { demoFocus = (demoFocus + 1) % demo.karts.length; demoSwitch = 8; camInit = false; }
    syncKarts(demo, dt); updateParts(dt);
    updateCamera(demo.karts[demoFocus], dt, true);
    Snd.updateEngine(null, false);
  } else if (race) {
    if (state === 'race' && !paused) {
      acc += dt;
      let first = true;
      while (acc >= STEP) {
        if (first) { fillInput(); first = false; }
        Core.stepRace(race, STEP, pin);
        acc -= STEP;
      }
      handleEvents(race, false);
      if (msgT > 0) { msgT -= dt; if (msgT <= 0) $('msg').style.opacity = 0; }
      if (subT > 0) { subT -= dt; if (subT <= 0) $('sub').textContent = ''; }
      if (cueHold > 0) cueHold -= dt;
      if (techT > 0) { techT -= dt; if (techT <= 0) $('techTag').classList.remove('on'); }
      if (resultTimer > 0) { resultTimer -= dt; if (resultTimer <= 0) showResults(); }
      if (NET.inRace) netTick(dt);
      updateHud(race);
      drawMini(race, race.player);
    } else if (state === 'result') {
      acc += dt;
      while (acc >= STEP) { Core.stepRace(race, STEP, null); acc -= STEP; }
      race.events.length = 0;
      if (NET.inRace) netTick(dt);
    } else acc = 0;
    if (!paused) { syncKarts(race, dt); syncGhost(dt); if (NET.inRace) syncProxies(dt); updateParts(dt); }
    updateCamera(race.player, paused ? 0 : dt, false);
    Snd.updateEngine(race.player, state === 'race' && !paused);
  }
  renderer.render(scene, camera);
}


/* ============================================================
   Profile bar, garage, account, ranking, rewards
   ============================================================ */
function esc(t) { return String(t).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }
function renderPbar() {
  const on = !!Profile.user;
  $('btnAcct').classList.toggle('on', on);
  $('acctName').textContent = on ? Profile.user.username : (Api.enabled ? '게스트 · 로그인' : '게스트');
  $('coinNum').textContent = Profile.data.coins.toLocaleString();
  $('gCoins').textContent = Profile.data.coins.toLocaleString();
}
const PANELS = ['garage', 'account', 'ranking'];
function openPanel(id) { for (const p of PANELS) $(p).classList.toggle('hidden', p !== id); $('menu').classList.add('hidden'); }
function closePanel(id) {
  $(id).classList.add('hidden'); if (state === 'menu') $('menu').classList.remove('hidden'); if (id === 'garage') garageOpen = false;
  if (id === 'account' && gateMode) { gateMode = false; setGateUI(false); afterGate(); }
}
function closeTopPanel() {
  for (const p of PANELS) if (!$(p).classList.contains('hidden')) { if (p === 'account' && gateMode) return true; closePanel(p); return true; }
  return false;
}

/* ----- rewards ----- */
function grantRewards(r) {
  if (race.rewarded) { $('resReward').innerHTML = race.rewardHtml || ''; return; }
  race.rewarded = true;
  const out = Profile.awardRace(r);
  let html = '+' + out.coins + ' 코인';
  for (const a of out.unlocked) html += '<br><span class="ach">도전 과제 달성: ' + esc(a.name) + ' — ' + esc(Profile.rewardText(a)) + '</span>';
  race.rewardHtml = html;
  $('resReward').innerHTML = html;
  if (out.unlocked.length) Snd.finish();
}

/* ----- garage ----- */
let garageOpen = false, gTab = 'body', gSel = null;
const GarageR = { r: null, scene: null, cam: null, model: null, key: '' };
function garageInit() {
  if (GarageR.r) return;
  const cv = $('gCanvas');
  GarageR.r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
  GarageR.r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  GarageR.r.setSize(cv.width, cv.height, false);
  GarageR.scene = new THREE.Scene();
  GarageR.scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 0.95));
  const dl = new THREE.DirectionalLight(0xffffff, 0.8); dl.position.set(4, 8, 6); GarageR.scene.add(dl);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(3.6, 48), new THREE.MeshBasicMaterial({ color: 0x2a2a33 }));
  floor.rotation.x = -Math.PI / 2; GarageR.scene.add(floor);
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.45, 3.6, 64), new THREE.MeshBasicMaterial({ color: 0xffd400 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; GarageR.scene.add(ring);
  GarageR.cam = new THREE.PerspectiveCamera(32, cv.width / cv.height, 0.1, 100);
  GarageR.cam.position.set(5.6, 3.3, 6.8); GarageR.cam.lookAt(0, 0.8, 0);
}
function previewSkin() {
  const sk = Profile.skin();
  if (gTab !== 'ach' && gSel != null) sk[gTab] = gTab === 'color' ? +gSel : gSel;
  return sk;
}
function drawGarage(now) {
  garageInit();
  const sk = previewSkin(), key = JSON.stringify(sk);
  if (key !== GarageR.key) {
    if (GarageR.model) disposeGroup(GarageR.model.g);
    GarageR.model = makeKartMesh(Profile.colorHex(sk.color), null, GarageR.scene, null, sk);
    GarageR.model.shadow.visible = false;
    GarageR.key = key;
  }
  GarageR.model.g.rotation.y = now / 1600;
  GarageR.r.render(GarageR.scene, GarageR.cam);
}
function openGarage() { garageOpen = true; gSel = null; openPanel('garage'); renderGarage(); }
function renderGarage() {
  renderPbar();
  const tabs = $('gTabs'); tabs.innerHTML = '';
  [['body', '바디'], ['color', '색상'], ['wheel', '바퀴'], ['helmet', '헬멧'], ['ach', '도전 과제']].forEach(([id, label]) => {
    const b = document.createElement('button'); b.className = 'opt' + (gTab === id ? ' sel' : ''); b.textContent = label;
    b.onclick = () => { gTab = id; gSel = null; renderGarage(); }; tabs.appendChild(b);
  });
  const box = $('gItems'); box.innerHTML = '';
  if (gTab === 'ach') {
    for (const a of Profile.achievements) {
      const pr = Profile.achProgress(a), d = document.createElement('div');
      d.className = 'achrow' + (pr.done ? ' done' : '');
      d.innerHTML = `<div class="an"><b>${esc(a.name)}</b><span>${esc(a.desc)} · ${pr.cur}/${pr.goal}</span><div class="bar"><i style="width:${Math.round(pr.cur / pr.goal * 100)}%"></i></div></div><div class="rw">${pr.done ? '달성' : esc(Profile.rewardText(a))}</div>`;
      box.appendChild(d);
    }
    $('gName').textContent = '도전 과제';
    $('gDesc').textContent = Profile.data.ach.length + ' / ' + Profile.achievements.length + ' 달성';
    $('gAction').classList.add('hidden');
    return;
  }
  $('gAction').classList.remove('hidden');
  const list = Profile.catalog[gTab];
  const cur = gSel != null ? gSel : Profile.data.equip[gTab];
  for (const it of list) {
    const st = Profile.itemState(gTab, it), d = document.createElement('button');
    d.className = 'gitem ' + st + (String(it.id) === String(cur) ? ' sel' : '');
    const label = st === 'equipped' ? '장착 중' : st === 'owned' ? '보유' : st === 'buy' ? it.price + ' 코인' : '도전 과제';
    const ico = gTab === 'color' ? `<div class="sw2" style="background:${hex6(it.hex)}"></div>` : '';
    d.innerHTML = ico + `<b>${esc(it.name)}</b><em>${label}</em>`;
    d.onclick = () => { gSel = it.id; renderGarage(); };
    box.appendChild(d);
  }
  const it = list.find(x => String(x.id) === String(cur)) || list[0];
  const st = Profile.itemState(gTab, it);
  $('gName').textContent = it.name;
  const achInfo = it.ach ? Profile.achievements.find(a => a.id === it.ach) : null;
  $('gDesc').textContent = (it.desc || '') + (achInfo ? (it.desc ? ' · ' : '') + '도전 과제 "' + achInfo.name + '": ' + achInfo.desc : '');
  const btn = $('gAction');
  btn.disabled = st === 'equipped' || st === 'locked' || (st === 'buy' && Profile.data.coins < it.price);
  btn.textContent = st === 'equipped' ? '장착 중' : st === 'owned' ? '장착하기' : st === 'locked' ? '도전 과제로 얻을 수 있어요' :
    (Profile.data.coins < it.price ? '코인 부족 (' + it.price + ')' : it.price + ' 코인으로 구매');
  btn.onclick = () => {
    if (st === 'owned') { Profile.equip(gTab, it.id); gSel = null; }
    else if (st === 'buy') { const r = Profile.buy(gTab, it.id); if (r.ok) { Profile.equip(gTab, it.id); Snd.item(); gSel = null; } }
    renderGarage();
  };
}

/* ----- account ----- */
let acMode = 'login', gateMode = false;
const LAST_USER_KEY = 'racing_last_user';
function lastUser() { try { return localStorage.getItem(LAST_USER_KEY) || ''; } catch (e) { return ''; } }
function rememberUser(u) { try { localStorage.setItem(LAST_USER_KEY, u); } catch (e) { } }
function setGateUI(on) {
  $('acGuestRow').classList.toggle('hidden', !on);
  $('acCloseRow').classList.toggle('hidden', on);
  $('acTitle').innerHTML = on ? '체커<span>드</span>' : 'ACCOUNT <span>계정</span>';
  $('acWelcome').textContent = on ? '로그인하면 코인·스킨·기록이 서버에 저장되고 랭킹에 참여할 수 있어요.' : '';
}
function openAccount() {
  openPanel('account');
  $('acRecShow').classList.add('hidden'); setGateUI(gateMode);
  renderAccount();
}
// shown on startup when the server is set up and nobody is logged in
function openGate() {
  gateMode = true;
  const lu = lastUser();
  acMode = lu ? 'login' : 'register';
  $('acUser').value = lu;
  openAccount();
  setTimeout(() => { try { $(lu ? 'acPass' : 'acUser').focus(); } catch (e) { } }, 50);
}
function afterGate() { renderPbar(); renderMenu(); checkInvite(); }
function renderAccount() {
  const on = !!Profile.user;
  $('acIn').classList.toggle('hidden', on || !Api.enabled);
  $('acOut').classList.toggle('hidden', !on && Api.enabled);
  if (!Api.enabled) {
    $('acInfo').innerHTML = '서버가 아직 설정되지 않아 <b>게스트</b>로만 저장돼요.<br>코인과 스킨은 이 브라우저에만 저장됩니다.';
    $('acLogout').classList.add('hidden');
    return;
  }
  $('acLogout').classList.remove('hidden');
  if (on) {
    const d = Profile.data;
    $('acInfo').innerHTML = `아이디 <b>${esc(Profile.user.username)}</b><br>코인 <b>${d.coins.toLocaleString()}</b> · 보유 스킨 <b>${d.owned.length}</b>개 · 도전 과제 <b>${d.ach.length}/${Profile.achievements.length}</b><br><span class="sm">코인·스킨·도전 과제와 타임어택 기록이 서버에 저장돼요.</span>`;
    return;
  }
  const tabs = $('acTabs'); tabs.innerHTML = '';
  [['login', '로그인'], ['register', '회원가입'], ['recover', '비밀번호 재설정']].forEach(([id, label]) => {
    const b = document.createElement('button'); b.className = 'opt' + (acMode === id ? ' sel' : ''); b.textContent = label;
    b.onclick = () => { acMode = id; $('acMsg').textContent = ''; renderAccount(); }; tabs.appendChild(b);
  });
  $('acRecRow').classList.toggle('hidden', acMode !== 'recover');
  $('acPass2Row').classList.toggle('hidden', acMode === 'login');
  $('acCarryRow').classList.toggle('hidden', acMode !== 'register');
  $('acPassLbl').textContent = acMode === 'recover' ? '새 비밀번호' : '비밀번호';
  $('acPass').autocomplete = acMode === 'login' ? 'current-password' : 'new-password';
  $('acSubmit').textContent = acMode === 'login' ? '로그인' : acMode === 'register' ? '가입하기' : '새 비밀번호로 바꾸기';
}
async function submitAccount() {
  const u = $('acUser').value.trim(), pw = $('acPass').value, pw2 = $('acPass2').value, msg = $('acMsg'), btn = $('acSubmit');
  msg.style.color = '#ff8a7a';
  if (!Api.validUser(u)) { msg.textContent = '아이디는 한글·영문·숫자·밑줄로 2~12자예요'; return; }
  if (acMode !== 'login' && pw !== pw2) { msg.textContent = '비밀번호 확인이 달라요'; return; }
  btn.disabled = true; msg.style.color = ''; msg.textContent = '처리 중...';
  try {
    if (acMode === 'login') { await Api.login(u, pw); rememberUser(u); msg.textContent = ''; closePanel('account'); }
    else if (acMode === 'register') {
      const r = await Api.register(u, pw, $('acCarry').checked); rememberUser(u);
      showRecovery(r.recovery);
    } else {
      const r = await Api.recover(u, $('acRec').value, pw); rememberUser(u);
      showRecovery(r.recovery);
    }
    $('acPass').value = ''; $('acPass2').value = ''; $('acRec').value = '';
  } catch (e) { msg.style.color = '#ff8a7a'; msg.textContent = e.message; }
  btn.disabled = false;
  renderPbar();
}
function showRecovery(code) {
  $('acIn').classList.add('hidden'); $('acOut').classList.add('hidden'); $('acCloseRow').classList.add('hidden'); $('acGuestRow').classList.add('hidden');
  $('acRecShow').classList.remove('hidden'); $('acRecCode').textContent = code; $('acMsg').textContent = '';
}

/* ----- ranking & ghosts from the server ----- */
let chosenGhost = null;
function renderGhostRow() {
  const s = save.settings, row = $('rowGhost');
  row.classList.toggle('hidden', s.mode !== 'ta');
  if (s.mode !== 'ta') return;
  const og = $('optGhost'); og.innerHTML = '';
  const tid = Core.TRACK_DEFS[s.track].id;
  const cg = chosenGhost && chosenGhost.trackId === tid && chosenGhost.laps === s.laps ? chosenGhost : null;
  const mk = (label, sel, fn) => { const b = document.createElement('button'); b.className = 'opt' + (sel ? ' sel' : ''); b.textContent = label; b.onclick = fn; og.appendChild(b); };
  mk('자동 (내 기록·기본 고스트)', !cg, () => { chosenGhost = null; renderMenu(); });
  if (Api.enabled) mk('랭킹에서 고르기', !!cg, () => openRanking());
  $('ghostNote').textContent = cg ? '상대: ' + cg.owner + ' ' + Core.fmtTime(cg.time) + ' (랭킹 고스트)' :
    (Api.enabled ? '랭킹에서 다른 사람의 고스트를 골라 겨룰 수 있어요.' : '');
}
async function openRanking() {
  const s = save.settings, d = Core.TRACK_DEFS[s.track];
  openPanel('ranking');
  $('rkSub').textContent = d.name + ' · ' + s.laps + ' LAP · 타임어택 랭킹';
  $('rkTable').innerHTML = ''; $('rkMsg').textContent = '불러오는 중...';
  try {
    const r = await Api.leaderboard(d.id, s.laps);
    const me = Profile.user ? Profile.user.username.toLowerCase() : '';
    if (!r.rows.length) { $('rkMsg').textContent = '아직 기록이 없어요. 첫 기록의 주인공이 되어 보세요.'; return; }
    $('rkMsg').textContent = '';
    $('rkTable').innerHTML = r.rows.map(x => `<tr class="${x.username.toLowerCase() === me ? 'me' : ''}"><td class="r">${x.rank}</td><td>${esc(x.username)}</td><td class="t">${Core.fmtTime(x.time)}</td><td class="t"><button data-u="${esc(x.username)}">도전</button></td></tr>`).join('');
    $('rkTable').querySelectorAll('button').forEach(b => b.onclick = () => pickServerGhost(d.id, s.laps, b.dataset.u));
  } catch (e) { $('rkMsg').textContent = e.message; }
}
async function pickServerGhost(trackId, laps, user) {
  $('rkMsg').textContent = '고스트 불러오는 중...';
  try {
    const g = await Api.ghost(trackId, laps, user);
    const sk = g.skin || {};
    chosenGhost = Core.prepGhost({ time: g.time, lapTimes: g.lapTimes, data: g.ghost.data, stride: g.ghost.stride,
      color: Profile.colorHex(sk.color || 0), skin: sk, owner: g.username, trackId, laps });
    closePanel('ranking');
    renderMenu();
  } catch (e) { $('rkMsg').textContent = e.message; }
}
async function submitRecord(trackId, laps, P, r) {
  if (!Api.enabled || !Profile.user || !r.rec) return;
  try {
    const res = await Api.submitRecord({ track: trackId, laps, time: +P.finishTime.toFixed(3), lapTimes: P.lapTimes.map(x => +x.toFixed(3)),
      skin: r.playerSkin, ghost: { stride: Core.GHOST_STRIDE, data: r.rec.data } });
    if (res && res.best) $('resRec').textContent += ' · 서버 랭킹 ' + res.rank + '위';
  } catch (e) { console.warn('record upload failed', e.message); }
}

/* ----- wiring ----- */
$('btnGarage').onclick = openGarage;
$('gClose').onclick = () => closePanel('garage');
$('btnAcct').onclick = openAccount;
$('acClose').onclick = () => closePanel('account');
$('acSubmit').onclick = submitAccount;
$('acLogout').onclick = async () => { await Api.logout(); renderAccount(); renderPbar(); renderMenu(); };
$('acRecOk').onclick = () => { closePanel('account'); };
$('acRecCopy').onclick = () => { const t = $('acRecCode').textContent; if (navigator.clipboard) navigator.clipboard.writeText(t).catch(() => { }); $('acRecCopy').textContent = '복사됨'; };
$('rkClose').onclick = () => closePanel('ranking');
['acUser', 'acPass', 'acPass2', 'acRec'].forEach(id => $(id).addEventListener('keydown', e => { if (e.code === 'Enter') submitAccount(); }));
Profile.onChange(() => { renderPbar(); if (garageOpen) renderGarage(); });
(function migrateLegacyColor() {
  let had = false; try { had = !!localStorage.getItem('racing_profile_guest'); } catch (e) { }
  if (!had && !Profile.user) { const c = save.settings.color | 0; if (c >= 0 && c < 8) Profile.data.equip.color = c; Profile.persist(); }
})();
renderPbar();
$('acGuest').onclick = () => closePanel('account');
let startChecked = false;
function startupGate() {
  if (startChecked) return; startChecked = true;
  if (Api.enabled && !Profile.user) openGate(); else afterGate();
}
Api.resume().then(() => { renderPbar(); startupGate(); }, () => startupGate());

renderMenu();
newDemo();
requestAnimationFrame(frame);
function checkInvite() {
  const m = location.hash.match(/join=([A-Za-z0-9]{5})/);
  if (!m || gateMode || NET.active || state === 'race' || state === 'result') return;
  save.settings.mode = 'net'; persist(); renderMenu();
  openLobby();
  $('codeIn').value = m[1].toUpperCase();
  setStatus('초대받은 방입니다. 닉네임을 확인하고 참가를 눌러 주세요.');
}
window.addEventListener('hashchange', checkInvite);
})();
