(function (root) {
'use strict';

const C = {
  ROAD_HALF: 9, CURB_OUT: 10.2, WALL: 10.8, KART_R: 1.1,
  BASE_V: 44, BOOST_V: 58, IB_V: 52, IB_V_P: 55, START_V: 54, REV_V: 12,
  ACC: 34, ACC_IB: 60, ACC_BOOST: 85,
  BOOST_T: 2.6, IB_T: 0.85, IB_T_P: 1.15, START_T: 1.3,
  IB_POST: 0.2, IB_PERF: 0.75, IB_PERF_END: 1.5, IB_COMBO: 5,
  STEER: 2.3, GRIP_K: 12, DRIFT_K: 3.2, REC_T: 0.4, GAUGE_K: 0.016,
  TAP_T: 0.16, TAP_GAUGE: 0.018, DRAG_T: 0.45, DRAG_ACC: 4.5, DRAG_REC: 0.8,
  KMH: 4.4, COUNTDOWN: 3.2, RETIRE: 10,
  GRAV: 32, SLOPE_K: 20, KICK_LEN: 14, KICK_RISE: 1.6, PAD_T: 0.9
};
C.LIMIT = C.WALL - C.KART_R;

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function wrapA(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

const TRACK_DEFS = [
  {
    id: 'green', concept: 'forest', name: '그린 서킷', desc: '완만한 코너 위주의 입문 코스', seed: 11,
    pts: [[0,-80],[0,100],[10,130],[40,140],[140,140],[170,150],[180,180],[180,230],[200,255],[280,255],[300,235],[300,-60],[285,-90],[250,-100],[150,-100],[120,-130],[90,-160],[30,-160],[5,-130]]
  },
  {
    id: 'valley', concept: 'desert', name: '헤어핀 밸리', desc: '급커브가 이어지는 테크니컬 코스', seed: 23,
    pts: [[0,-40],[0,160],[25,210],[70,215],[90,175],[85,120],[110,80],[165,85],[190,130],[230,200],[290,200],[315,150],[290,90],[300,30],[330,-30],[310,-110],[250,-135],[205,-85],[160,-100],[130,-145],[70,-140],[20,-100]]
  },
  {
    id: 'coast', concept: 'sea', name: '오션 하이웨이', desc: '긴 직선과 고속 코너의 해안 도로', seed: 37,
    pts: [[0,-120],[0,270],[8,296],[34,306],[200,305],[260,290],[300,250],[330,180],[320,100],[340,20],[400,-30],[488,-22],[510,-42],[510,-183],[488,-205],[320,-225],[200,-215],[40,-232],[8,-218]]
  },
  {
    id: 'city', concept: 'city', name: '시티 블록', desc: '직각 코너가 연속되는 도심 코스', seed: 41,
    poly: [[0,-100],[0,110],[120,110],[120,230],[260,230],[260,130],[380,130],[380,-100],[220,-100],[220,40],[90,40],[90,-100]], round: 20
  },
  {
    id: 'canyon', concept: 'desert', name: '레드 캐니언', desc: 'S자 연속 코너의 협곡 코스', seed: 53,
    pts: [[0,-80],[0,80],[-30,140],[0,200],[60,220],[100,180],[90,120],[130,80],[200,90],[230,150],[290,170],[340,120],[320,40],[260,10],[250,-60],[300,-110],[290,-190],[220,-220],[150,-180],[130,-120],[90,-105],[50,-140],[10,-140]]
  },
  {
    id: 'blizzard', concept: 'ice', name: '블리자드 패스', desc: '오르막·점프대·낭떠러지가 있는 3km 설산 코스', seed: 67, half: 7.5, grip: 0.72, hard: true, scale: 1.3,
    elev: [[0,0],[130,0],[340,14],[440,16],[640,16],[840,9],[1000,4],[1160,8],[1300,20],[1500,26],[1620,30],[1850,30],[2000,24],[2140,22],[2234,22],[2254,16],[2400,10],[2540,8],[2620,8],[2638,4],[2700,3],[2850,0],[9999,0]],
    gaps: [[2234, 20], [2620, 18]],
    open: [[1565, 1715]],
    pads: [[200, 12], [2168, 12], [2556, 12]],
    pts: [[0,-150],[0,165],[8,192],[30,204],[52,192],[60,165],[60,74],[73,50],[63,26],[73,2],[76,-40],[110,-88],[175,-100],[228,-70],[250,-5],[240,55],[268,95],[240,135],[268,175],[245,215],[265,262],[320,288],[375,282],[398,252],[384,218],[350,205],[340,165],[372,120],[345,75],[375,30],[380,-40],[385,-170],[340,-228],[200,-240],[90,-238],[35,-215],[8,-190]]
  },
  {id: 'cherry',name: '체리 블로썸',desc: '벚꽃길 언덕 코스',concept: 'forest',seed: 105,elev: [[0,0],[120,0],[260,9],[440,9],[620,1],[800,0],[980,7],[1160,8],[1340,5],[1520,9],[1689,0],[9999,0]],pts: [[-48,-173],[23,-139],[131,-171],[240,-151],[297,-88],[336,8],[300,99],[189,145],[83,134],[34,121],[-53,195],[-164,221],[-262,169],[-267,85],[-227,0],[-257,-66],[-243,-186],[-139,-212]]},
  {id: 'jungle',name: '정글 런',desc: '오르막과 강 점프가 있는 밀림 코스',concept: 'forest',seed: 102,half: 8.5,elev: [[0,0],[120,0],[260,1],[390,5],[476,5],[576,5],[594,4],[674,2],[780,1],[910,11],[1040,18],[1170,8],[1300,-2],[1430,4],[1560,4],[1690,3],[1820,-4],[1938,0],[9999,0]],gaps: [[576,18]],pads: [[520,12]],pts: [[120,-190],[189,-174],[239,-111],[337,-64],[401,-14],[413,94],[223,122],[93,91],[71,124],[32,222],[-44,274],[-152,288],[-204,179],[-247,118],[-305,87],[-304,0],[-307,-74],[-255,-144],[-218,-179],[-129,-224],[-34,-206],[21,-198]]},
  {id: 'dunes',name: '사하라 듄',desc: '모래 언덕을 넘는 점프 코스',concept: 'desert',seed: 101,elev: [[0,0],[120,0],[260,-1],[410,9],[560,2],[710,10],[860,8],[911,5],[1011,5],[1029,4],[1109,2],[1160,6],[1310,1],[1460,6],[1610,-3],[1760,6],[1956,0],[9999,0]],gaps: [[1011,18]],pads: [[955,12]],pts: [[-144,-210],[-89,-330],[56,-318],[128,-190],[124,-79],[176,-63],[322,10],[373,117],[274,205],[176,255],[76,278],[-34,227],[-126,161],[-202,149],[-312,77],[-331,6],[-288,-79],[-178,-116]]},
  {id: 'icelake',name: '아이스 레이크',desc: '얼어붙은 호수 위 빙판 코스',concept: 'ice',seed: 105,half: 9,grip: 0.62,pts: [[-120,173],[-174,118],[-280,84],[-289,10],[-229,-76],[-179,-107],[-148,-209],[-66,-329],[80,-346],[154,-238],[134,-89],[145,-50],[225,-8],[283,96],[254,153],[168,230],[43,285],[-45,246]]},
  {id: 'sunset',name: '선셋 비치',desc: '노을 진 해변 고속 코스',concept: 'sea',seed: 101,elev: [[0,0],[120,0],[260,0],[480,3],[700,1],[806,4],[906,4],[924,3],[1004,1],[1140,3],[1360,2],[1580,5],[1800,0],[2098,0],[9999,0]],gaps: [[906,18]],pads: [[850,12]],pts: [[273,-153],[291,-87],[344,-9],[374,89],[239,153],[120,159],[53,187],[-90,290],[-251,284],[-364,221],[-385,119],[-362,11],[-278,-69],[-177,-105],[-121,-154],[-44,-275],[74,-342],[225,-321]]},
  {id: 'volcano',name: '볼케이노 림',desc: '용암 위를 뛰어넘는 화산 코스',concept: 'volcano',seed: 103,half: 8.2,elev: [[0,0],[120,0],[260,11],[400,1],[540,1],[680,0],[820,5],[960,16],[1100,8],[1240,15],[1381,17],[1481,17],[1499,16],[1579,14],[1660,8],[1894,0],[9999,0]],gaps: [[1481,18]],pads: [[1425,12]],pts: [[-163,178],[-269,137],[-303,62],[-307,-4],[-265,-57],[-269,-158],[-236,-273],[-96,-243],[-4,-171],[42,-112],[138,-146],[300,-162],[372,-79],[401,2],[344,67],[246,124],[144,152],[91,180],[6,232],[-78,217]]},
  {id: 'galaxy',name: '갤럭시 서킷',desc: '벽 없는 구간이 있는 우주 코스',concept: 'space',seed: 103,half: 8.2,hard: true,elev: [[0,0],[120,0],[260,11],[410,2],[560,1],[710,0],[860,9],[996,20],[1096,28],[1114,29],[1194,33],[1310,25],[1421,28],[1521,28],[1539,27],[1619,25],[1760,14],[1910,2],[2060,-1],[2281,0],[9999,0]],gaps: [[1096,18],[1521,18]],pads: [[1040,12],[1465,12]],open: [[105,185],[325,395],[1725,1795],[2175,2255]],pts: [[-178,-184],[-107,-217],[7,-224],[112,-210],[243,-221],[377,-190],[402,-83],[394,-17],[342,64],[359,182],[256,243],[123,253],[8,189],[-76,171],[-176,174],[-352,180],[-497,121],[-503,-20],[-433,-91],[-278,-134]]},
  {id: 'neon', name: '네온 시티', desc: '밤의 도심, 직각 코너 연속 코스', concept: 'city', seed: 77, half: 8.6, scale: 1.25, round: 24, poly: [[0,-130],[0,170],[140,170],[140,70],[240,70],[240,200],[360,200],[360,-30],[200,-30],[200,-130]]}
];
function roundPoly(V, d) {
  const out = [], n = V.length;
  for (let i = 0; i < n; i++) {
    const p = V[(i - 1 + n) % n], c = V[i], q = V[(i + 1) % n];
    const l1 = Math.hypot(c[0] - p[0], c[1] - p[1]), l2 = Math.hypot(q[0] - c[0], q[1] - c[1]);
    out.push([c[0] - (c[0] - p[0]) / l1 * d, c[1] - (c[1] - p[1]) / l1 * d]);
    out.push([c[0] + (q[0] - c[0]) / l2 * d, c[1] + (q[1] - c[1]) / l2 * d]);
  }
  out.push(out.shift());
  return out;
}
for (const d of TRACK_DEFS) if (d.poly) d.pts = roundPoly(d.poly, d.round);
for (const d of TRACK_DEFS) if (d.scale) d.pts = d.pts.map(p => [p[0] * d.scale, p[1] * d.scale]);

function crPoint(p0, p1, p2, p3, t) {
  const d = (p, q) => Math.pow(Math.hypot(q[0] - p[0], q[1] - p[1]), 0.5) || 1e-4;
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
  const tt = t1 + (t2 - t1) * t;
  const L = (p, q, ta, tb) => { const w = (tt - ta) / (tb - ta); return [p[0] + (q[0] - p[0]) * w, p[1] + (q[1] - p[1]) * w]; };
  const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
  const B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
  return L(B1, B2, t1, t2);
}

function buildTrack(def) {
  const P = def.pts, n = P.length, SUB = 40, dense = [];
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    for (let j = 0; j < SUB; j++) dense.push(crPoint(p0, p1, p2, p3, j / SUB));
  }
  dense.push(dense[0]);
  const cum = [0];
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  const L = cum[cum.length - 1];
  const N = Math.round(L);
  const ds = L / N;
  const px = new Float64Array(N), pz = new Float64Array(N), tx = new Float64Array(N), tz = new Float64Array(N);
  const nx = new Float64Array(N), nz = new Float64Array(N), ang = new Float64Array(N), dAng = new Float64Array(N);
  let j = 0;
  for (let i = 0; i < N; i++) {
    const s = i * ds;
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const w = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    px[i] = dense[j][0] + (dense[j + 1][0] - dense[j][0]) * w;
    pz[i] = dense[j][1] + (dense[j + 1][1] - dense[j][1]) * w;
  }
  for (let i = 0; i < N; i++) {
    const a = (i + 1) % N, b = (i - 1 + N) % N;
    let dx = px[a] - px[b], dz = pz[a] - pz[b];
    const l = Math.hypot(dx, dz) || 1;
    tx[i] = dx / l; tz[i] = dz / l;
    nx[i] = tz[i]; nz[i] = -tx[i];
    ang[i] = Math.atan2(tx[i], tz[i]);
  }
  for (let i = 0; i < N; i++) dAng[i] = wrapA(ang[(i + 1) % N] - ang[i]);
  const half = def.half || C.ROAD_HALF, wall = half + (C.WALL - C.ROAD_HALF);
  const h = new Float32Array(N), grade = new Float32Array(N), gapMask = new Uint8Array(N), openMask = new Uint8Array(N), padMask = new Uint8Array(N);
  const gaps = (def.gaps || []).map(([lip, len]) => ({ lip, a: lip, b: lip + len }));
  const pads = (def.pads || []).map(([s0, len], id) => ({ id, a: s0, b: s0 + len }));
  if (def.elev) {
    const E = def.elev;
    for (let i = 0; i < N; i++) {
      const s = i * ds;
      let j = 0; while (j < E.length - 2 && E[j + 1][0] <= s) j++;
      const s0 = E[j][0], s1 = Math.min(E[j + 1][0], L), w = s1 > s0 ? clamp((s - s0) / (s1 - s0), 0, 1) : 0;
      const e = (1 - Math.cos(w * Math.PI)) / 2;
      h[i] = E[j][1] + (E[j + 1][1] - E[j][1]) * e;
      for (const g of gaps) {
        const k0 = g.lip - C.KICK_LEN;
        if (s >= k0 && s <= g.lip) h[i] += C.KICK_RISE * Math.pow((s - k0) / C.KICK_LEN, 2);
      }
    }
  }
  for (let i = 0; i < N; i++) {
    const s = i * ds;
    for (const g of gaps) if (s > g.a && s < g.b) gapMask[i] = 1;
    for (const o of def.open || []) if (s >= o[0] && s <= o[1]) openMask[i] = 1;
    for (const p of pads) if (s >= p.a && s <= p.b) padMask[i] = 1;
  }
  for (let i = 0; i < N; i++) {
    const a = (i + 1) % N, b = (i - 1 + N) % N;
    grade[i] = (h[a] - h[b]) / (2 * ds);
  }
  for (const g of gaps) { const i = Math.round((g.lip - C.KICK_LEN - 3) / ds); g.launch = 2 * C.KICK_RISE / C.KICK_LEN + grade[(i + N) % N]; }
  return { def, N, L, ds, px, pz, tx, tz, nx, nz, ang, dAng,
    half, curb: half + (C.CURB_OUT - C.ROAD_HALF), wall, limit: wall - C.KART_R, grip: def.grip || 1, ws: half / C.ROAD_HALF,
    h, grade, gaps, pads, gapMask, openMask, padMask, hasElev: !!(def.elev || def.gaps || def.open) };
}

const trackCache = {};
function getTrack(i) {
  if (!trackCache[i]) trackCache[i] = buildTrack(TRACK_DEFS[i]);
  return trackCache[i];
}

function idxOf(tr, s) {
  let f = s / tr.ds;
  f = ((f % tr.N) + tr.N) % tr.N;
  return f;
}
function pointAt(tr, s, lat) {
  const f = idxOf(tr, s), i = Math.floor(f) % tr.N, i2 = (i + 1) % tr.N, w = f - Math.floor(f);
  const x = tr.px[i] + (tr.px[i2] - tr.px[i]) * w, z = tr.pz[i] + (tr.pz[i2] - tr.pz[i]) * w;
  const nx = tr.nx[i] + (tr.nx[i2] - tr.nx[i]) * w, nz = tr.nz[i] + (tr.nz[i2] - tr.nz[i]) * w;
  return { x: x + nx * (lat || 0), z: z + nz * (lat || 0) };
}
function angAt(tr, s) {
  const f = idxOf(tr, s), i = Math.floor(f) % tr.N, w = f - Math.floor(f);
  return wrapA(tr.ang[i] + tr.dAng[i] * w);
}
function heightAt(tr, s) {
  const f = idxOf(tr, s), i = Math.floor(f) % tr.N, i2 = (i + 1) % tr.N, w = f - Math.floor(f);
  return tr.h[i] + (tr.h[i2] - tr.h[i]) * w;
}
function gapAt(tr, s) {
  for (const g of tr.gaps) if (s > g.a && s < g.b) return g;
  return null;
}
function turnBetween(tr, s1, s2) {
  let i = Math.floor(idxOf(tr, s1));
  const steps = Math.max(0, Math.round((s2 - s1) / tr.ds));
  let sum = 0;
  for (let k = 0; k < steps; k++) { sum += tr.dAng[i]; i = (i + 1) % tr.N; }
  return sum;
}
function project(tr, x, z, hint) {
  const N = tr.N;
  let best = 0, bd = Infinity;
  if (hint == null || hint < 0) {
    for (let i = 0; i < N; i++) {
      const dx = x - tr.px[i], dz = z - tr.pz[i], d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
  } else {
    for (let k = -40; k <= 40; k++) {
      const i = ((hint + k) % N + N) % N;
      const dx = x - tr.px[i], dz = z - tr.pz[i], d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
  }
  const i = best, dx = x - tr.px[i], dz = z - tr.pz[i];
  const along = dx * tr.tx[i] + dz * tr.tz[i];
  const lat = dx * tr.nx[i] + dz * tr.nz[i];
  let s = i * tr.ds + along;
  s = ((s % tr.L) + tr.L) % tr.L;
  return { i, s, lat };
}

const KART_COLORS = [0xe8402a, 0xf2c230, 0x2fa84f, 0x7a4fd6, 0xf07ab0, 0x1c1c1c, 0xffffff, 0x2b8fd6];
const BOT_NAMES = ['민준', '서연', '하늘', '도윤', '지우', '태오', '유나', '시우'];
const DIFF = [
  { name: '쉬움', mult: 0.88, ib: 0.35, drift: 1.05, start: 0.2 },
  { name: '보통', mult: 0.945, ib: 0.6, drift: 0.95, start: 0.45 },
  { name: '어려움', mult: 0.99, ib: 0.85, drift: 0.9, start: 0.75 }
];

function newInput() { return { accel: 0, brake: 0, steer: 0, drift: false, boostEdge: false, accelEdge: false, reset: false }; }

function makeKart(id, name, color, isPlayer) {
  return {
    id, name, color, isPlayer, x: 0, z: 0, th: 0, phi: 0, v: 0, slip: 0, steerVis: 0,
    drift: 0, driftDir: 0, driftTime: 0, recT: 0, driftLock: false,
    ibOpen: false, ibUsed: false, ibPhase: 0, ibPost: 0, ibPerfect: false, ibCombo: 0, ibLast: -99,
    stats: { drifts: 0, ib: 0, perfect: 0, taps: 0, drags: 0, cuts: 0 }, driftV0: 0, dragT: 0, dragOn: false,
    gauge: 0, items: 0, boostT: 0, ibT: 0, startT: 0, startArmed: false, startUsed: false,
    idx: -1, s: 0, lat: 0, dist: 0, lapsDone: 0, lapStart: 0, lapTimes: [],
    finished: false, retired: false, finishTime: 0, rank: 0, mult: 1,
    wallHits: 0, respawns: 0, stuckT: 0, wrongT: 0, wrongWay: false,
    y: 0, vy: 0, air: false, fall: false, fallT: 0, airT: 0, lastPad: -1,
    input: newInput(), ai: null
  };
}

function placeOnTrack(race, k, s, lat) {
  const tr = race.track, p = pointAt(tr, s, lat);
  k.x = p.x; k.z = p.z; k.th = angAt(tr, s); k.phi = k.th; k.v = 0;
  k.y = heightAt(tr, s); k.vy = 0; k.air = false; k.fall = false; k.fallT = 0;
  const pr = project(tr, k.x, k.z, -1);
  k.idx = pr.i; k.s = pr.s; k.lat = pr.lat;
}

function createRace(opts) {
  const tr = getTrack(opts.track || 0);
  const rng = mulberry32(opts.seed || 12345);
  const diff = DIFF[opts.diff == null ? 1 : opts.diff];
  const total = opts.solo ? 1 : 6;
  const playerSlot = opts.solo ? 0 : (opts.playerSlot != null ? opts.playerSlot : 2 + Math.floor(rng() * 4));
  const race = {
    track: tr, laps: opts.laps || 3, karts: [], events: [], rng, diff,
    time: -C.COUNTDOWN, state: 'countdown', retireT: -1, ended: false, player: null, endTime: 0,
    solo: !!opts.solo, autopilot: !!opts.autopilot, rec: opts.record ? { acc: 0, data: [], done: false } : null
  };
  const pc = opts.playerColor || 0;
  const botColors = KART_COLORS.filter((c, i) => i !== pc);
  const names = BOT_NAMES.slice();
  for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [names[i], names[j]] = [names[j], names[i]]; }
  let bi = 0;
  for (let slot = 0; slot < total; slot++) {
    const isP = slot === playerSlot && !opts.allBots;
    const k = makeKart(slot, isP ? '나' : names[bi], isP ? (opts.playerHex != null ? opts.playerHex : KART_COLORS[pc]) : botColors[bi % botColors.length], isP);
    if (!isP) bi++;
    const gslot = opts.gridSlot != null ? opts.gridSlot : slot;
    const row = Math.floor(gslot / 2), col = gslot % 2;
    const back = 8 + row * 8 + col * 2;
    placeOnTrack(race, k, tr.L - back, opts.solo && opts.gridSlot == null ? 0 : (col ? -4 : 4) * tr.ws);
    k.dist = -back;
    k.ai = {
      lane: (rng() * 2 - 1) * 3 * tr.ws, laneT: 2 + rng() * 3, ibPlan: null, tapHold: 0, tapCD: 0, boostCD: 1 + rng() * 2,
      jitter: (rng() * 2 - 1) * 0.015, skillIb: diff.ib, driftTh: diff.drift, startChance: diff.start
    };
    k.mult = isP ? 1 : diff.mult + k.ai.jitter;
    k.tech = isP && !opts.autopilot;
    if (isP) race.player = k;
    race.karts.push(k);
  }
  if (opts.teams && !opts.solo) {
    const bots = race.karts.filter(k => !k.isPlayer);
    for (let i = bots.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [bots[i], bots[j]] = [bots[j], bots[i]]; }
    const half = Math.floor(race.karts.length / 2);
    if (race.player) race.player.team = 0;
    bots.forEach((k, i) => { k.team = i < half - (race.player ? 1 : 0) ? 0 : 1; });
    race.teams = true;
  }
  return race;
}

function setVel(k, vx, vz) {
  const sp = Math.hypot(vx, vz);
  const fx = Math.sin(k.th), fz = Math.cos(k.th);
  const dot = (vx * fx + vz * fz) / (sp || 1);
  if (sp > 0.3 && (dot < -0.7 || (k.v < 0 && dot < 0))) { k.v = -sp; k.phi = k.th; }
  else { k.v = sp; k.phi = sp > 0.3 ? Math.atan2(vx, vz) : k.th; }
}
function velOf(k) {
  const a = k.v >= 0 ? k.phi : k.th;
  return [Math.sin(a) * k.v, Math.cos(a) * k.v];
}

function updateKart(k, inp, dt, race) {
  const ev = race.events;
  k.boostT = Math.max(0, k.boostT - dt);
  k.ibT = Math.max(0, k.ibT - dt);
  k.startT = Math.max(0, k.startT - dt);
  if (!inp.drift) k.driftLock = false;
  // instant-boost window: opens when a drift ends and follows the slide settling
  if (k.ibOpen) {
    if (k.drift === 2) k.ibPhase = Math.min(1, k.recT / C.REC_T);
    else if (k.drift === 0) {
      k.ibPost += dt; k.ibPhase = 1 + k.ibPost / C.IB_POST;
      if (k.ibPost >= C.IB_POST) k.ibOpen = false;
    } else k.ibOpen = false;
  }

  if (inp.boostEdge && k.items > 0) {
    k.items--; k.boostT = C.BOOST_T;
    ev.push({ t: 'boost', k });
  }
  if (inp.accelEdge && k.ibOpen && !k.ibUsed && k.v > 10) {
    const perfect = k.ibPhase >= C.IB_PERF && k.ibPhase <= C.IB_PERF_END;
    k.ibUsed = true; k.ibOpen = false; k.ibPerfect = perfect;
    k.ibT = perfect ? C.IB_T_P : C.IB_T;
    k.v += perfect ? 3.5 : 2;
    k.ibCombo = (race.time - k.ibLast < C.IB_COMBO) ? k.ibCombo + 1 : 1;
    k.ibLast = race.time;
    k.stats.ib++; if (perfect) k.stats.perfect++;
    ev.push({ t: 'ib', k, perfect, combo: k.ibCombo });
  }

  const m = k.mult;
  let vmax = C.BASE_V * m, A = C.ACC;
  if (k.boostT > 0) { vmax = C.BOOST_V * m; A = C.ACC_BOOST; }
  else if (k.startT > 0) { vmax = C.START_V * m; A = C.ACC_IB; }
  else if (k.ibT > 0) { vmax = (k.ibPerfect ? C.IB_V_P : C.IB_V) * m; A = C.ACC_IB; }
  const forced = k.boostT > 0 || k.startT > 0 || k.ibT > 0;
  let v = k.v;
  const steer = clamp(inp.steer, -1, 1);
  k.steerVis += (steer - k.steerVis) * Math.min(1, dt * 12);

  const air = k.air;
  if (k.drift !== 1 && inp.drift && !k.driftLock && !air && Math.abs(steer) > 0.3 && v > 14) {
    k.drift = 1; k.driftDir = steer > 0 ? 1 : -1; k.driftTime = 0; k.ibOpen = false; k.stats.drifts++;
    k.driftV0 = v; k.dragT = 0; k.dragOn = false;
    k.th = wrapA(k.th - k.driftDir * 0.12);
    ev.push({ t: 'driftStart', k });
  }

  let yaw;
  if (k.drift === 1) {
    k.driftTime += dt;
    const along = steer * k.driftDir;
    yaw = -k.driftDir * (1.15 + 1.0 * along);
    const natural = along < -0.3 && Math.abs(k.slip) < 0.1 && k.driftTime > 0.25;
    if (!inp.drift || v < 9 || natural) {
      k.drift = v < 9 ? 0 : 2; k.recT = 0;
      if (natural && inp.drift) { k.driftLock = true; k.stats.cuts++; ev.push({ t: 'cut', k }); }
      const tapOk = k.tech || k.aiTap; k.aiTap = false;
      if (k.driftTime < C.TAP_T && v >= 9 && tapOk) {
        // tap drift (톡톡이): quick angle change, almost no speed loss, a little gauge, no instant boost
        v = Math.max(v, k.driftV0 - 0.4);
        k.recT = C.REC_T * 0.6;
        k.gauge += C.TAP_GAUGE * Math.min(1, v / C.BASE_V);
        k.stats.drifts--; k.stats.taps++;
        ev.push({ t: 'tap', k });
      } else if (v >= 9) { k.ibOpen = true; k.ibUsed = false; k.ibPost = 0; k.ibPhase = 0; }
    }
  } else {
    const av = Math.abs(v);
    const sf = Math.min(1, av / 8) * (1 - 0.32 * Math.min(1, av / C.BASE_V));
    yaw = -steer * C.STEER * sf * (v < 0 ? -1 : 1);
    k.dragOn = false;
    if (k.drift === 2) {
      const along = steer * k.driftDir;
      // drag (드래그): counter-steer while the slide settles keeps the kart sliding and pulls it forward
      if (k.tech && along < -0.3 && v > 20 && k.dragT < C.DRAG_T && !air) {
        k.dragOn = true;
        if (k.dragT === 0) { k.stats.drags++; ev.push({ t: 'drag', k }); }
        k.dragT += dt;
      }
      k.recT += dt * (along > 0.3 ? 0.55 : (k.dragOn ? C.DRAG_REC : (along < -0.3 ? 1.8 : 1)));
      if (k.recT >= C.REC_T) k.drift = 0;
    }
  }

  if (air) {
    yaw *= 0.3;
    v -= Math.sign(v) * Math.min(Math.abs(v), 1 * dt);
  } else {
    if (inp.accel || forced) {
      if (v < vmax) v += A * (1 - Math.max(0, v) / vmax) * dt + (v < 0 ? 20 * dt : 0);
    }
    if (inp.brake && !forced) {
      if (v > 0.5) v -= 42 * dt; else if (v > -C.REV_V) v -= 16 * dt;
    }
    if (!inp.accel && !inp.brake && !forced) {
      const d = Math.min(Math.abs(v), 6 * dt); v -= Math.sign(v) * d;
    }
    if (v > vmax) v -= (v - vmax) * 1.6 * dt;
  }

  k.th = wrapA(k.th + yaw * dt);
  const gm = race.track.grip, GK = C.GRIP_K * gm, DK = C.DRIFT_K * (0.6 + 0.4 * gm);
  let K = GK;
  if (k.drift === 1) K = DK;
  else if (k.drift === 2) K = DK + (GK - DK) * Math.min(1, k.recT / C.REC_T);
  if (v < 2) {
    k.phi = k.th; k.slip = 0;
  } else {
    let slip = wrapA(k.th - k.phi);
    k.phi = wrapA(k.phi + slip * (1 - Math.exp(-K * dt)));
    slip = wrapA(k.th - k.phi);
    const ss = Math.abs(Math.sin(slip));
    if (k.drift === 1) v -= (2.5 + 7 * ss) * dt;
    else if (k.drift === 2) { if (k.dragOn) { if (v < vmax * 1.03) v += C.DRAG_ACC * dt; } else v -= 4 * ss * dt; }
    else v -= 3 * ss * dt;
    if (k.drift > 0 && v > 10 && !air) k.gauge += v * ss * dt * C.GAUGE_K;
    k.slip = slip;
  }
  if (k.gauge >= 1) {
    if (k.items < 2) { k.items++; k.gauge -= 1; ev.push({ t: 'item', k }); }
    else k.gauge = 1;
  }
  k.v = v;
  const a = v >= 0 ? k.phi : k.th;
  k.x += Math.sin(a) * v * dt;
  k.z += Math.cos(a) * v * dt;
}

function wallCollide(k, race) {
  const tr = race.track;
  const pr = project(tr, k.x, k.z, k.idx);
  if (tr.hasElev) {
    if (tr.gapMask[pr.i] || tr.openMask[pr.i] || k.fall) return pr;
    if (k.air && k.y > heightAt(tr, pr.s) + 1.3) return pr;
  }
  if (Math.abs(pr.lat) > tr.limit) {
    const sg = Math.sign(pr.lat), ox = tr.nx[pr.i] * sg, oz = tr.nz[pr.i] * sg;
    const pen = Math.abs(pr.lat) - tr.limit;
    k.x -= ox * pen; k.z -= oz * pen;
    pr.lat -= sg * pen;
    let [vx, vz] = velOf(k);
    const vn = vx * ox + vz * oz;
    if (vn > 0) {
      const sp = Math.hypot(vx, vz) + 1e-6, ratio = vn / sp;
      vx -= 1.25 * vn * ox; vz -= 1.25 * vn * oz;
      const scrub = 1 - 0.45 * ratio;
      vx *= scrub; vz *= scrub;
      setVel(k, vx, vz);
      if (k.drift === 1) { k.drift = 0; }
      if (k.v > 2) {
        const d = wrapA(k.phi - k.th);
        if (Math.abs(d) < 1.3) k.th = wrapA(k.th + d * 0.35);
      }
      if (vn > 2) { k.wallHits++; race.events.push({ t: 'wall', k, p: vn }); }
    }
  }
  return pr;
}

function kartCollisions(race) {
  const ks = race.karts, R2 = C.KART_R * 2.2;
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
    const a = ks[i], b = ks[j];
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    if (Math.abs(a.y - b.y) > 1.5 || a.fall || b.fall) continue;
    if (d < R2 && d > 1e-4) {
      const nx = dx / d, nz = dz / d, ov = R2 - d;
      a.x -= nx * ov / 2; a.z -= nz * ov / 2; b.x += nx * ov / 2; b.z += nz * ov / 2;
      const va = velOf(a), vb = velOf(b);
      const rel = (vb[0] - va[0]) * nx + (vb[1] - va[1]) * nz;
      if (rel < 0) {
        const j2 = -(1 + 0.3) * rel / 2;
        setVel(a, va[0] - j2 * nx, va[1] - j2 * nz);
        setVel(b, vb[0] + j2 * nx, vb[1] + j2 * nz);
        if (-rel > 3) race.events.push({ t: 'bump', k: a, k2: b, p: -rel });
      }
    }
  }
}

function aiInput(k, race, dt) {
  const tr = race.track, ai = k.ai, inp = k.input;
  inp.boostEdge = false; inp.accelEdge = false; inp.reset = false;
  const v = k.v;
  ai.laneT -= dt;
  if (ai.laneT <= 0) { ai.lane = (race.rng() * 2 - 1) * 3.5 * tr.ws; ai.laneT = 2.5 + race.rng() * 3; }
  for (const o of race.karts) {
    if (o === k) continue;
    let ahead = o.s - k.s;
    if (ahead < -tr.L / 2) ahead += tr.L; else if (ahead > tr.L / 2) ahead -= tr.L;
    if (ahead > 0 && ahead < 12 && Math.abs(o.lat - (k.lat)) < 2.6 && o.v < v + 1) {
      ai.lane = o.lat > 0 ? o.lat - 4.5 * tr.ws : o.lat + 4.5 * tr.ws;
      ai.lane = clamp(ai.lane, -5.5 * tr.ws, 5.5 * tr.ws); ai.laneT = 1.5;
      break;
    }
  }
  const lookTurn = turnBetween(tr, k.s + 6, k.s + 22 + Math.max(0, v) * 0.75);
  const sharp = Math.abs(lookTurn);
  let lane = ai.lane;
  let nearRamp = false;
  for (const g of tr.gaps) { let ds = g.lip - k.s; if (ds < -tr.L / 2) ds += tr.L; if (ds > -2 && ds < 110) nearRamp = true; }
  for (const o of tr.def.open || []) if (k.s > o[0] - 30 && k.s < o[1]) lane = clamp(lane, -1.5 * tr.ws, 1.5 * tr.ws);
  if (nearRamp) lane = 0;
  const la = 8 + Math.max(0, v) * 0.42;
  const tgt = pointAt(tr, k.s + la, lane);
  const desired = Math.atan2(tgt.x - k.x, tgt.z - k.z);
  const ref = k.drift === 1 ? k.phi : k.th;
  const e = wrapA(desired - ref);
  let steer = clamp(-e * 3.0, -1, 1);
  let drift = false, accel = 1, brake = 0;

  const near = turnBetween(tr, k.s, k.s + 18 + Math.max(0, v) * 0.5);
  if (ai.tapHold > 0) {
    drift = true; steer = ai.tapDir; ai.tapHold -= dt;
    if (ai.tapHold <= 0) ai.tapRelease = true;
  } else if (ai.tapRelease) {
    drift = false; ai.tapRelease = false;
  } else if (k.drift === 1) {
    const need = -e * k.driftDir > 0.06;
    drift = need && k.driftTime < 1.8 && Math.abs(near) > 0.25;
    if (drift) steer = clamp(-e * 4, -1, 1);
  } else if (!nearRamp && !k.air && Math.abs(near) > ai.driftTh && v > 26 && Math.abs(e) > 0.08 && k.drift === 0) {
    drift = true;
    steer = near > 0 ? -1 : 1;
  } else if (!nearRamp && !k.air && k.drift === 0 && ai.tapCD <= 0 && v > 32 && Math.abs(e) > 0.1 && Math.sign(-e) === -Math.sign(near) &&
             Math.abs(near) > ai.driftTh * 0.5 && Math.abs(near) < ai.driftTh && race.rng() < ai.skillIb * 1.5 * dt) {
    ai.tapHold = 0.05 + race.rng() * 0.04; ai.tapDir = e > 0 ? -1 : 1; ai.tapCD = 1.4; k.aiTap = true;
    drift = true; steer = ai.tapDir;
  }
  ai.tapCD -= dt;
  if (k.ibOpen && !k.ibUsed) {
    if (ai.ibPlan == null) {
      ai.ibPlan = race.rng() < ai.skillIb ? (race.rng() < ai.skillIb ? 0.8 + race.rng() * 0.6 : 0.1 + race.rng() * 1.6) : -1;
    }
    if (ai.ibPlan >= 0 && k.ibPhase >= ai.ibPlan) { inp.accelEdge = true; ai.ibPlan = -1; }
  } else ai.ibPlan = null;
  if (sharp > 2.3 && v > 33 && k.drift !== 1) accel = 0;
  if (sharp > 2.8 && v > 36 && k.drift !== 1) brake = 1;

  ai.boostCD -= dt;
  if (k.items > 0 && ai.boostCD <= 0 && k.boostT <= 0 && sharp < 0.55) {
    inp.boostEdge = true; ai.boostCD = 1.5 + race.rng() * 2.5;
  }
  if (nearRamp) brake = 0;
  inp.steer = steer; inp.drift = drift; inp.accel = accel; inp.brake = brake;
  return inp;
}

function respawn(race, k) {
  const tr = race.track;
  let s = k.s;
  for (const g of tr.gaps) if (s > g.lip - 40 && s < g.b + 4) s = g.b + 12;
  let d = s - k.s;
  if (d > tr.L / 2) d -= tr.L; else if (d < -tr.L / 2) d += tr.L;
  placeOnTrack(race, k, s, clamp(k.lat, -3, 3) * tr.ws);
  const pr = project(tr, k.x, k.z, -1);
  k.idx = pr.i; k.s = pr.s; k.lat = pr.lat; k.dist += d;
  k.drift = 0; k.boostT = 0; k.ibT = 0; k.startT = 0; k.stuckT = 0; k.ibOpen = false; k.respawns++;
  race.events.push({ t: 'respawn', k });
}

function verticalStep(k, pr, prevS, dt, race) {
  const tr = race.track;
  if (!tr.hasElev) { k.y = 0; return; }
  const gH = heightAt(tr, pr.s);
  const gap = tr.gapMask[pr.i] === 1;
  const offEdge = Math.abs(pr.lat) > tr.wall + 0.4;
  const overRoad = !gap && !offEdge;
  if (!k.air) {
    for (const g of tr.gaps) {
      if (prevS > g.lip - 8 && prevS < g.lip + 0.5 && pr.s >= g.lip - 0.6 && pr.s < g.b && k.v > 4) {
        k.air = true; k.fall = false; k.airT = 0;
        k.vy = Math.max(2, k.v * g.launch);
        k.y = Math.max(k.y, gH);
        if (k.drift === 1) k.drift = 0;
        race.events.push({ t: 'jump', k });
        break;
      }
    }
  }
  if (!k.air) {
    if (!overRoad) {
      k.air = true; k.fall = true; k.vy = 0; k.fallT = 0; k.airT = 0;
      if (k.drift === 1) k.drift = 0;
      race.events.push({ t: 'fall', k });
    } else {
      {
        if (k.v > 0) k.v -= C.SLOPE_K * tr.grade[pr.i] * Math.cos(k.phi - tr.ang[pr.i]) * dt;
        k.y = gH;
        if (tr.padMask[pr.i] && Math.abs(pr.lat) < 4.5 * tr.ws) {
          const pad = tr.pads.find(p => pr.s >= p.a - 1 && pr.s <= p.b + 1);
          if (pad && k.lastPad !== pad.id) {
            k.lastPad = pad.id; k.startT = Math.max(k.startT, C.PAD_T); k.v = Math.max(k.v, C.IB_V * k.mult * 0.92);
            race.events.push({ t: 'pad', k });
          }
        } else if (!tr.padMask[pr.i]) k.lastPad = -1;
      }
    }
  }
  if (k.air) {
    k.airT += dt;
    k.vy -= C.GRAV * dt; k.y += k.vy * dt;
    if (k.fall) k.fallT += dt;
    if (!k.fall && overRoad && k.y <= gH) {
      if (k.y < gH - 0.8) { k.fall = true; k.v *= 0.2; }
      else {
        const imp = -k.vy;
        k.y = gH; k.air = false; k.vy = 0;
        race.events.push({ t: 'land', k, p: imp });
      }
    } else if (!k.fall && !overRoad && k.y < gH - 0.8) k.fall = true;
    if (k.fall && (k.y < gH - 9 || k.fallT > 1.6)) respawn(race, k);
  }
}

function stepRace(race, dt, playerInput) {
  const prevT = race.time;
  race.time += dt;
  const P = race.player;
  if (race.state === 'countdown') {
    for (const n of [3, 2, 1]) if (prevT < -n && race.time >= -n) race.events.push({ t: 'count', n });
    if (P && playerInput && playerInput.accelEdge) {
      if (race.time >= -0.15) P.startArmed = true;
      playerInput.accelEdge = false;
    }
    if (race.time >= 0) {
      race.state = 'racing';
      race.events.push({ t: 'go' });
      for (const k of race.karts) {
        k.lapStart = 0;
        const arm = k.isPlayer ? k.startArmed : race.rng() < k.ai.startChance;
        if (arm) { k.startT = C.START_T; k.startUsed = true; race.events.push({ t: 'startBoost', k }); }
      }
      if (race.rec && P) { race.rec.acc = 0; pushSample(race.rec.data, P); }
    }
    return;
  }
  const tr = race.track;
  for (const k of race.karts) {
    let inp;
    if (k.isPlayer && !k.finished && playerInput) {
      inp = playerInput;
      if (inp.accelEdge && !k.startUsed && race.time <= 0.3) {
        k.startUsed = true; k.startT = C.START_T; race.events.push({ t: 'startBoost', k });
      }
      if (inp.reset) { respawn(race, k); inp.reset = false; }
    } else {
      inp = aiInput(k, race, dt);
    }
    if (!k.isPlayer && !k.finished) {
      let gap = P ? P.dist - k.dist : 0;
      const rb = P ? clamp(gap / 200, -1, 1) * 0.035 : 0;
      k.mult = race.diff.mult + k.ai.jitter + rb;
    }
    updateKart(k, inp, dt, race);
    if (inp === playerInput) { inp.accelEdge = false; inp.boostEdge = false; }
  }
  kartCollisions(race);
  for (const k of race.karts) {
    const pr = wallCollide(k, race);
    k.idx = pr.i;
    const prevS = k.s;
    let d = pr.s - k.s;
    if (d > tr.L / 2) d -= tr.L; else if (d < -tr.L / 2) d += tr.L;
    k.s = pr.s; k.lat = pr.lat; k.dist += d;
    verticalStep(k, pr, prevS, dt, race);

    const ta = tr.ang[pr.i];
    const facing = Math.cos(k.th - ta);
    if (k.v > 4 && facing < -0.2) k.wrongT += dt; else k.wrongT = Math.max(0, k.wrongT - dt * 2);
    k.wrongWay = k.wrongT > 1.0;

    if ((!k.isPlayer || k.finished || race.autopilot) && Math.abs(k.v) < 3 && !k.air) {
      k.stuckT += dt;
      if (k.stuckT > 2.0) respawn(race, k);
    } else k.stuckT = 0;
    if (!k.isPlayer && k.wrongT > 2.5) { respawn(race, k); k.wrongT = 0; }

    const done = k.dist >= 0 ? Math.floor(k.dist / tr.L) : -1;
    if (!k.finished && done > k.lapsDone) {
      k.lapsDone = done;
      k.lapTimes.push(race.time - k.lapStart);
      k.lapStart = race.time;
      if (k.lapsDone >= race.laps) {
        k.finished = true; k.finishTime = race.time;
        race.events.push({ t: 'finish', k });
        if (race.retireT < 0) race.retireT = C.RETIRE;
      } else if (k.lapsDone === race.laps - 1) race.events.push({ t: 'finalLap', k });
      else race.events.push({ t: 'lap', k });
    }
  }
  if (race.rec && P && !race.rec.done) {
    race.rec.acc += dt;
    if (P.finished) { pushSample(race.rec.data, P); race.rec.done = true; }
    else if (race.rec.acc >= GHOST_DT - 1e-9) { race.rec.acc -= GHOST_DT; pushSample(race.rec.data, P); }
  }
  const order = race.karts.slice().sort((a, b) => {
    if (a.finished && !a.retired && b.finished && !b.retired) return a.finishTime - b.finishTime;
    if (a.finished && !a.retired) return -1;
    if (b.finished && !b.retired) return 1;
    return b.dist - a.dist;
  });
  order.forEach((k, i) => { k.rank = i + 1; });
  race.order = order;

  if (race.retireT > 0) {
    race.retireT -= dt;
    if (race.retireT <= 0) {
      race.retireT = 0;
      for (const k of race.karts) if (!k.finished) { k.finished = true; k.retired = true; race.events.push({ t: 'retire', k }); }
    }
  }
  if (!race.ended && race.karts.every(k => k.finished)) { race.ended = true; race.endTime = race.time; race.events.push({ t: 'end' }); }
}

/* ---------- ghost ---------- */
const GHOST_DT = 0.05, GS = 8;
function pushSample(d, k) {
  const f = (k.boostT > 0 || k.startT > 0 ? 1 : 0) | (k.ibT > 0 ? 2 : 0) | (k.drift >= 1 ? 4 : 0);
  d.push(Math.round(k.x * 20), Math.round(k.z * 20), Math.round(k.th * 1000), Math.round(k.slip * 1000),
    Math.round(k.steerVis * 100), f, Math.round(k.dist * 10), Math.round(k.y * 20));
}
function prepGhost(g) {
  const st = g.stride || 7;
  g.stride = st;
  const n = Math.floor(g.data.length / st), md = new Float32Array(n);
  let m = -1e9;
  for (let i = 0; i < n; i++) { m = Math.max(m, g.data[i * st + 6] / 10); md[i] = m; }
  g.n = n; g.maxd = md;
  return g;
}
function ghostAt(g, t, out) {
  out = out || {};
  const d = g.data, n = g.n;
  let f = t / GHOST_DT;
  out.done = f >= n - 1;
  if (f < 0) f = 0; if (f > n - 1) f = n - 1;
  const st = g.stride, i = Math.floor(f), j = Math.min(n - 1, i + 1), w = f - i, a = i * st, b = j * st;
  const L = (o, sc) => (d[a + o] + (d[b + o] - d[a + o]) * w) / sc;
  out.x = L(0, 20); out.z = L(1, 20);
  const t0 = d[a + 2] / 1000, t1 = d[b + 2] / 1000;
  out.th = wrapA(t0 + wrapA(t1 - t0) * w);
  out.slip = L(3, 1000); out.steer = L(4, 100); out.flags = d[a + 5]; out.dist = L(6, 10);
  out.y = st > 7 ? L(7, 20) : 0;
  return out;
}
function ghostTimeAtDist(g, dist) {
  const md = g.maxd, n = g.n;
  if (!n || dist <= md[0]) return 0;
  if (dist >= md[n - 1]) return null;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (md[m] < dist) lo = m; else hi = m; }
  const w = (dist - md[lo]) / ((md[hi] - md[lo]) || 1);
  return (lo + w) * GHOST_DT;
}
function makeDefaultGhost(track, laps, diff) {
  const D = DIFF[diff];
  const race = createRace({ track, laps, diff, seed: 777 + track * 131 + laps * 17 + diff, solo: true, record: true, autopilot: true });
  const P = race.player;
  P.mult = D.mult + 0.02;
  P.startArmed = race.rng() < D.start + 0.2;
  while (!race.ended && race.time < 1200) { stepRace(race, 1 / 120, null); race.events.length = 0; }
  return prepGhost({ time: P.finishTime, lapTimes: P.lapTimes.slice(), data: race.rec.data, stride: GS, color: 0xffffff, isDefault: true });
}

/* ---------- TAS: closed-loop driver following an optimized per-knot plan ---------- */
function planAt(arr, sp, L, s) {
  const n = arr.length;
  const f = (((s % L) + L) % L) / sp;
  const i = Math.floor(f) % n, j = (i + 1) % n, w = f - Math.floor(f);
  return arr[i] + (arr[j] - arr[i]) * w;
}
function tasInput(k, race, dt) {
  const P = race.tasPlan, tr = race.track, L = tr.L, inp = k.input, G = P.g;
  inp.boostEdge = false; inp.accelEdge = false; inp.reset = false;
  const v = k.v, s = k.s, n = P.lane.length, j = Math.floor((((s % L) + L) % L) / P.sp) % n;
  let nearRamp = false;
  for (const g of tr.gaps) { let ds = g.lip - s; if (ds < -L / 2) ds += L; if (ds > -2 && ds < 70) nearRamp = true; }
  const la = G.la0 + Math.max(0, v) * G.laK;
  let lane = planAt(P.lane, P.sp, L, s + la) * tr.ws;
  if (nearRamp) lane *= 0.3;
  const tgt = pointAt(tr, s + la, lane);
  const desired = Math.atan2(tgt.x - k.x, tgt.z - k.z);
  const ref = k.drift === 1 ? k.phi : k.th;
  const e = wrapA(desired - ref);
  let steer = clamp(-e * G.kp, -1, 1), drift = false;
  const near = turnBetween(tr, s, s + 18 + Math.max(0, v) * 0.5);
  if (k.drift === 1) {
    const need = -e * k.driftDir > P.need[j];
    drift = k.driftTime < 0.17 || (need && k.driftTime < P.hold[j]);
    if (drift) steer = clamp(-e * G.kd, -1, 1);
  } else if (k.drift === 2) {
    if (P.drag[j] > 0 && v > 20) steer = -k.driftDir;
  } else if (!nearRamp && !k.air && v > 18) {
    if (Math.abs(near) > P.thr[j] && Math.abs(e) > 0.04) { drift = true; steer = near > 0 ? -1 : 1; }
    else if (P.chain[j] > 0 && k.ibT <= G.chainT && !k.ibOpen) {
      drift = true; steer = e > 0 ? -1 : (e < 0 ? 1 : (k.driftDir || 1));
    }
  }
  if (k.ibOpen && !k.ibUsed && k.ibPhase >= C.IB_PERF) inp.accelEdge = true;
  if (k.items > 0 && k.boostT <= 0 && P.boost[j] > 0) inp.boostEdge = true;
  inp.steer = steer; inp.drift = drift; inp.accel = 1; inp.brake = 0;
  return inp;
}
// packed plan (as stored in tas.js) -> arrays
function unpackTasPlan(pk) {
  const bits = (str, n) => { const a = []; for (let i = 0; i < n; i++) a.push(str[i] === '1' ? 1 : -1); return a; };
  const n = pk.lane.length, sc = (a, d) => a.map(x => x / d);
  return { sp: pk.sp, lane: sc(pk.lane, 1000), thr: sc(pk.thr, 1000), need: sc(pk.need, 1000), hold: sc(pk.hold, 1000),
    chain: bits(pk.chain, n), drag: bits(pk.drag, n), boost: bits(pk.boost, n), g: pk.g };
}
function runTas(track, laps, plan, record) {
  const race = createRace({ track, laps, solo: true, seed: 1, record });
  const P = race.player; P.mult = 1; P.tech = true; P.startArmed = true;
  race.tasPlan = plan;
  const idle = newInput(); idle.accel = 1;
  while (!P.finished && race.time < 600) {
    stepRace(race, 1 / 120, race.state === 'racing' ? tasInput(P, race, 1 / 120) : idle);
    race.events.length = 0;
  }
  return race;
}
function makeTasGhost(track, laps, packed) {
  const race = runTas(track, laps, unpackTasPlan(packed), true), P = race.player;
  if (!P.finished) return null;
  return prepGhost({ time: P.finishTime, lapTimes: P.lapTimes.slice(), data: race.rec.data, stride: GS, isTas: true });
}

function fmtTime(t) {
  if (t == null || !isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60), s = t - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(3);
}

root.Core = {
  C, TRACK_DEFS, KART_COLORS, DIFF, mulberry32, wrapA, clamp, getTrack, pointAt, angAt, project, turnBetween,
  CONCEPTS: [['all', '전체'], ['forest', '숲'], ['desert', '사막'], ['ice', '얼음'], ['sea', '바다'], ['city', '도시'], ['volcano', '화산'], ['space', '우주']],
  buildTrack, clearTrackCache: () => { for (const k in trackCache) delete trackCache[k]; }, createRace, stepRace, updateKart, aiInput, newInput, velOf, setVel, fmtTime, heightAt, gapAt,
  GHOST_DT, GHOST_STRIDE: GS, prepGhost, ghostAt, ghostTimeAtDist, makeDefaultGhost,
  tasInput, unpackTasPlan, runTas, makeTasGhost
};
})(typeof window !== 'undefined' ? window : globalThis);
