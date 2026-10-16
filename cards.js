// カードデータと効果。効果は「レビュー済みの構造化された手続き」としてコードで記述し、
// 自由文をその場で解釈して状態を変更することはしない（仕様書 §5）。
// 各カードに source / confidence を保持する。公式資料との個別照合が済むまで confidence は needs_review。

export const SRC = {
  evidence_type: 'author_knowledge_unverified',
  checked_at: '2026-10-16',
  confidence: 'needs_review',
  note: '公式ルールブック・FAQとの個別照合は未完了。日本語名は仮訳の可能性あり。',
  refs: ['https://dominionleague.org/resources', 'https://dominionleague.org/faq'],
};

export const CARDS = {};
const def = (id, name_en, name_ja, cost, types, summary_ja, effect = null, extra = {}) => {
  CARDS[name_en] = { id, name: name_en, name_ja, cost, types, summary_ja, effect, ...extra };
};

const A = 'Action', T = 'Treasure', V = 'Victory', AT = 'Attack', R = 'Reaction';

// ---------- 基本カード ----------
def('base_copper', 'Copper', '銅貨', 0, [T], '+1コイン', null, { coins: 1, set: 'basic' });
def('base_silver', 'Silver', '銀貨', 3, [T], '+2コイン', null, { coins: 2, set: 'basic' });
def('base_gold', 'Gold', '金貨', 6, [T], '+3コイン', null, { coins: 3, set: 'basic' });
def('base_estate', 'Estate', '屋敷', 2, [V], '1勝利点', null, { vp: () => 1, set: 'basic' });
def('base_duchy', 'Duchy', '公領', 5, [V], '3勝利点', null, { vp: () => 3, set: 'basic' });
def('base_province', 'Province', '属州', 8, [V], '6勝利点', null, { vp: () => 6, set: 'basic' });
def('base_curse', 'Curse', '呪い', 0, ['Curse'], '-1勝利点', null, { vp: () => -1, set: 'basic' });

// ---------- 基本セット 第2版 ----------
def('base2_cellar', 'Cellar', '地下貯蔵庫', 2, [A], '+1アクション。手札から好きな枚数を捨て、捨てた枚数だけ引く。', function* (g, p) {
  g.t.actions += 1;
  const cs = yield* g.chooseCards(p, p.hand, 0, p.hand.length, '捨てるカードを選ぶ（捨てた枚数だけ引く）', 'discard');
  for (const c of cs) g.discard(p, c);
  g.draw(p, cs.length);
}, { set: 'base' });

def('base2_chapel', 'Chapel', '礼拝堂', 2, [A], '手札から最大4枚を廃棄する。', function* (g, p) {
  const cs = yield* g.chooseCards(p, p.hand, 0, 4, '廃棄するカードを選ぶ（最大4枚）', 'trash');
  for (const c of cs) g.trash(p, c);
}, { set: 'base' });

def('base2_moat', 'Moat', '堀', 2, [A, R], '+2カード。（手札にあり他人がアタックをプレイした時、公開してそのアタックを受けない。）', function* (g, p) {
  g.draw(p, 2);
}, { set: 'base', reaction: 'moat' });

def('base2_harbinger', 'Harbinger', '先触れ', 3, [A], '+1カード +1アクション。捨て札から1枚を山札の上に置いてもよい。', function* (g, p) {
  g.draw(p, 1); g.t.actions += 1;
  if (!p.discard.length) return;
  const [c] = yield* g.chooseCards(p, p.discard, 0, 1, '山札の上に置く捨て札（任意）', 'topdeck');
  if (c) { g.moveTo(p, c, 'deck'); g.say(`${p.name}は捨て札から1枚を山札の上に置いた`); }
}, { set: 'base' });

def('base2_merchant', 'Merchant', '商人', 3, [A], '+1カード +1アクション。このターン最初に銀貨をプレイした時、+1コイン。', function* (g, p) {
  g.draw(p, 1); g.t.actions += 1; g.t.merchant += 1;
}, { set: 'base' });

def('base2_vassal', 'Vassal', '家臣', 3, [A], '+2コイン。山札の一番上を捨てる。それがアクションならプレイしてもよい。', function* (g, p) {
  g.t.coins += 2;
  const c = g.takeTop(p);
  if (!c) return;
  g.moveTo(p, c, 'discard');
  g.say(`${p.name}は山札の上から${g.nm(c)}を捨てた`);
  if (g.isType(c, A)) {
    const ok = yield* g.yesNo(p, `${g.nm(c)}をプレイしますか？`, true);
    if (ok) yield* g.playCard(p, c);
  }
}, { set: 'base' });

def('base2_village', 'Village', '村', 3, [A], '+1カード +2アクション', function* (g, p) {
  g.draw(p, 1); g.t.actions += 2;
}, { set: 'base' });

def('base2_workshop', 'Workshop', '工房', 3, [A], 'コスト4以下のカード1枚を獲得する。', function* (g, p) {
  const n = yield* g.choosePile(p, g.gainable(4), 'コスト4以下のカードを獲得', 'gain');
  if (n) g.gain(p, n);
}, { set: 'base' });

def('base2_bureaucrat', 'Bureaucrat', '役人', 4, [A, AT], '銀貨1枚を獲得して山札の上に置く。他の各プレイヤーは手札の勝利点カード1枚を公開して山札の上に置く（なければ手札を公開）。', function* (g, p) {
  const imm = yield* g.beginAttack(p);
  g.gain(p, 'Silver', 'deck');
  for (const v of g.victims(p, imm)) {
    const vs = v.hand.filter((c) => g.isType(c, V));
    if (!vs.length) { g.say(`${v.name}は手札を公開した：${g.names(v.hand)}`); continue; }
    const c = yield* g.chooseCards(v, vs, 1, 1, '山札の上に置く勝利点カードを公開', 'topdeck');
    g.moveTo(v, c[0], 'deck'); g.say(`${v.name}は${g.nm(c[0])}を公開して山札の上に置いた`);
  }
}, { set: 'base' });

def('base2_gardens', 'Gardens', '庭園', 4, [V], '自分のカード10枚（端数切り捨て）ごとに1勝利点。', null, { set: 'base', vp: (cards) => Math.floor(cards.length / 10) });

def('base2_militia', 'Militia', '民兵', 4, [A, AT], '+2コイン。他の各プレイヤーは手札が3枚になるまで捨てる。', function* (g, p) {
  g.t.coins += 2;
  const imm = yield* g.beginAttack(p);
  for (const v of g.victims(p, imm)) {
    if (v.hand.length <= 3) continue;
    const n = v.hand.length - 3;
    const cs = yield* g.chooseCards(v, v.hand, n, n, `手札が3枚になるまで${n}枚捨てる`, 'discard');
    for (const c of cs) g.discard(v, c);
    g.say(`${v.name}は${n}枚捨てた`);
  }
}, { set: 'base' });

def('base2_moneylender', 'Moneylender', '金貸し', 4, [A], '手札の銅貨1枚を廃棄してもよい。廃棄したら+3コイン。', function* (g, p) {
  const c = p.hand.find((x) => x.name === 'Copper');
  if (!c) return;
  const ok = yield* g.yesNo(p, '銅貨を廃棄して+3コインを得ますか？', true);
  if (ok) { g.trash(p, c); g.t.coins += 3; }
}, { set: 'base' });

def('base2_poacher', 'Poacher', '密猟者', 4, [A], '+1カード +1アクション +1コイン。空のサプライ山1つにつき手札を1枚捨てる。', function* (g, p) {
  g.draw(p, 1); g.t.actions += 1; g.t.coins += 1;
  const n = Math.min(g.emptyPiles(), p.hand.length);
  if (n > 0) {
    const cs = yield* g.chooseCards(p, p.hand, n, n, `空の山${n}つ分、${n}枚捨てる`, 'discard');
    for (const c of cs) g.discard(p, c);
  }
}, { set: 'base' });

def('base2_remodel', 'Remodel', '改築', 4, [A], '手札1枚を廃棄する。廃棄したカードのコスト+2以下のカード1枚を獲得する。', function* (g, p) {
  if (!p.hand.length) return;
  const [c] = yield* g.chooseCards(p, p.hand, 1, 1, '廃棄するカード', 'trash');
  const cost = g.cost(c);
  g.trash(p, c);
  const n = yield* g.choosePile(p, g.gainable(cost + 2), `コスト${cost + 2}以下のカードを獲得`, 'gain');
  if (n) g.gain(p, n);
}, { set: 'base' });

def('base2_smithy', 'Smithy', '鍛冶屋', 4, [A], '+3カード', function* (g, p) { g.draw(p, 3); }, { set: 'base' });

def('base2_throne_room', 'Throne Room', '玉座の間', 4, [A], '手札のアクションカード1枚を選び、2回プレイする。', function* (g, p) {
  const acts = p.hand.filter((c) => g.isType(c, A));
  if (!acts.length) return;
  const [c] = yield* g.chooseCards(p, acts, 0, 1, '2回プレイするアクション（任意）', 'play');
  if (!c) return;
  yield* g.playCard(p, c);
  yield* g.playCard(p, c, { again: true });
}, { set: 'base' });

def('base2_bandit', 'Bandit', '山賊', 5, [A, AT], '金貨1枚を獲得する。他の各プレイヤーは山札の上2枚を公開し、銅貨以外の財宝1枚を廃棄し、残りを捨てる。', function* (g, p) {
  const imm = yield* g.beginAttack(p);
  g.gain(p, 'Gold');
  for (const v of g.victims(p, imm)) {
    const rev = [];
    for (let i = 0; i < 2; i++) { const c = g.takeTop(v); if (c) rev.push(c); }
    if (!rev.length) continue;
    g.say(`${v.name}は山札の上を公開した：${g.names(rev)}`);
    const tr = rev.filter((c) => g.isType(c, T) && c.name !== 'Copper');
    let pick = null;
    if (tr.length === 1) pick = tr[0];
    else if (tr.length > 1) {
      if (tr[0].name === tr[1].name) pick = tr[0];
      else pick = (yield* g.chooseCards(v, tr, 1, 1, '廃棄する財宝を選ぶ', 'trash'))[0];
    }
    if (pick) { g.trash(v, pick); g.say(`${v.name}は${g.nm(pick)}を廃棄した`); }
    for (const c of rev) if (c !== pick) g.moveTo(v, c, 'discard');
  }
}, { set: 'base' });

def('base2_council_room', 'Council Room', '議事堂', 5, [A], '+4カード +1購入。他の各プレイヤーはカードを1枚引く。', function* (g, p) {
  g.draw(p, 4); g.t.buys += 1;
  for (const o of g.others(p)) g.draw(o, 1);
}, { set: 'base' });

def('base2_festival', 'Festival', '祝祭', 5, [A], '+2アクション +1購入 +2コイン', function* (g, p) {
  g.t.actions += 2; g.t.buys += 1; g.t.coins += 2;
}, { set: 'base' });

def('base2_laboratory', 'Laboratory', '研究所', 5, [A], '+2カード +1アクション', function* (g, p) { g.draw(p, 2); g.t.actions += 1; }, { set: 'base' });

def('base2_library', 'Library', '図書館', 5, [A], '手札が7枚になるまで引く。引いたアクションカードは脇に置いてもよい（引き終わったら捨てる）。', function* (g, p) {
  const set = [];
  while (p.hand.length < 7) {
    const c = g.takeTop(p);
    if (!c) break;
    if (g.isType(c, A)) {
      const skip = yield* g.yesNo(p, `${g.nm(c)}を脇に置きますか？（いいえで手札に加える）`, false);
      if (skip) { set.push(c); continue; }
      g.moveTo(p, c, 'hand');
    } else g.moveTo(p, c, 'hand', true);
  }
  for (const c of set) g.moveTo(p, c, 'discard');
}, { set: 'base' });

def('base2_market', 'Market', '市場', 5, [A], '+1カード +1アクション +1購入 +1コイン', function* (g, p) {
  g.draw(p, 1); g.t.actions += 1; g.t.buys += 1; g.t.coins += 1;
}, { set: 'base' });

def('base2_mine', 'Mine', '鉱山', 5, [A], '手札の財宝1枚を廃棄してもよい。廃棄したら、コスト+3以下の財宝1枚を手札に獲得する。', function* (g, p) {
  const ts = p.hand.filter((c) => g.isType(c, T));
  if (!ts.length) return;
  const [c] = yield* g.chooseCards(p, ts, 0, 1, '廃棄する財宝（任意）', 'trash');
  if (!c) return;
  const cost = g.cost(c);
  g.trash(p, c);
  const n = yield* g.choosePile(p, g.gainable(cost + 3, (x) => g.isType(x, T)), `コスト${cost + 3}以下の財宝を手札に獲得`, 'gain');
  if (n) g.gain(p, n, 'hand');
}, { set: 'base' });

def('base2_sentry', 'Sentry', '衛兵', 5, [A], '+1カード +1アクション。山札の上2枚を見て、好きな枚数を廃棄・捨て、残りを好きな順で山札の上に戻す。', function* (g, p) {
  g.draw(p, 1); g.t.actions += 1;
  const look = [];
  for (let i = 0; i < 2; i++) { const c = g.takeTop(p); if (c) look.push(c); }
  if (!look.length) return;
  let rest = look.slice();
  const tr = yield* g.chooseCards(p, rest, 0, rest.length, `山札の上${look.length}枚：廃棄するカード（任意）`, 'trash');
  for (const c of tr) g.trash(p, c);
  rest = rest.filter((c) => !tr.includes(c));
  if (rest.length) {
    const ds = yield* g.chooseCards(p, rest, 0, rest.length, '捨てるカード（任意）', 'discard');
    for (const c of ds) g.moveTo(p, c, 'discard');
    rest = rest.filter((c) => !ds.includes(c));
  }
  yield* g.orderToDeck(p, rest);
}, { set: 'base' });

def('base2_witch', 'Witch', '魔女', 5, [A, AT], '+2カード。他の各プレイヤーは呪いを1枚獲得する。', function* (g, p) {
  g.draw(p, 2);
  const imm = yield* g.beginAttack(p);
  for (const v of g.victims(p, imm)) g.gain(v, 'Curse');
}, { set: 'base' });

def('base2_artisan', 'Artisan', '職人', 6, [A], 'コスト5以下のカード1枚を手札に獲得する。その後、手札1枚を山札の上に置く。', function* (g, p) {
  const n = yield* g.choosePile(p, g.gainable(5), 'コスト5以下のカードを手札に獲得', 'gain');
  if (n) g.gain(p, n, 'hand');
  if (!p.hand.length) return;
  const [c] = yield* g.chooseCards(p, p.hand, 1, 1, '山札の上に置く手札', 'topdeck');
  g.moveTo(p, c, 'deck');
}, { set: 'base' });

// ---------- 陰謀 第2版 ----------
def('int2_courtyard', 'Courtyard', '中庭', 2, [A], '+3カード。手札1枚を山札の上に置く。', function* (g, p) {
  g.draw(p, 3);
  if (!p.hand.length) return;
  const [c] = yield* g.chooseCards(p, p.hand, 1, 1, '山札の上に置く手札', 'topdeck');
  g.moveTo(p, c, 'deck');
}, { set: 'intrigue' });

def('int2_lurker', 'Lurker', '待ち伏せ', 2, [A], '+1アクション。次から1つ選ぶ：サプライのアクション1枚を廃棄する／廃棄置き場のアクション1枚を獲得する。', function* (g, p) {
  g.t.actions += 1;
  const supplyActs = g.pileNames().filter((n) => g.pile(n).length && g.isType(g.def(n), A));
  const trashActs = g.trashPile.filter((c) => g.isType(c, A));
  const opts = [];
  if (supplyActs.length) opts.push({ id: 'trash', label: 'サプライのアクションを廃棄' });
  if (trashActs.length) opts.push({ id: 'gain', label: '廃棄置き場のアクションを獲得' });
  if (!opts.length) return;
  const o = yield* g.chooseOption(p, opts, '待ち伏せ：1つ選ぶ');
  if (o === 'trash') {
    const n = yield* g.choosePile(p, supplyActs, '廃棄するサプライのアクション', 'none', false, 1);
    const c = g.pile(n).pop(); g.trashPile.push(c);
    g.say(`${p.name}はサプライの${g.nm(c)}を廃棄した`);
  } else {
    const [c] = yield* g.chooseCards(p, trashActs, 1, 1, '獲得するアクション（廃棄置き場）', 'gain');
    g.trashPile.splice(g.trashPile.indexOf(c), 1); p.discard.push(c);
    g.say(`${p.name}は廃棄置き場から${g.nm(c)}を獲得した`);
  }
}, { set: 'intrigue' });

def('int2_pawn', 'Pawn', '手先', 2, [A], '次から異なる2つを選ぶ：+1カード／+1アクション／+1購入／+1コイン。', function* (g, p) {
  const opts = [{ id: 'card', label: '+1カード' }, { id: 'action', label: '+1アクション' }, { id: 'buy', label: '+1購入' }, { id: 'coin', label: '+1コイン' }];
  const ch = yield* g.chooseOptions(p, opts, 2, '異なる2つを選ぶ');
  for (const o of ch) {
    if (o === 'card') g.draw(p, 1); if (o === 'action') g.t.actions += 1;
    if (o === 'buy') g.t.buys += 1; if (o === 'coin') g.t.coins += 1;
  }
}, { set: 'intrigue' });

def('int2_masquerade', 'Masquerade', '仮面舞踏会', 3, [A], '+2カード。各プレイヤーは手札1枚を左隣に渡す。その後、手札1枚を廃棄してもよい。', function* (g, p) {
  g.draw(p, 2);
  const order = g.orderFrom(p);
  const picks = [];
  for (const q of order) {
    if (!q.hand.length) continue;
    const [c] = yield* g.chooseCards(q, q.hand, 1, 1, '左隣に渡すカードを選ぶ', 'pass');
    picks.push([q, c]);
  }
  for (const [q, c] of picks) {
    const left = g.leftOf(q);
    g.moveTo(q, c, 'aside', true);
    c._to = left;
  }
  for (const [q, c] of picks) { const to = c._to; delete c._to; q.aside.splice(q.aside.indexOf(c), 1); to.hand.push(c); }
  g.say('各プレイヤーはカードを左隣に渡した');
  if (p.hand.length) {
    const [t] = yield* g.chooseCards(p, p.hand, 0, 1, '廃棄する手札（任意）', 'trash');
    if (t) g.trash(p, t);
  }
}, { set: 'intrigue' });

def('int2_shanty_town', 'Shanty Town', 'スラム街', 3, [A], '+2アクション。手札を公開する。アクションがなければ+2カード。', function* (g, p) {
  g.t.actions += 2;
  g.say(`${p.name}は手札を公開した：${g.names(p.hand) || '（なし）'}`);
  if (!p.hand.some((c) => g.isType(c, A))) g.draw(p, 2);
}, { set: 'intrigue' });

def('int2_steward', 'Steward', '執事', 3, [A], '次から1つ選ぶ：+2カード／+2コイン／手札2枚を廃棄。', function* (g, p) {
  const o = yield* g.chooseOption(p, [{ id: 'card', label: '+2カード' }, { id: 'coin', label: '+2コイン' }, { id: 'trash', label: '手札2枚を廃棄' }], '執事：1つ選ぶ');
  if (o === 'card') g.draw(p, 2);
  else if (o === 'coin') g.t.coins += 2;
  else {
    const n = Math.min(2, p.hand.length);
    const cs = yield* g.chooseCards(p, p.hand, n, n, '廃棄する手札2枚', 'trash');
    for (const c of cs) g.trash(p, c);
  }
}, { set: 'intrigue' });

def('int2_swindler', 'Swindler', '詐欺師', 3, [A, AT], '+2コイン。他の各プレイヤーは山札の上を廃棄し、それと同コストのカードをあなたが選んで獲得させる。', function* (g, p) {
  g.t.coins += 2;
  const imm = yield* g.beginAttack(p);
  for (const v of g.victims(p, imm)) {
    const c = g.takeTop(v);
    if (!c) continue;
    g.trash(v, c);
    const cost = g.cost(c);
    g.say(`${v.name}は山札の上の${g.nm(c)}を廃棄した`);
    const names = g.pileNames().filter((n) => g.pile(n).length && g.cost(g.def(n)) === cost);
    const n = yield* g.choosePile(p, names, `${v.name}に獲得させるコスト${cost}のカード`, 'swindle');
    if (n) g.gain(v, n);
  }
}, { set: 'intrigue' });

def('int2_wishing_well', 'Wishing Well', '願いの井戸', 3, [A], '+1カード +1アクション。カード名を1つ宣言し、山札の上を公開する。同じなら手札に加える。', function* (g, p) {
  g.draw(p, 1); g.t.actions += 1;
  const n = yield* g.choosePile(p, g.pileNames(), '宣言するカード名', 'name', false, 1);
  const c = g.takeTop(p);
  if (!c) { g.say(`${p.name}は${g.defOf(n).name_ja}を宣言したが、山札がない`); return; }
  g.say(`${p.name}は${g.defOf(n).name_ja}を宣言し、${g.nm(c)}を公開した`);
  g.moveTo(p, c, c.name === n ? 'hand' : 'deck', true);
}, { set: 'intrigue' });

def('int2_baron', 'Baron', '男爵', 4, [A], '+1購入。手札の屋敷を捨ててもよい。捨てたら+4コイン。捨てなければ屋敷を1枚獲得する。', function* (g, p) {
  g.t.buys += 1;
  const e = p.hand.find((c) => c.name === 'Estate');
  if (e) {
    const ok = yield* g.yesNo(p, '屋敷を捨てて+4コインを得ますか？（いいえで屋敷を獲得）', true);
    if (ok) { g.discard(p, e); g.t.coins += 4; return; }
  }
  g.gain(p, 'Estate');
}, { set: 'intrigue' });

def('int2_bridge', 'Bridge', '橋', 4, [A], '+1購入 +1コイン。このターン、全カードのコストが1コイン少なくなる（最小0）。', function* (g, p) {
  g.t.buys += 1; g.t.coins += 1; g.t.reduce += 1;
}, { set: 'intrigue' });

def('int2_conspirator', 'Conspirator', '共謀者', 4, [A], '+2コイン。このターンにアクションを3枚以上プレイしていたら（これを含む）+1カード +1アクション。', function* (g, p) {
  g.t.coins += 2;
  if (g.t.actionsPlayed >= 3) { g.draw(p, 1); g.t.actions += 1; }
}, { set: 'intrigue' });

def('int2_diplomat', 'Diplomat', '外交官', 4, [A, R], '+2カード。この後手札が5枚以下なら+2アクション。（手札5枚以上で他人のアタック時に公開し、2枚引いて3枚捨てられる。）', function* (g, p) {
  g.draw(p, 2);
  if (p.hand.length <= 5) g.t.actions += 2;
}, { set: 'intrigue', reaction: 'diplomat' });

def('int2_ironworks', 'Ironworks', '製鉄所', 4, [A], 'コスト4以下のカード1枚を獲得する。獲得したカードがアクションなら+1アクション、財宝なら+1コイン、勝利点なら+1カード（複数タイプなら全て）。', function* (g, p) {
  const n = yield* g.choosePile(p, g.gainable(4), 'コスト4以下のカードを獲得', 'gain');
  if (!n) return;
  const c = g.gain(p, n);
  if (!c) return;
  if (g.isType(c, A)) g.t.actions += 1;
  if (g.isType(c, T)) g.t.coins += 1;
  if (g.isType(c, V)) g.draw(p, 1);
}, { set: 'intrigue' });

def('int2_mill', 'Mill', '製粉所', 4, [A, V], '+1カード +1アクション。手札2枚を捨ててもよい。捨てたら+2コイン。1勝利点。', function* (g, p) {
  g.draw(p, 1); g.t.actions += 1;
  if (p.hand.length < 2) return;
  const cs = yield* g.chooseCards(p, p.hand, 0, 2, '捨てる手札2枚（任意：捨てなければ0枚）', 'discard', [0, 2]);
  if (cs.length === 2) { for (const c of cs) g.discard(p, c); g.t.coins += 2; }
}, { set: 'intrigue', vp: () => 1 });

def('int2_mining_village', 'Mining Village', '鉱山の村', 4, [A], '+1カード +2アクション。これを廃棄してもよい。廃棄したら+2コイン。', function* (g, p, ctx) {
  g.draw(p, 1); g.t.actions += 2;
  if (!p.play.includes(ctx.card)) return;
  const ok = yield* g.yesNo(p, '鉱山の村を廃棄して+2コインを得ますか？', false);
  if (ok) { g.trash(p, ctx.card); g.t.coins += 2; }
}, { set: 'intrigue' });

def('int2_secret_passage', 'Secret Passage', '秘密の通路', 4, [A], '+2カード +1アクション。手札1枚を山札の好きな位置に入れる。', function* (g, p) {
  g.draw(p, 2); g.t.actions += 1;
  if (!p.hand.length) return;
  const [c] = yield* g.chooseCards(p, p.hand, 1, 1, '山札に入れる手札', 'topdeck');
  const k = yield* g.chooseNumber(p, 0, p.deck.length, `入れる位置（0=一番上、${p.deck.length}=一番下）`, 0);
  g.removeAny(p, c);
  p.deck.splice(p.deck.length - k, 0, c);
}, { set: 'intrigue' });

def('int2_courtier', 'Courtier', '廷臣', 5, [A], '手札1枚を公開する。そのカードのタイプ1つにつき、異なる効果を1つ選ぶ：+1アクション／+1購入／+3コイン／金貨を獲得。', function* (g, p) {
  if (!p.hand.length) return;
  const [c] = yield* g.chooseCards(p, p.hand, 1, 1, '公開する手札', 'reveal');
  const n = Math.min(c.types.length, 4);
  g.say(`${p.name}は${g.nm(c)}を公開した（タイプ${c.types.length}）`);
  const opts = [{ id: 'action', label: '+1アクション' }, { id: 'buy', label: '+1購入' }, { id: 'coin', label: '+3コイン' }, { id: 'gold', label: '金貨を獲得' }];
  const ch = yield* g.chooseOptions(p, opts, n, `${n}つ選ぶ`);
  for (const o of ch) {
    if (o === 'action') g.t.actions += 1; if (o === 'buy') g.t.buys += 1;
    if (o === 'coin') g.t.coins += 3; if (o === 'gold') g.gain(p, 'Gold');
  }
}, { set: 'intrigue' });

def('int2_duke', 'Duke', '公爵', 5, [V], '自分の公領1枚につき1勝利点。', null, { set: 'intrigue', vp: (cards) => cards.filter((c) => c.name === 'Duchy').length });

def('int2_minion', 'Minion', '寵臣', 5, [A, AT], '+1アクション。次から1つ選ぶ：+2コイン／手札を捨て+4カードし、手札5枚以上の他プレイヤーも手札を捨てて4枚引く。', function* (g, p) {
  g.t.actions += 1;
  const imm = yield* g.beginAttack(p);
  const o = yield* g.chooseOption(p, [{ id: 'coin', label: '+2コイン' }, { id: 'attack', label: '手札を捨て+4カード／アタック' }], '寵臣：1つ選ぶ');
  if (o === 'coin') { g.t.coins += 2; return; }
  for (const c of p.hand.slice()) g.discard(p, c);
  g.draw(p, 4);
  for (const v of g.victims(p, imm)) {
    if (v.hand.length < 5) continue;
    for (const c of v.hand.slice()) g.discard(v, c);
    g.draw(v, 4);
    g.say(`${v.name}は手札を捨てて4枚引いた`);
  }
}, { set: 'intrigue' });

def('int2_patrol', 'Patrol', '巡回', 5, [A], '+3カード。山札の上4枚を公開し、勝利点カードと呪いを手札に加える。残りは好きな順で山札の上に戻す。', function* (g, p) {
  g.draw(p, 3);
  const rev = [];
  for (let i = 0; i < 4; i++) { const c = g.takeTop(p); if (c) rev.push(c); }
  if (rev.length) g.say(`${p.name}は山札の上を公開した：${g.names(rev)}`);
  const rest = [];
  for (const c of rev) {
    if (g.isType(c, V) || g.isType(c, 'Curse')) g.moveTo(p, c, 'hand', true); else rest.push(c);
  }
  yield* g.orderToDeck(p, rest);
}, { set: 'intrigue' });

def('int2_replace', 'Replace', '取り替え', 5, [A, AT], '手札1枚を廃棄し、コスト+2以下のカードを獲得する。アクションか財宝なら山札の上に、勝利点なら他の各プレイヤーが呪いを獲得。', function* (g, p) {
  const imm = yield* g.beginAttack(p);
  if (!p.hand.length) return;
  const [c] = yield* g.chooseCards(p, p.hand, 1, 1, '廃棄する手札', 'trash');
  const cost = g.cost(c);
  g.trash(p, c);
  const n = yield* g.choosePile(p, g.gainable(cost + 2), `コスト${cost + 2}以下のカードを獲得`, 'gain');
  if (!n) return;
  const d = g.defOf(n);
  const isAT = g.isType(d, A) || g.isType(d, T);
  g.gain(p, n, isAT ? 'deck' : 'discard');
  if (g.isType(d, V)) for (const v of g.victims(p, imm)) g.gain(v, 'Curse');
}, { set: 'intrigue' });

def('int2_torturer', 'Torturer', '拷問人', 5, [A, AT], '+3カード。他の各プレイヤーは、手札2枚を捨てるか、呪いを手札に獲得するかを選ぶ。', function* (g, p) {
  g.draw(p, 3);
  const imm = yield* g.beginAttack(p);
  for (const v of g.victims(p, imm)) {
    const o = yield* g.chooseOption(v, [{ id: 'discard', label: '手札2枚を捨てる' }, { id: 'curse', label: '呪いを手札に獲得' }], '拷問人：1つ選ぶ', v.hand.length >= 2 ? 'discard' : 'curse');
    if (o === 'discard') {
      const n = Math.min(2, v.hand.length);
      const cs = yield* g.chooseCards(v, v.hand, n, n, '捨てる手札2枚', 'discard');
      for (const c of cs) g.discard(v, c);
      g.say(`${v.name}は${n}枚捨てた`);
    } else g.gain(v, 'Curse', 'hand');
  }
}, { set: 'intrigue' });

def('int2_trading_post', 'Trading Post', '交易場', 5, [A], '手札2枚を廃棄する。2枚廃棄したら銀貨1枚を手札に獲得する。', function* (g, p) {
  const n = Math.min(2, p.hand.length);
  if (!n) return;
  const cs = yield* g.chooseCards(p, p.hand, n, n, '廃棄する手札2枚', 'trash');
  for (const c of cs) g.trash(p, c);
  if (cs.length === 2) g.gain(p, 'Silver', 'hand');
}, { set: 'intrigue' });

def('int2_upgrade', 'Upgrade', '改良', 5, [A], '+1カード +1アクション。手札1枚を廃棄し、コストがちょうど1多いカードを獲得する。', function* (g, p) {
  g.draw(p, 1); g.t.actions += 1;
  if (!p.hand.length) return;
  const [c] = yield* g.chooseCards(p, p.hand, 1, 1, '廃棄する手札', 'trash');
  const cost = g.cost(c);
  g.trash(p, c);
  const n = yield* g.choosePile(p, g.gainable(cost + 1, null, true), `コスト${cost + 1}ちょうどのカードを獲得`, 'gain');
  if (n) g.gain(p, n);
}, { set: 'intrigue' });

def('int2_harem', 'Harem', 'ハーレム', 6, [T, V], '+2コイン。2勝利点。', null, { set: 'intrigue', coins: 2, vp: () => 2 });

def('int2_nobles', 'Nobles', '貴族', 6, [A, V], '次から1つ選ぶ：+3カード／+2アクション。2勝利点。', function* (g, p) {
  const o = yield* g.chooseOption(p, [{ id: 'card', label: '+3カード' }, { id: 'action', label: '+2アクション' }], '貴族：1つ選ぶ');
  if (o === 'card') g.draw(p, 3); else g.t.actions += 2;
}, { set: 'intrigue', vp: () => 2 });

export const SETS = {
  base: { name_ja: '基本セット 第2版', cards: Object.values(CARDS).filter((c) => c.set === 'base').map((c) => c.name) },
  intrigue: { name_ja: '陰謀 第2版', cards: Object.values(CARDS).filter((c) => c.set === 'intrigue').map((c) => c.name) },
};

export const KINGDOM_COUNT = Object.values(CARDS).filter((c) => c.set === 'base' || c.set === 'intrigue').length;
