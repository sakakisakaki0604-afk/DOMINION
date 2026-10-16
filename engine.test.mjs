import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/engine.js';
import { CARDS, KINGDOM_NAMES, FIRST_GAME } from '../js/cards.js';

const PL = (n = 2) => Array.from({ length: n }, (_, i) => ({ id: 'u' + i, name: 'P' + i }));
const mk = (k = FIRST_GAME, n = 2, seed = 7) => new Game({ players: PL(n), kingdom: k, seed });
// 手札・山札などを直接セットするテストヘルパ
function setZone(g, p, zone, names) { g.P(p)[zone] = names.map((n) => g._mk(n)); }
// 山札から実在カードを除去してカウント保存を保つ: テストでは supply 側を減らして total を維持
function fix(g) { g.S.turn.phase = 'action'; g._afterAction(); g.S.total = Object.values(g.S.piles).reduce((a, b) => a + b, 0) + g.S.players.reduce((s, p) => s + p.deck.length + p.hand.length + p.discard.length + p.play.length + p.aside.length, 0) + g.S.trash.length; }
const ok = (r) => assert.equal(r.ok, true, r.error);
const hand = (g, p, n) => g.P(p).hand.find((c) => c.n === n);
const names = (zone) => zone.map((c) => c.n).sort();

test('セットアップ: 2人 山札枚数・初期デッキ・初期手札', () => {
  const g = mk();
  assert.equal(g.S.piles.Copper, 46); assert.equal(g.S.piles.Estate, 8); assert.equal(g.S.piles.Curse, 10);
  assert.equal(g.S.piles.Silver, 40); assert.equal(g.S.piles.Gold, 30);
  for (const p of g.S.players) { assert.equal(p.hand.length, 5); assert.equal(p.deck.length, 5); }
  g.audit();
});
test('セットアップ: 3/4人の呪いと勝利点山', () => {
  const g3 = mk(FIRST_GAME, 3), g4 = mk(FIRST_GAME, 4);
  assert.equal(g3.S.piles.Curse, 20); assert.equal(g3.S.piles.Province, 12); assert.equal(g3.S.piles.Copper, 39);
  assert.equal(g4.S.piles.Curse, 30); assert.equal(g4.S.piles.Copper, 32);
});
test('セットアップ: 庭園の山は勝利点カード枚数', () => {
  const k = [...FIRST_GAME.slice(0, 9), 'Gardens'];
  assert.equal(mk(k, 2).S.piles.Gardens, 8); assert.equal(mk(k, 4).S.piles.Gardens, 12);
});
test('セットアップ: 不正な王国カードを拒否', () => {
  assert.throws(() => new Game({ players: PL(2), kingdom: FIRST_GAME.slice(0, 9), seed: 1 }));
  assert.throws(() => new Game({ players: PL(2), kingdom: [...FIRST_GAME.slice(0, 9), 'Copper'], seed: 1 }));
  assert.throws(() => new Game({ players: PL(1), kingdom: FIRST_GAME, seed: 1 }));
});
test('ドロー: 山札切れで捨て札をシャッフル/双方空なら引けない', () => {
  const g = mk();
  setZone(g, 0, 'deck', ['Copper']); setZone(g, 0, 'discard', ['Silver', 'Gold']); setZone(g, 0, 'hand', []); fix(g);
  assert.equal(g._draw(0, 5), 3); assert.equal(g.P(0).hand.length, 3); assert.equal(g.P(0).discard.length, 0);
  assert.equal(g._draw(0, 1), 0); g.audit();
});
test('手番: 購入→クリーンアップ→次手番', () => {
  const g = mk();
  setZone(g, 0, 'hand', ['Copper', 'Copper', 'Copper', 'Estate', 'Estate']); fix(g);
  ok(g.act(0, { type: 'playAllTreasures' }));
  assert.equal(g.S.turn.coins, 3);
  ok(g.act(0, { type: 'buy', pile: 'Silver' }));
  assert.equal(g.S.turn.buys, 0); assert.equal(g.S.turn.coins, 0);
  assert.equal(g.act(0, { type: 'buy', pile: 'Silver' }).ok, false);
  ok(g.act(0, { type: 'endTurn' }));
  assert.equal(g.S.turn.player, 1); assert.equal(g.P(0).hand.length, 5); assert.equal(g.P(0).turns, 1);
  assert.equal(g.P(0).play.length, 0); assert.equal(g.S.piles.Silver, 39);
  g.audit();
});
test('手番外の操作・コスト不足・空山の購入は拒否', () => {
  const g = mk();
  assert.equal(g.act(1, { type: 'endTurn' }).ok, false);
  assert.equal(g.act(0, { type: 'buy', pile: 'Gold' }).ok, false);
  g.S.piles.Moat = 0;
  g.S.turn.coins = 9;
  assert.equal(g.act(0, { type: 'buy', pile: 'Moat' }).ok, false);
});
test('アクション不足・アクション以外のプレイは拒否/自動で購入フェイズへ', () => {
  const g = mk();
  setZone(g, 0, 'hand', ['Village', 'Smithy', 'Copper', 'Copper', 'Copper']); setZone(g, 0, 'deck', ['Copper', 'Copper', 'Copper', 'Copper']); fix(g);
  g.S.turn.phase = 'action';
  ok(g.act(0, { type: 'play', card: hand(g, 0, 'Village').id }));
  assert.equal(g.S.turn.actions, 2); assert.equal(g.P(0).hand.length, 5);
  assert.equal(g.act(0, { type: 'play', card: hand(g, 0, 'Copper').id }).ok, false);
  ok(g.act(0, { type: 'play', card: hand(g, 0, 'Smithy').id }));
  assert.equal(g.S.turn.phase, 'buy'); // アクションカードが手札にないため自動で購入フェイズ
  assert.equal(g.act(0, { type: 'play', card: 1 }).ok, false);
});
test('アクションフェイズ後の財宝: 購入フェイズ後はアクションをプレイ不可', () => {
  const g = mk();
  setZone(g, 0, 'hand', ['Village', 'Village', 'Copper', 'Copper', 'Copper']); fix(g);
  ok(g.act(0, { type: 'playTreasure', card: hand(g, 0, 'Copper').id }));
  assert.equal(g.act(0, { type: 'play', card: hand(g, 0, 'Village').id }).ok, false);
});

// ---- 個別カード ----
function play(g, name, answers = [], p = 0) {
  const c = hand(g, p, name);
  ok(g.act(p, { type: 'play', card: c.id }));
  for (const a of answers) {
    assert.ok(g.pending, `選択待ちのはず (${name})`);
    let v = typeof a === 'function' ? a(g.pending, g) : a;
    if (g.pending.kind === 'cards' && typeof v === 'number') v = [v];
    ok(g.act(g.pending.player, { type: 'answer', value: v }));
  }
  assert.equal(g.pending, null, `未解決の選択待ち: ${g.pending && g.pending.prompt}`);
  g.audit();
}
const ids = (g, p, ...ns) => { const used = new Set(); return ns.map((n) => { const c = g.P(p).hand.find((x) => x.n === n && !used.has(x.id)); used.add(c.id); return c.id; }); };

test('Cellar', () => {
  const g = mk(); setZone(g, 0, 'hand', ['Cellar', 'Estate', 'Estate', 'Copper']); setZone(g, 0, 'deck', ['Gold', 'Gold', 'Silver']); fix(g);
  play(g, 'Cellar', [(p, g) => ids(g, 0, 'Estate', 'Estate')]);
  assert.equal(g.S.turn.actions, 1); assert.deepEqual(names(g.P(0).hand), ['Copper', 'Gold', 'Silver']); assert.equal(g.P(0).discard.length, 2);
});
test('Cellar 0枚', () => {
  const g = mk(); setZone(g, 0, 'hand', ['Cellar', 'Copper']); fix(g);
  play(g, 'Cellar', [[]]); assert.equal(g.P(0).hand.length, 1);
});
test('Chapel 最大4枚/5枚は不可', () => {
  const g = mk(); setZone(g, 0, 'hand', ['Chapel', 'Curse', 'Estate', 'Copper', 'Copper', 'Silver']); fix(g);
  ok(g.act(0, { type: 'play', card: hand(g, 0, 'Chapel').id }));
  const five = ids(g, 0, 'Curse', 'Estate', 'Copper', 'Copper', 'Silver');
  assert.equal(g.act(0, { type: 'answer', value: five }).ok, false);
  ok(g.act(0, { type: 'answer', value: five.slice(0, 4) }));
  assert.equal(g.S.trash.length, 4); assert.equal(g.P(0).hand.length, 1); g.audit();
});
test('Moat: +2カード/攻撃を防ぐ', () => {
  const g = mk(); setZone(g, 0, 'hand', ['Moat']); fix(g);
  play(g, 'Moat'); assert.equal(g.P(0).hand.length, 2);
  const h = mk(); setZone(h, 0, 'hand', ['Witch']); setZone(h, 1, 'hand', ['Moat', 'Copper']); fix(h);
  play(h, 'Witch', ['yes']);
  assert.equal(h.S.piles.Curse, 10); assert.equal(h.P(1).discard.length, 0);
  const i = mk(); setZone(i, 0, 'hand', ['Witch']); setZone(i, 1, 'hand', ['Moat', 'Copper']); fix(i);
  play(i, 'Witch', ['no']); assert.equal(i.S.piles.Curse, 9); assert.deepEqual(names(i.P(1).discard), ['Curse']);
});
test('Harbinger', () => {
  const g = mk(); setZone(g, 0, 'hand', ['Harbinger']); setZone(g, 0, 'deck', ['Gold', 'Silver']); setZone(g, 0, 'discard', ['Province', 'Copper']); fix(g);
  play(g, 'Harbinger', [(p) => p.from.find((c) => c.n === 'Province').id]);
  assert.equal(g.S.turn.actions, 1); assert.equal(g.P(0).deck.at(-1).n, 'Province'); assert.equal(g.P(0).hand.length, 1);
});
test('Merchant: 最初の銀貨だけ+$1、2枚で2回分', () => {
  const g = mk(); setZone(g, 0, 'hand', ['Merchant', 'Silver', 'Silver']); setZone(g, 0, 'deck', ['Copper']); fix(g);
  play(g, 'Merchant');
  ok(g.act(0, { type: 'playAllTreasures' }));
  assert.equal(g.S.turn.coins, 2 + 2 + 1 + 1); // 銀貨2枚+銅貨1+商人1回
});
test('Merchant + Throne Room: 商人2回で最初の銀貨に+$2', () => {
  const g = mk(); setZone(g, 0, 'hand', ['Throne Room', 'Merchant', 'Silver']); setZone(g, 0, 'deck', ['Copper', 'Copper']); fix(g);
  play(g, 'Throne Room', [(p) => p.from[0].id]);
  assert.equal(g.S.turn.actions, 2); // 0->(TR使用で0)+2
  ok(g.act(0, { type: 'playAllTreasures' }));
  assert.equal(g.S.turn.coins, 2 + 2 + 2); // 銀貨+商人2 + 銅貨2
});
test('Vassal: アクションをプレイ/財宝は捨てるだけ/山札なし', () => {
  const g = mk(); setZone(g, 0, 'hand', ['Vassal']); setZone(g, 0, 'deck', ['Copper', 'Copper', 'Copper', 'Smithy']); fix(g);
  play(g, 'Vassal', ['yes']);
  assert.equal(g.S.turn.coins, 2); assert.equal(g.P(0).hand.length, 3); assert.equal(g.P(0).play.length, 2); assert.equal(g.P(0).discard.length, 0);
  const h = mk(); setZone(h, 0, 'hand', ['Vassal']); setZone(h, 0, 'deck', ['Gold']); fix(h);
  play(h, 'Vassal'); assert.equal(h.P(0).discard.length, 1);
  const i = mk(); setZone(i, 0, 'hand', ['Vassal']); setZone(i, 0, 'deck', []); setZone(i, 0, 'discard', []); fix(i);
  play(i, 'Vassal'); assert.equal(i.S.turn.coins, 2);
});
test('Vassal: アクションをプレイしない選択', () => {
  const g = mk(); setZone(g, 0, 'hand', ['Vassal']); setZone(g, 0, 'deck', ['Smithy']); fix(g);
  play(g, 'Vassal', ['no']); assert.equal(g.P(0).discard.length, 1); assert.equal(g.P(0).hand.length, 0);
});
test('Village/Smithy/Laboratory/Market/Festival', () => {
  const g = mk(); setZone(g, 0, 'hand', ['Market', 'Festival', 'Laboratory']); setZone(g, 0, 'deck', Array(10).fill('Copper')); fix(g);
  play(g, 'Market'); assert.deepEqual([g.S.turn.actions, g.S.turn.buys, g.S.turn.coins], [1, 2, 1]);
  play(g, 'Festival'); assert.deepEqual([g.S.turn.actions, g.S.turn.buys, g.S.turn.coins], [2, 3, 3]);
  play(g, 'Laboratory'); assert.deepEqual([g.S.turn.actions, g.S.turn.buys, g.S.turn.coins], [2, 3, 3]); assert.equal(g.P(0).hand.length, 3);
});
test('Workshop: $4以下を獲得/$5は不可', () => {
  const g = mk(); setZone(g, 0, 'hand', ['Workshop']); fix(g);
  ok(g.act(0, { type: 'play', card: hand(g, 0, 'Workshop').id }));
  assert.equal(g.act(0, { type: 'answer', value: 'Gold' }).ok, false);
  assert.equal(g.act(0, { type: 'answer', value: 'Market' }).ok, false);
  ok(g.act(0, { type: 'answer', value: 'Smithy' })); assert.equal(g.P(0).discard[0].n, 'Smithy'); g.audit();
});
test('Bureaucrat', () => {
  const g = mk(); setZone(g, 0, 'hand', ['Bureaucrat']); setZone(g, 1, 'hand', ['Estate', 'Province', 'Copper']); fix(g);
  play(g, 'Bureaucrat', [(p) => p.from.find((c) => c.n === 'Province').id]);
  assert.equal(g.P(0).deck.at(-1).n, 'Silver'); assert.equal(g.P(1).deck.at(-1).n, 'Province'); assert.equal(g.P(1).hand.length, 2);
  const h = mk(); setZone(h, 0, 'hand', ['Bureaucrat']); setZone(h, 1, 'hand', ['Copper', 'Copper']); fix(h);
  play(h, 'Bureaucrat'); assert.equal(h.P(1).hand.length, 2);
});
test('Gardens: 得点', () => {
  const g = mk([...FIRST_GAME.slice(0, 9), 'Gardens']);
  setZone(g, 0, 'deck', Array(30).fill('Copper')); setZone(g, 0, 'hand', ['Gardens', 'Gardens']); setZone(g, 0, 'discard', []); fix(g);
  const s = g.score(0); assert.equal(s.cards, 32); assert.equal(s.vp, 6);
});
test('Gardens 境界: 39枚→3点/40枚→4点', () => {
  const g = mk([...FIRST_GAME.slice(0, 9), 'Gardens']);
  setZone(g, 0, 'hand', ['Gardens']); setZone(g, 0, 'deck', Array(38).fill('Copper')); setZone(g, 0, 'discard', []); fix(g);
  assert.equal(g.score(0).vp, 3);
  setZone(g, 0, 'deck', Array(39).fill('Copper')); fix(g); assert.equal(g.score(0).vp, 4);
});
test('Militia: 3枚まで捨てる/手札3枚以下は何もしない', () => {
  const g = mk(); setZone(g, 0, 'hand', ['Militia']); setZone(g, 1, 'hand', ['Copper', 'Silver', 'Gold', 'Estate', 'Estate']); fix(g);
  ok(g.act(0, { type: 'play', card: hand(g, 0, 'Militia').id }));
  assert.equal(g.pending.player, 1);
  assert.equal(g.act(1, { type: 'answer', value: ids(g, 1, 'Estate') }).ok, false);
  assert.equal(g.act(0, { type: 'answer', value: ids(g, 1, 'Estate', 'Estate') }).ok, false);
  ok(g.act(1, { type: 'answer', value: ids(g, 1, 'Estate', 'Estate') }));
  assert.equal(g.P(1).hand.length, 3); assert.equal(g.S.turn.coins, 2); g.audit();
  const h = mk(); setZone(h, 0, 'hand', ['Militia']); setZone(h, 1, 'hand', ['Copper', 'Silver', 'Gold']); fix(h);
  play(h, 'Militia'); assert.equal(h.P(1).hand.length, 3);
});
test('Militia: 全員同名なら自動解決', () => {
  const g = mk(); setZone(g, 0, 'hand', ['Militia']); setZone(g, 1, 'hand', Array(5).fill('Copper')); fix(g);
  play(g, 'Militia'); assert.equal(g.P(1).hand.length, 3);
});
test('Moneylender', () => {
  const g = mk(); setZone(g, 0, 'hand', ['Moneylender', 'Copper']); fix(g);
  play(g, 'Moneylender', ['yes']); assert.equal(g.S.turn.coins, 3); assert.equal(g.S.trash.length, 1);
  const h = mk(); setZone(h, 0, 'hand', ['Moneylender', 'Copper']); fix(h);
  play(h, 'Moneylender', ['no']); assert.equal(h.S.turn.coins, 0);
  const i = mk(); setZone(i, 0, 'hand', ['Moneylender', 'Silver']); fix(i);
  play(i, 'Moneylender'); assert.equal(i.S.turn.coins, 0);
});
test('Poacher: 空山の数だけ捨てる', () => {
  const g = mk(); setZone(g, 0, 'hand', ['Poacher', 'Copper', 'Estate']); setZone(g, 0, 'deck', ['Gold']); fix(g);
  g.S.piles.Moat = 0; g.S.piles.Cellar = 0; fix(g);
  play(g, 'Poacher', [(p, g) => ids(g, 0, 'Estate', 'Copper')]);
  assert.equal(g.S.turn.coins, 1); assert.equal(g.P(0).hand.length, 1); assert.equal(g.S.turn.actions, 1);
  const h = mk(); setZone(h, 0, 'hand', ['Poacher']); setZone(h, 0, 'deck', ['Gold']); fix(h);
  play(h, 'Poacher'); assert.equal(h.P(0).hand.length, 1);
});
test('Remodel: 廃棄してコスト+2まで獲得', () => {
  const g = mk(); setZone(g, 0, 'hand', ['Remodel', 'Estate']); fix(g);
  ok(g.act(0, { type: 'play', card: hand(g, 0, 'Remodel').id }));
  assert.equal(g.pending.kind, 'pile'); assert.ok(!g.pending.piles.includes('Market')); assert.ok(g.pending.piles.includes('Smithy'));
  ok(g.act(0, { type: 'answer', value: 'Smithy' })); assert.equal(g.S.trash.length, 1); g.audit();
  const h = mk(); setZone(h, 0, 'hand', ['Remodel', 'Gold']); fix(h);
  ok(h.act(0, { type: 'play', card: hand(h, 0, 'Remodel').id })); ok(h.act(0, { type: 'answer', value: 'Province' }));
  assert.equal(h.S.piles.Province, 7);
});
test('Remodel: 手札なし/Curse廃棄は$0以下(呪い・銅貨など)獲得', () => {
  const g = mk(); setZone(g, 0, 'hand', ['Remodel']); fix(g); play(g, 'Remodel');
  const h = mk(); setZone(h, 0, 'hand', ['Remodel', 'Curse']); fix(h);
  ok(h.act(0, { type: 'play', card: hand(h, 0, 'Remodel').id }));
  assert.deepEqual([...h.pending.piles].sort(), ['Cellar', 'Copper', 'Curse', 'Estate', 'Moat']); // コスト$2以下
});
test('Throne Room: Smithy 2回 / TR+TR / 対象なし', () => {
  const g = mk(); setZone(g, 0, 'hand', ['Throne Room', 'Smithy']); setZone(g, 0, 'deck', Array(8).fill('Copper')); fix(g);
  play(g, 'Throne Room', [(p) => p.from[0].id]); assert.equal(g.P(0).hand.length, 6);
  const h = mk(); setZone(h, 0, 'hand', ['Throne Room', 'Throne Room', 'Village', 'Smithy']); setZone(h, 0, 'deck', Array(30).fill('Copper')); fix(h);
  ok(h.act(0, { type: 'play', card: hand(h, 0, 'Throne Room').id }));
  ok(h.act(0, { type: 'answer', value: [hand(h, 0, 'Throne Room').id] })); // 内側TRを2回
  // 内側TR1回目 → 選択(Village) / 2回目 → 選択(Smithy)
  ok(h.act(0, { type: 'answer', value: [hand(h, 0, 'Village').id] }));
  ok(h.act(0, { type: 'answer', value: [hand(h, 0, 'Smithy').id] }));
  assert.equal(h.pending, null); h.audit();
  const i = mk(); setZone(i, 0, 'hand', ['Throne Room', 'Copper']); fix(i); play(i, 'Throne Room');
});
test('Throne Room: Militia 2回→Moatの反応も2回', () => {
  const g = mk(); setZone(g, 0, 'hand', ['Throne Room', 'Militia']); setZone(g, 1, 'hand', ['Moat', 'Copper', 'Copper', 'Copper', 'Copper']); fix(g);
  ok(g.act(0, { type: 'play', card: hand(g, 0, 'Throne Room').id }));
  ok(g.act(0, { type: 'answer', value: [hand(g, 0, 'Militia').id] }));
  assert.equal(g.pending.reaction, true); ok(g.act(1, { type: 'answer', value: 'yes' }));
  assert.equal(g.pending.reaction, true); ok(g.act(1, { type: 'answer', value: 'no' }));
  assert.equal(g.pending.kind, 'cards'); // 2回目で民兵を受ける
  ok(g.act(1, { type: 'answer', value: [g.pending.from[0].id, g.pending.from[1].id] }));
  assert.equal(g.P(1).hand.length, 3); assert.equal(g.S.turn.coins, 4);
});
test('Bandit: 金貨獲得/銀貨廃棄/銅貨は廃棄しない/選択', () => {
  const g = mk(); setZone(g, 0, 'hand', ['Bandit']); setZone(g, 1, 'deck', ['Copper', 'Silver']); fix(g);
  play(g, 'Bandit'); assert.equal(g.P(0).discard[0].n, 'Gold'); assert.deepEqual(g.S.trash.map((c) => c.n), ['Silver']); assert.deepEqual(names(g.P(1).discard), ['Copper']);
  const h = mk(); setZone(h, 0, 'hand', ['Bandit']); setZone(h, 1, 'deck', ['Copper', 'Copper']); fix(h);
  play(h, 'Bandit'); assert.equal(h.S.trash.length, 0); assert.equal(h.P(1).discard.length, 2);
  const i = mk(); setZone(i, 0, 'hand', ['Bandit']); setZone(i, 1, 'deck', ['Gold', 'Silver']); fix(i);
  play(i, 'Bandit', [(p) => p.from.find((c) => c.n === 'Gold').id]); assert.deepEqual(i.S.trash.map((c) => c.n), ['Gold']); assert.deepEqual(names(i.P(1).discard), ['Silver']);
});
test('Council Room', () => {
  const g = mk(); setZone(g, 0, 'hand', ['Council Room']); setZone(g, 0, 'deck', Array(5).fill('Copper')); setZone(g, 1, 'deck', Array(5).fill('Copper')); fix(g);
  const n1 = g.P(1).hand.length; play(g, 'Council Room');
  assert.equal(g.P(0).hand.length, 4); assert.equal(g.S.turn.buys, 2); assert.equal(g.P(1).hand.length, n1 + 1);
});
test('Library: 7枚まで引く/アクションを脇に置く', () => {
  const g = mk(); setZone(g, 0, 'hand', ['Library', 'Copper', 'Copper']); setZone(g, 0, 'deck', ['Gold', 'Gold', 'Smithy', 'Silver', 'Silver', 'Silver', 'Silver']); fix(g);
  // 山札の上は末尾から: Silver x4, Smithy, Gold, Gold
  play(g, 'Library', ['skip']);
  assert.equal(g.P(0).hand.length, 7); assert.equal(g.P(0).hand.filter((c) => c.n === 'Smithy').length, 0); assert.ok(g.P(0).discard.some((c) => c.n === 'Smithy'));
  const h = mk(); setZone(h, 0, 'hand', ['Library']); setZone(h, 0, 'deck', Array(3).fill('Copper')); setZone(h, 0, 'discard', []); fix(h);
  play(h, 'Library'); assert.equal(h.P(0).hand.length, 3);
  const i = mk(); setZone(i, 0, 'hand', ['Library', 'Copper']); setZone(i, 0, 'deck', ['Copper', 'Copper', 'Copper', 'Copper', 'Copper', 'Smithy']); fix(i);
  play(i, 'Library', ['keep']); assert.equal(i.P(0).hand.length, 7); assert.ok(hand(i, 0, 'Smithy'));
});
test('Mine: 財宝を廃棄して+$3以下の財宝を手札へ', () => {
  const g = mk(); setZone(g, 0, 'hand', ['Mine', 'Copper']); fix(g);
  ok(g.act(0, { type: 'play', card: hand(g, 0, 'Mine').id }));
  ok(g.act(0, { type: 'answer', value: [hand(g, 0, 'Copper').id] }));
  assert.deepEqual(g.pending.piles.sort(), ['Copper', 'Silver']); // $4以下の財宝(金貨は$6)
  ok(g.act(0, { type: 'answer', value: 'Silver' })); assert.equal(hand(g, 0, 'Silver') != null, true); assert.equal(g.S.trash.length, 1);
  const h = mk(); setZone(h, 0, 'hand', ['Mine', 'Silver']); fix(h);
  ok(h.act(0, { type: 'play', card: hand(h, 0, 'Mine').id })); ok(h.act(0, { type: 'answer', value: [hand(h, 0, 'Silver').id] }));
  assert.ok(h.pending.piles.includes('Gold'));
});
test('Sentry: 廃棄・捨て・順序', () => {
  const g = mk(); setZone(g, 0, 'hand', ['Sentry']); setZone(g, 0, 'deck', ['Gold', 'Silver', 'Curse', 'Estate']); fix(g);
  // 引く: Estate、上2枚: Curse, Silver
  ok(g.act(0, { type: 'play', card: hand(g, 0, 'Sentry').id }));
  const cu = g.pending.from.find((c) => c.n === 'Curse').id;
  ok(g.act(0, { type: 'answer', value: [cu] })); // 廃棄
  ok(g.act(0, { type: 'answer', value: [] })); // 捨てない
  assert.equal(g.pending, null); assert.equal(g.P(0).deck.at(-1).n, 'Silver'); assert.equal(g.S.trash[0].n, 'Curse'); g.audit();
  const h = mk(); setZone(h, 0, 'hand', ['Sentry']); setZone(h, 0, 'deck', ['Gold', 'Silver', 'Copper', 'Estate']); fix(h);
  ok(h.act(0, { type: 'play', card: hand(h, 0, 'Sentry').id }));
  ok(h.act(0, { type: 'answer', value: [] })); ok(h.act(0, { type: 'answer', value: [] }));
  assert.equal(h.pending.kind, 'order'); const [a, b] = h.pending.cards.map((c) => c.id);
  ok(h.act(0, { type: 'answer', value: [a, b] })); // a が一番上
  assert.equal(h.P(0).deck.at(-1).id, a);
  const i = mk(); setZone(i, 0, 'hand', ['Sentry']); setZone(i, 0, 'deck', ['Gold', 'Silver', 'Copper']); fix(i);
  ok(i.act(0, { type: 'play', card: hand(i, 0, 'Sentry').id })); // 1枚引いた後、上2枚のみ
  ok(i.act(0, { type: 'answer', value: i.pending.from.map((c) => c.id) })); assert.equal(i.pending, null); assert.equal(i.S.trash.length, 2);
});
test('Sentry: 山札不足(1枚のみ)', () => {
  const g = mk(); setZone(g, 0, 'hand', ['Sentry']); setZone(g, 0, 'deck', ['Gold']); setZone(g, 0, 'discard', []); fix(g);
  play(g, 'Sentry'); assert.equal(g.P(0).hand.length, 1);
});
test('Witch: 呪い山が尽きたら獲得なし', () => {
  const g = mk(); setZone(g, 0, 'hand', ['Witch']); g.S.piles.Curse = 0; fix(g);
  play(g, 'Witch'); assert.equal(g.P(1).discard.length, 0);
});
test('Witch: 3人で全員に呪い', () => {
  const g = mk(FIRST_GAME.slice(0, 9).concat('Witch'), 3); setZone(g, 0, 'hand', ['Witch']); fix(g);
  play(g, 'Witch'); assert.equal(g.S.piles.Curse, 18);
});
test('Artisan: 手札へ獲得→山札の上へ', () => {
  const g = mk([...FIRST_GAME.slice(0, 9), 'Artisan']); setZone(g, 0, 'hand', ['Artisan', 'Estate']); fix(g);
  ok(g.act(0, { type: 'play', card: hand(g, 0, 'Artisan').id }));
  ok(g.act(0, { type: 'answer', value: 'Market' }));
  assert.ok(hand(g, 0, 'Market')); // 手札へ
  ok(g.act(0, { type: 'answer', value: [hand(g, 0, 'Market').id] }));
  assert.equal(g.P(0).deck.at(-1).n, 'Market'); g.audit();
});

// ---- 終了・得点 ----
test('終了: 属州が尽きたら手番終了時に終了/勝者', () => {
  const g = mk(); g.S.piles.Province = 0;
  ok(g.act(0, { type: 'endTurn' }));
  assert.equal(g.S.over, true); assert.equal(g.act(1, { type: 'endTurn' }).ok, false);
});
test('終了: 3山が空', () => {
  const g = mk(); g.S.piles.Moat = 0; g.S.piles.Cellar = 0;
  ok(g.act(0, { type: 'endTurn' })); assert.equal(g.S.over, false);
  g.S.piles.Smithy = 0; ok(g.act(1, { type: 'endTurn' })); assert.equal(g.S.over, true);
});
test('得点: 屋敷3枚=3, 呪いで減点, 同点は手番数が少ない方が勝ち', () => {
  const g = mk(); g.S.piles.Province = 0;
  setZone(g, 0, 'hand', ['Province', 'Curse']); setZone(g, 0, 'deck', Array(5).fill('Copper')); setZone(g, 1, 'deck', Array(5).fill('Copper')); setZone(g, 1, 'hand', Array(5).fill('Copper')); fix(g);
  const s0 = g.score(0); assert.equal(s0.vp, 6 - 1);
  ok(g.act(0, { type: 'endTurn' }));
  // 先手(P0)は1手番、P1は0手番: 得点はP0>P1
  assert.deepEqual(g.S.result.winners, [0]);
});
test('同点: 手番数が同じなら引き分け(共同勝利) / 後手が少なければ後手勝利', () => {
  const g = mk(); g.S.turn.player = 1; g.P(0).turns = 1; g.P(1).turns = 0; g.S.piles.Province = 0;
  // 両者同点(屋敷3): P1が終了させる→ P0=1手番, P1=1手番 → 共同
  ok(g.act(1, { type: 'endTurn' })); assert.deepEqual(g.S.result.winners, [0, 1]);
  const h = mk(); h.S.piles.Province = 0; ok(h.act(0, { type: 'endTurn' }));
  assert.deepEqual(h.S.result.winners, [1]); // 同点でP1の手番数が少ない
});

// ---- 永続化・再現 ----
test('直列化/復元: 選択待ち中でも同一状態に復元', () => {
  const g = mk(); setZone(g, 0, 'hand', ['Militia', 'Library']); setZone(g, 1, 'hand', ['Moat', 'Copper', 'Silver', 'Gold', 'Estate']); fix(g);
  ok(g.act(0, { type: 'play', card: hand(g, 0, 'Militia').id }));
  ok(g.act(1, { type: 'answer', value: 'no' }));
  const ser = JSON.parse(JSON.stringify(g.serialize()));
  const h = Game.restore(ser);
  assert.deepEqual(h.pending, g.pending); assert.deepEqual(h.S, g.S);
  const ans = g.pending.from.slice(0, 2).map((c) => c.id);
  ok(g.act(1, { type: 'answer', value: ans })); ok(h.act(1, { type: 'answer', value: ans }));
  assert.deepEqual(h.S, g.S);
});
test('不正な回答はエンジン状態を壊さない', () => {
  const g = mk(); setZone(g, 0, 'hand', ['Chapel', 'Copper']); fix(g);
  ok(g.act(0, { type: 'play', card: hand(g, 0, 'Chapel').id }));
  const before = JSON.stringify(g.S);
  for (const bad of [[999], 'x', null, [hand(g, 0, 'Copper').id, hand(g, 0, 'Copper').id]]) assert.equal(g.act(0, { type: 'answer', value: bad }).ok, false);
  assert.equal(g.act(1, { type: 'answer', value: [] }).ok, false);
  assert.equal(JSON.stringify(g.S), before);
});
test('公開状態に他人の手札/山札順を含まない', () => {
  const g = mk(); const pub = JSON.stringify(g.publicState());
  for (const p of g.S.players) for (const c of p.hand) assert.ok(!pub.includes(`"id":${c.id},"n"`), '手札IDが公開状態に含まれる');
  assert.equal(typeof g.publicState().players[0].hand, 'number'); assert.equal(typeof g.publicState().players[0].deck, 'number');
  assert.equal(g.privateState(0).hand.length, 5);
  assert.equal(g.privateState(1).hand.every((c) => g.P(1).hand.some((x) => x.id === c.id)), true);
});
test('全王国カードに宣言型effectと出典メタデータがある', () => {
  for (const n of KINGDOM_NAMES) {
    const c = CARDS[n];
    assert.ok(c.id && c.name_en && c.name_ja && c.set_id && c.edition && c.summary_ja && c.source.confidence && c.source.checked_at && c.tests.length, n);
    if (!c.vp_rule) assert.ok(c.effect.length > 0, n);
  }
  assert.equal(KINGDOM_NAMES.length, 26);
});
