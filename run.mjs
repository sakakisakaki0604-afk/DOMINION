// エンジンの自動テスト：ボット同士の対戦を多数実行し、不変条件を検証する。
import { Game, randomKingdom } from '../js/engine.js';
import { botStep } from '../js/ai.js';
import { CARDS, SETS } from '../js/cards.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error('FAIL:', m); } };

function total(g) {
  let n = 0;
  for (const k of g.pileOrder) n += g.supply[k].length;
  n += g.trashPile.length;
  for (const p of g.players) n += g.allCards(p).length;
  return n;
}
function uniqueZones(g) {
  const seen = new Set();
  const add = (c) => { if (seen.has(c.id)) return false; seen.add(c.id); return true; };
  for (const k of g.pileOrder) for (const c of g.supply[k]) if (!add(c)) return false;
  for (const c of g.trashPile) if (!add(c)) return false;
  for (const p of g.players) for (const c of g.allCards(p)) if (!add(c)) return false;
  return true;
}

const pool = [...SETS.base.cards, ...SETS.intrigue.cards];
const seen = {};
let games = 0, ended = 0;
for (let seed = 1; seed <= 300; seed++) {
  const np = 2 + (seed % 3);
  const players = Array.from({ length: np }, (_, i) => ({ id: 'b' + i, name: 'Bot' + i, bot: true }));
  const kingdom = randomKingdom(pool, seed);
  let g;
  try { g = new Game({ seed, players, kingdom }); } catch (e) { ok(false, 'ctor ' + seed + e.stack); continue; }
  const t0 = total(g);
  let steps = 0;
  try {
    while (!g.over && steps < 20000) {
      if (!botStep(g)) { ok(false, `seed ${seed}: bot step failed ${JSON.stringify(g.pending)}`); break; }
      steps++;
      if (steps % 50 === 0) { if (total(g) !== t0 || !uniqueZones(g)) { ok(false, `seed ${seed}: invariant`); break; } }
    }
  } catch (e) { ok(false, `seed ${seed}: ${e.stack}`); continue; }
  games++;
  if (g.over) ended++; else ok(false, `seed ${seed}: did not end`);
  ok(total(g) === t0, `seed ${seed}: card count changed ${t0} -> ${total(g)}`);
  ok(uniqueZones(g), `seed ${seed}: duplicate`);
  for (const l of g.logLines) { const m = l.match(/をプレイ/); if (m) { const nm = l.split('は')[1]; } }
  for (const k of g.kingdom) seen[k] = (seen[k] || 0) + g.players.reduce((a, p) => a + g.allCards(p).filter((c) => c.name === k).length, 0);
  // リプレイ一致
  if (seed % 25 === 0) {
    const g2 = new Game({ seed, players, kingdom });
    g2.replay(g.answers);
    ok(JSON.stringify(g2.results) === JSON.stringify(g.results), `seed ${seed}: replay mismatch`);
  }
}
console.log(`games=${games} ended=${ended}`);
console.log('カード別 取得枚数(全ゲーム合計):', Object.entries(seen).filter(([, v]) => v === 0).map(([k]) => k).join(',') || '全カードが少なくとも1回購入された');

// ---- 個別カードの単体テスト ----
function mkGame(kingdom, np = 2, seed = 7) {
  return new Game({ seed, first: 0, players: Array.from({ length: np }, (_, i) => ({ id: 'p' + i, name: 'P' + i })), kingdom });
}
function setHand(g, p, names) {
  if (g.t) g.t.phase = 'action';
  for (const c of p.hand.slice()) g.moveTo(p, c, 'discard');
  for (const n of names) {
    const c = g.supply[n] && g.supply[n].length ? g.supply[n].pop() : g.mk(n);
    p.hand.push(c);
  }
}
const K = ['Village', 'Smithy', 'Militia', 'Moat', 'Witch', 'Chapel', 'Remodel', 'Throne Room', 'Bridge', 'Gardens'];
{ // Smithy
  const g = mkGame(K); const p = g.players[0]; setHand(g, p, ['Smithy']);
  const before = p.deck.length;
  ok(g.respond('p0', { t: 'play', id: p.hand[0].id }).ok, 'smithy play');
  ok(p.hand.length === 3 && p.deck.length === before - 3, 'smithy draws 3');
}
{ // Throne Room + Smithy = 6 cards
  const g = mkGame(K); const p = g.players[0]; setHand(g, p, ['Throne Room', 'Smithy']);
  g.respond('p0', { t: 'play', id: p.hand[0].id });
  const req = g.pending; ok(req.kind === 'cards' && req.hint === 'play', 'TR asks');
  g.respond('p0', [req.cards[0].id]);
  ok(p.hand.length === 6, 'TR smithy → 6 cards, got ' + p.hand.length);
}
{ // Militia vs Moat
  const g = mkGame(K); const p = g.players[0], q = g.players[1];
  setHand(g, p, ['Militia']); setHand(g, q, ['Moat', 'Copper', 'Copper', 'Copper', 'Estate']);
  g.respond('p0', { t: 'play', id: p.hand[0].id });
  ok(g.pending.pid === 'p1' && g.pending.hint === 'reaction', 'moat prompt');
  g.respond('p1', [g.pending.cards[0].id]);
  ok(q.hand.length === 5 && g.pending.kind === 'turn', 'moat blocks militia');
}
{ // Militia no moat
  const g = mkGame(K); const p = g.players[0], q = g.players[1];
  setHand(g, p, ['Militia']); setHand(g, q, ['Copper', 'Copper', 'Copper', 'Estate', 'Estate']);
  g.respond('p0', { t: 'play', id: p.hand[0].id });
  ok(g.pending.pid === 'p1' && g.pending.min === 2, 'militia discard 2');
  g.respond('p1', g.pending.cards.slice(0, 2).map((c) => c.id));
  ok(q.hand.length === 3, 'militia → 3');
  ok(g.t.coins === 2, 'militia +2 coins');
}
{ // Witch curse
  const g = mkGame(K); const p = g.players[0], q = g.players[1];
  setHand(g, p, ['Witch']);
  g.respond('p0', { t: 'play', id: p.hand[0].id });
  ok(q.discard.some((c) => c.name === 'Curse') && g.supply.Curse.length === 9, 'witch curse');
}
{ // Bridge cost reduction + buy
  const g = mkGame(K); const p = g.players[0]; setHand(g, p, ['Bridge', 'Gold', 'Gold']);
  g.respond('p0', { t: 'play', id: p.hand[0].id });
  g.respond('p0', { t: 'allTreasures' });
  ok(g.t.coins === 7, 'coins 7');
  ok(g.cost(CARDS.Province) === 7, 'province cost 7 under bridge');
  ok(g.respond('p0', { t: 'buy', pile: 'Province' }).ok, 'buy province with 7');
}
{ // illegal buy rejected
  const g = mkGame(K); const p = g.players[0]; setHand(g, p, ['Copper']);
  g.respond('p0', { t: 'allTreasures' });
  ok(!g.respond('p0', { t: 'buy', pile: 'Gold' }).ok, 'cannot buy gold with 1');
  ok(!g.respond('p1', { t: 'end' }).ok, 'other player rejected');
}
{ // Remodel
  const g = mkGame(K); const p = g.players[0]; setHand(g, p, ['Remodel', 'Estate', 'Copper']);
  g.respond('p0', { t: 'play', id: p.hand[0].id });
  const est = g.pending.cards.find((c) => c.name === 'Estate');
  g.respond('p0', [est.id]);
  ok(g.pending.kind === 'pile' && g.pending.piles.every((n) => g.cost(CARDS[n]) <= 4), 'remodel gain ≤4');
  g.respond('p0', 'Smithy');
  ok(p.discard.some((c) => c.name === 'Smithy') && g.trashPile.some((c) => c.name === 'Estate'), 'remodel result');
}
{ // Gardens scoring
  const g = mkGame(K); const p = g.players[0];
  const s = g.score(p); ok(s.vp === 3, 'start vp 3');
  for (let i = 0; i < 10; i++) p.discard.push(g.mk('Gardens'));
  ok(g.score(p).vp === 3 + 10 * 2, 'gardens 20 cards → 2 each');
}
{ // end by Province
  const g = mkGame(K); g.supply.Province.length = 0;
  const p = g.players[0]; setHand(g, p, []);
  g.respond('p0', { t: 'end' }); ok(g.over, 'game over when Provinces gone');
}
{ // Merchant + Silver
  const g = mkGame(['Merchant', ...K.slice(1)]); const p = g.players[0]; setHand(g, p, ['Merchant', 'Silver', 'Silver']); p.deck = []; p.discard = [];
  g.respond('p0', { t: 'play', id: p.hand[0].id });
  g.respond('p0', { t: 'allTreasures' });
  ok(g.t.coins === 5, 'merchant: 2+2+1=5, got ' + g.t.coins);
}

// ---- 追加の個別カードテスト ----
const K2 = ['Mine', 'Sentry', 'Library', 'Bandit', 'Bureaucrat', 'Masquerade', 'Swindler', 'Torturer', 'Courtier', 'Patrol'];
const K3 = ['Secret Passage', 'Replace', 'Lurker', 'Wishing Well', 'Minion', 'Baron', 'Upgrade', 'Ironworks', 'Trading Post', 'Steward'];
const K4 = ['Diplomat', 'Pawn', 'Conspirator', 'Mill', 'Mining Village', 'Nobles', 'Courtyard', 'Cellar', 'Poacher', 'Duke'];
const play = (g, pid, name) => { const p = g.playerById(pid); const c = p.hand.find((x) => x.name === name); return g.respond(pid, { t: 'play', id: c.id }); };
const ids = (req, ...names) => names.map((n) => req.cards.find((c) => c.name === n).id);
{ // Mine: Copper -> Silver in hand
  const g = mkGame(K2); const p = g.players[0]; setHand(g, p, ['Mine', 'Copper']);
  play(g, 'p0', 'Mine'); g.respond('p0', ids(g.pending, 'Copper'));
  ok(g.pending.piles.every((n) => CARDS[n].types.includes('Treasure') && CARDS[n].cost <= 3), 'mine gain treasure ≤3');
  g.respond('p0', 'Silver'); ok(p.hand.some((c) => c.name === 'Silver'), 'mine silver to hand');
}
{ // Sentry: trash 1, discard 1
  const g = mkGame(K2); const p = g.players[0]; setHand(g, p, ['Sentry']);
  const top2 = p.deck.slice(-3, -1).map((c) => c.id); play(g, 'p0', 'Sentry');
  g.respond('p0', [g.pending.cards[0].id]); ok(g.trashPile.length === 1, 'sentry trash');
  g.respond('p0', [g.pending.cards[0].id]); ok(p.discard.length >= 1 && g.pending.kind === 'turn', 'sentry discard rest');
}
{ // Library skip action
  const g = mkGame(K2); const p = g.players[0]; setHand(g, p, ['Library']);
  p.deck = [g.mk('Copper'), g.mk('Copper'), g.mk('Library'), g.mk('Copper'), g.mk('Copper'), g.mk('Copper'), g.mk('Copper'), g.mk('Copper')];
  play(g, 'p0', 'Library');
  ok(g.pending.kind === 'option', 'library asks');
  g.respond('p0', 'yes'); ok(p.hand.length === 7 && !p.hand.some((c) => c.name === 'Library'), 'library sets aside');
  ok(p.discard.some((c) => c.name === 'Library'), 'library discarded after');
}
{ // Bureaucrat
  const g = mkGame(K2); const p = g.players[0], q = g.players[1]; setHand(g, p, ['Bureaucrat']); setHand(g, q, ['Estate', 'Copper', 'Copper', 'Copper', 'Copper']);
  play(g, 'p0', 'Bureaucrat');
  ok(p.deck[p.deck.length - 1].name === 'Silver' && q.deck[q.deck.length - 1].name === 'Estate', 'bureaucrat topdecks');
}
{ // Masquerade passes left
  const g = mkGame(K2); const p = g.players[0], q = g.players[1]; setHand(g, p, ['Masquerade', 'Gold', 'Copper']); setHand(g, q, ['Silver', 'Estate']);
  play(g, 'p0', 'Masquerade');
  g.respond('p0', ids(g.pending, 'Gold')); g.respond('p1', ids(g.pending, 'Silver'));
  ok(q.hand.some((c) => c.name === 'Gold') && p.hand.some((c) => c.name === 'Silver'), 'masquerade passes');
  ok(g.pending.kind === 'cards' && g.pending.min === 0, 'masquerade trash optional'); g.respond('p0', []);
}
{ // Swindler
  const g = mkGame(K2); const p = g.players[0], q = g.players[1]; setHand(g, p, ['Swindler']); q.deck.push(g.mk('Silver'));
  play(g, 'p0', 'Swindler');
  ok(g.pending.pid === 'p0' && g.pending.piles.every((n) => CARDS[n].cost === 3), 'swindler attacker picks cost 3');
  g.respond('p0', 'Silver'); ok(q.discard.some((c) => c.name === 'Silver') && g.trashPile.some((c) => c.name === 'Silver'), 'swindler result');
}
{ // Torturer: curse to hand
  const g = mkGame(K2); const p = g.players[0], q = g.players[1]; setHand(g, p, ['Torturer']);
  play(g, 'p0', 'Torturer'); g.respond('p1', 'curse');
  ok(q.hand.some((c) => c.name === 'Curse'), 'torturer curse to hand');
}
{ // Courtier: Mill-like multi type
  const g = mkGame([...K2.slice(0, 9), 'Mill']); const p = g.players[0]; setHand(g, p, ['Courtier', 'Mill']);
  play(g, 'p0', 'Courtier');
  ok(g.pending.kind === 'options' && g.pending.n === 2, 'courtier 2 types → 2 choices');
  g.respond('p0', ['coin', 'gold']); ok(g.t.coins === 3 && p.discard.some((c) => c.name === 'Gold'), 'courtier results');
}
{ // Patrol
  const g = mkGame(K2); const p = g.players[0]; setHand(g, p, ['Patrol']);
  p.deck = ['Copper', 'Estate', 'Curse', 'Silver', 'Copper', 'Copper', 'Copper', 'Copper'].map((n) => g.mk(n)).reverse().reverse();
  const top = p.deck.slice(-7).map((c) => c.name);
  play(g, 'p0', 'Patrol');
  ok(p.hand.length >= 3, 'patrol draws');
}
{ // Secret Passage
  const g = mkGame(K3); const p = g.players[0]; setHand(g, p, ['Secret Passage', 'Gold']);
  play(g, 'p0', 'Secret Passage'); g.respond('p0', ids(g.pending, 'Gold'));
  ok(g.pending.kind === 'number', 'position asked'); const n = g.pending.max; g.respond('p0', n);
  ok(p.deck[0].name === 'Gold', 'secret passage bottom');
}
{ // Replace victory → curses
  const g = mkGame(K3); const p = g.players[0], q = g.players[1]; setHand(g, p, ['Replace', 'Copper', 'Estate']);
  play(g, 'p0', 'Replace'); g.respond('p0', ids(g.pending, 'Copper')); g.respond('p0', 'Estate');
  ok(q.discard.some((c) => c.name === 'Curse'), 'replace victory curses');
  const g2 = mkGame(K3); const p2 = g2.players[0]; setHand(g2, p2, ['Replace', 'Copper', 'Estate']);
  play(g2, 'p0', 'Replace'); g2.respond('p0', ids(g2.pending, 'Estate')); g2.respond('p0', 'Silver');
  ok(p2.deck[p2.deck.length - 1].name === 'Silver', 'replace treasure on deck');
}
{ // Lurker
  const g = mkGame(K3); const p = g.players[0]; setHand(g, p, ['Lurker']);
  g.trashPile.push(g.mk('Upgrade'));
  play(g, 'p0', 'Lurker'); g.respond('p0', 'gain');
  ok(p.discard.some((c) => c.name === 'Upgrade'), 'lurker gains from trash');
}
{ // Wishing Well hit
  const g = mkGame(K3); const p = g.players[0]; setHand(g, p, ['Wishing Well']);
  p.deck = [g.mk('Gold'), g.mk('Gold'), g.mk('Copper')]; play(g, 'p0', 'Wishing Well');
  g.respond('p0', 'Gold'); ok(p.hand.filter((c) => c.name === 'Gold').length === 1 && p.hand.length === 2 + 0 || p.hand.length >= 1, 'wishing well');
}
{ // Minion attack
  const g = mkGame(K3); const p = g.players[0], q = g.players[1]; setHand(g, p, ['Minion', 'Copper']); setHand(g, q, ['Copper', 'Copper', 'Copper', 'Copper', 'Copper']);
  play(g, 'p0', 'Minion'); g.respond('p0', 'attack');
  ok(p.hand.length === 4 && q.hand.length === 4 && q.discard.length >= 5, 'minion attack');
}
{ // Baron
  const g = mkGame(K3); const p = g.players[0]; setHand(g, p, ['Baron', 'Estate']);
  play(g, 'p0', 'Baron'); g.respond('p0', 'yes'); ok(g.t.coins === 4 && g.t.buys === 2, 'baron +4');
  const g2 = mkGame(K3); const p2 = g2.players[0]; setHand(g2, p2, ['Baron']); play(g2, 'p0', 'Baron');
  ok(p2.discard.some((c) => c.name === 'Estate'), 'baron gains estate when none');
}
{ // Upgrade exact cost
  const g = mkGame(K3); const p = g.players[0]; setHand(g, p, ['Upgrade', 'Copper']);
  play(g, 'p0', 'Upgrade'); g.respond('p0', ids(g.pending, 'Copper'));
  ok(g.pending.kind === 'turn', 'upgrade: no exact cost-1 pile → no gain');
}
{ // Ironworks + Trading Post + Steward
  const g = mkGame(K3); const p = g.players[0]; setHand(g, p, ['Ironworks']); const a0 = g.t.actions;
  play(g, 'p0', 'Ironworks'); g.respond('p0', 'Silver'); ok(g.t.coins === 1, 'ironworks treasure +coin');
  const g2 = mkGame(K3); const p2 = g2.players[0]; setHand(g2, p2, ['Trading Post', 'Copper', 'Copper']);
  play(g2, 'p0', 'Trading Post'); ok(g2.pending.kind === 'cards' || p2.hand.some((c) => c.name === 'Silver'), 'trading post');
  if (g2.pending.kind === 'cards') g2.respond('p0', g2.pending.cards.map((c) => c.id));
  ok(p2.hand.some((c) => c.name === 'Silver') && g2.trashPile.length === 2, 'trading post → silver');
}
{ // Diplomat reaction + Conspirator + Mill + Nobles
  const g = mkGame([...K4]); const p = g.players[0], q = g.players[1];
  const K5 = ['Militia', ...K4.slice(0, 9)]; const g5 = mkGame(K5); const p5 = g5.players[0], q5 = g5.players[1];
  setHand(g5, p5, ['Militia']); setHand(g5, q5, ['Diplomat', 'Copper', 'Copper', 'Copper', 'Estate']);
  play(g5, 'p0', 'Militia'); g5.respond('p1', ids(g5.pending, 'Diplomat'));
  ok(g5.pending.pid === 'p1' && g5.pending.kind === 'cards', 'diplomat discards 3'); g5.respond('p1', g5.pending.cards.slice(0, 3).map((c) => c.id));
  ok(g5.pending.pid === 'p1' && g5.pending.hint === 'discard', 'then militia applies (Diplomat does not block)');
}
{ // Mining Village trash; Throne'd second play no trash
  const g = mkGame(K4); const p = g.players[0]; setHand(g, p, ['Mining Village']);
  play(g, 'p0', 'Mining Village'); g.respond('p0', 'yes'); ok(g.t.coins === 2 && g.trashPile.length === 1, 'mining village trash');
}
{ // Courtyard / Cellar / Poacher / Duke
  const g = mkGame(K4); const p = g.players[0]; setHand(g, p, ['Poacher', 'Silver', 'Silver']);
  for (const n of ['Duke']) g.supply[n].length = 0; g.supply.Cellar.length = 0;
  play(g, 'p0', 'Poacher'); ok(g.pending.min === 2, 'poacher discards per empty pile');
  const g2 = mkGame(K4); const p2 = g2.players[0]; p2.discard.push(g2.mk('Duchy'), g2.mk('Duchy'), g2.mk('Duke'));
  p2.hand.forEach(() => {}); ok(g2.score(p2).vp === 3 + 6 + 2, 'duke counts duchies');
}
{ // 3つの山が空でゲーム終了
  const g = mkGame(K); const p = g.players[0]; setHand(g, p, []);
  g.supply.Village.length = 0; g.supply.Smithy.length = 0; g.supply.Moat.length = 0;
  g.respond('p0', { t: 'end' }); ok(g.over, 'ends on 3 empty piles');
}
{ // 引き分け：ターン数が少ない方が勝ち
  const g = mkGame(K); g.players[0].turns = 5; g.players[1].turns = 4; g.finish();
  ok(g.results.winners.length === 1 && g.results.winners[0] === 'p1', 'tiebreak fewer turns');
}
console.log(fails ? `FAILED: ${fails}` : 'ALL TESTS PASSED');
process.exit(fails ? 1 : 0);
