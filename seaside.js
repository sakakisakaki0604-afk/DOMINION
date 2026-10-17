// 海辺 第2版（27種）。持続(Duration)は engine.addDuration() で次ターン以降の効果を登録する。
// 効果は公式資料との個別照合が未完了（needs_review）。
import { def, registerSet } from './cards.js';

const A = 'Action', T = 'Treasure', V = 'Victory', AT = 'Attack', R = 'Reaction', D = 'Duration';
const S = { set: 'seaside' };

def('sea2_astrolabe', 'Astrolabe', 'アストロラーベ', 3, [T, D], '今と次のターン開始時に、+1コイン +1購入。', function* (g, p, ctx) {
  g.t.coins += 1; g.t.buys += 1;
  g.addDuration(p, ctx.card, 'astrolabe', (g2, p2) => { g2.t.coins += 1; g2.t.buys += 1; });
}, S);

def('sea2_bazaar', 'Bazaar', 'バザー', 5, [A], '+1カード +2アクション +1コイン', function* (g, p) {
  g.draw(p, 1); g.t.actions += 2; g.t.coins += 1;
}, S);

def('sea2_blockade', 'Blockade', '封鎖', 4, [A, D, AT], 'コスト4以下のカードを獲得し、脇に置く。次のターン開始時にそれを手札に加える。それまでの間、他プレイヤーが自分のターンにその同名カードを獲得したら、呪いを獲得する。', function* (g, p, ctx) {
  const n = yield* g.choosePile(p, g.gainable(4), '封鎖：コスト4以下のカードを獲得して脇に置く', 'gain');
  if (!n) return;
  const c = g.gain(p, n, 'hold');
  if (!c) return;
  g.addDuration(p, ctx.card, 'blockade', (g2, p2) => { if (p2.hold.includes(c)) g2.moveTo(p2, c, 'hand'); }, { name: n });
}, S);

def('sea2_caravan', 'Caravan', 'キャラバン', 4, [A, D], '+1カード +1アクション。次のターン開始時に+1カード。', function* (g, p, ctx) {
  g.draw(p, 1); g.t.actions += 1;
  g.addDuration(p, ctx.card, 'caravan', (g2, p2) => { g2.draw(p2, 1); });
}, S);

def('sea2_corsair', 'Corsair', '私掠船', 5, [A, D, AT], '+2コイン。次のターン開始時に+1カード。それまでの間、他の各プレイヤーが自分のターンに最初に銀貨か金貨をプレイした時、それを廃棄する。', function* (g, p, ctx) {
  g.t.coins += 2;
  g.addDuration(p, ctx.card, 'corsair', (g2, p2) => { g2.draw(p2, 1); });
}, S);

def('sea2_cutpurse', 'Cutpurse', '巾着切り', 4, [A, AT], '+2コイン。他の各プレイヤーは銅貨1枚を捨てる（なければ手札を公開）。', function* (g, p) {
  g.t.coins += 2;
  const imm = yield* g.beginAttack(p);
  for (const v of g.victims(p, imm)) {
    const c = v.hand.find((x) => x.name === 'Copper');
    if (c) { g.discard(v, c); g.say(`${v.name}は銅貨を捨てた`); } else g.say(`${v.name}は手札を公開した：${g.names(v.hand) || '（なし）'}`);
  }
}, S);

def('sea2_fishing_village', 'Fishing Village', '漁村', 3, [A, D], '+2アクション +1コイン。次のターン開始時に+1アクション +1コイン。', function* (g, p, ctx) {
  g.t.actions += 2; g.t.coins += 1;
  g.addDuration(p, ctx.card, 'fishing', (g2) => { g2.t.actions += 1; g2.t.coins += 1; });
}, S);

def('sea2_haven', 'Haven', '停泊所', 2, [A, D], '+1カード +1アクション。手札1枚を裏向きで脇に置く。次のターン開始時にそれを手札に加える。', function* (g, p, ctx) {
  g.draw(p, 1); g.t.actions += 1;
  if (!p.hand.length) return;
  const [c] = yield* g.chooseCards(p, p.hand, 1, 1, '脇に置く手札（次のターンに戻る）', 'hold');
  g.moveTo(p, c, 'hold');
  g.addDuration(p, ctx.card, 'haven', (g2, p2) => { if (p2.hold.includes(c)) g2.moveTo(p2, c, 'hand'); });
}, S);

def('sea2_island', 'Island', '島', 4, [A, V], 'これと手札1枚を島マットに置く。2勝利点。', function* (g, p, ctx) {
  if (p.play.includes(ctx.card)) g.moveTo(p, ctx.card, 'island');
  if (p.hand.length) {
    const [c] = yield* g.chooseCards(p, p.hand, 1, 1, '島マットに置く手札', 'mat');
    g.moveTo(p, c, 'island');
  }
  g.say(`${p.name}は島マットにカードを置いた`);
}, { ...S, vp: () => 2 });

def('sea2_lighthouse', 'Lighthouse', '灯台', 2, [A, D], '+1アクション +1コイン。次のターン開始時に+1コイン。それまでの間、他プレイヤーのアタックの影響を受けない。', function* (g, p, ctx) {
  g.t.actions += 1; g.t.coins += 1;
  g.addDuration(p, ctx.card, 'lighthouse', (g2) => { g2.t.coins += 1; });
}, S);

def('sea2_lookout', 'Lookout', '見張り', 3, [A], '+1アクション。山札の上3枚を見て、1枚を廃棄し、1枚を捨て、残りを山札の上に戻す。', function* (g, p) {
  g.t.actions += 1;
  const look = [];
  for (let i = 0; i < 3; i++) { const c = g.takeTop(p); if (c) look.push(c); }
  if (!look.length) return;
  let rest = look.slice();
  const [t] = yield* g.chooseCards(p, rest, 1, 1, '廃棄するカード', 'trash');
  g.trash(p, t); rest = rest.filter((c) => c !== t);
  if (rest.length) {
    const [d] = yield* g.chooseCards(p, rest, 1, 1, '捨てるカード', 'discard');
    g.moveTo(p, d, 'discard'); rest = rest.filter((c) => c !== d);
  }
  for (const c of rest) g.moveTo(p, c, 'deck');
}, S);

def('sea2_merchant_ship', 'Merchant Ship', '商船', 5, [A, D], '今と次のターン開始時に+2コイン。', function* (g, p, ctx) {
  g.t.coins += 2;
  g.addDuration(p, ctx.card, 'mship', (g2) => { g2.t.coins += 2; });
}, S);

def('sea2_monkey', 'Monkey', '猿', 3, [A, D], '次のターン開始まで、右隣のプレイヤーがカードを獲得するたび+1カード。次のターン開始時に+1カード。', function* (g, p, ctx) {
  g.addDuration(p, ctx.card, 'monkey', (g2, p2) => { g2.draw(p2, 1); });
}, S);

def('sea2_native_village', 'Native Village', '原住民の村', 2, [A], '+2アクション。次から1つ選ぶ：山札の上を裏向きで原住民マットに置く／マットの全カードを手札に加える。', function* (g, p) {
  g.t.actions += 2;
  const opts = [];
  if (p.deck.length || p.discard.length) opts.push({ id: 'put', label: '山札の上をマットに置く' });
  if (p.native.length) opts.push({ id: 'take', label: `マットの${p.native.length}枚を手札に加える` });
  if (!opts.length) return;
  const o = yield* g.chooseOption(p, opts, '原住民の村：1つ選ぶ', opts[0].id);
  if (o === 'put') { const c = g.takeTop(p); if (c) { g.moveTo(p, c, 'native'); g.say(`${p.name}は山札の上を原住民マットに置いた`); } }
  else { for (const c of p.native.slice()) g.moveTo(p, c, 'hand'); g.say(`${p.name}は原住民マットのカードを手札に加えた`); }
}, S);

def('sea2_outpost', 'Outpost', '前哨地', 5, [A, D], '次の手札は3枚だけ引く。このターンの後に追加ターンを行う（3ターン連続にはならない）。', function* (g, p, ctx) {
  g.t.outpost = true;
  g.addDuration(p, ctx.card, 'outpost', null);
}, S);

def('sea2_pirate', 'Pirate', '海賊', 5, [A, D, R], '次のターン開始時にコスト6以下の財宝を手札に獲得する。（誰かが財宝を獲得した時、手札からこれをプレイしてよい。）', function* (g, p, ctx) {
  g.addDuration(p, ctx.card, 'pirate', function* (g2, p2) {
    const n = yield* g2.choosePile(p2, g2.gainable(6, (d) => d.types.includes('Treasure')), '海賊：コスト6以下の財宝を手札に獲得', 'gain');
    if (n) g2.gain(p2, n, 'hand');
  });
}, S);

def('sea2_sailor', 'Sailor', '船乗り', 4, [A, D], '+1アクション。このターン1回、持続カードを獲得した時それをプレイしてよい。次のターン開始時に+2コインし、手札1枚を廃棄してよい。', function* (g, p, ctx) {
  g.t.actions += 1; g.t.sailorLeft += 1;
  g.addDuration(p, ctx.card, 'sailor', function* (g2, p2) {
    g2.t.coins += 2;
    if (p2.hand.length) {
      const [c] = yield* g2.chooseCards(p2, p2.hand, 0, 1, '船乗り：廃棄する手札（任意）', 'trash');
      if (c) g2.trash(p2, c);
    }
  });
}, S);

def('sea2_salvager', 'Salvager', '引揚水夫', 4, [A], '+1購入。手札1枚を廃棄し、そのコスト分の+コイン。', function* (g, p) {
  g.t.buys += 1;
  if (!p.hand.length) return;
  const [c] = yield* g.chooseCards(p, p.hand, 1, 1, '廃棄する手札（コスト分のコインを得る）', 'trash');
  g.t.coins += g.cost(c);
  g.trash(p, c);
}, S);

def('sea2_sea_chart', 'Sea Chart', '海図', 3, [A], '+1カード +1アクション。山札の上を公開し、同名カードが場にあれば手札に加える。', function* (g, p) {
  g.draw(p, 1); g.t.actions += 1;
  const c = g.takeTop(p);
  if (!c) return;
  g.say(`${p.name}は山札の上を公開した：${g.nm(c)}`);
  if (p.play.some((x) => x.name === c.name)) g.moveTo(p, c, 'hand'); else g.moveTo(p, c, 'deck');
}, S);

def('sea2_sea_witch', 'Sea Witch', '海の魔女', 5, [A, D, AT], '+2カード。他の各プレイヤーは呪いを獲得する。次のターン開始時に+2カードし、手札2枚を捨てる。', function* (g, p, ctx) {
  g.draw(p, 2);
  const imm = yield* g.beginAttack(p);
  for (const v of g.victims(p, imm)) g.gain(v, 'Curse');
  g.addDuration(p, ctx.card, 'seawitch', function* (g2, p2) {
    g2.draw(p2, 2);
    const n = Math.min(2, p2.hand.length);
    const cs = yield* g2.chooseCards(p2, p2.hand, n, n, '海の魔女：手札2枚を捨てる', 'discard');
    for (const c of cs) g2.discard(p2, c);
  });
}, S);

def('sea2_smugglers', 'Smugglers', '密輸人', 3, [A], '右隣のプレイヤーが前のターンに獲得した、コスト6以下のカードと同名のカードを1枚獲得する。', function* (g, p) {
  const names = [...new Set(g.rightOf(p).lastGains)].filter((n) => g.pile(n) && g.pile(n).length && g.cost(g.def(n)) <= 6);
  const n = yield* g.choosePile(p, names, '密輸人：獲得するカード', 'gain');
  if (n) g.gain(p, n);
}, S);

def('sea2_tactician', 'Tactician', '策士', 5, [A, D], '手札を全て捨てる。1枚以上捨てたなら、次のターン開始時に+5カード +1購入 +1アクション。', function* (g, p, ctx) {
  if (!p.hand.length) return;
  for (const c of p.hand.slice()) g.discard(p, c);
  g.say(`${p.name}は手札を全て捨てた`);
  g.addDuration(p, ctx.card, 'tactician', (g2, p2) => { g2.draw(p2, 5); g2.t.buys += 1; g2.t.actions += 1; });
}, S);

def('sea2_tide_pools', 'Tide Pools', '潮溜まり', 4, [A, D], '+3カード +1アクション。次のターン開始時に手札2枚を捨てる。', function* (g, p, ctx) {
  g.draw(p, 3); g.t.actions += 1;
  g.addDuration(p, ctx.card, 'tidepools', function* (g2, p2) {
    const n = Math.min(2, p2.hand.length);
    const cs = yield* g2.chooseCards(p2, p2.hand, n, n, '潮溜まり：手札2枚を捨てる', 'discard');
    for (const c of cs) g2.discard(p2, c);
  });
}, S);

def('sea2_treasure_map', 'Treasure Map', '宝の地図', 4, [A], 'これと手札の宝の地図を廃棄する。2枚廃棄したら、金貨4枚を山札の上に獲得する。', function* (g, p, ctx) {
  if (p.play.includes(ctx.card)) g.trash(p, ctx.card); else return;
  const other = p.hand.find((c) => c.name === 'Treasure Map');
  if (!other) return;
  g.trash(p, other);
  for (let i = 0; i < 4; i++) g.gain(p, 'Gold', 'deck');
}, S);

def('sea2_treasury', 'Treasury', '国庫', 5, [A], '+1カード +1アクション +1コイン。購入フェイズで勝利点カードを購入していなければ、これを捨てる時に山札の上に置いてよい。', function* (g, p) {
  g.draw(p, 1); g.t.actions += 1; g.t.coins += 1;
}, S);

def('sea2_warehouse', 'Warehouse', '倉庫', 3, [A], '+3カード +1アクション。手札3枚を捨てる。', function* (g, p) {
  g.draw(p, 3); g.t.actions += 1;
  const n = Math.min(3, p.hand.length);
  const cs = yield* g.chooseCards(p, p.hand, n, n, '倉庫：手札3枚を捨てる', 'discard');
  for (const c of cs) g.discard(p, c);
}, S);

def('sea2_wharf', 'Wharf', '船着場', 5, [A, D], '今と次のターン開始時に+2カード +1購入。', function* (g, p, ctx) {
  g.draw(p, 2); g.t.buys += 1;
  g.addDuration(p, ctx.card, 'wharf', (g2, p2) => { g2.draw(p2, 2); g2.t.buys += 1; });
}, S);

registerSet('seaside', '海辺 第2版');
