// 繁栄 第2版（25種）。白金貨・植民地、勝利点トークン、獲得時の誘発（engine.flush）を使用。
// 効果は公式資料との個別照合が未完了（needs_review）。
import { def, registerSet } from './cards.js';

const A = 'Action', T = 'Treasure', V = 'Victory', AT = 'Attack', R = 'Reaction';
const S = { set: 'prosperity' };
const isT = (g, c) => g.isType(c, T);

def('pro2_anvil', 'Anvil', '金床', 3, [T], '+1コイン。財宝1枚を捨ててもよい。捨てたらコスト4以下のカードを獲得する。', function* (g, p) {
  const ts = p.hand.filter((c) => isT(g, c));
  if (!ts.length) return;
  const [c] = yield* g.chooseCards(p, ts, 0, 1, '捨てる財宝（任意：コスト4以下を獲得）', 'discard');
  if (!c) return;
  g.discard(p, c);
  const n = yield* g.choosePile(p, g.gainable(4), 'コスト4以下のカードを獲得', 'gain');
  if (n) g.gain(p, n);
}, { ...S, coins: 1 });

def('pro2_bank', 'Bank', '銀行', 7, [T], '場にある財宝カード（これを含む）1枚につき+1コイン。', null, { ...S, coinsFn: (g, p) => p.play.filter((c) => g.isType(c, T)).length });

def('pro2_bishop', 'Bishop', '司教', 4, [A], '+1コイン +勝利点トークン1。手札1枚を廃棄し、そのコスト2コインにつき勝利点トークン1（端数切捨て）を得る。他の各プレイヤーは手札1枚を廃棄してよい。', function* (g, p) {
  g.t.coins += 1; p.vp += 1;
  if (p.hand.length) {
    const [c] = yield* g.chooseCards(p, p.hand, 1, 1, '廃棄する手札（コスト2につき勝利点トークン1）', 'trash');
    const v = Math.floor(g.cost(c) / 2);
    g.trash(p, c); p.vp += v;
    if (v) g.say(`${p.name}は勝利点トークンを${v}得た`);
  }
  for (const o of g.others(p)) {
    if (!o.hand.length) continue;
    const [c] = yield* g.chooseCards(o, o.hand, 0, 1, '司教：手札1枚を廃棄してもよい', 'trash');
    if (c) g.trash(o, c);
  }
}, S);

def('pro2_charlatan', 'Charlatan', '山師', 5, [A, AT], '+3コイン。他の各プレイヤーは呪いを獲得する。（この王国では呪いは財宝としても扱われ、1コインの価値がある。）', function* (g, p) {
  g.t.coins += 3;
  const imm = yield* g.beginAttack(p);
  for (const v of g.victims(p, imm)) g.gain(v, 'Curse');
}, S);

def('pro2_city', 'City', '都市', 5, [A], '+1カード +2アクション。空のサプライ山が1つ以上なら+1カード。2つ以上なら+1コイン +1購入も。', function* (g, p) {
  g.draw(p, 1); g.t.actions += 2;
  const e = g.emptyPiles();
  if (e >= 1) g.draw(p, 1);
  if (e >= 2) { g.t.coins += 1; g.t.buys += 1; }
}, S);

def('pro2_clerk', 'Clerk', '書記官', 4, [A, AT, R], '+2コイン。手札5枚以上の他の各プレイヤーは、手札1枚を山札の上に置く。（ターン開始時に手札からプレイしてよい。）', function* (g, p) {
  g.t.coins += 2;
  const imm = yield* g.beginAttack(p);
  for (const v of g.victims(p, imm)) {
    if (v.hand.length < 5) continue;
    const [c] = yield* g.chooseCards(v, v.hand, 1, 1, '書記官：山札の上に置く手札1枚', 'topdeck');
    g.moveTo(v, c, 'deck'); g.say(`${v.name}は手札1枚を山札の上に置いた`);
  }
}, S);

def('pro2_collection', 'Collection', 'コレクション', 5, [T], '+2コイン +1購入。このターン、アクションカードを獲得するたび勝利点トークン1。', function* (g, p) {
  g.t.buys += 1; g.t.collection += 1;
}, { ...S, coins: 2 });

def('pro2_crystal_ball', 'Crystal Ball', '水晶玉', 5, [T], '+1コイン +1購入。山札の上を見て、廃棄・捨てる、またはアクションか財宝ならプレイしてよい。', function* (g, p) {
  g.t.buys += 1;
  const c = g.takeTop(p);
  if (!c) return;
  const opts = [{ id: 'keep', label: '山札の上に戻す' }, { id: 'trash', label: '廃棄する' }, { id: 'discard', label: '捨てる' }];
  if (g.isType(c, A) || g.isType(c, T)) opts.push({ id: 'play', label: 'プレイする' });
  const o = yield* g.chooseOption(p, opts, `水晶玉：山札の上は「${g.nm(c)}」`, 'keep');
  if (o === 'keep') g.moveTo(p, c, 'deck');
  else if (o === 'trash') g.trash(p, c);
  else if (o === 'discard') g.moveTo(p, c, 'discard');
  else if (g.isType(c, A)) yield* g.playCard(p, c);
  else yield* g.playTreasure(p, c);
}, { ...S, coins: 1 });

def('pro2_expand', 'Expand', '拡張', 7, [A], '手札1枚を廃棄し、コスト+3以下のカードを獲得する。', function* (g, p) {
  if (!p.hand.length) return;
  const [c] = yield* g.chooseCards(p, p.hand, 1, 1, '廃棄する手札', 'trash');
  const cost = g.cost(c);
  g.trash(p, c);
  const n = yield* g.choosePile(p, g.gainable(cost + 3), `コスト${cost + 3}以下のカードを獲得`, 'gain');
  if (n) g.gain(p, n);
}, S);

def('pro2_forge', 'Forge', '鍛冶場', 7, [A], '手札から好きな枚数を廃棄し、合計コストとちょうど同じコストのカード1枚を獲得する。', function* (g, p) {
  const cs = yield* g.chooseCards(p, p.hand, 0, p.hand.length, '廃棄する手札（合計コストと同じカードを獲得）', 'trash');
  let total = 0;
  for (const c of cs) { total += g.cost(c); g.trash(p, c); }
  const n = yield* g.choosePile(p, g.gainable(total, null, true), `コスト${total}ちょうどのカードを獲得`, 'gain');
  if (n) g.gain(p, n);
}, S);

def('pro2_grand_market', 'Grand Market', '大市場', 6, [A], '+1カード +1アクション +1購入 +2コイン。場に銅貨があると購入できない。', function* (g, p) {
  g.draw(p, 1); g.t.actions += 1; g.t.buys += 1; g.t.coins += 2;
}, S);

def('pro2_hoard', 'Hoard', '蓄え', 6, [T], '+2コイン。場にある間、勝利点カードを購入するたび金貨を獲得する。', null, { ...S, coins: 2 });

def('pro2_investment', 'Investment', '投資', 4, [T], '手札1枚を廃棄する。次から1つ選ぶ：+1コイン／これを廃棄し、手札の異なる名前の財宝1種につき勝利点トークン1。', function* (g, p, ctx) {
  if (p.hand.length) {
    const [c] = yield* g.chooseCards(p, p.hand, 1, 1, '投資：廃棄する手札', 'trash');
    g.trash(p, c);
  }
  const o = yield* g.chooseOption(p, [{ id: 'coin', label: '+1コイン' }, { id: 'vp', label: '投資を廃棄して勝利点トークン' }], '投資：1つ選ぶ', 'coin');
  if (o === 'coin') g.t.coins += 1;
  else {
    if (p.play.includes(ctx.card)) g.trash(p, ctx.card);
    g.say(`${p.name}は手札を公開した：${g.names(p.hand) || '（なし）'}`);
    const n = new Set(p.hand.filter((c) => isT(g, c)).map((c) => c.name)).size;
    p.vp += n; if (n) g.say(`${p.name}は勝利点トークンを${n}得た`);
  }
}, S);

def('pro2_kings_court', "King's Court", '王宮', 7, [A], '手札のアクションカード1枚を3回プレイしてもよい。', function* (g, p) {
  const acts = p.hand.filter((c) => g.isType(c, A));
  if (!acts.length) return;
  const [c] = yield* g.chooseCards(p, acts, 0, 1, '3回プレイするアクション（任意）', 'play');
  if (!c) return;
  yield* g.playCard(p, c);
  yield* g.playCard(p, c, { again: true });
  yield* g.playCard(p, c, { again: true });
}, S);

def('pro2_magnate', 'Magnate', '大富豪', 5, [A], '手札を公開する。その中の財宝1枚につき+1カード。', function* (g, p) {
  g.say(`${p.name}は手札を公開した：${g.names(p.hand) || '（なし）'}`);
  g.draw(p, p.hand.filter((c) => isT(g, c)).length);
}, S);

def('pro2_mint', 'Mint', '造幣所', 5, [A], '手札の財宝1枚を公開してもよい。それと同じカードを1枚獲得する。（これを獲得した時、場の財宝を全て廃棄する。）', function* (g, p) {
  const ts = p.hand.filter((c) => isT(g, c));
  if (!ts.length) return;
  const [c] = yield* g.chooseCards(p, ts, 0, 1, '公開する財宝（任意：同じカードを獲得）', 'reveal');
  if (!c) return;
  g.say(`${p.name}は${g.nm(c)}を公開した`);
  g.gain(p, c.name);
}, S);

def('pro2_monument', 'Monument', '記念碑', 4, [A], '+2コイン +勝利点トークン1。', function* (g, p) {
  g.t.coins += 2; p.vp += 1;
}, S);

def('pro2_peddler', 'Peddler', '行商人', 8, [A], '+1カード +1アクション +1コイン。購入フェイズ中、場のアクション1枚につきコストが2コイン安くなる。', function* (g, p) {
  g.draw(p, 1); g.t.actions += 1; g.t.coins += 1;
}, S);

def('pro2_quarry', 'Quarry', '採石場', 4, [T], '+1コイン。場にある間、アクションカードのコストが2コイン安くなる。', null, { ...S, coins: 1 });

def('pro2_rabble', 'Rabble', '烏合の衆', 5, [A, AT], '+3カード。他の各プレイヤーは山札の上3枚を公開し、アクションと財宝を捨て、残りを好きな順で山札の上に戻す。', function* (g, p) {
  g.draw(p, 3);
  const imm = yield* g.beginAttack(p);
  for (const v of g.victims(p, imm)) {
    const rev = [];
    for (let i = 0; i < 3; i++) { const c = g.takeTop(v); if (c) rev.push(c); }
    if (!rev.length) continue;
    g.say(`${v.name}は山札の上を公開した：${g.names(rev)}`);
    const back = [];
    for (const c of rev) { if (g.isType(c, A) || g.isType(c, T)) g.moveTo(v, c, 'discard'); else back.push(c); }
    yield* g.orderToDeck(v, back);
  }
}, S);

def('pro2_tiara', 'Tiara', 'ティアラ', 4, [T], '+1購入。このターン、カードを獲得した時それを山札の上に置いてよい。手札の財宝1枚を2回プレイしてもよい。', function* (g, p) {
  g.t.buys += 1; g.t.tiara = true;
  const ts = p.hand.filter((c) => isT(g, c));
  if (!ts.length) return;
  const [c] = yield* g.chooseCards(p, ts, 0, 1, '2回プレイする財宝（任意）', 'play');
  if (!c) return;
  yield* g.playTreasure(p, c);
  yield* g.playTreasure(p, c, { again: true });
}, S);

def('pro2_vault', 'Vault', '金庫', 5, [A], '+2カード。手札を好きな枚数捨て、1枚につき+1コイン。他の各プレイヤーは手札2枚を捨てて1枚引いてもよい。', function* (g, p) {
  g.draw(p, 2);
  const cs = yield* g.chooseCards(p, p.hand, 0, p.hand.length, '捨てる手札（1枚につき+1コイン）', 'discard');
  for (const c of cs) g.discard(p, c);
  g.t.coins += cs.length;
  for (const o of g.others(p)) {
    if (o.hand.length < 2) continue;
    const ds = yield* g.chooseCards(o, o.hand, 0, 2, '金庫：2枚捨てて1枚引く（任意）', 'discard', [0, 2]);
    if (ds.length === 2) { for (const c of ds) g.discard(o, c); g.draw(o, 1); }
  }
}, S);

def('pro2_war_chest', 'War Chest', '軍資金', 5, [A], '左隣のプレイヤーがカード名を1つ宣言する。このターンまだ宣言されていない、コスト5以下のカード1枚を獲得する。', function* (g, p) {
  const left = g.leftOf(p);
  const nm = yield* g.choosePile(left, g.pileNames(), `軍資金：${p.name}が獲得できないカード名を宣言`, 'name');
  g.t.named.push(nm);
  g.say(`${left.name}は${g.defOf(nm).name_ja}を宣言した`);
  const n = yield* g.choosePile(p, g.gainable(5, null, false).filter((x) => !g.t.named.includes(x)), '宣言されていないコスト5以下のカードを獲得', 'gain');
  if (n) g.gain(p, n);
}, S);

def('pro2_watchtower', 'Watchtower', '物見やぐら', 3, [A, R], '手札が6枚になるまで引く。（カードを獲得した時、これを公開して、そのカードを廃棄するか山札の上に置いてよい。）', function* (g, p) {
  while (p.hand.length < 6) { if (!g.draw(p, 1)) break; }
}, S);

def('pro2_workers_village', "Worker's Village", '労働者の村', 4, [A], '+1カード +2アクション +1購入', function* (g, p) {
  g.draw(p, 1); g.t.actions += 2; g.t.buys += 1;
}, S);

registerSet('prosperity', '繁栄 第2版');
