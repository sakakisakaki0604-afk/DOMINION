// CPUプレイヤー。ホスト側(権威側)でのみ動作し、エンジンの合法手APIだけを使う。
// - smartBot: 「ビッグマネー＋少数アクション」の簡易戦略 (練習相手)
// - chaosBot: ランダムな合法手 (ファジングテスト用)
import { CARDS, isType, costOf } from './cards.js';

const JUNK = { Curse: 0, Estate: 1, Copper: 2, Province: 3, Duchy: 3, Gardens: 3 };
const junkRank = (n) => (n in JUNK ? JUNK[n] : isType(n, 'Treasure') ? 5 + CARDS[n].coins : 4 + costOf(n) / 10);
const ACTION_PRIORITY = ['Village', 'Festival', 'Market', 'Laboratory', 'Sentry', 'Council Room', 'Witch', 'Militia', 'Bandit', 'Library', 'Smithy', 'Artisan', 'Merchant', 'Harbinger', 'Poacher', 'Moneylender', 'Mine', 'Cellar', 'Vassal', 'Remodel', 'Workshop', 'Moat', 'Chapel', 'Throne Room'];

function countIn(P, name) {
  return [...P.deck, ...P.hand, ...P.discard, ...P.play].filter((c) => c.n === name).length;
}

export function smartAnswer(g, p) {
  const S = g.S, P = g.P(p.player);
  switch (p.kind) {
    case 'cards': {
      const asc = [...p.from].sort((a, b) => junkRank(a.n) - junkRank(b.n));
      const src = p.source;
      if (src === 'Cellar') return asc.filter((c) => junkRank(c.n) <= 3 || (isType(c.n, 'Victory'))).slice(0, p.max).map((c) => c.id);
      if (src === 'Chapel') return asc.filter((c) => c.n === 'Curse' || c.n === 'Estate').slice(0, p.max).map((c) => c.id);
      if (src === 'Sentry') {
        if (/廃棄/.test(p.prompt)) return asc.filter((c) => c.n === 'Curse' || c.n === 'Estate').map((c) => c.id);
        return asc.filter((c) => junkRank(c.n) <= 2).map((c) => c.id);
      }
      if (src === 'Mine') return asc.filter((c) => c.n === 'Copper' || c.n === 'Silver').slice(0, 1).map((c) => c.id);
      if (src === 'Harbinger' || src === 'Throne Room') {
        const best = [...p.from].sort((a, b) => junkRank(b.n) - junkRank(a.n))[0];
        return src === 'Throne Room' && best ? [best.id] : [];
      }
      if (src === 'Artisan') return asc.slice(0, 1).map((c) => c.id);
      return asc.slice(0, p.min).map((c) => c.id); // 強制選択は不要カードから
    }
    case 'option': {
      if (p.reaction) return 'yes';
      if (p.source === 'Library') return S.turn.actions < 1 ? 'skip' : 'keep';
      return 'yes';
    }
    case 'pile': {
      const pref = (n) => {
        if (n === 'Province') return 100; if (n === 'Gold') return 90;
        if (n === 'Duchy') return S.piles.Province <= 4 ? 80 : 20;
        if (n === 'Curse') return -10; if (n === 'Estate') return 1; if (n === 'Copper') return 0; if (n === 'Silver') return 50;
        return 30 + costOf(n);
      };
      return [...p.piles].sort((a, b) => pref(b) - pref(a))[0];
    }
    case 'order': return p.cards.map((c) => c.id);
  }
}

export function smartTurn(g, i) {
  const S = g.S, T = S.turn, P = g.P(i);
  if (T.phase === 'action' && T.actions > 0) {
    const acts = P.hand.filter((c) => isType(c.n, 'Action'));
    acts.sort((a, b) => ACTION_PRIORITY.indexOf(a.n) - ACTION_PRIORITY.indexOf(b.n));
    if (acts.length) return { type: 'play', card: acts[0].id };
  }
  if (P.hand.some((c) => isType(c.n, 'Treasure'))) return { type: 'playAllTreasures' };
  if (T.buys > 0) {
    const c = T.coins, prov = S.piles.Province, opts = [];
    const have = (n) => countIn(P, n);
    const can = (n) => S.piles[n] > 0 && costOf(n) <= c;
    if (can('Province') && (have('Gold') > 0 || prov <= 4)) opts.push('Province');
    if (prov <= 3 && can('Duchy')) opts.push('Duchy');
    if (prov <= 2 && can('Estate')) opts.push('Estate');
    if (can('Gold')) opts.push('Gold');
    for (const k of ['Laboratory', 'Market', 'Festival', 'Witch', 'Library', 'Smithy', 'Militia', 'Village', 'Merchant']) {
      if (!S.kingdom.includes(k) || !can(k)) continue;
      const lim = { Witch: 2, Library: 1, Smithy: 2, Militia: 1, Village: 1, Merchant: 1 }[k] || 3;
      if (have(k) < lim && prov > 3) opts.push(k);
    }
    if (can('Duchy') && prov <= 5) opts.push('Duchy');
    if (can('Silver')) opts.push('Silver');
    if (opts.length) return { type: 'buy', pile: opts[0] };
  }
  return { type: 'endTurn' };
}

// ---- ランダム合法手 (テスト用) ----
export function chaosAnswer(g, p, rnd) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  switch (p.kind) {
    case 'cards': {
      const k = p.min + Math.floor(rnd() * (p.max - p.min + 1));
      const pool = [...p.from]; const out = [];
      while (out.length < k) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0].id);
      return out;
    }
    case 'option': return pick(p.options).value;
    case 'pile': return p.optional && rnd() < 0.3 ? null : pick(p.piles);
    case 'order': { const ids = p.cards.map((c) => c.id); return rnd() < 0.5 ? ids : ids.reverse(); }
  }
}
export function chaosTurn(g, i, rnd) {
  const S = g.S, T = S.turn, P = g.P(i);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const moves = [{ type: 'endTurn' }];
  if (T.phase === 'action' && T.actions > 0) for (const c of P.hand) if (isType(c.n, 'Action')) { moves.push({ type: 'play', card: c.id }, { type: 'play', card: c.id }); }
  for (const c of P.hand) if (isType(c.n, 'Treasure')) moves.push({ type: 'playTreasure', card: c.id });
  moves.push({ type: 'playAllTreasures' });
  if (T.phase === 'action') moves.push({ type: 'toBuy' });
  if (T.buys > 0) for (const n of S.pileOrder) if (S.piles[n] > 0 && costOf(n) <= T.coins) moves.push({ type: 'buy', pile: n });
  const biased = moves.length > 3 && rnd() < 0.7 ? moves.filter((m) => m.type !== 'endTurn') : moves;
  return pick(biased);
}
