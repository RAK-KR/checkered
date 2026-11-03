/*
 * 체커드 서버 (Cloudflare Worker + D1)
 * - 회원가입 / 로그인 / 비밀번호 재설정(복구 코드)
 * - 코인·스킨·도전 과제 저장 (프로필 동기화)
 * - 타임어택 기록, 랭킹, 고스트
 *
 * 비밀번호는 서버로 그대로 오지 않습니다. 브라우저가 먼저 느린 해시(PBKDF2 30만 회)를 만들어 보내고,
 * 서버는 사용자마다 다른 소금(salt)을 섞어 한 번 더 해시해서 저장합니다.
 *
 * 필요한 설정
 * - D1 바인딩 이름: DB
 * - 환경 변수 ALLOWED_ORIGINS: 게임 주소 (쉼표로 여러 개), 예: https://rak-kr.github.io
 */

const TRACKS = { green: 18.1, valley: 20.4, coast: 26.8, city: 21.9, canyon: 22.5, blizzard: 41.7, cherry: 25.1, jungle: 28.5, dunes: 28.8, icelake: 26.3, sunset: 30.7, volcano: 27.9, galaxy: 33.3, neon: 25.3 };
const LAPS = [1, 2, 3, 5];
const SESSION_DAYS = 60;
const USER_RE = /^[A-Za-z0-9_가-힣]{2,12}$/;
const KEY_RE = /^[A-Za-z0-9+/]{43}=$/;
const REC_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_FAILS = 8, LOCK_MS = 10 * 60 * 1000;
const MAX_GHOST_CHARS = 600000;

/* ---------- helpers ---------- */
const enc = new TextEncoder();
function hex(buf) { return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join(''); }
function randHex(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return hex(a); }
async function sha256(str) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(str))); }
function sameStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function recoveryCode() {
  const a = new Uint8Array(16); crypto.getRandomValues(a);
  let s = ''; for (let i = 0; i < 16; i++) { s += REC_ALPHA[a[i] % REC_ALPHA.length]; if (i % 4 === 3 && i < 15) s += '-'; }
  return s;
}
const normRec = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function corsHeaders(req, env) {
  const origin = req.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim()).filter(Boolean);
  const ok = allowed.includes('*') ? (origin || '*') : (allowed.includes(origin) ? origin : allowed[0] || '');
  return {
    'Access-Control-Allow-Origin': ok,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}
function json(data, status, cors) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, cors) });
}
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const bad = msg => new HttpError(400, msg);

async function readBody(req, limit) {
  const text = await req.text();
  if (text.length > limit) throw new HttpError(413, '요청이 너무 커요');
  try { return JSON.parse(text || '{}'); } catch (e) { throw bad('잘못된 요청이에요'); }
}

/* ---------- profile validation (mirrors profile.js) ---------- */
const ITEM_RE = /^(body|wheel|helmet):[a-z]{2,10}$|^color:\d{1,2}$/;
const STAT_NUM = ['races', 'finishes', 'botWins', 'hardWins', 'perfects', 'drifts', 'taps', 'jumps', 'teamWins', 'netWins'];
function cleanProfile(p) {
  if (!p || typeof p !== 'object') return null;
  const out = { v: 1, coins: 0, owned: [], equip: { body: 'std', color: 0, wheel: 'std', helmet: 'std' }, ach: [], stats: {} };
  out.coins = Math.max(0, Math.min(1e7, Math.floor(+p.coins || 0)));
  if (Array.isArray(p.owned)) out.owned = [...new Set(p.owned.filter(k => typeof k === 'string' && ITEM_RE.test(k)))].slice(0, 200);
  for (const k of ['body:std', 'wheel:std', 'helmet:std', 'color:0', 'color:1', 'color:2', 'color:3', 'color:4', 'color:5', 'color:6', 'color:7'])
    if (!out.owned.includes(k)) out.owned.push(k);
  if (p.equip && typeof p.equip === 'object') for (const cat of ['body', 'wheel', 'helmet', 'color']) {
    const v = p.equip[cat];
    if (v != null && out.owned.includes(cat + ':' + v)) out.equip[cat] = cat === 'color' ? +v : String(v);
  }
  if (Array.isArray(p.ach)) out.ach = [...new Set(p.ach.filter(a => typeof a === 'string' && /^[a-z0-9_]{2,20}$/.test(a)))].slice(0, 50);
  const st = p.stats && typeof p.stats === 'object' ? p.stats : {};
  for (const k of STAT_NUM) out.stats[k] = Math.max(0, Math.min(1e8, Math.floor(+st[k] || 0)));
  for (const k of ['maps', 'ghostHard']) out.stats[k] = Array.isArray(st[k]) ? [...new Set(st[k].filter(x => typeof x === 'string' && TRACKS[x] != null))] : [];
  return out;
}
// Results are calculated on the players' own devices, so the server cannot fully verify coins.
// It only blocks jumps that are impossible from normal play.
function limitCoins(oldP, newP, lastMs, now) {
  if (!oldP) return newP;
  const minutes = Math.max(0, (now - lastMs) / 60000);
  const maxGain = 600 + minutes * 400;
  if (newP.coins > oldP.coins + maxGain) newP.coins = Math.floor(oldP.coins + maxGain);
  return newP;
}

/* ---------- sessions ---------- */
async function newSession(env, userId) {
  const token = randHex(32);
  const now = Date.now();
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires) VALUES (?, ?, ?)')
    .bind(await sha256(token), userId, now + SESSION_DAYS * 864e5).run();
  // occasionally clean expired sessions
  if (Math.random() < 0.05) await env.DB.prepare('DELETE FROM sessions WHERE expires < ?').bind(now).run();
  return token;
}
async function authUser(req, env) {
  const h = req.headers.get('Authorization') || '';
  const m = h.match(/^Bearer ([0-9a-f]{64})$/);
  if (!m) throw new HttpError(401, '로그인이 필요해요');
  const row = await env.DB.prepare('SELECT u.id, u.username, u.profile, u.profile_updated, s.expires, s.token_hash FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?')
    .bind(await sha256(m[1])).first();
  if (!row || row.expires < Date.now()) throw new HttpError(401, '로그인이 만료됐어요. 다시 로그인해 주세요');
  return row;
}
function parseProfile(row) { try { return row.profile ? JSON.parse(row.profile) : null; } catch (e) { return null; } }

/* ---------- handlers ---------- */
async function register(req, env) {
  const b = await readBody(req, 40000);
  const username = String(b.username || '').trim();
  if (!USER_RE.test(username)) throw bad('아이디는 한글·영문·숫자·밑줄로 2~12자예요');
  if (!KEY_RE.test(String(b.key || ''))) throw bad('잘못된 요청이에요');
  const exists = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
  if (exists) throw new HttpError(409, '이미 쓰고 있는 아이디예요');
  const salt = randHex(16), recSalt = randHex(16), rec = recoveryCode();
  const profile = cleanProfile(b.profile) || cleanProfile({});
  if (profile.coins > 20000) profile.coins = 20000;
  const now = Date.now();
  let res;
  try {
    res = await env.DB.prepare('INSERT INTO users (username, salt, hash, rec_salt, rec_hash, profile, profile_updated, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(username, salt, await sha256(salt + b.key), recSalt, await sha256(recSalt + normRec(rec)), JSON.stringify(profile), now, now).run();
  } catch (e) { throw new HttpError(409, '이미 쓰고 있는 아이디예요'); }
  const id = res.meta.last_row_id;
  return { token: await newSession(env, id), username, recovery: rec, profile };
}

async function login(req, env) {
  const b = await readBody(req, 2000);
  const username = String(b.username || '').trim();
  if (!USER_RE.test(username) || !KEY_RE.test(String(b.key || ''))) throw new HttpError(401, '아이디 또는 비밀번호가 맞지 않아요');
  const u = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
  const now = Date.now();
  if (!u) throw new HttpError(401, '아이디 또는 비밀번호가 맞지 않아요');
  if (u.fail_until > now) throw new HttpError(429, '로그인 시도가 너무 많아요. 10분 뒤에 다시 해 주세요');
  if (!sameStr(await sha256(u.salt + b.key), u.hash)) {
    const fails = u.fail_count + 1;
    await env.DB.prepare('UPDATE users SET fail_count = ?, fail_until = ? WHERE id = ?')
      .bind(fails >= MAX_FAILS ? 0 : fails, fails >= MAX_FAILS ? now + LOCK_MS : 0, u.id).run();
    throw new HttpError(401, '아이디 또는 비밀번호가 맞지 않아요');
  }
  if (u.fail_count) await env.DB.prepare('UPDATE users SET fail_count = 0, fail_until = 0 WHERE id = ?').bind(u.id).run();
  return { token: await newSession(env, u.id), username: u.username, profile: cleanProfile(parseProfile(u)) || cleanProfile({}) };
}

async function recover(req, env) {
  const b = await readBody(req, 2000);
  const username = String(b.username || '').trim();
  if (!USER_RE.test(username) || !KEY_RE.test(String(b.key || ''))) throw bad('입력을 확인해 주세요');
  const u = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
  const now = Date.now();
  if (!u) throw new HttpError(401, '아이디 또는 복구 코드가 맞지 않아요');
  if (u.fail_until > now) throw new HttpError(429, '시도가 너무 많아요. 10분 뒤에 다시 해 주세요');
  if (!sameStr(await sha256(u.rec_salt + normRec(b.recovery)), u.rec_hash)) {
    const fails = u.fail_count + 1;
    await env.DB.prepare('UPDATE users SET fail_count = ?, fail_until = ? WHERE id = ?')
      .bind(fails >= MAX_FAILS ? 0 : fails, fails >= MAX_FAILS ? now + LOCK_MS : 0, u.id).run();
    throw new HttpError(401, '아이디 또는 복구 코드가 맞지 않아요');
  }
  const salt = randHex(16), recSalt = randHex(16), rec = recoveryCode();
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET salt = ?, hash = ?, rec_salt = ?, rec_hash = ?, fail_count = 0, fail_until = 0 WHERE id = ?')
      .bind(salt, await sha256(salt + b.key), recSalt, await sha256(recSalt + normRec(rec)), u.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id)
  ]);
  return { token: await newSession(env, u.id), username: u.username, recovery: rec, profile: cleanProfile(parseProfile(u)) || cleanProfile({}) };
}

async function logout(req, env) {
  const u = await authUser(req, env);
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(u.token_hash).run();
  return { ok: true };
}

async function me(req, env) {
  const u = await authUser(req, env);
  return { username: u.username, profile: cleanProfile(parseProfile(u)) || cleanProfile({}) };
}

async function saveProfile(req, env) {
  const u = await authUser(req, env);
  const b = await readBody(req, 40000);
  const now = Date.now();
  const next = cleanProfile(b.profile);
  if (!next) throw bad('잘못된 프로필이에요');
  const prev = cleanProfile(parseProfile(u));
  limitCoins(prev, next, u.profile_updated, now);
  await env.DB.prepare('UPDATE users SET profile = ?, profile_updated = ? WHERE id = ?').bind(JSON.stringify(next), now, u.id).run();
  return { profile: next };
}

function checkTrack(track, laps) {
  if (TRACKS[track] == null) throw bad('없는 트랙이에요');
  if (!LAPS.includes(laps)) throw bad('바퀴 수가 잘못됐어요');
}
async function postRecord(req, env) {
  const u = await authUser(req, env);
  const b = await readBody(req, MAX_GHOST_CHARS + 20000);
  const track = String(b.track || ''), laps = b.laps | 0, time = +b.time;
  checkTrack(track, laps);
  const lapTimes = Array.isArray(b.lapTimes) ? b.lapTimes.map(Number) : [];
  if (!isFinite(time) || lapTimes.length !== laps || lapTimes.some(x => !isFinite(x) || x <= 0)) throw bad('기록 형식이 잘못됐어요');
  const minLap = TRACKS[track];
  if (lapTimes.some(x => x < minLap) || Math.abs(lapTimes.reduce((a, c) => a + c, 0) - time) > 0.6) throw bad('믿기 어려운 기록이라 저장하지 않았어요');
  // ghost = Int32 samples packed as base64 text (cheap to check: no number parsing on the server)
  const g = b.ghost || {};
  const stride = g.stride | 0, b64 = typeof g.b64 === 'string' ? g.b64 : '';
  if (![7, 8].includes(stride) || !b64 || b64.length > MAX_GHOST_CHARS || b64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw bad('고스트 형식이 잘못됐어요');
  const bytes = b64.length / 4 * 3 - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
  if (bytes % (4 * stride) !== 0) throw bad('고스트 형식이 잘못됐어요');
  const samples = bytes / 4 / stride;
  if (Math.abs(samples * 0.05 - time) > 2.5) throw bad('고스트와 기록이 맞지 않아요');
  const ghost = JSON.stringify({ stride, b64 });
  const skin = b.skin && typeof b.skin === 'object' ? JSON.stringify({
    body: String(b.skin.body || 'std').slice(0, 12), wheel: String(b.skin.wheel || 'std').slice(0, 12),
    helmet: String(b.skin.helmet || 'std').slice(0, 12), color: Math.max(0, Math.min(99, b.skin.color | 0))
  }) : null;
  const old = await env.DB.prepare('SELECT time FROM records WHERE user_id = ? AND track = ? AND laps = ?').bind(u.id, track, laps).first();
  let best = false;
  if (!old || time < old.time) {
    best = true;
    await env.DB.prepare('INSERT INTO records (user_id, track, laps, time, lap_times, skin, ghost, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ' +
      'ON CONFLICT(user_id, track, laps) DO UPDATE SET time = excluded.time, lap_times = excluded.lap_times, skin = excluded.skin, ghost = excluded.ghost, updated_at = excluded.updated_at')
      .bind(u.id, track, laps, time, JSON.stringify(lapTimes), skin, ghost, Date.now()).run();
  }
  const mine = best ? time : old.time;
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM records WHERE track = ? AND laps = ? AND time < ?').bind(track, laps, mine).first();
  return { best, time: mine, rank: (r ? r.n : 0) + 1 };
}

async function leaderboard(url, env) {
  const track = url.searchParams.get('track') || '', laps = +url.searchParams.get('laps') || 0;
  checkTrack(track, laps);
  const rs = await env.DB.prepare('SELECT u.username, r.time, r.skin FROM records r JOIN users u ON u.id = r.user_id WHERE r.track = ? AND r.laps = ? ORDER BY r.time ASC LIMIT 20')
    .bind(track, laps).all();
  return { rows: (rs.results || []).map((x, i) => ({ rank: i + 1, username: x.username, time: x.time, skin: x.skin ? JSON.parse(x.skin) : null })) };
}

async function getGhost(url, env) {
  const track = url.searchParams.get('track') || '', laps = +url.searchParams.get('laps') || 0, user = url.searchParams.get('user') || '';
  checkTrack(track, laps);
  if (!USER_RE.test(user)) throw bad('아이디가 잘못됐어요');
  const x = await env.DB.prepare('SELECT u.username, r.time, r.lap_times, r.skin, r.ghost FROM records r JOIN users u ON u.id = r.user_id WHERE r.track = ? AND r.laps = ? AND u.username = ?')
    .bind(track, laps, user).first();
  if (!x) throw new HttpError(404, '기록을 찾을 수 없어요');
  return { username: x.username, time: x.time, lapTimes: JSON.parse(x.lap_times), skin: x.skin ? JSON.parse(x.skin) : null, ghost: JSON.parse(x.ghost) };
}

/* ---------- router ---------- */
export default {
  async fetch(req, env) {
    const cors = corsHeaders(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(req.url);
    const route = req.method + ' ' + url.pathname.replace(/\/+$/, '');
    try {
      if (!env.DB) throw new HttpError(500, '서버에 데이터베이스(DB)가 연결되지 않았어요');
      let out;
      switch (route) {
        case 'GET /api/health': out = { ok: true }; break;
        case 'POST /api/register': out = await register(req, env); break;
        case 'POST /api/login': out = await login(req, env); break;
        case 'POST /api/recover': out = await recover(req, env); break;
        case 'POST /api/logout': out = await logout(req, env); break;
        case 'GET /api/me': out = await me(req, env); break;
        case 'PUT /api/profile': out = await saveProfile(req, env); break;
        case 'POST /api/records': out = await postRecord(req, env); break;
        case 'GET /api/leaderboard': out = await leaderboard(url, env); break;
        case 'GET /api/ghost': out = await getGhost(url, env); break;
        default: throw new HttpError(404, '없는 주소예요');
      }
      return json(out, 200, cors);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e && e.stack || e);
      return json({ error: status === 500 && !(e instanceof HttpError) ? '서버 오류가 났어요' : e.message }, status, cors);
    }
  }
};
