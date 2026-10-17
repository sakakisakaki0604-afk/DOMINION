// Dominion ゲームエンジン。
// - 乱数はシード付き。入力(answers)の列から状態を完全に再現できる（ホスト再接続時のリプレイ用）。
// - 効果はジェネレータで記述し、選択が必要な箇所で pending request を yield して一時停止する。
// - 全ての応答は respond() で合法性を検証してから適用する。
// - 持続(Duration)・獲得時誘発・追加ターン・トークン/マットなど拡張固有の状態もここで一元管理する。

import { CARDS } from './cards.js';
import './seaside.js';
import './prosperity.js';

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// カードが存在しうる領域（プレイヤー個別）
const ZONES = ['hand', 'deck', 'discard', 'play', 'aside', 'hold', 'island', 'native'];

export class Game {
  constructor(cfg) {
    this.cfg = cfg;
    this.seed = cfg.seed >>> 0;
    this.rng = mulberry32(this.seed);
    this.nextId = 1;
    this.logLines = [];
    this.answers = [];
    this.pending = null;
    this.over = false;
    this.results = null;
    this.trashPile = [];
    this.pendingGains = [];
    this.isExtra = false;
    this.depth = 0;
    this.setup();
    this.gen = this.main();
    this.advance(undefined);
  }

  // ---------- 基本ユーティリティ ----------
  def(n) { return CARDS[n]; }
  defOf(n) { return CARDS[n]; }
  nm(c) { return CARDS[c.name].name_ja; }
  names(list) { return list.map((c) => this.nm(c)).join('、'); }
  isType(c, t) {
    if (t === 'Treasure' && this.curseTreasure && c.name === 'Curse') return true;
    return CARDS[c.name].types.includes(t);
  }
  say(s) { this.logLines.push(s); if (this.logLines.length > 400) this.logLines.shift(); }
  pile(n) { return this.supply[n]; }
  pileNames() { return this.pileOrder.slice(); }
  emptyPiles() { return this.pileOrder.filter((n) => this.supply[n].length === 0).length; }
  cost(x) {
    const base = CARDS[x.name].cost;
    if (!this.t) return base;
    const cur = this.players[this.cur];
    let c = base - this.t.reduce;
    if (CARDS[x.name].types.includes('Action')) c -= 2 * cur.play.filter((k) => k.name === 'Quarry').length;
    if (x.name === 'Peddler' && this.t.phase === 'buy') c -= 2 * cur.play.filter((k) => CARDS[k.name].types.includes('Action')).length;
    return Math.max(0, c);
  }
  mk(name) { return { id: this.nextId++, name, types: CARDS[name].types.slice() }; }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  others(p) {
    const i = this.players.indexOf(p), n = this.players.length, r = [];
    for (let k = 1; k < n; k++) r.push(this.players[(i + k) % n]);
    return r;
  }
  orderFrom(p) { return [p, ...this.others(p)]; }
  leftOf(p) { return this.players[(this.players.indexOf(p) + 1) % this.players.length]; }
  rightOf(p) { const n = this.players.length; return this.players[(this.players.indexOf(p) - 1 + n) % n]; }
  victims(p, imm) { return this.others(p).filter((v) => !imm.has(v.id)); }
  playerById(id) { return this.players.find((p) => p.id === id); }

  // ---------- セットアップ ----------
  setup() {
    const n = this.cfg.players.length;
    this.players = this.cfg.players.map((pl) => ({
      id: pl.id, name: pl.name, bot: !!pl.bot, turns: 0, vp: 0,
      deck: [], hand: [], discard: [], play: [], aside: [], hold: [], island: [], native: [],
      durations: [], lastGains: [], gainsNow: [],
    }));
    const vic = n <= 2 ? 8 : 12;
    const piles = {};
    const order = [];
    const add = (name, count) => { piles[name] = []; for (let i = 0; i < count; i++) piles[name].push(this.mk(name)); order.push(name); };
    const kingdom = this.cfg.kingdom.slice().sort((a, b) => CARDS[a].cost - CARDS[b].cost || CARDS[a].name_ja.localeCompare(CARDS[b].name_ja));
    this.curseTreasure = kingdom.includes('Charlatan');
    // 繁栄のカードが含まれる場合、その割合で白金貨・植民地を使う（シードから決定。cfg.colony で固定可）
    const pc = kingdom.filter((k) => CARDS[k].set === 'prosperity').length;
    const roll = this.rng();
    this.colony = this.cfg.colony != null ? !!this.cfg.colony : roll < pc / 10;
    add('Copper', 60 - 7 * n); add('Silver', 40); add('Gold', 30);
    if (this.colony) add('Platinum', 12);
    add('Estate', vic); add('Duchy', vic); add('Province', vic);
    if (this.colony) add('Colony', vic);
    add('Curse', (n - 1) * 10);
    for (const k of kingdom) add(k, CARDS[k].types.includes('Victory') ? vic : 10);
    this.supply = piles; this.pileOrder = order; this.kingdom = kingdom;
    for (const p of this.players) {
      for (let i = 0; i < 7; i++) p.deck.push(piles.Copper.pop());
      for (let i = 0; i < 3; i++) p.deck.push(piles.Estate.pop());
      this.shuffle(p.deck);
    }
    this.cur = this.cfg.first != null ? this.cfg.first : Math.floor(this.rng() * n);
    for (const p of this.players) this.draw(p, 5);
    this.say(`ゲーム開始。先手は${this.players[this.cur].name}${this.colony ? '（白金貨・植民地あり）' : ''}`);
  }

  // ---------- 領域操作（カードは常に1つの領域だけに存在） ----------
  removeAny(p, c) {
    for (const z of ZONES) { const i = p[z].indexOf(c); if (i >= 0) { p[z].splice(i, 1); return z; } }
    const i = this.trashPile.indexOf(c); if (i >= 0) this.trashPile.splice(i, 1);
    return null;
  }
  zoneOf(p, c) { for (const z of ZONES) if (p[z].includes(c)) return z; return null; }
  moveTo(p, c, zone) { this.removeAny(p, c); p[zone].push(c); return c; }
  discard(p, c) { this.moveTo(p, c, 'discard'); }
  trash(p, c) { this.removeAny(p, c); this.trashPile.push(c); this.say(`${p.name}は${this.nm(c)}を廃棄した`); }
  takeTop(p) {
    if (!p.deck.length && p.discard.length) {
      p.deck = this.shuffle(p.discard); p.discard = [];
      this.say(`${p.name}は捨て札をシャッフルして山札にした`);
    }
    if (!p.deck.length) return null;
    const c = p.deck.pop(); p.aside.push(c); return c;
  }
  draw(p, n) {
    let k = 0;
    for (; k < n; k++) { const c = this.takeTop(p); if (!c) break; this.moveTo(p, c, 'hand'); }
    return k;
  }
  gain(p, name, dest = 'discard', opts = {}) {
    const pile = this.supply[name];
    if (!pile || !pile.length) { this.say(`${CARDS[name].name_ja}の山は空で獲得できない`); return null; }
    const c = pile.pop(); p[dest].push(c);
    this.say(`${p.name}は${this.nm(c)}を獲得した${dest === 'deck' ? '（山札の上）' : dest === 'hand' ? '（手札）' : dest === 'hold' ? '（脇に置く）' : ''}`);
    const isCur = this.t && this.players[this.cur] === p;
    if (isCur) p.gainsNow.push(name);
    if (opts.bought && isCur && this.isType(c, 'Victory')) this.t.boughtVictory = true;
    this.pendingGains.push({ p, card: c, bought: !!opts.bought });
    return c;
  }
  gainable(max, filter, exact) {
    return this.pileOrder.filter((n) => {
      if (!this.supply[n].length) return false;
      const c = this.cost(CARDS[n]);
      if (exact ? c !== max : c > max) return false;
      return !filter || filter(CARDS[n]);
    });
  }
  addDuration(p, card, kind, start, data = {}) { p.durations.push({ card, kind, start, data }); }

  // 獲得時などの誘発を、次の選択の前／カード解決の終わりにまとめて処理する
  *flush() {
    while (this.pendingGains.length) {
      const { p, card, bought } = this.pendingGains.shift();
      const isCur = this.t && this.players[this.cur] === p;
      if (card.name === 'Mint') for (const c of p.play.filter((x) => this.isType(x, 'Treasure'))) this.trash(p, c);
      if (isCur && this.t.collection && this.isType(card, 'Action')) { p.vp += this.t.collection; this.say(`${p.name}は収集で勝利点トークンを${this.t.collection}得た`); }
      if (isCur && bought && this.isType(card, 'Victory')) {
        for (const h of p.play.filter((x) => x.name === 'Hoard')) { void h; this.gain(p, 'Gold'); }
      }
      for (const q of this.players) {
        for (const e of q.durations) {
          if (e.kind === 'blockade' && q !== p && isCur && card.name === e.data.name) this.gain(p, 'Curse');
          if (e.kind === 'monkey' && this.rightOf(q) === p) this.draw(q, 1);
        }
      }
      if (this.isType(card, 'Treasure')) {
        for (const q of this.orderFrom(p)) {
          for (;;) {
            const pir = q.hand.find((c) => c.name === 'Pirate');
            if (!pir) break;
            const ok = yield* this.yesNo(q, `${p.name}が財宝を獲得：手札の海賊をプレイしますか？`, true);
            if (!ok) break;
            yield* this.playCard(q, pir, { react: true });
          }
        }
      }
      if (isCur && this.t.sailorLeft > 0 && this.isType(card, 'Duration') && this.zoneOf(p, card)) {
        const ok = yield* this.yesNo(p, `船乗り：獲得した${this.nm(card)}をプレイしますか？`, true);
        if (ok) { this.t.sailorLeft -= 1; yield* this.playCard(p, card, { react: true }); }
      }
      if (isCur && this.t.tiara && this.zoneOf(p, card) && this.zoneOf(p, card) !== 'deck') {
        const ok = yield* this.yesNo(p, `ティアラ：獲得した${this.nm(card)}を山札の上に置きますか？`, false);
        if (ok) this.moveTo(p, card, 'deck');
      }
      for (;;) {
        const wt = p.hand.find((c) => c.name === 'Watchtower');
        if (!wt || !this.zoneOf(p, card) || this.zoneOf(p, card) === 'trash') break;
        const o = yield* this.chooseOption(p, [{ id: 'no', label: '何もしない' }, { id: 'trash', label: `${this.nm(card)}を廃棄` }, { id: 'deck', label: `${this.nm(card)}を山札の上に置く` }], '物見やぐら：公開して使いますか？', 'no');
        if (o === 'no') break;
        this.say(`${p.name}は物見やぐらを公開した`);
        if (o === 'trash') this.trash(p, card); else this.moveTo(p, card, 'deck');
        break;
      }
    }
  }

  // ---------- 選択リクエスト ----------
  ref(c) { return { id: c.id, name: c.name }; }
  *chooseCards(p, list, min, max, prompt, hint = 'none', counts = null) {
    yield* this.flush();
    list = list.slice();
    min = Math.min(min, list.length); max = Math.min(max, list.length);
    if (!list.length || max === 0) return [];
    if (!counts && min === max && min === list.length) return list;
    const req = { pid: p.id, kind: 'cards', prompt, hint, cards: list.map((c) => this.ref(c)), min, max, counts };
    const ans = yield req;
    return ans.map((id) => list.find((c) => c.id === id));
  }
  *choosePile(p, names, prompt, hint = 'gain', optional = false) {
    yield* this.flush();
    if (!names.length) return null;
    if (!optional && names.length === 1 && hint !== 'name') return names[0];
    const req = { pid: p.id, kind: 'pile', prompt, hint, piles: names.slice(), optional };
    return yield req;
  }
  *chooseOption(p, options, prompt, def) {
    yield* this.flush();
    if (options.length === 1) return options[0].id;
    const req = { pid: p.id, kind: 'option', prompt, hint: 'option', options, def: def || options[0].id };
    return yield req;
  }
  *chooseOptions(p, options, n, prompt) {
    yield* this.flush();
    const req = { pid: p.id, kind: 'options', prompt, hint: 'options', options, n };
    return yield req;
  }
  *yesNo(p, prompt, def = true) {
    yield* this.flush();
    const req = { pid: p.id, kind: 'option', prompt, hint: 'yesno', options: [{ id: 'yes', label: 'はい' }, { id: 'no', label: 'いいえ' }], def: def ? 'yes' : 'no' };
    return (yield req) === 'yes';
  }
  *chooseNumber(p, min, max, prompt, def = 0) {
    yield* this.flush();
    if (min >= max) return min;
    return yield { pid: p.id, kind: 'number', prompt, hint: 'number', min, max, def };
  }
  *orderToDeck(p, cards) {
    // cards: 山札の上に戻すカード。上に置く順にひとつずつ選ばせる
    const rest = cards.slice(); const top = [];
    while (rest.length > 1) {
      const [c] = yield* this.chooseCards(p, rest, 1, 1, `山札の上に戻す順：次に上へ来るカードを選ぶ（残り${rest.length}枚）`, 'order');
      top.push(c); rest.splice(rest.indexOf(c), 1);
    }
    top.push(...rest);
    for (let i = top.length - 1; i >= 0; i--) this.moveTo(p, top[i], 'deck');
  }

  // ---------- アタックとリアクション ----------
  *beginAttack(p) {
    const imm = new Set();
    for (const v of this.others(p)) {
      if (v.durations.some((e) => e.kind === 'lighthouse')) { imm.add(v.id); this.say(`${v.name}は灯台の効果でアタックを受けない`); continue; }
      const used = new Set();
      for (;;) {
        const cands = v.hand.filter((c) => {
          const r = CARDS[c.name].reaction;
          return r && !used.has(c.id) && (r !== 'diplomat' || v.hand.length >= 5);
        });
        if (!cands.length) break;
        const pk = yield* this.chooseCards(v, cands, 0, 1, `${p.name}のアタック：リアクションを公開しますか？（公開するカードを選ぶ／選ばず見送り）`, 'reaction');
        if (!pk.length) break;
        const c = pk[0]; used.add(c.id);
        this.say(`${v.name}は${this.nm(c)}を公開した`);
        const r = CARDS[c.name].reaction;
        if (r === 'moat') imm.add(v.id);
        if (r === 'diplomat') {
          this.draw(v, 2);
          const n = Math.min(3, v.hand.length);
          const cs = yield* this.chooseCards(v, v.hand, n, n, '外交官：手札3枚を捨てる', 'discard');
          for (const x of cs) this.discard(v, x);
        }
      }
    }
    return imm;
  }

  // ---------- プレイ ----------
  *playCard(p, c, opt = {}) {
    if (++this.depth > 300) throw new Error('effect depth exceeded');
    const d = CARDS[c.name];
    if (!opt.again) { this.removeAny(p, c); p.play.push(c); }
    if (!opt.react) this.t.actionsPlayed += 1;
    this.say(`${p.name}は${d.name_ja}をプレイ${opt.again ? '（追加プレイ）' : ''}`);
    if (d.effect) yield* d.effect(this, p, { card: c });
    yield* this.flush();
    this.depth--;
  }
  *playTreasure(p, c, opt = {}) {
    const d = CARDS[c.name];
    if (!opt.again) { this.removeAny(p, c); p.play.push(c); }
    let coins = d.coinsFn ? d.coinsFn(this, p, c) : (d.coins || 0);
    if (c.name === 'Curse' && this.curseTreasure) coins = 1;
    this.t.coins += coins;
    if (c.name === 'Silver' && !this.t.silverPlayed) { this.t.silverPlayed = true; this.t.coins += this.t.merchant; }
    if (d.effect) yield* d.effect(this, p, { card: c });
    if ((c.name === 'Silver' || c.name === 'Gold') && !this.t.corsairHit && this.others(p).some((q) => q.durations.some((e) => e.kind === 'corsair'))) {
      this.t.corsairHit = true;
      this.say(`海賊船の効果で${p.name}は${d.name_ja}を廃棄した`);
      this.trash(p, c);
    }
    yield* this.flush();
  }

  // ---------- 入力の検証 ----------
  legalTurn(p, a) {
    const t = this.t;
    if (!a || typeof a !== 'object') return false;
    const inHand = (id) => p.hand.find((c) => c.id === id);
    switch (a.t) {
      case 'play': { const c = inHand(a.id); return !!c && t.phase === 'action' && t.actions > 0 && this.isType(c, 'Action'); }
      case 'treasure': { const c = inHand(a.id); return !!c && this.isType(c, 'Treasure'); }
      case 'allTreasures': return p.hand.some((c) => this.isType(c, 'Treasure'));
      case 'buy': {
        const pl = this.supply[a.pile];
        if (!pl || !pl.length || t.buys < 1 || t.coins < this.cost(CARDS[a.pile])) return false;
        if (a.pile === 'Grand Market' && p.play.some((c) => c.name === 'Copper')) return false;
        return true;
      }
      case 'endActions': return t.phase === 'action';
      case 'end': return true;
      default: return false;
    }
  }
  validate(req, ans) {
    switch (req.kind) {
      case 'turn': return this.legalTurn(this.playerById(req.pid), ans);
      case 'cards': {
        if (!Array.isArray(ans)) return false;
        const ids = req.cards.map((c) => c.id);
        if (new Set(ans).size !== ans.length || ans.some((x) => !ids.includes(x))) return false;
        if (req.counts) return req.counts.includes(ans.length);
        return ans.length >= req.min && ans.length <= req.max;
      }
      case 'pile': return (req.optional && ans == null) || req.piles.includes(ans);
      case 'option': return req.options.some((o) => o.id === ans);
      case 'options': return Array.isArray(ans) && new Set(ans).size === req.n && ans.length === req.n && ans.every((x) => req.options.some((o) => o.id === x));
      case 'number': return Number.isInteger(ans) && ans >= req.min && ans <= req.max;
      default: return false;
    }
  }
  respond(pid, ans) {
    const req = this.pending;
    if (this.over || !req) return { ok: false, err: 'no_pending' };
    if (req.pid !== pid) return { ok: false, err: 'not_your_turn' };
    if (!this.validate(req, ans)) return { ok: false, err: 'illegal' };
    this.answers.push({ pid, a: ans });
    this.advance(ans);
    return { ok: true };
  }
  advance(v) {
    const r = this.gen.next(v);
    this.pending = r.done ? null : r.value;
  }
  // 保存済みの入力列から再現
  replay(list) { for (const x of list) { const r = this.respond(x.pid, x.a); if (!r.ok) throw new Error('replay failed'); } }

  // ---------- ターン進行 ----------
  newTurn() {
    this.t = {
      phase: 'action', actions: 1, buys: 1, coins: 0, reduce: 0, merchant: 0, silverPlayed: false, actionsPlayed: 0,
      boughtVictory: false, collection: 0, tiara: false, sailorLeft: 0, named: [], outpost: false, corsairHit: false,
    };
  }
  *startTurn(p) {
    // 前のターンから持ち越した持続効果を解決（終わった効果はここで取り除く）
    const list = p.durations; p.durations = [];
    for (const e of list) {
      if (!e.start) continue;
      const r = e.start(this, p, e);
      if (r && typeof r.next === 'function') yield* r;
    }
    yield* this.flush();
    // 手札のリアクション（開始時に使えるもの）
    for (;;) {
      const clerk = p.hand.find((c) => c.name === 'Clerk');
      if (!clerk) break;
      const ok = yield* this.yesNo(p, 'ターン開始時：手札の書記官をプレイしますか？', true);
      if (!ok) break;
      yield* this.playCard(p, clerk);
    }
  }
  *main() {
    for (;;) {
      const p = this.players[this.cur];
      this.newTurn(); p.turns += 1;
      this.say(`── ${p.name}のターン（${p.turns}）${this.isExtra ? '※追加ターン' : ''} ──`);
      this.depth = 0;
      yield* this.startTurn(p);
      for (;;) {
        const t = this.t;
        if (t.phase === 'action' && (t.actions < 1 || !p.hand.some((c) => this.isType(c, 'Action')))) t.phase = 'buy';
        if (t.phase === 'buy' && t.buys < 1) break;
        const a = yield { pid: p.id, kind: 'turn', prompt: '' };
        if (a.t === 'end') break;
        if (a.t === 'endActions') { t.phase = 'buy'; continue; }
        if (a.t === 'play') {
          const c = p.hand.find((x) => x.id === a.id);
          t.actions -= 1; this.depth = 0;
          yield* this.playCard(p, c);
        } else if (a.t === 'treasure') {
          t.phase = 'buy'; yield* this.playTreasure(p, p.hand.find((x) => x.id === a.id));
        } else if (a.t === 'allTreasures') {
          t.phase = 'buy';
          const ts = p.hand.filter((x) => this.isType(x, 'Treasure')).sort((x, y) => (CARDS[x.name].coinsFn ? 1 : 0) - (CARDS[y.name].coinsFn ? 1 : 0)); // 銀行など「場の財宝を数える」財宝は最後に
          for (const c of ts) { if (p.hand.includes(c)) yield* this.playTreasure(p, c); }
        } else if (a.t === 'buy') {
          t.phase = 'buy';
          t.buys -= 1; t.coins -= this.cost(CARDS[a.pile]);
          const c = this.gain(p, a.pile, 'discard', { bought: true });
          if (c) this.say(`${p.name}は${CARDS[a.pile].name_ja}を購入`);
          yield* this.flush();
        }
      }
      // クリーンアップ
      const t = this.t;
      const keep = [], toDiscard = [];
      for (const c of p.play) (p.durations.some((e) => e.card === c) ? keep : toDiscard).push(c);
      // 先に領域を整合させてから選択を問う（途中状態でカードが重複しないようにする）
      const rest = p.hand.concat(p.aside);
      const tre = [];
      p.hand = []; p.aside = []; p.play = keep;
      for (const c of toDiscard) (c.name === 'Treasury' && !t.boughtVictory ? tre : p.discard).push(c);
      for (const c of rest) p.discard.push(c);
      p.aside = tre;
      for (const c of tre.slice()) {
        const ok = yield* this.yesNo(p, '国庫を捨て札にせず山札の上に置きますか？', true);
        this.moveTo(p, c, ok ? 'deck' : 'discard');
      }
      p.lastGains = p.gainsNow; p.gainsNow = [];
      const extra = t.outpost && !this.isExtra;
      this.t = null;
      yield* this.flush();
      this.draw(p, t.outpost ? 3 : 5);
      if (this.checkEnd()) { this.finish(); return; }
      if (extra) { this.isExtra = true; } else { this.isExtra = false; this.cur = (this.cur + 1) % this.players.length; }
    }
  }
  checkEnd() {
    return this.supply.Province.length === 0 || (this.colony && this.supply.Colony.length === 0) || this.emptyPiles() >= 3;
  }
  allCards(p) { return p.deck.concat(p.hand, p.discard, p.play, p.aside, p.hold, p.island, p.native); }
  score(p) {
    const cards = this.allCards(p);
    const bd = {}; let vp = 0;
    for (const c of cards) {
      const d = CARDS[c.name];
      if (!d.vp) continue;
      if (c.name === 'Gardens' || c.name === 'Duke') continue;
      const v = d.vp(cards); vp += v; bd[d.name_ja] = (bd[d.name_ja] || 0) + v;
    }
    for (const nme of ['Gardens', 'Duke']) {
      const n = cards.filter((c) => c.name === nme).length;
      if (n) { const v = n * CARDS[nme].vp(cards); vp += v; bd[CARDS[nme].name_ja] = v; }
    }
    if (p.vp) { vp += p.vp; bd['勝利点トークン'] = p.vp; }
    return { vp, bd, cards: cards.length };
  }
  finish() {
    this.over = true;
    const rows = this.players.map((p) => ({ id: p.id, name: p.name, turns: p.turns, ...this.score(p) }));
    const best = Math.max(...rows.map((r) => r.vp));
    let w = rows.filter((r) => r.vp === best);
    const minT = Math.min(...w.map((r) => r.turns));
    w = w.filter((r) => r.turns === minT);
    this.results = { rows, winners: w.map((r) => r.id) };
    this.say(`ゲーム終了。勝者：${w.map((r) => r.name).join('、')}${w.length > 1 ? '（引き分け）' : ''}`);
  }

  // ---------- 表示用の射影（非公開情報は含めない） ----------
  publicView() {
    const cur = this.players[this.cur];
    const pend = this.pending;
    return {
      seq: this.answers.length,
      over: this.over,
      results: this.results,
      kingdom: this.kingdom,
      curseTreasure: this.curseTreasure,
      supply: this.pileOrder.map((n) => ({ name: n, count: this.supply[n].length, cost: this.cost(CARDS[n]) })),
      trash: this.trashPile.map((c) => c.name),
      players: this.players.map((p) => ({
        id: p.id, name: p.name, bot: p.bot, turns: p.turns, vp: p.vp,
        deck: p.deck.length, hand: p.hand.length, aside: p.aside.length, hold: p.hold.length, native: p.native.length,
        island: p.island.map((c) => c.name),
        discard: p.discard.map((c) => c.name), play: p.play.map((c) => c.name),
        dur: p.durations.map((e) => e.card.name),
      })),
      cur: cur.id,
      t: this.t ? { ...this.t, named: this.t.named.slice() } : null,
      pending: pend ? { pid: pend.pid, kind: pend.kind, prompt: pend.prompt } : null,
      log: this.logLines.slice(-120),
    };
  }
  privateView(pid) {
    const p = this.playerById(pid);
    if (!p) return null;
    const pend = this.pending && this.pending.pid === pid ? this.pending : null;
    return {
      seq: this.answers.length,
      hand: p.hand.map((c) => this.ref(c)),
      hold: p.hold.map((c) => c.name),
      native: p.native.map((c) => c.name),
      req: pend,
    };
  }
}

export function randomKingdom(pool, rngSeed) {
  const r = mulberry32(rngSeed);
  const a = pool.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, 10);
}
