// Firebase Realtime Database を使ったオンライン対戦。
// 構成：ホストのブラウザがゲームエンジン（権威）を実行し、各プレイヤーの操作要求だけを受け取って検証する。
//  - rooms/{code}/meta     : ロビー情報（全員が読める）
//  - rooms/{code}/public   : 公開状態（供給・捨て札・場・ログ等）
//  - rooms/{code}/hands/{uid} : 各自の手札と選択待ち（本人とホストのみ読める。他人には送られない）
//  - rooms/{code}/actions/{uid}: 各プレイヤーが書く操作要求（ホストのみ読める）
//  - rooms/{code}/replay, secret: 再現用の入力ログとシード（ホストのみ）
// ホストが再読み込みしても、replay から同じ状態を再構築して続行できる。
import { firebaseConfig, isConfigured } from './firebase-config.js';
import { Game } from './engine.js';
import { botStep } from './ai.js';

const V = '10.14.1';
const base = `https://www.gstatic.com/firebasejs/${V}`;
let real = null;
let factory = null;
export function __setFactory(f) { factory = f; } // テスト用：Firebaseの代わりのモックを注入

export async function initFirebase() {
  if (factory) return factory();
  if (real) return real;
  if (!isConfigured()) throw new Error('firebase-config.js が未設定です');
  const [{ initializeApp }, A, D] = await Promise.all([
    import(`${base}/firebase-app.js`), import(`${base}/firebase-auth.js`), import(`${base}/firebase-database.js`),
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  const db = D.getDatabase(app);
  const user = await new Promise((res, rej) => {
    const off = A.onAuthStateChanged(auth, (u) => { if (u) { off(); res(u); } });
    A.signInAnonymously(auth).catch(rej);
  });
  real = { app, auth, db, uid: user.uid, D };
  return real;
}

// Firebase は空配列・null を保存しないため、受信時に補正する
function normPublic(v) {
  if (!v) return v;
  v.trash = v.trash || []; v.log = v.log || []; v.supply = v.supply || []; v.kingdom = v.kingdom || [];
  for (const p of v.players || []) { p.discard = p.discard || []; p.play = p.play || []; }
  if (v.results) { v.results.winners = v.results.winners || []; for (const r of v.results.rows || []) r.bd = r.bd || {}; }
  v.t = v.t || null; v.pending = v.pending || null; v.results = v.results || null;
  return v;
}
function normPriv(v) {
  if (!v) return v;
  v.hand = v.hand || []; v.req = v.req || null;
  if (v.req) { v.req.cards = v.req.cards || undefined; if (v.req.kind === 'cards') v.req.cards = v.req.cards || []; }
  return v;
}
const remember = (v) => { try { localStorage.setItem('dom_room', v); } catch {} };
const clean = (o) => JSON.parse(JSON.stringify(o));
const genCode = () => { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 5; i++) s += c[Math.floor(Math.random() * c.length)]; return s; };

export class OnlineSession {
  constructor() { this.listeners = []; this.view = null; this.privView = null; this.meta = null; this.offs = []; this.isHost = false; this.game = null; this.processed = {}; this.botTimer = null; this.code = null; }
  onUpdate(cb) { this.listeners.push(cb); }
  emit() { this.listeners.forEach((f) => f()); }
  get uid() { return this.fb.uid; }
  get me() { return this.fb.uid; }
  r(path) { return this.fb.D.ref(this.fb.db, `rooms/${this.code}/${path}`); }
  listen(path, cb) { const off = this.fb.D.onValue(this.r(path), (s) => cb(s.val())); this.offs.push(off); }
  close() { this.offs.forEach((f) => f()); this.offs = []; clearTimeout(this.botTimer); }

  async create(name, cfg) {
    this.fb = await initFirebase();
    this.isHost = true;
    for (let i = 0; i < 5; i++) {
      this.code = genCode();
      const snap = await this.fb.D.get(this.r('meta'));
      if (!snap.exists()) break;
    }
    await this.fb.D.set(this.r('meta'), { hostUid: this.fb.uid, status: 'lobby', cfg, created: Date.now(), players: { [this.fb.uid]: { name, seat: 0, host: true } } });
    this.attach();
    remember(JSON.stringify({ code: this.code, host: true }));
    return this.code;
  }
  async join(code, name) {
    this.fb = await initFirebase();
    this.code = code.trim().toUpperCase();
    const snap = await this.fb.D.get(this.r('meta'));
    if (!snap.exists()) throw new Error('部屋が見つかりません');
    const m = snap.val();
    this.isHost = m.hostUid === this.fb.uid;
    const players = m.players || {};
    if (!players[this.fb.uid]) {
      if (m.status !== 'lobby') throw new Error('このゲームは既に始まっています');
      if (Object.keys(players).length >= 4) throw new Error('満員です');
      const seat = Math.max(-1, ...Object.values(players).map((p) => p.seat)) + 1;
      await this.fb.D.set(this.r(`meta/players/${this.fb.uid}`), { name, seat });
    }
    this.attach();
    remember(JSON.stringify({ code: this.code, host: this.isHost }));
    return this.code;
  }
  attach() {
    this.listen('meta', async (m) => {
      this.meta = m; this.emit();
      if (this.isHost && m && m.status === 'playing' && !this.game && !this.starting) await this.hostResume();
    });
    this.listen('public', (v) => { this.view = normPublic(v); this.emit(); });
    this.listen(`hands/${this.fb.uid}`, (v) => { this.privView = normPriv(v); this.emit(); });
    if (this.isHost) this.listen('actions', (a) => this.onActions(a));
  }

  // ---- ロビー（ホスト）----
  async addBot() {
    if (!this.meta) return;
    const ps = this.meta.players || {};
    const n = Object.keys(ps).length; if (n >= 4) return;
    const seat = Math.max(...Object.values(ps).map((p) => p.seat)) + 1;
    let k = 1; while (ps['bot' + k]) k++;
    await this.fb.D.set(this.r(`meta/players/bot${k}`), { name: `ボット${k}`, seat, bot: true });
  }
  async removePlayer(id) { await this.fb.D.remove(this.r(`meta/players/${id}`)); }
  async updateCfg(cfg) { await this.fb.D.update(this.r('meta'), { cfg }); }
  async start(kingdom) {
    const ps = Object.entries(this.meta.players || {}).map(([id, p]) => ({ id, ...p })).sort((a, b) => a.seat - b.seat);
    if (ps.length < 2) throw new Error('2人以上必要です');
    const seed = (Math.random() * 2 ** 32) >>> 0;
    const order = ps.map((p) => ({ id: p.id, name: p.name, bot: !!p.bot }));
    await this.fb.D.set(this.r('secret'), { seed, kingdom, order });
    await this.fb.D.remove(this.r('replay'));
    await this.fb.D.update(this.r('meta'), { status: 'playing', kingdom });
  }

  // ---- ゲーム実行（ホスト）----
  async hostResume() {
    this.starting = true;
    const [sec, rep] = await Promise.all([this.fb.D.get(this.r('secret')), this.fb.D.get(this.r('replay'))]);
    const s = sec.val();
    this.game = new Game({ seed: s.seed, players: s.order, kingdom: s.kingdom });
    const list = [];
    const rv = rep.val();
    if (rv) Object.keys(rv).map(Number).sort((a, b) => a - b).forEach((k) => list.push({ pid: rv[k].pid, a: JSON.parse(rv[k].a) }));
    this.game.replay(list);
    this.botIds = new Set(s.order.filter((p) => p.bot).map((p) => p.id));
    for (const id of Object.keys((this.meta && this.meta.players) || {})) if (this.meta.players[id].bot) this.botIds.add(id);
    await this.publish(null);
    this.scheduleBot();
  }
  async publish(newAnswer) {
    const g = this.game;
    const up = { [`rooms/${this.code}/public`]: clean(g.publicView()) };
    for (const p of g.players) if (!this.botIds.has(p.id)) up[`rooms/${this.code}/hands/${p.id}`] = clean(g.privateView(p.id));
    if (newAnswer) up[`rooms/${this.code}/replay/${newAnswer.i}`] = { pid: newAnswer.pid, a: JSON.stringify(newAnswer.a) };
    if (g.over) up[`rooms/${this.code}/meta/status`] = 'finished';
    await this.fb.D.update(this.fb.D.ref(this.fb.db), up);
  }
  async applyAnswer(pid, a) {
    const r = this.game.respond(pid, a);
    if (!r.ok) return r;
    const i = this.game.answers.length - 1;
    await this.publish({ i, pid, a });
    return r;
  }
  onActions(all) {
    if (!all || !this.game || this.busy) return;
    const jobs = [];
    for (const [uid, x] of Object.entries(all)) {
      if (!x || (this.processed[uid] || 0) >= x.n) continue;
      this.processed[uid] = x.n;
      jobs.push([uid, x]);
    }
    if (!jobs.length) return;
    this.chain = (this.chain || Promise.resolve()).then(async () => {
      for (const [uid, x] of jobs) {
        if (x.seq !== this.game.answers.length) continue; // 古い操作・二重送信は無視
        try { await this.applyAnswer(uid, JSON.parse(x.a)); } catch (e) { console.error(e); }
      }
      this.scheduleBot();
    });
  }
  scheduleBot() {
    clearTimeout(this.botTimer);
    const g = this.game;
    if (!g || g.over || !g.pending || !this.botIds.has(g.pending.pid)) return;
    this.botTimer = setTimeout(() => {
      this.chain = (this.chain || Promise.resolve()).then(async () => {
        const g2 = this.game; if (!g2 || g2.over || !g2.pending || !this.botIds.has(g2.pending.pid)) return;
        const before = g2.answers.length;
        botStep(g2);
        if (g2.answers.length > before) { const a = g2.answers[g2.answers.length - 1]; await this.publish({ i: g2.answers.length - 1, pid: a.pid, a: a.a }); }
        this.scheduleBot();
      });
    }, this.botDelay != null ? this.botDelay : g.pending.kind === 'turn' ? 650 : 400);
  }
  async replaceWithBot(id) {
    if (!this.isHost || !this.game) return;
    this.botIds.add(id);
    await this.fb.D.update(this.r(`meta/players/${id}`), { bot: true });
    const p = this.game.playerById(id); if (p) p.bot = true;
    await this.publish(null);
    this.scheduleBot();
  }

  // ---- プレイヤー操作 ----
  async send(ans) {
    if (!this.privView || !this.privView.req) return;
    if (this.isHost && this.game) {
      this.chain = (this.chain || Promise.resolve()).then(async () => {
        if (this.privView.seq !== this.game.answers.length) return;
        await this.applyAnswer(this.fb.uid, ans); this.scheduleBot();
      });
      return;
    }
    await this.fb.D.set(this.r(`actions/${this.fb.uid}`), { n: (this.actN = Math.max(this.actN || 0, Date.now()) + 1), seq: this.privView.seq, a: JSON.stringify(ans) });
  }
}
