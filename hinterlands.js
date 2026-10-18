// 異郷 第2版（一部）。公式文面を確認できたと言い切れないため、単純なカードのみ実装（すべて needs_review）。
import { def, registerSet, CARDS } from './cards.js';

const A = 'Action', T = 'Treasure', V = 'Victory', AT = 'Attack';
const S = { set: 'hinterlands' };

def('hin2_crossroads', 'Crossroads', '交差路', 2, [A], '手札を公開し、勝利点カード1枚につき+1カード。このターン最初にプレイした時のみ +3アクション。', function* (g, p) {
  const n = p.hand.filter((c) => g.isType(c, V)).length;
  g.say(`${p.name}は手札を公開した：${g.names(p.hand)}`);
  g.draw(p, n);
  if (!g.t.crossroads) { g.t.crossroads = true; g.t.actions += 3; }
}, S);

def('hin2_highway', 'Highway', '街道', 5, [A], '+1カード +1アクション。このターン、全カードのコストが1コイン少なくなる（最小0）。', function* (g, p) {
  g.draw(p, 1); g.t.actions += 1; g.t.reduce += 1;
}, S);

def('hin2_margrave', 'Margrave', '辺境伯', 5, [A, AT], '+3カード +1購入。他の各プレイヤーは1枚引き、手札が3枚になるまで捨てる。', function* (g, p) {
  g.draw(p, 3); g.t.buys += 1;
  const imm = yield* g.beginAttack(p);
  for (const v of g.victims(p, imm)) {
    g.draw(v, 1);
    if (v.hand.length <= 3) continue;
    const n = v.hand.length - 3;
    const cs = yield* g.chooseCards(v, v.hand, n, n, `手札が3枚になるまで${n}枚捨てる`, 'discard');
    for (const c of cs) g.discard(v, c);
  }
}, S);

def('hin2_stables', 'Stables', '厩舎', 5, [A], '財宝1枚を捨ててもよい。捨てたら +3カード +1アクション。', function* (g, p) {
  const ts = p.hand.filter((c) => g.isType(c, T));
  if (!ts.length) return;
  const ok = yield* g.yesNo(p, '財宝を1枚捨てて+3カード+1アクションを得ますか？', true);
  if (!ok) return;
  const [c] = yield* g.chooseCards(p, ts, 1, 1, '捨てる財宝', 'discard');
  g.discard(p, c); g.draw(p, 3); g.t.actions += 1;
}, S);

def('hin2_spice_merchant', 'Spice Merchant', '香辛料商人', 4, [A], '手札の財宝1枚を廃棄してもよい。廃棄したら次から1つ：+2カード +1アクション／+2コイン +1購入。', function* (g, p) {
  const ts = p.hand.filter((c) => g.isType(c, T));
  if (!ts.length) return;
  const ok = yield* g.yesNo(p, '財宝を1枚廃棄しますか？', true);
  if (!ok) return;
  const [c] = yield* g.chooseCards(p, ts, 1, 1, '廃棄する財宝', 'trash');
  g.trash(p, c);
  const o = yield* g.chooseOption(p, [{ id: 'cards', label: '+2カード +1アクション' }, { id: 'coins', label: '+2コイン +1購入' }], '香辛料商人：1つ選ぶ');
  if (o === 'cards') { g.draw(p, 2); g.t.actions += 1; } else { g.t.coins += 2; g.t.buys += 1; }
}, S);

def('hin2_silk_road', 'Silk Road', 'シルクロード', 4, [V], '自分の勝利点カード4枚（端数切り捨て）ごとに1勝利点。', null, { ...S, vp: (cards) => Math.floor(cards.filter((c) => CARDS[c.name].types.includes(V)).length / 4) });

def('hin2_oasis', 'Oasis', 'オアシス', 3, [A], '+1カード +1アクション +1コイン。手札1枚を捨てる。', function* (g, p) {
  g.draw(p, 1); g.t.actions += 1; g.t.coins += 1;
  if (!p.hand.length) return;
  const [c] = yield* g.chooseCards(p, p.hand, 1, 1, '捨てる手札', 'discard');
  g.discard(p, c);
}, S);

registerSet('hinterlands', '異郷（一部）');
