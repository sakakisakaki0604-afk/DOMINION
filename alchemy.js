// 錬金術（12種）＋ポーション。ポーションは財宝として「ポーション」資源を生み、コストに P を含むカードの購入に使う。
// 憑依(Possession)は engine の poss 状態で実装（憑依された側の判断を憑依した側が行う）。
// 効果は公式資料との個別照合が未完了（needs_review）。
import { def, registerSet, CARDS } from './cards.js';

const A = 'Action', T = 'Treasure', V = 'Victory', AT = 'Attack';
const S = { set: 'alchemy' };

def('alc_potion', 'Potion', 'ポーション', 4, [T], '+1ポーション（ポーションコストのカードの購入に使う）', null, { set: 'basic', potions: 1 });

def('alc_transmute', 'Transmute', '変成', 0, [A], '手札1枚を廃棄する。それがアクションなら公領、財宝なら変成、勝利点なら金貨を獲得する（複数タイプなら全て）。', function* (g, p) {
  if (!p.hand.length) return;
  const [c] = yield* g.chooseCards(p, p.hand, 1, 1, '廃棄する手札', 'trash');
  const types = c.types.slice();
  g.trash(p, c);
  if (types.includes(A)) g.gain(p, 'Duchy');
  if (types.includes(T)) g.gain(p, 'Transmute');
  if (types.includes(V)) g.gain(p, 'Gold');
}, { ...S, potion: 1 });

def('alc_vineyard', 'Vineyard', 'ぶどう園', 0, [V], '自分のデッキのアクションカード3枚（端数切り捨て）ごとに1勝利点。', null, {
  ...S, potion: 1, vp: (cards) => Math.floor(cards.filter((c) => c.types.includes(A)).length / 3),
});

def('alc_herbalist', 'Herbalist', '薬草商', 2, [A], '+1購入 +1コイン。これを場から捨てる時、場の財宝1枚を山札の上に置いてもよい。', function* (g, p) {
  g.t.buys += 1; g.t.coins += 1;
}, S);

def('alc_apothecary', 'Apothecary', '薬剤師', 2, [A], '+1カード +1アクション。山札の上4枚を公開し、銅貨とポーションを手札に加える。残りは好きな順で山札の上に戻す。', function* (g, p) {
  g.draw(p, 1); g.t.actions += 1;
  const rev = [];
  for (let i = 0; i < 4; i++) { const c = g.takeTop(p); if (c) rev.push(c); }
  if (rev.length) g.say(`${p.name}は山札の上を公開した：${g.names(rev)}`);
  const rest = [];
  for (const c of rev) { if (c.name === 'Copper' || c.name === 'Potion') g.moveTo(p, c, 'hand'); else rest.push(c); }
  yield* g.orderToDeck(p, rest);
}, { ...S, potion: 1 });

def('alc_scrying_pool', 'Scrying Pool', '占い池', 2, [A, AT], '+1アクション。各プレイヤー（自分を含む）の山札の上を公開し、あなたが捨てるか戻すかを選ぶ。その後、アクション以外が出るまで自分の山札を公開し、全て手札に加える。', function* (g, p) {
  g.t.actions += 1;
  const imm = yield* g.beginAttack(p);
  for (const q of [p, ...g.victims(p, imm)]) {
    const c = g.takeTop(q);
    if (!c) continue;
    g.say(`${q.name}の山札の上：${g.nm(c)}`);
    const bad = c.types.includes('Curse') || (c.types.includes(V) && !c.types.includes(A));
    const disc = yield* g.yesNo(p, `${q.name}の${g.nm(c)}を捨てさせますか？（いいえで山札の上に戻す）`, q === p ? bad : !bad);
    g.moveTo(q, c, disc ? 'discard' : 'deck');
  }
  const got = [];
  for (;;) {
    const c = g.takeTop(p);
    if (!c) break;
    got.push(c);
    if (!c.types.includes(A)) break;
  }
  if (got.length) g.say(`${p.name}は${g.names(got)}を公開して手札に加えた`);
  for (const c of got) g.moveTo(p, c, 'hand');
}, { ...S, potion: 1 });

def('alc_university', 'University', '大学', 2, [A], '+2アクション。コスト5以下のアクションカード1枚を獲得してもよい。', function* (g, p) {
  g.t.actions += 2;
  const n = yield* g.choosePile(p, g.gainable(5, (d) => d.types.includes(A)), '獲得するアクション（任意）', 'gain', true);
  if (n) g.gain(p, n);
}, { ...S, potion: 1 });

def('alc_alchemist', 'Alchemist', '錬金術師', 3, [A], '+2カード +1アクション。これを場から捨てる時、場にポーションがあれば山札の上に置いてもよい。', function* (g, p) {
  g.draw(p, 2); g.t.actions += 1;
}, { ...S, potion: 1 });

def('alc_familiar', 'Familiar', '使い魔', 3, [A, AT], '+1カード +1アクション。他の各プレイヤーは呪いを獲得する。', function* (g, p) {
  g.draw(p, 1); g.t.actions += 1;
  const imm = yield* g.beginAttack(p);
  for (const v of g.victims(p, imm)) g.gain(v, 'Curse');
}, { ...S, potion: 1 });

def('alc_philosophers_stone', "Philosopher's Stone", '賢者の石', 3, [T], 'プレイ時、自分の山札と捨て札の合計枚数を数え、5枚につき+1コイン（端数切り捨て）。', null, {
  ...S, potion: 1, coinsFn: (g, p) => Math.floor((p.deck.length + p.discard.length) / 5),
});

def('alc_golem', 'Golem', 'ゴーレム', 4, [A], 'ゴーレム以外のアクションを2枚公開するまで山札を公開する。他のカードは捨て、公開したアクション2枚を好きな順でプレイする。', function* (g, p) {
  const acts = [], others = [];
  for (;;) {
    const c = g.takeTop(p);
    if (!c) break;
    if (c.types.includes(A) && c.name !== 'Golem') { acts.push(c); if (acts.length === 2) break; } else others.push(c);
  }
  g.say(`${p.name}は山札を公開した：${g.names(acts.concat(others)) || '（なし）'}`);
  for (const c of others) g.moveTo(p, c, 'discard');
  let order = acts;
  if (acts.length === 2) {
    const [first] = yield* g.chooseCards(p, acts, 1, 1, '先にプレイするアクションを選ぶ', 'play');
    order = [first, acts.find((c) => c !== first)];
  }
  for (const c of order) yield* g.playCard(p, c);
}, { ...S, potion: 1 });

def('alc_apprentice', 'Apprentice', '弟子', 5, [A], '+1アクション。手札1枚を廃棄する。そのコスト1コインにつき+1カード。ポーションコストを含むなら+2カード。', function* (g, p) {
  g.t.actions += 1;
  if (!p.hand.length) return;
  const [c] = yield* g.chooseCards(p, p.hand, 1, 1, '廃棄する手札（コスト分カードを引く）', 'trash');
  const n = g.cost(c) + (CARDS[c.name].potion ? 2 : 0);
  g.trash(p, c);
  g.draw(p, n);
}, S);

def('alc_possession', 'Possession', '憑依', 6, [A], '左隣のプレイヤーがこのターンの後に追加ターンを行う。そのターン、あなたが全ての判断を行い、獲得するカードは全てあなたが獲得する。廃棄されたカードはそのターン終了時に持ち主の捨て札へ戻る。', function* (g, p) {
  if (g.poss) { g.say('憑依中のターンでは追加の憑依は無効として扱う'); return; }
  g.t.possessions += 1;
}, { ...S, potion: 1 });

registerSet('alchemy', '錬金術');
