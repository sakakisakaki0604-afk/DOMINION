// ボットAI：Big Money を基礎に、王国カードを少し使う簡易戦略。
// ルール上の合法性は engine.respond() が最終検証するため、不正な応答は legalFallback で補正する。
import { CARDS } from './cards.js';

const NONTERM = new Set(['Hamlet', 'Menagerie', 'Hunting Party', 'Candlestick Maker', 'Baker', 'Plaza', 'Herald', 'Alchemist', 'Apothecary', 'Familiar', 'Scrying Pool', 'University', 'Apprentice', 'Village', 'Festival', 'Market', 'Laboratory', 'Merchant', 'Sentry', 'Harbinger', 'Cellar', 'Poacher', 'Upgrade', 'Pawn', 'Lurker', 'Wishing Well', 'Shanty Town', 'Mining Village', 'Secret Passage', 'Mill', 'Minion', 'Nobles', 'Conspirator', 'Diplomat', 'Vassal', 'Bazaar', 'Caravan', 'Fishing Village', 'Haven', 'Lighthouse', 'Lookout', 'Native Village', 'Sea Chart', 'Treasury', 'Warehouse', 'Tide Pools', 'City', 'Grand Market', 'Peddler', "Worker's Village", 'Wharf']);
const APPETITE = { Hamlet: 4, Menagerie: 5, 'Hunting Party': 6, Jester: 5, Remake: 3, 'Young Witch': 9, 'Horn of Plenty': 2, 'Candlestick Maker': 4, Baker: 5, Butcher: 3, Herald: 5, Journeyman: 6, 'Merchant Guild': 4, Plaza: 5, Soothsayer: 7, Stonemason: 2, Advisor: 4, Familiar: 8, Alchemist: 6, Apothecary: 5, 'Scrying Pool': 4, University: 5, Golem: 6, Apprentice: 5, Herbalist: 3, Transmute: 1, Possession: 4, Vineyard: 0, Laboratory: 9, Witch: 10, Festival: 7, Market: 7, Merchant: 6, Sentry: 7, Artisan: 6, Minion: 6, Torturer: 7, Smithy: 7, Militia: 6, 'Council Room': 6, Bandit: 5, Library: 6, Courtyard: 6, Patrol: 6, Pawn: 4, Village: 4, Upgrade: 6, Ironworks: 5, Courtier: 5, Replace: 5, Swindler: 5, Masquerade: 3, 'Wishing Well': 5, Steward: 5, Diplomat: 4, Moneylender: 4, Poacher: 4, Harbinger: 4, Vassal: 3, Cellar: 3, Moat: 4, Bureaucrat: 4, Mine: 4, 'Trading Post': 4, 'Mining Village': 4, 'Secret Passage': 3, Bridge: 4, Conspirator: 3, Mill: 2, Baron: 3, Lurker: 3, 'Shanty Town': 3, Remodel: 3, 'Throne Room': 2, Workshop: 2, Chapel: 0, Nobles: 3, Bazaar: 7, Caravan: 6, 'Fishing Village': 5, Haven: 3, Lighthouse: 5, Lookout: 3, 'Merchant Ship': 6, 'Native Village': 4, 'Sea Chart': 3, Treasury: 5, Warehouse: 5, Wharf: 7, 'Sea Witch': 10, Cutpurse: 4, Corsair: 5, Blockade: 4, Tactician: 3, 'Tide Pools': 4, Salvager: 3, Smugglers: 3, Pirate: 3, Sailor: 4, Outpost: 3, Monkey: 3, Island: 2, 'Treasure Map': 1, Astrolabe: 5, City: 6, 'Grand Market': 8, Peddler: 5, "Worker's Village": 6, Watchtower: 4, Monument: 4, Bishop: 5, Magnate: 3, Vault: 5, Clerk: 5, Charlatan: 6, Rabble: 7, Mint: 3, 'War Chest': 4, Expand: 4, Forge: 3, "King's Court": 6, Bank: 6, Collection: 4, Hoard: 5, 'Crystal Ball': 4, Investment: 3, Quarry: 3, Tiara: 4, Anvil: 3, Anvil_: 0 };

const keepVal = (name) => {
  const d = CARDS[name];
  if (name === 'Curse') return -5;
  if (name === 'Gold') return 7;
  if (name === 'Silver') return 4;
  if (name === 'Copper') return 2;
  if (name === 'Harem') return 3;
  if (d.types.includes('Victory') && !d.types.includes('Action')) return 1;
  return 5;
};
const isType = (n, t) => CARDS[n].types.includes(t);

function me(g, req) { return g.playerById(req.forPid || req.pid); }

function deckInfo(g, p) {
  const cards = g.allCards(p);
  let terms = 0;
  for (const c of cards) if (isType(c.name, 'Action') && !NONTERM.has(c.name)) terms++;
  return { cards, terms, size: cards.length, count: (n) => cards.filter((c) => c.name === n).length };
}

function chooseBuy(g, p) {
  const coins = g.t.coins;
  const prov = g.pile('Province').length;
  const info = deckInfo(g, p);
  const afford = (n) => g.canAfford(n);
  if (coins >= 8 && afford('Province') && (info.cards.filter((c) => c.name === 'Gold').length > 0 || prov <= 6 || info.size > 14)) return 'Province';
  if (prov <= 3 && coins >= 5 && afford('Duchy')) return 'Duchy';
  if (prov <= 2 && coins >= 2 && afford('Estate')) return 'Estate';
  const maxTerm = 1 + Math.floor(info.size / 14);
  let best = null, bs = 0;
  for (const n of g.kingdom) {
    const d = CARDS[n];
    if (!afford(n) || !(d.types.includes('Action') || d.types.includes('Treasure'))) continue;
    const ap = APPETITE[n] || 0;
    if (ap <= 0) continue;
    const term = d.types.includes('Action') && !NONTERM.has(n);
    if (term && info.terms >= maxTerm) continue;
    if (!term && n === 'Village' && info.terms < 2) continue;
    const owned = info.count(n);
    if (owned >= (term ? 2 : 4)) continue;
    // コスト帯ごとの最低食欲：コイン6〜7なら金貨と比べる
    const thr = coins >= 6 ? 8 : coins === 5 ? 5 : 4;
    if (ap >= thr && ap - owned > bs) { best = n; bs = ap - owned; }
  }
  if (best) return best;
  // ポーションコストのカードを使う王国ならポーションを買う
  const wantPotion = g.kingdom.some((n) => CARDS[n].potion && (APPETITE[n] || 0) >= 4);
  if (wantPotion && coins >= 4 && info.count('Potion') < 1 && afford('Potion')) return 'Potion';
  if (coins >= 6 && afford('Gold')) return 'Gold';
  if (coins >= 3 && afford('Silver')) return 'Silver';
  return null;
}

function turnAnswer(g, req) {
  const p = me(g, req), t = g.t;
  if (p.coffers > 0) return { t: 'coffers', n: p.coffers };
  if (t.phase === 'action' && t.actions > 0) {
    const acts = p.hand.filter((c) => isType(c.name, 'Action'));
    const deckSize = g.allCards(p).length;
    // 手札を強制的に廃棄させるカードは、デッキが小さい時や廃棄したいカードが無い時は使わない（ボット同士の無限ループ防止）
    const forced = new Set(['Remake', 'Butcher', 'Stonemason', 'Apprentice', 'Remodel', 'Upgrade', 'Trading Post', 'Salvager', 'Expand', 'Forge']);
    const junkInHand = p.hand.some((c) => keepVal(c.name) <= 2);
    const playable = acts.filter((c) => !((c.name === 'Throne Room' || c.name === "King's Court") && acts.length < 2) && !(c.name === 'Chapel') && !(forced.has(c.name) && (deckSize <= 12 || !junkInHand)));
    playable.sort((a, b) => {
      const na = NONTERM.has(a.name) ? 1 : 0, nb = NONTERM.has(b.name) ? 1 : 0;
      if (na !== nb) return nb - na;
      return (APPETITE[b.name] || 0) - (APPETITE[a.name] || 0);
    });
    if (playable.length) return { t: 'play', id: playable[0].id };
    return { t: 'endActions' };
  }
  if (p.hand.some((c) => isType(c.name, 'Treasure'))) return { t: 'allTreasures' };
  const b = chooseBuy(g, p);
  if (b) return { t: 'buy', pile: b };
  return { t: 'end' };
}

function pileScore(g, n) {
  const late = g.pile('Province').length <= 4;
  if (n === 'Curse') return -10;
  if (n === 'Province') return late ? 10 : 2;
  if (n === 'Gold') return 8;
  if (n === 'Duchy') return late ? 7 : 3;
  if (n === 'Silver') return 5;
  if (n === 'Copper') return 1;
  if (n === 'Estate') return late ? 2 : 0;
  const d = CARDS[n];
  if (d.types.includes('Action')) return (APPETITE[n] || 1) * 0.9;
  if (d.types.includes('Victory')) return late ? 4 : 0;
  return 1;
}

function cardsAnswer(g, req) {
  const p = me(g, req);
  const byKeep = (a, b) => keepVal(a.name) - keepVal(b.name);
  const list = req.cards.slice();
  const lowest = (n) => list.slice().sort(byKeep).slice(0, n).map((c) => c.id);
  const optional = req.min < req.max;
  const prov = g.pile('Province').length;
  switch (req.hint) {
    case 'trash': {
      if (optional) {
        if (list.every((c) => isType(c.name, 'Treasure'))) {
          const c = list.slice().sort(byKeep)[0];
          return c && c.name !== 'Gold' ? [c.id] : [];
        }
        return list.filter((c) => keepVal(c.name) <= (prov > 4 ? 1 : -1)).slice(0, req.max).map((c) => c.id);
      }
      return lowest(req.min);
    }
    case 'discard': {
      if (req.counts) { const two = list.slice().sort(byKeep).slice(0, 2); return two.length === 2 && two.every((c) => keepVal(c.name) <= 2) ? two.map((c) => c.id) : []; }
      if (optional) return list.filter((c) => keepVal(c.name) <= 1).slice(0, req.max).map((c) => c.id);
      return lowest(req.min);
    }
    case 'topdeck': {
      if (optional) { const c = list.slice().sort(byKeep).pop(); return c && keepVal(c.name) >= 4 ? [c.id] : []; }
      return lowest(req.min);
    }
    case 'play': {
      const c = list.slice().sort((a, b) => (APPETITE[b.name] || 0) - (APPETITE[a.name] || 0))[0];
      return c ? [c.id] : [];
    }
    case 'pass': return lowest(req.min);
    case 'advisor': { const c = list.slice().sort(byKeep).pop(); return [c.id]; } // 相手の最良カードを捨てさせる
    case 'reaction': return [req.cards[0].id];
    case 'reveal': {
      const c = list.slice().sort((a, b) => CARDS[b.name].types.length - CARDS[a.name].types.length)[0];
      return [c.id];
    }
    case 'gain': {
      const c = list.slice().sort((a, b) => pileScore(g, b.name) - pileScore(g, a.name))[0];
      return [c.id];
    }
    default: return list.slice(0, req.min).map((c) => c.id);
  }
}

export function botAnswer(g, req) {
  switch (req.kind) {
    case 'turn': return turnAnswer(g, req);
    case 'cards': return cardsAnswer(g, req);
    case 'pile': {
      if (req.hint === 'swindle') return req.piles.slice().sort((a, b) => pileScore(g, a) - pileScore(g, b))[0];
      if (req.hint === 'name') return 'Copper';
      return req.piles.slice().sort((a, b) => pileScore(g, b) - pileScore(g, a))[0];
    }
    case 'option': return req.def || req.options[0].id;
    case 'options': return req.options.slice(0, req.n).map((o) => o.id);
    case 'number': return req.def || 0;
  }
}

export function legalFallback(g, req) {
  switch (req.kind) {
    case 'turn': return { t: 'end' };
    case 'cards': return req.counts ? req.cards.slice(0, req.counts[0]).map((c) => c.id) : req.cards.slice(0, req.min).map((c) => c.id);
    case 'pile': return req.optional ? null : req.piles[0];
    case 'option': return req.options[0].id;
    case 'options': return req.options.slice(0, req.n).map((o) => o.id);
    case 'number': return req.min;
  }
}

// 1手進める。成功したら true
export function botStep(g) {
  const req = g.pending;
  if (!req) return false;
  let a = botAnswer(g, req);
  let r = g.respond(req.pid, a);
  if (!r.ok) r = g.respond(req.pid, legalFallback(g, req));
  return r.ok;
}
