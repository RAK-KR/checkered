(function (root) {
'use strict';
/* ============================================================
   Profile: skins catalog, coins, achievements, save layer, API
   - Everything here is cosmetic: no item changes kart performance.
   - Saved in the browser; when logged in it is also synced to the server.
   ============================================================ */

const CFG = root.RACING_CONFIG || {};
const API_BASE = String(CFG.API_BASE || '').replace(/\/+$/, '');

/* ---------- catalog ---------- */
// colors: index 0-7 are the original free colours (same order as Core.KART_COLORS)
const COLORS = [
  { id: 0, name: '레드', hex: 0xe8402a },
  { id: 1, name: '옐로', hex: 0xf2c230 },
  { id: 2, name: '그린', hex: 0x2fa84f },
  { id: 3, name: '퍼플', hex: 0x7a4fd6 },
  { id: 4, name: '핑크', hex: 0xf07ab0 },
  { id: 5, name: '블랙', hex: 0x1c1c1c },
  { id: 6, name: '화이트', hex: 0xffffff },
  { id: 7, name: '블루', hex: 0x2b8fd6 },
  { id: 8, name: '오렌지', hex: 0xff8a1f, price: 150 },
  { id: 9, name: '민트', hex: 0x3fe0c0, price: 150 },
  { id: 10, name: '네이비', hex: 0x1f3a8a, price: 150 },
  { id: 11, name: '라임', hex: 0xa8e63a, price: 150 },
  { id: 12, name: '카본', hex: 0x34363d, price: 400, emissive: 0x08090c },
  { id: 13, name: '크롬', hex: 0xa9b4c0, price: 700, emissive: 0x1c232c },
  { id: 14, name: '네온', hex: 0xff3df0, price: 900, emissive: 0x7a1070 },
  { id: 15, name: '프로스트', hex: 0xbfe9ff, ach: 'blizzard', emissive: 0x2a5a78 },
  { id: 16, name: '골드', hex: 0xb8860b, ach: 'allmaps', emissive: 0x5a3c00 }
];
const BODIES = [
  { id: 'std', name: '기본형', desc: '익숙한 기본 카트' },
  { id: 'classic', name: '클래식', desc: '둥근 앞코의 복고풍', price: 300 },
  { id: 'rocket', name: '로켓', desc: '뾰족한 앞코와 꼬리 날개', price: 600 },
  { id: 'buggy', name: '버기', desc: '롤케이지를 두른 오프로드형', price: 900 },
  { id: 'wedge', name: '웨지', desc: '납작하고 날카로운 슈퍼카형', price: 1200 },
  { id: 'proto', name: '프로토', desc: '빛나는 라인의 시제품', ach: 'perfect100' }
];
const WHEELS = [
  { id: 'std', name: '기본 휠' },
  { id: 'slick', name: '슬릭', desc: '넓은 레이싱 타이어', price: 200 },
  { id: 'star', name: '스타 휠', desc: '별 모양 휠', price: 400 },
  { id: 'neon', name: '네온 휠', desc: '빛나는 휠', ach: 'drift1000' },
  { id: 'gold', name: '골드 휠', desc: '금색 휠', ach: 'ghosthard' }
];
const HELMETS = [
  { id: 'std', name: '기본 헬멧' },
  { id: 'visor', name: '풀페이스', desc: '큰 바이저', price: 200 },
  { id: 'cat', name: '고양이 귀', price: 400 },
  { id: 'horn', name: '뿔', price: 500 },
  { id: 'wing', name: '날개', ach: 'jump50' },
  { id: 'crown', name: '왕관', ach: 'netwin10' }
];
const CATS = { body: BODIES, color: COLORS, wheel: WHEELS, helmet: HELMETS };
const CAT_NAMES = { body: '바디', color: '색상', wheel: '바퀴', helmet: '헬멧' };

/* ---------- achievements ---------- */
// check(stats) returns [current, goal]
const ACHIEVEMENTS = [
  { id: 'first_finish', name: '첫 완주', desc: '아무 레이스나 완주하기', check: s => [s.finishes, 1], reward: { coins: 100 } },
  { id: 'first_win', name: '첫 우승', desc: '봇전에서 1등 하기', check: s => [s.botWins, 1], reward: { coins: 200 } },
  { id: 'hard_win', name: '강적 격파', desc: '어려움 봇전에서 1등 하기', check: s => [s.hardWins, 1], reward: { coins: 500 } },
  { id: 'tap300', name: '톡톡이 장인', desc: '톡톡이 300회', check: s => [s.taps, 300], reward: { coins: 300 } },
  { id: 'team5', name: '팀플레이어', desc: '팀전 승리 5회', check: s => [s.teamWins, 5], reward: { coins: 500 } },
  { id: 'perfect100', name: '퍼펙트 마스터', desc: '퍼펙트 순간 부스터 100회', check: s => [s.perfects, 100], reward: { item: 'body:proto' } },
  { id: 'drift1000', name: '드리프트 1000', desc: '드리프트 1000회', check: s => [s.drifts, 1000], reward: { item: 'wheel:neon' } },
  { id: 'jump50', name: '하늘을 날다', desc: '점프대 50회 넘기', check: s => [s.jumps, 50], reward: { item: 'helmet:wing' } },
  { id: 'blizzard', name: '설산 정복', desc: '블리자드 패스 완주', check: s => [s.maps.indexOf('blizzard') >= 0 ? 1 : 0, 1], reward: { item: 'color:15' } },
  { id: 'allmaps', name: '월드 투어', desc: '모든 맵 완주', check: s => [s.maps.length, MAP_COUNT()], reward: { item: 'color:16' } },
  { id: 'ghosthard', name: '고스트 헌터', desc: '어려움 기본 고스트를 서로 다른 맵 5곳에서 이기기', check: s => [s.ghostHard.length, 5], reward: { item: 'wheel:gold' } },
  { id: 'netwin10', name: '대결의 왕', desc: '친구 대결 10승 (개인전 1등 또는 팀전 승리)', check: s => [s.netWins, 10], reward: { item: 'helmet:crown' } }
];
const MAP_COUNT = () => (root.Core ? root.Core.TRACK_DEFS.length : 14);

/* ---------- profile data ---------- */
function freeItems() {
  const out = [];
  for (const cat in CATS) for (const it of CATS[cat]) if (!it.price && !it.ach) out.push(cat + ':' + it.id);
  return out;
}
function blankStats() {
  return { races: 0, finishes: 0, botWins: 0, hardWins: 0, perfects: 0, drifts: 0, taps: 0, jumps: 0, teamWins: 0, netWins: 0, maps: [], ghostHard: [] };
}
function blank() {
  return { v: 1, coins: 0, owned: freeItems(), equip: { body: 'std', color: 0, wheel: 'std', helmet: 'std' }, ach: [], stats: blankStats() };
}
function itemOf(key) {
  const i = key.indexOf(':'); if (i < 0) return null;
  const cat = key.slice(0, i), id = key.slice(i + 1), list = CATS[cat];
  if (!list) return null;
  const it = list.find(x => String(x.id) === id);
  return it ? { cat, it } : null;
}
function sanitize(p) {
  const b = blank();
  if (!p || typeof p !== 'object') return b;
  b.coins = Math.max(0, Math.min(1e7, Math.floor(+p.coins || 0)));
  const owned = new Set(b.owned);
  if (Array.isArray(p.owned)) for (const k of p.owned) if (typeof k === 'string' && itemOf(k)) owned.add(k);
  b.owned = [...owned];
  if (p.equip && typeof p.equip === 'object') for (const cat in CATS) {
    const v = p.equip[cat];
    if (v != null && owned.has(cat + ':' + v)) b.equip[cat] = cat === 'color' ? +v : String(v);
  }
  if (Array.isArray(p.ach)) b.ach = p.ach.filter(a => ACHIEVEMENTS.some(x => x.id === a));
  if (p.stats && typeof p.stats === 'object') {
    for (const k in b.stats) {
      if (Array.isArray(b.stats[k])) b.stats[k] = Array.isArray(p.stats[k]) ? p.stats[k].filter(x => typeof x === 'string').slice(0, 100) : [];
      else b.stats[k] = Math.max(0, Math.floor(+p.stats[k] || 0));
    }
  }
  return b;
}

/* ---------- local storage ---------- */
const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { } }
};
const KEY_GUEST = 'racing_profile_guest', KEY_ACCT = 'racing_profile_acct', KEY_SESSION = 'racing_session';

const listeners = [];
const P = {
  data: sanitize(LS.get(KEY_GUEST)),
  user: null,            // { username } when logged in
  onChange(fn) { listeners.push(fn); },
  emit() { for (const fn of listeners) try { fn(); } catch (e) { console.error(e); } },
  persist() {
    LS.set(this.user ? KEY_ACCT : KEY_GUEST, this.data);
    if (this.user) Api.queueSave();
    this.emit();
  },

  /* items */
  catalog: CATS, catNames: CAT_NAMES, colors: COLORS, achievements: ACHIEVEMENTS,
  owns(cat, id) { return this.data.owned.indexOf(cat + ':' + id) >= 0; },
  itemState(cat, it) {
    if (this.owns(cat, it.id)) return String(this.data.equip[cat]) === String(it.id) ? 'equipped' : 'owned';
    if (it.ach) return 'locked';
    return 'buy';
  },
  buy(cat, id) {
    const list = CATS[cat], it = list && list.find(x => String(x.id) === String(id));
    if (!it || this.owns(cat, id)) return { ok: false, why: '이미 가지고 있어요' };
    if (it.ach) return { ok: false, why: '도전 과제로만 얻을 수 있어요' };
    if (this.data.coins < it.price) return { ok: false, why: '코인이 부족해요' };
    this.data.coins -= it.price;
    this.data.owned.push(cat + ':' + it.id);
    this.persist();
    return { ok: true };
  },
  equip(cat, id) {
    if (!this.owns(cat, id)) return false;
    this.data.equip[cat] = cat === 'color' ? +id : String(id);
    this.persist();
    return true;
  },
  skin() { const e = this.data.equip; return { body: e.body, wheel: e.wheel, helmet: e.helmet, color: e.color }; },
  colorHex(id) { const c = COLORS[id] || COLORS[0]; return c.hex; },
  ownedColors() { return COLORS.filter(c => this.owns('color', c.id)).map(c => c.id); },
  achProgress(a) { const [cur, goal] = a.check(this.data.stats); return { cur: Math.min(cur, goal), goal, done: this.data.ach.indexOf(a.id) >= 0 }; },

  /* rewards: r = { mode:'speed'|'ta'|'net', rank, total, retired, diff, laps, team, teamWin, trackId,
                    pb, beatDefault, beatDefaultHard, stats:{drifts,perfect,taps}, jumps } */
  awardRace(r) {
    const st = this.data.stats;
    st.races++;
    st.drifts += r.stats.drifts || 0; st.taps += r.stats.taps || 0; st.perfects += r.stats.perfect || 0; st.jumps += r.jumps || 0;
    let coins = 0;
    const lapMul = Math.max(0.4, (r.laps || 3) / 3);
    if (!r.retired) {
      st.finishes++;
      if (r.trackId && st.maps.indexOf(r.trackId) < 0) st.maps.push(r.trackId);
    }
    if (r.mode === 'ta') {
      if (!r.retired) coins += 20 * lapMul;
      if (r.pb) coins += 30;
      if (r.beatDefault) coins += 40;
      if (r.beatDefaultHard && r.trackId && st.ghostHard.indexOf(r.trackId) < 0) st.ghostHard.push(r.trackId);
    } else {
      const table = [60, 45, 35, 25, 20, 15, 12, 10];
      const base = r.retired ? 5 : (table[r.rank - 1] || 10);
      const diffMul = r.mode === 'net' ? 1.2 : [0.7, 1, 1.4, 1.8][r.diff == null ? 1 : r.diff] || 1;
      coins += base * diffMul * lapMul;
      if (r.teamWin) coins += r.mode === 'net' ? 30 : 20;
      if (r.mode === 'speed' && r.rank === 1 && !r.retired) { st.botWins++; if (r.diff >= 2) st.hardWins++; }
      if (r.mode === 'net' && ((r.team == null && r.rank === 1 && !r.retired) || r.teamWin)) st.netWins++;
      if (r.teamWin) st.teamWins++;
    }
    coins = Math.round(coins);
    this.data.coins += coins;
    const unlocked = [];
    for (const a of ACHIEVEMENTS) {
      if (this.data.ach.indexOf(a.id) >= 0) continue;
      const [cur, goal] = a.check(st);
      if (cur >= goal) {
        this.data.ach.push(a.id);
        if (a.reward.coins) this.data.coins += a.reward.coins;
        if (a.reward.item && this.data.owned.indexOf(a.reward.item) < 0) this.data.owned.push(a.reward.item);
        unlocked.push(a);
      }
    }
    this.persist();
    return { coins, unlocked };
  },
  rewardText(a) {
    if (a.reward.coins) return a.reward.coins + ' 코인';
    const it = itemOf(a.reward.item);
    return it ? CAT_NAMES[it.cat] + ' "' + it.it.name + '"' : '';
  },

  /* account switching */
  useAccount(username, serverProfile) {
    this.user = { username };
    this.data = sanitize(serverProfile);
    LS.set(KEY_ACCT, this.data);
    this.emit();
  },
  useGuest() {
    this.user = null;
    LS.del(KEY_ACCT);
    this.data = sanitize(LS.get(KEY_GUEST));
    this.emit();
  },
  guestData() { return sanitize(LS.get(KEY_GUEST)); }
};

/* ---------- API client ---------- */
const enc = new TextEncoder();
function b64(buf) { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }
// The slow password hash runs here in the browser (PBKDF2, 300k rounds); the server hashes the result again.
async function deriveKey(username, password) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('racing-v1|' + username.toLowerCase()), iterations: 300000 }, base, 256);
  return b64(bits);
}
const USER_RE = /^[A-Za-z0-9_가-힣]{2,12}$/;
// ghost samples are whole numbers; pack them as little-endian Int32 → base64
function packGhost(data) {
  const a = new Int32Array(data.length); for (let i = 0; i < data.length; i++) a[i] = data[i] | 0;
  const u = new Uint8Array(a.buffer); let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}
function unpackGhost(b64) {
  const s = atob(b64), u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return Array.from(new Int32Array(u.buffer));
}

const Api = {
  enabled: !!API_BASE,
  base: API_BASE,
  token: (LS.get(KEY_SESSION) || {}).token || null,
  async req(method, path, body, auth) {
    if (!this.enabled) throw new Error('서버 주소가 설정되지 않았어요');
    const h = { 'Content-Type': 'application/json' };
    if (auth && this.token) h.Authorization = 'Bearer ' + this.token;
    let res;
    try { res = await fetch(this.base + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }); }
    catch (e) { throw new Error('서버에 연결하지 못했어요'); }
    let data = null; try { data = await res.json(); } catch (e) { }
    if (!res.ok) {
      if (res.status === 401 && auth) this.dropSession();
      throw new Error((data && data.error) || ('서버 오류 (' + res.status + ')'));
    }
    return data;
  },
  setSession(token, username) { this.token = token; LS.set(KEY_SESSION, { token, username }); },
  dropSession() { this.token = null; LS.del(KEY_SESSION); if (P.user) P.useGuest(); },
  validUser(u) { return USER_RE.test(u); },

  async register(username, password, carryGuest) {
    if (!USER_RE.test(username)) throw new Error('아이디는 한글·영문·숫자·밑줄로 2~12자예요');
    if (password.length < 6) throw new Error('비밀번호는 6자 이상이에요');
    const key = await deriveKey(username, password);
    const r = await this.req('POST', '/api/register', { username, key, profile: carryGuest ? P.guestData() : null });
    if (carryGuest) LS.del(KEY_GUEST);   // moved into the account, so the guest copy starts fresh
    this.setSession(r.token, r.username);
    P.useAccount(r.username, r.profile);
    return r;
  },
  async login(username, password) {
    const key = await deriveKey(username, password);
    const r = await this.req('POST', '/api/login', { username, key });
    this.setSession(r.token, r.username);
    P.useAccount(r.username, r.profile);
    return r;
  },
  async recover(username, recovery, newPassword) {
    if (newPassword.length < 6) throw new Error('비밀번호는 6자 이상이에요');
    const key = await deriveKey(username, newPassword);
    const r = await this.req('POST', '/api/recover', { username, recovery: recovery.trim().toUpperCase(), key });
    this.setSession(r.token, r.username);
    P.useAccount(r.username, r.profile);
    return r;
  },
  async logout() {
    try { await this.req('POST', '/api/logout', null, true); } catch (e) { }
    this.dropSession();
    P.useGuest();
  },
  async resume() {
    if (!this.enabled || !this.token) return false;
    const cached = LS.get(KEY_ACCT), sess = LS.get(KEY_SESSION) || {};
    if (cached && sess.username) { P.user = { username: sess.username }; P.data = sanitize(cached); P.emit(); }
    try {
      const r = await this.req('GET', '/api/me', null, true);
      P.useAccount(r.username, r.profile);
      return true;
    } catch (e) {
      // keep cached account data if the server is just unreachable
      return !!P.user;
    }
  },
  _saveT: null, _saving: false, _again: false,
  queueSave() {
    if (!this.enabled || !this.token) return;
    clearTimeout(this._saveT);
    this._saveT = setTimeout(() => this.flush(), 1200);
  },
  async flush() {
    if (this._saving) { this._again = true; return; }
    this._saving = true;
    try {
      const r = await this.req('PUT', '/api/profile', { profile: P.data }, true);
      if (r && r.profile) { P.data = sanitize(r.profile); LS.set(KEY_ACCT, P.data); P.emit(); }
    } catch (e) { console.warn('profile sync failed:', e.message); }
    this._saving = false;
    if (this._again) { this._again = false; this.flush(); }
  },
  submitRecord(rec) {
    const g = rec.ghost;
    const body = Object.assign({}, rec, { ghost: { stride: g.stride, b64: packGhost(g.data) } });
    return this.req('POST', '/api/records', body, true);
  },
  leaderboard(track, laps) { return this.req('GET', '/api/leaderboard?track=' + encodeURIComponent(track) + '&laps=' + laps); },
  async ghost(track, laps, user) {
    const r = await this.req('GET', '/api/ghost?track=' + encodeURIComponent(track) + '&laps=' + laps + '&user=' + encodeURIComponent(user));
    r.ghost = { stride: r.ghost.stride, data: unpackGhost(r.ghost.b64) };
    return r;
  }
};

root.Profile = P;
root.Api = Api;
root.ProfileUtil = { sanitize, blank, itemOf, deriveKey, USER_RE, packGhost, unpackGhost };
})(typeof window !== 'undefined' ? window : globalThis);
