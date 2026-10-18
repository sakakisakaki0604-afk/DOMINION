// ギルド 第2版（一部）。第2版の新カード Infirmary, Shop は公式の正確な文面を確認できていないため未実装。
// コッファー(Coffers)と超過払い(Overpay)は engine 側で管理する。
import { def, registerSet } from './cards.js';

const A = 'Action', T = 'Treasure', V = 'Victory', AT = 'Attack';
const S = { set: 'guilds' };

def('gld2_advisor', 'Advisor', '顧問官', 4, [A], '+1アクション。山札の上3枚を公開し、左隣のプレイヤーが1枚選ぶ。それを捨て、残りを手札に加える。', function* (g, p) {
  g.t.actions += 1;
  const rev = [];
  for (let i = 0; i < 3; i++) { const c = g.takeTop(p); if (c) rev.push(c); }
  if (!rev.length) return;
  g.say(`${p.name}は山札の上を公開した：${g.names(rev)}`);
  const left = g.leftOf(p);
  const [d] = yield* g.chooseCards(left, rev, 1, 1, `${p.name}の顧問官：捨てさせるカードを選ぶ`, 'advisor');
  g.moveTo(p, d, 'discard');
  for (const c of rev) if (c !== d) g.moveTo(p, c, 'hand');
}, S);

def('gld2_baker', 'Baker', 'パン屋', 5, [A], '+1カード +1アクション +1コッファー。（セットアップ：各プレイヤーはコッファーを1得る。）', function* (g, p) {
  g.draw(p, 1); g.t.actions += 1; p.coffers += 1;
}, S);

def('gld2_butcher', 'Butcher', '肉屋', 5, [A], '+2コッファー。手札1枚を廃棄する。コッファーを好きな数だけ支払い、廃棄したカードのコスト＋支払った数以下のカードを獲得する。', function* (g, p) {
  p.coffers += 2;
  if (!p.hand.length) return;
  const [c] = yield* g.chooseCards(p, p.hand, 1, 1, '廃棄する手札', 'trash');
  const cost = g.cost(c), pot = g.def(c.name).potion || 0;
  g.trash(p, c);
  let pay = 0;
  if (p.coffers > 0) pay = yield* g.chooseNumber(p, 0, p.coffers, '支払うコッファーの数', 0);
  p.coffers -= pay;
  const n = yield* g.choosePile(p, g.gainable(cost + pay, null, false, pot), `コスト${cost + pay}以下のカードを獲得`, 'gain');
  if (n) g.gain(p, n);
}, S);

def('gld2_candlestick_maker', 'Candlestick Maker', 'ろうそく職人', 2, [A], '+1アクション +1購入 +1コッファー', function* (g, p) {
  g.t.actions += 1; g.t.buys += 1; p.coffers += 1;
}, S);

def('gld2_herald', 'Herald', '伝令官', 4, [A], '+1カード +1アクション。山札の上を公開し、アクションならプレイする。（超過払い：1コインにつき、捨て札から1枚を山札の上に置く。）', function* (g, p) {
  g.draw(p, 1); g.t.actions += 1;
  const c = g.takeTop(p);
  if (!c) return;
  g.say(`${p.name}は山札の上を公開した：${g.nm(c)}`);
  if (g.isType(c, A)) yield* g.playCard(p, c); else g.moveTo(p, c, 'deck');
}, { ...S, overpay: function* (g, p, n) {
  for (let i = 0; i < n; i++) {
    if (!p.discard.length) break;
    const [c] = yield* g.chooseCards(p, p.discard, 1, 1, `伝令官の超過払い：捨て札から山札の上に置くカード（${i + 1}/${n}）`, 'topdeck');
    g.moveTo(p, c, 'deck');
  }
} });

def('gld2_journeyman', 'Journeyman', 'ジャーニーマン', 5, [A], 'カード名を1つ宣言する。宣言したカード以外を3枚公開するまで山札を公開し、その3枚を手札に加え、残りを捨てる。', function* (g, p) {
  const n = yield* g.choosePile(p, g.pileNames(), '宣言するカード名', 'name', false);
  const skipped = []; let got = 0;
  while (got < 3) {
    const c = g.takeTop(p);
    if (!c) break;
    if (c.name === n) skipped.push(c); else { g.moveTo(p, c, 'hand'); got++; }
  }
  g.say(`${p.name}は${g.defOf(n).name_ja}を宣言し、${got}枚を手札に加えた`);
  for (const c of skipped) g.moveTo(p, c, 'discard');
}, S);

def('gld2_merchant_guild', 'Merchant Guild', '商人ギルド', 5, [A], '+1購入 +1コイン。場にある間、カードを購入するたびに+1コッファー。', function* (g, p) {
  g.t.buys += 1; g.t.coins += 1;
}, S);

def('gld2_plaza', 'Plaza', '広場', 4, [A], '+1カード +2アクション。財宝1枚を捨てて+1コッファーを得てもよい。', function* (g, p) {
  g.draw(p, 1); g.t.actions += 2;
  const ts = p.hand.filter((c) => g.isType(c, T));
  if (!ts.length) return;
  const [c] = yield* g.chooseCards(p, ts, 0, 1, '捨てる財宝（+1コッファー、任意）', 'discard');
  if (c) { g.discard(p, c); p.coffers += 1; }
}, S);

def('gld2_soothsayer', 'Soothsayer', '占い師', 5, [A, AT], '金貨を1枚獲得する。他の各プレイヤーは呪いを獲得し、獲得した者は1枚引く。', function* (g, p) {
  const imm = yield* g.beginAttack(p);
  g.gain(p, 'Gold');
  for (const v of g.victims(p, imm)) { const c = g.gain(v, 'Curse'); if (c) g.draw(v, 1); }
}, S);

def('gld2_stonemason', 'Stonemason', '石工', 2, [A], '手札1枚を廃棄し、それよりコストの低いカードを2枚獲得する。（超過払い：支払った額と同じコストのアクションを2枚獲得する。）', function* (g, p) {
  if (!p.hand.length) return;
  const [c] = yield* g.chooseCards(p, p.hand, 1, 1, '廃棄する手札', 'trash');
  const cost = g.cost(c), pot = g.def(c.name).potion || 0;
  g.trash(p, c);
  for (let i = 0; i < 2; i++) {
    const n = yield* g.choosePile(p, cost > 0 ? g.gainable(cost - 1, null, false, pot) : [], `コスト${cost}未満のカードを獲得（${i + 1}/2）`, 'gain');
    if (n) g.gain(p, n);
  }
}, { ...S, overpay: function* (g, p, n) {
  for (let i = 0; i < 2; i++) {
    const nm = yield* g.choosePile(p, g.gainable(n, (d) => d.types.includes('Action'), true), `コスト${n}ちょうどのアクションを獲得（${i + 1}/2）`, 'gain');
    if (nm) g.gain(p, nm);
  }
} });

registerSet('guilds', 'ギルド 第2版（一部）');
