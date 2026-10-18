// 収穫祭 第2版（一部）。第2版で追加された新カード（Carnival, Farmhands, Farrier, Ferryman, Footpad, Joust, 報酬カード）は
// 公式の正確な文面を確認できていないため未実装（推測で補完しない）。docs/UNCONFIRMED.md 参照。
import { def, registerSet } from './cards.js';

const A = 'Action', T = 'Treasure', V = 'Victory', AT = 'Attack';
const S = { set: 'cornucopia' };

def('cor2_hamlet', 'Hamlet', 'ハムレット', 2, [A], '+1カード +1アクション。カード1枚を捨てて+1アクションしてよい。カード1枚を捨てて+1購入してよい。', function* (g, p) {
  g.draw(p, 1); g.t.actions += 1;
  for (const [k, label] of [['actions', '+1アクション'], ['buys', '+1購入']]) {
    if (!p.hand.length) break;
    const [c] = yield* g.chooseCards(p, p.hand, 0, 1, `カード1枚を捨てて${label}（任意）`, 'discard');
    if (c) { g.discard(p, c); g.t[k] += 1; }
  }
}, S);

def('cor2_menagerie', 'Menagerie', '移動動物園', 3, [A], '+1アクション。手札を公開する。同名カードが無ければ+3カード、あれば+1カード。', function* (g, p) {
  g.t.actions += 1;
  g.say(`${p.name}は手札を公開した：${g.names(p.hand) || '（なし）'}`);
  const dup = new Set(p.hand.map((c) => c.name)).size < p.hand.length;
  g.draw(p, dup ? 1 : 3);
}, S);

def('cor2_hunting_party', 'Hunting Party', '狩猟団', 5, [A], '+1カード +1アクション。手札を公開する。手札に無い名前のカードが出るまで山札を公開し、それを手札に加え、残りを捨てる。', function* (g, p) {
  g.draw(p, 1); g.t.actions += 1;
  g.say(`${p.name}は手札を公開した：${g.names(p.hand) || '（なし）'}`);
  const names = new Set(p.hand.map((c) => c.name));
  const skipped = [];
  for (;;) {
    const c = g.takeTop(p);
    if (!c) break;
    if (!names.has(c.name)) { g.moveTo(p, c, 'hand'); g.say(`${p.name}は${g.nm(c)}を手札に加えた`); break; }
    skipped.push(c);
  }
  for (const c of skipped) g.moveTo(p, c, 'discard');
}, S);

def('cor2_jester', 'Jester', '道化師', 5, [A, AT], '+2コイン。他の各プレイヤーは山札の上を捨てる。勝利点カードなら呪いを獲得する。そうでなければ、そのカードと同名のカードを、あなたが選んで本人かあなたのどちらかが獲得する。', function* (g, p) {
  g.t.coins += 2;
  const imm = yield* g.beginAttack(p);
  for (const v of g.victims(p, imm)) {
    const c = g.takeTop(v);
    if (!c) continue;
    g.moveTo(v, c, 'discard');
    g.say(`${v.name}は山札の上の${g.nm(c)}を捨てた`);
    if (g.isType(c, V)) { g.gain(v, 'Curse'); continue; }
    if (!g.supply[c.name] || !g.supply[c.name].length) continue;
    const who = yield* g.chooseOption(p, [{ id: 'them', label: `${v.name}に${g.nm(c)}を獲得させる` }, { id: 'me', label: `自分が${g.nm(c)}を獲得` }], '道化師：誰が獲得する？', 'me');
    g.gain(who === 'me' ? p : v, c.name);
  }
}, S);

def('cor2_remake', 'Remake', '改造', 4, [A], '次を2回行う：手札1枚を廃棄し、それよりコストがちょうど1多いカードを獲得する。', function* (g, p) {
  for (let i = 0; i < 2; i++) {
    if (!p.hand.length) break;
    const [c] = yield* g.chooseCards(p, p.hand, 1, 1, `廃棄する手札（${i + 1}回目）`, 'trash');
    const cost = g.cost(c), pot = (c.name && g.def(c.name).potion) || 0;
    g.trash(p, c);
    const n = yield* g.choosePile(p, g.gainable(cost + 1, null, true, pot), `コスト${cost + 1}ちょうどのカードを獲得`, 'gain');
    if (n) g.gain(p, n);
  }
}, S);

def('cor2_young_witch', 'Young Witch', '若き魔女', 4, [A, AT], '+2カード。手札2枚を捨てる。他の各プレイヤーは、手札の「災い」を公開して呪いを防いでもよい。（セットアップ：コスト2〜3の王国カードを1山追加し、それを災いとする。）', function* (g, p) {
  g.draw(p, 2);
  const n = Math.min(2, p.hand.length);
  const cs = yield* g.chooseCards(p, p.hand, n, n, '若き魔女：手札2枚を捨てる', 'discard');
  for (const c of cs) g.discard(p, c);
  const imm = yield* g.beginAttack(p);
  for (const v of g.victims(p, imm)) {
    const b = g.bane && v.hand.find((x) => x.name === g.bane);
    if (b) {
      const ok = yield* g.yesNo(v, `災いの${g.nm(b)}を公開して呪いを防ぎますか？`, true);
      if (ok) { g.say(`${v.name}は災い（${g.nm(b)}）を公開した`); continue; }
    }
    g.gain(v, 'Curse');
  }
}, S);

def('cor2_horn_of_plenty', 'Horn of Plenty', '豊穣の角', 5, [T], 'プレイ時、場の異なる名前のカード1種類（これを含む）につき1コインまでのカードを獲得する。それが勝利点カードなら、これを廃棄する。', function* (g, p, ctx) {
  const k = new Set(p.play.map((c) => c.name)).size;
  const n = yield* g.choosePile(p, g.gainable(k), `豊穣の角：コスト${k}以下のカードを獲得`, 'gain');
  if (!n) return;
  const c = g.gain(p, n);
  if (c && g.isType(c, V) && p.play.includes(ctx.card)) g.trash(p, ctx.card);
}, { ...S, coins: 0 });

def('cor2_fairgrounds', 'Fairgrounds', '品評会', 6, [V], '自分の持つ異なる名前のカード5種類（端数切り捨て）につき2勝利点。', null, { ...S, vp: (cards) => 2 * Math.floor(new Set(cards.map((c) => c.name)).size / 5) });

registerSet('cornucopia', '収穫祭 第2版（一部）');
