import { CARDS, SETS, SRC, KINGDOM_COUNT } from './cards.js';
import { randomKingdom } from './engine.js';
import { LocalSession } from './local.js';
import { OnlineSession } from './net.js';
import { isConfigured } from './firebase-config.js';

const $app = document.getElementById('app');
const $modal = document.getElementById('modal');
const $toast = document.getElementById('toast');
const TY = { Action: 'アクション', Treasure: '財宝', Victory: '勝利点', Curse: '呪い', Attack: 'アタック', Reaction: 'リアクション' };
const SETNAME = { basic: '基本カード', base: '基本セット 第2版', intrigue: '陰謀 第2版' };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

const S = {
  screen: 'title', name: lsGet('dom_name', ''), session: null, online: false, err: '',
  setup: { bots: 1, mode: 'random', sets: { base: true, intrigue: true }, manual: [] },
  sel: new Set(), selSeq: -1, sentSeq: -1, joinCode: '',
};

function toast(msg) { $toast.textContent = msg; $toast.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => ($toast.hidden = true), 2600); }

// ---------------- カード表示 ----------------
function typeClass(d) {
  const t = d.types;
  if (t.includes('Treasure') && t.includes('Victory')) return 't-tv';
  if (t.includes('Action') && t.includes('Victory')) return 't-av';
  if (t.includes('Curse')) return 't-curse';
  if (t.includes('Treasure')) return 't-treasure';
  if (t.includes('Victory')) return 't-victory';
  if (t.includes('Reaction')) return 't-reaction';
  return 't-action';
}
function cardHtml(name, o = {}) {
  const d = CARDS[name];
  const cost = Math.max(0, d.cost - (o.reduce || 0));
  const cls = ['card', typeClass(d), d.types.includes('Attack') ? 'attack' : '', o.cls || ''].join(' ');
  return `<div class="${cls}" data-name="${esc(name)}" ${o.id != null ? `data-id="${o.id}"` : ''} ${o.act ? `data-act="${o.act}"` : ''} title="${esc(d.name_ja + '：' + d.summary_ja)}">
    <span class="cost">${cost}</span><b class="nm">${esc(d.name_ja)}</b>
    <i class="ty">${d.types.map((t) => TY[t]).join('・')}</i><p class="sm">${esc(d.summary_ja)}</p>
    ${o.count != null ? `<span class="cnt">${o.count}</span>` : ''}<button class="info" data-info="${esc(name)}" aria-label="詳細">i</button></div>`;
}
function showCardModal(name) {
  const d = CARDS[name];
  $modal.hidden = false;
  $modal.innerHTML = `<div class="dlg"><h2>${esc(d.name_ja)} <span class="mute">${esc(d.name_en || d.name)}</span></h2>
  <p>コスト：<b>${d.cost}</b>　タイプ：${d.types.map((t) => TY[t]).join(' / ')}　収録：${SETNAME[d.set]}</p>
  <p>${esc(d.summary_ja)}</p>
  <p class="mute">カードID：${d.id}<br>確度：<span class="badge warn">${SRC.confidence}</span>（${esc(SRC.note)}）<br>確認日：${SRC.checked_at}／根拠種別：${SRC.evidence_type}</p>
  <div class="row"><button class="sec" data-close>閉じる</button></div></div>`;
}
function listModal(title, names) {
  const cnt = {}; names.forEach((n) => (cnt[n] = (cnt[n] || 0) + 1));
  $modal.hidden = false;
  $modal.innerHTML = `<div class="dlg"><h2>${esc(title)}（${names.length}枚）</h2>
  <div class="mini">${Object.entries(cnt).map(([n, c]) => `<span>${esc(CARDS[n].name_ja)} ×${c}</span>`).join('') || '<span>なし</span>'}</div>
  <div class="row" style="margin-top:12px"><button class="sec" data-close>閉じる</button></div></div>`;
}

// ---------------- 画面：タイトル ----------------
function titleScreen() {
  const save = LocalSession.loadSave();
  const room = JSON.parse(lsGet('dom_room', 'null'));
  return `<div class="wrap">
  <div class="title"><h1>DOMINION</h1><div class="mute">ブラウザで遊べるドミニオン（日本語）</div></div>
  <div class="panel"><h3>プレイヤー名</h3>
    <div class="row"><input id="name" maxlength="12" placeholder="あなたの名前" value="${esc(S.name)}"></div></div>
  <div class="panel"><h3>遊ぶ</h3><div class="row">
    <button data-go="setup-local">ひとりで遊ぶ（ボット対戦）</button>
    ${save ? '<button class="sec" data-go="resume-local">前回の続きから</button>' : ''}
    <button class="sec" data-go="online-menu">オンライン対戦</button>
    ${room ? `<button class="sec" data-go="rejoin">部屋 ${esc(room.code)} に戻る</button>` : ''}
  </div></div>
  <div class="panel"><h3>対応範囲</h3>
    <p>基本セット第2版（王国カード26種）＋陰謀第2版（26種）＝<b>${KINGDOM_COUNT}種</b>に対応。2〜4人。</p>
    <p class="mute">公式拡張のうち残りの14種（海辺〜日出）は未対応です。カード効果は公式資料との個別照合が未完了のため、全カードを <span class="badge warn">needs_review</span> として表示しています（カードの「i」ボタンで確認できます）。「全カード完全対応」ではありません。</p></div>
  </div>`;
}

// ---------------- 画面：セットアップ ----------------
function kingdomPanel() {
  const s = S.setup;
  const pool = Object.keys(s.sets).filter((k) => s.sets[k]).flatMap((k) => SETS[k].cards);
  const manual = s.mode === 'manual';
  return `<div class="panel"><h3>王国カード</h3>
  <div class="row"><label><input type="radio" name="kmode" value="random" ${!manual ? 'checked' : ''}> ランダム10種</label>
  <label><input type="radio" name="kmode" value="manual" ${manual ? 'checked' : ''}> 自分で10種選ぶ（${s.manual.length}/10）</label></div>
  <div class="row" style="margin:8px 0">使用するセット：
    ${Object.keys(SETS).map((k) => `<label><input type="checkbox" data-set="${k}" ${s.sets[k] ? 'checked' : ''}> ${SETS[k].name_ja}</label>`).join('')}</div>
  ${manual ? `<div class="kgrid">${pool.slice().sort((a, b) => CARDS[a].cost - CARDS[b].cost).map((n) => `<div class="kitem ${s.manual.includes(n) ? 'on' : ''}" data-pick="${esc(n)}"><b>${CARDS[n].cost}</b> ${esc(CARDS[n].name_ja)}</div>`).join('')}</div>` : `<p class="mute">選択中のセットから${pool.length}種中10種をランダムに選びます。</p>`}
  </div>`;
}
function resolveKingdom() {
  const s = S.setup;
  const pool = Object.keys(s.sets).filter((k) => s.sets[k]).flatMap((k) => SETS[k].cards);
  if (s.mode === 'manual') { if (s.manual.length !== 10) throw new Error('王国カードをちょうど10種選んでください'); return s.manual.slice(); }
  if (pool.length < 10) throw new Error('セットを選んでください（10種以上必要）');
  return randomKingdom(pool, (Math.random() * 2 ** 32) >>> 0);
}
function setupLocalScreen() {
  return `<div class="wrap"><h2>ひとりで遊ぶ</h2>
  <div class="panel"><h3>対戦相手（ボット）</h3><div class="row">
    ${[1, 2, 3].map((n) => `<label><input type="radio" name="bots" value="${n}" ${S.setup.bots === n ? 'checked' : ''}> ${n}人</label>`).join('')}</div></div>
  ${kingdomPanel()}
  ${S.err ? `<div class="panel" style="color:var(--bad)">${esc(S.err)}</div>` : ''}
  <div class="row"><button data-go="start-local">ゲーム開始</button><button class="sec" data-go="title">戻る</button></div></div>`;
}
function onlineMenuScreen() {
  return `<div class="wrap"><h2>オンライン対戦</h2>
  ${isConfigured() ? '' : `<div class="panel" style="border:1px solid var(--bad)"><b>Firebase が未設定です。</b><br>js/firebase-config.js に Firebase の設定値を入れて公開してください（手順は README.md）。設定前でも「ひとりで遊ぶ」は使えます。</div>`}
  <div class="panel"><h3>部屋を作る</h3><button data-go="create-room" ${isConfigured() ? '' : 'disabled'}>部屋を作成</button></div>
  <div class="panel"><h3>部屋コードで参加</h3><div class="row"><input id="code" maxlength="5" placeholder="ABCDE" value="${esc(S.joinCode)}" style="text-transform:uppercase;width:130px"><button data-go="join-room" ${isConfigured() ? '' : 'disabled'}>参加</button></div></div>
  ${S.err ? `<div class="panel" style="color:var(--bad)">${esc(S.err)}</div>` : ''}
  <button class="sec" data-go="title">戻る</button></div>`;
}
function lobbyScreen() {
  const ss = S.session, m = ss.meta;
  if (!m) return `<div class="wrap"><p>接続中…</p></div>`;
  const ps = Object.entries(m.players || {}).map(([id, p]) => ({ id, ...p })).sort((a, b) => a.seat - b.seat);
  return `<div class="wrap"><h2>ロビー</h2>
  <div class="panel"><div class="mute">部屋コード（友達に伝えてください）</div><div class="code">${esc(ss.code)}</div>
   <div class="mute">参加者はこのコードを「オンライン対戦 → 部屋コードで参加」に入力します。</div></div>
  <div class="panel"><h3>参加者（${ps.length}/4）</h3>
   ${ps.map((p) => `<div class="row" style="margin:4px 0"><span class="pill">${esc(p.name)}${p.bot ? '（ボット）' : ''}${p.host ? '（ホスト）' : ''}${p.id === ss.uid ? '（あなた）' : ''}</span>${ss.isHost && !p.host ? `<button class="sec" data-kick="${esc(p.id)}">外す</button>` : ''}</div>`).join('')}
   ${ss.isHost ? `<div class="row" style="margin-top:8px"><button class="sec" data-go="add-bot" ${ps.length >= 4 ? 'disabled' : ''}>ボットを追加</button></div>` : '<p class="mute">ホストの開始を待っています…</p>'}</div>
  ${ss.isHost ? kingdomPanel() : ''}
  ${S.err ? `<div class="panel" style="color:var(--bad)">${esc(S.err)}</div>` : ''}
  ${ss.isHost ? `<div class="row"><button data-go="start-online" ${ps.length < 2 ? 'disabled' : ''}>ゲーム開始</button><button class="sec" data-go="leave">退出</button></div>` : '<button class="sec" data-go="leave">退出</button>'}
  </div>`;
}

// ---------------- 画面：ゲーム ----------------
function selValid(req) {
  const n = S.sel.size;
  if (req.kind === 'cards') return req.counts ? req.counts.includes(n) : n >= req.min && n <= req.max;
  if (req.kind === 'pile') return req.optional || n === 1;
  if (req.kind === 'options') return n === req.n;
  return true;
}
function gameScreen() {
  const ss = S.session, v = ss.view, pv = ss.privView, me = ss.me;
  if (!v) return `<div class="wrap"><p>ゲームを読み込み中…</p>${ss.isHost ? '' : ''}</div>`;
  const req = pv && pv.req;
  if (pv && S.selSeq !== pv.seq) { S.sel = new Set(); S.selSeq = pv.seq; }
  const myTurn = v.cur === me;
  const t = v.t;
  const reduce = t ? t.reduce : 0;
  const curP = v.players.find((p) => p.id === v.cur);
  const mine = v.players.find((p) => p.id === me);
  const turnReq = req && req.kind === 'turn';
  const sent = pv && S.sentSeq === pv.seq;

  const canBuy = (n, count) => turnReq && t && !sent && count > 0 && t.buys > 0 && t.coins >= Math.max(0, CARDS[n].cost - reduce);
  const pileReq = req && req.kind === 'pile';
  const sup = (list) => list.map((s) => {
    let cls = s.count === 0 ? 'empty' : '', act = '';
    if (canBuy(s.name, s.count)) { cls += ' clickable ok'; act = 'buy'; }
    if (pileReq && req.piles.includes(s.name) && !sent) { cls += ' clickable ' + (S.sel.has(s.name) ? 'sel' : 'ok'); act = 'pile'; }
    return cardHtml(s.name, { count: s.count, reduce, cls, act });
  }).join('');
  const basics = v.supply.filter((s) => CARDS[s.name].set === 'basic');
  const kingdom = v.supply.filter((s) => CARDS[s.name].set !== 'basic');

  const sortHand = (pv ? pv.hand : []).slice().sort((a, b) => CARDS[a.name].types.join().localeCompare(CARDS[b.name].types.join()) || CARDS[a.name].cost - CARDS[b.name].cost || a.name.localeCompare(b.name));
  const handHtml = sortHand.map((c) => {
    const d = CARDS[c.name];
    let cls = '', act = '';
    if (turnReq && !sent) {
      if (d.types.includes('Action') && t.phase === 'action' && t.actions > 0) { cls = 'clickable ok'; act = 'play'; }
      else if (d.types.includes('Treasure')) { cls = 'clickable ok'; act = 'treasure'; }
      else cls = 'dim';
    }
    return cardHtml(c.name, { id: c.id, cls, act });
  }).join('');

  // 選択待ちパネル
  let prompt = '';
  if (v.over) prompt = '';
  else if (req && req.kind === 'turn') {
    const anyT = pv.hand.some((c) => CARDS[c.name].types.includes('Treasure'));
    prompt = `<div class="prompt"><h3>あなたの番（${t.phase === 'action' ? 'アクションフェーズ' : '購入フェーズ'}）</h3>
      <div class="mute" style="margin-bottom:8px">手札のカードをタップしてプレイ／緑枠のサプライをタップして購入</div>
      <div class="row">
      ${anyT ? '<button data-send="allTreasures">財宝をすべてプレイ</button>' : ''}
      ${t.phase === 'action' ? '<button class="sec" data-send="endActions">購入フェーズへ</button>' : ''}
      <button class="sec" data-send="end">ターン終了</button></div></div>`;
  } else if (req) {
    let body = '';
    if (req.kind === 'cards') {
      body = `<div class="mute">${req.counts ? `${req.counts.join('または')}枚選ぶ` : req.min === req.max ? `${req.min}枚選ぶ` : `${req.min}〜${req.max}枚選ぶ`}（選択中：${S.sel.size}）</div>
        <div class="hand" style="margin:8px 0">${req.cards.map((c) => cardHtml(c.name, { id: c.id, act: 'cardsel', cls: 'clickable ' + (S.sel.has(c.id) ? 'sel' : '') })).join('')}</div>
        <div class="row"><button data-confirm ${selValid(req) && !sent ? '' : 'disabled'}>${S.sel.size === 0 && req.min === 0 ? '選ばずに進む' : '決定'}</button></div>`;
    } else if (req.kind === 'pile') {
      body = `<div class="mute">サプライから選びます（下のサプライの緑枠をタップ）。選択中：${S.sel.size ? esc(CARDS[[...S.sel][0]].name_ja) : 'なし'}</div>
        <div class="row" style="margin-top:8px"><button data-confirm ${selValid(req) && !sent ? '' : 'disabled'}>決定</button></div>`;
    } else if (req.kind === 'option') {
      body = `<div class="row">${req.options.map((o) => `<button data-opt="${esc(o.id)}" ${sent ? 'disabled' : ''}>${esc(o.label)}</button>`).join('')}</div>`;
    } else if (req.kind === 'options') {
      body = `<div class="row">${req.options.map((o) => `<button class="${S.sel.has(o.id) ? '' : 'sec'}" data-optm="${esc(o.id)}">${S.sel.has(o.id) ? '✓ ' : ''}${esc(o.label)}</button>`).join('')}</div>
        <div class="row" style="margin-top:8px"><button data-confirm ${selValid(req) && !sent ? '' : 'disabled'}>決定</button><span class="mute">${req.n}つ選ぶ</span></div>`;
    } else if (req.kind === 'number') {
      const val = S.num != null && S.numSeq === pv.seq ? S.num : req.def || 0;
      body = `<div class="row"><input type="range" id="num" min="${req.min}" max="${req.max}" value="${val}" style="flex:1"><b id="numv">${val}</b><button data-confirm-num>決定</button></div>`;
    }
    prompt = `<div class="prompt"><h3>${esc(req.prompt)}</h3>${body}</div>`;
  } else if (v.pending) {
    const who = v.players.find((p) => p.id === v.pending.pid);
    prompt = `<div class="prompt"><h3>${esc(who ? who.name : '')} の操作を待っています…</h3><div class="mute">${esc(v.pending.prompt || '')}</div></div>`;
  }

  const results = v.over ? resultsHtml(v) : '';
  const opps = v.players.filter((p) => p.id !== me).map((p) => `<div class="oppc ${p.id === v.cur && !v.over ? 'cur' : ''}">
    <b>${esc(p.name)}</b>${p.bot ? ' <span class="badge">BOT</span>' : ''} <span class="mute">ターン${p.turns}</span>
    <div class="mute">手札${p.hand}　山札${p.deck}　捨て札${p.discard.length}${ss.isHost && !p.bot && ss.game ? ` <button class="sec" style="padding:2px 8px;font-size:11px" data-botify="${esc(p.id)}">ボットに交代</button>` : ''}</div>
    <div class="mini">${p.play.map((n) => `<span>${esc(CARDS[n].name_ja)}</span>`).join('')}</div></div>`).join('');

  return `<div class="hud">
    <span class="turnflag ${myTurn ? 'me' : ''}">${v.over ? 'ゲーム終了' : myTurn ? 'あなたの番' : esc(curP.name) + 'の番'}</span>
    ${t && !v.over ? `<div class="res"><span class="pill">アクション <b>${t.actions}</b></span><span class="pill">購入 <b>${t.buys}</b></span><span class="pill">コイン <b>${t.coins}</b></span></div>` : ''}
    <span class="mute">${ss.code ? '部屋 ' + esc(ss.code) : ''}</span>
    <span style="flex:1"></span>
    ${ss.speed ? `<button class="sec" data-go="speed">速度 ×${ss.speed}</button>` : ''}
    <button class="sec" data-trash>廃棄置き場 (${v.trash.length})</button>
    <button class="sec" data-go="quit">終了</button></div>
  <div class="wrap">
    ${results}
    <div class="opp">${opps}</div>
    <div class="cols"><div>
      ${myTurn || !req ? '' : ''}
      <div class="panel"><h3 style="margin-top:0">サプライ</h3>
        <div class="sup">${sup(basics)}</div><hr style="border-color:#46607f55;margin:10px 0">
        <div class="sup">${sup(kingdom)}</div></div>
      <div class="panel"><h3 style="margin-top:0">場（${mine.play.length}）</h3><div class="playarea">${mine.play.map((n) => cardHtml(n)).join('') || '<span class="mute">なし</span>'}</div></div>
    </div><div>
      <div class="panel"><h3 style="margin-top:0">ログ</h3><div class="log" id="log">${v.log.map((l) => `<div class="${l.startsWith('──') ? 'sep' : ''}">${esc(l)}</div>`).join('')}</div></div>
      <div class="panel mute">あなたの山札 ${mine.deck}枚／<a href="#" data-discard style="color:var(--accent)">捨て札 ${mine.discard.length}枚</a></div>
    </div></div>
    <div class="sticky-prompt">${prompt}
      <div class="panel" style="margin-bottom:0"><h3 style="margin-top:0">手札（${sortHand.length}）</h3><div class="hand">${handHtml || '<span class="mute">なし</span>'}</div></div></div>
  </div>`;
}
function resultsHtml(v) {
  const r = v.results; const names = new Map(v.players.map((p) => [p.id, p.name]));
  const win = r.winners.map((id) => names.get(id)).join('、');
  return `<div class="panel" style="border:2px solid var(--accent)"><h2 class="win">🏆 勝者：${esc(win)}${r.winners.length > 1 ? '（引き分け）' : ''}</h2>
  <table class="sc"><tr><th>プレイヤー</th><th>得点</th><th>内訳</th><th>ターン</th><th>カード数</th></tr>
  ${r.rows.map((x) => `<tr class="${r.winners.includes(x.id) ? 'win' : ''}"><td>${esc(x.name)}</td><td>${x.vp}</td><td>${Object.entries(x.bd).map(([k, n]) => `${esc(k)} ${n}`).join('、')}</td><td>${x.turns}</td><td>${x.cards}</td></tr>`).join('')}</table>
  <div class="row" style="margin-top:10px"><button data-go="title">タイトルへ</button></div></div>`;
}

// ---------------- 描画とイベント ----------------
function render() {
  let h = '';
  switch (S.screen) {
    case 'title': h = titleScreen(); break;
    case 'setup-local': h = setupLocalScreen(); break;
    case 'online-menu': h = onlineMenuScreen(); break;
    case 'lobby': h = S.session && S.session.view && S.session.meta && S.session.meta.status !== 'lobby' ? ((S.screen = 'game'), gameScreen()) : lobbyScreen(); break;
    case 'game': h = gameScreen(); break;
  }
  const y = window.scrollY;
  const keepName = document.getElementById('name');
  const nameVal = keepName ? keepName.value : null;
  $app.innerHTML = h;
  if (nameVal != null && document.getElementById('name')) document.getElementById('name').value = nameVal;
  window.scrollTo(0, y);
  const log = document.getElementById('log'); if (log) log.scrollTop = log.scrollHeight;
}
function attachSession(ss, online) {
  S.session = ss; S.online = online;
  ss.onUpdate(() => {
    if (S.session !== ss) return;
    if (S.screen === 'lobby' && ss.view && ss.meta && ss.meta.status !== 'lobby') S.screen = 'game';
    render();
  });
}
function getName() { const el = document.getElementById('name'); if (el) { S.name = el.value.trim(); lsSet('dom_name', S.name); } return S.name || 'プレイヤー'; }

async function go(a, el) {
  S.err = '';
  try {
    switch (a) {
      case 'title': if (S.session) { S.session.close && S.session.close(); S.session = null; } S.screen = 'title'; break;
      case 'setup-local': getName(); S.screen = 'setup-local'; break;
      case 'start-local': {
        const name = getName();
        const kingdom = resolveKingdom();
        const players = [{ id: 'you', name }]; for (let i = 1; i <= S.setup.bots; i++) players.push({ id: 'bot' + i, name: `ボット${i}`, bot: true });
        const cfg = { seed: (Math.random() * 2 ** 32) >>> 0, players, kingdom };
        LocalSession.clearSave();
        const ss = new LocalSession(cfg); attachSession(ss, false); S.screen = 'game'; ss.start(); return;
      }
      case 'resume-local': {
        const sv = LocalSession.loadSave(); const ss = new LocalSession(sv.cfg, sv.answers); attachSession(ss, false); S.screen = 'game'; ss.start(); return;
      }
      case 'speed': S.session.speed = S.session.speed === 1 ? 2 : S.session.speed === 2 ? 4 : 1; break;
      case 'quit': if (confirm('ゲームを終了してタイトルに戻りますか？')) { S.session.close && S.session.close(); S.session = null; S.screen = 'title'; } break;
      case 'online-menu': getName(); S.screen = 'online-menu'; break;
      case 'create-room': {
        const ss = new OnlineSession(); attachSession(ss, true);
        await ss.create(getName(), {}); S.screen = 'lobby'; break;
      }
      case 'join-room': {
        S.joinCode = (document.getElementById('code').value || '').toUpperCase();
        const ss = new OnlineSession(); attachSession(ss, true);
        await ss.join(S.joinCode, getName()); S.screen = 'lobby'; break;
      }
      case 'rejoin': {
        const room = JSON.parse(lsGet('dom_room', 'null'));
        const ss = new OnlineSession(); attachSession(ss, true);
        await ss.join(room.code, getName()); S.screen = 'lobby'; break;
      }
      case 'add-bot': await S.session.addBot(); break;
      case 'start-online': await S.session.start(resolveKingdom()); break;
      case 'leave': {
        const ss = S.session; if (ss) { try { if (!ss.isHost) await ss.removePlayer(ss.uid); } catch {} ss.close(); }
        lsSet('dom_room', 'null'); S.session = null; S.screen = 'title'; break;
      }
    }
  } catch (e) { S.err = e.message || String(e); }
  render();
}

function send(ans) {
  const ss = S.session, pv = ss.privView;
  if (!pv || !pv.req || S.sentSeq === pv.seq) return;
  S.sentSeq = pv.seq;
  const r = ss.send(ans);
  if (r && r.ok === false) { S.sentSeq = -1; toast('その操作はできません'); }
  render();
}

document.addEventListener('click', (e) => {
  const t = e.target;
  if (t.closest('[data-close]') || t === $modal) { $modal.hidden = true; return; }
  const info = t.closest('[data-info]'); if (info) { e.stopPropagation(); showCardModal(info.dataset.info); return; }
  const g = t.closest('[data-go]'); if (g) { go(g.dataset.go, g); return; }
  const k = t.closest('[data-kick]'); if (k) { S.session.removePlayer(k.dataset.kick); return; }
  const bf = t.closest('[data-botify]'); if (bf) { if (confirm('このプレイヤーをボットに交代させますか？')) S.session.replaceWithBot(bf.dataset.botify); return; }
  if (t.closest('[data-trash]')) { listModal('廃棄置き場', S.session.view.trash); return; }
  const dc = t.closest('[data-discard]'); if (dc) { e.preventDefault(); const v = S.session.view; listModal('あなたの捨て札', v.players.find((p) => p.id === S.session.me).discard); return; }
  const sn = t.closest('[data-send]'); if (sn) {
    const k2 = sn.dataset.send; send({ t: k2 }); return;
  }
  const set = t.closest('[data-set]'); if (set) { S.setup.sets[set.dataset.set] = set.checked; S.setup.manual = S.setup.manual.filter((n) => Object.keys(S.setup.sets).some((s) => S.setup.sets[s] && SETS[s].cards.includes(n))); render(); return; }
  const pk = t.closest('[data-pick]'); if (pk) {
    const n = pk.dataset.pick, m = S.setup.manual, i = m.indexOf(n);
    if (i >= 0) m.splice(i, 1); else if (m.length < 10) m.push(n); else toast('10種までです');
    render(); return;
  }
  const km = t.closest('input[name=kmode]'); if (km) { S.setup.mode = km.value; render(); return; }
  const bt = t.closest('input[name=bots]'); if (bt) { S.setup.bots = +bt.value; return; }
  if (!S.session || !S.session.privView) return;
  const ss = S.session, pv = ss.privView, req = pv.req;
  const cardEl = t.closest('.card[data-act]');
  if (cardEl && req) {
    const act = cardEl.dataset.act;
    if (act === 'play') send({ t: 'play', id: +cardEl.dataset.id });
    else if (act === 'treasure') send({ t: 'treasure', id: +cardEl.dataset.id });
    else if (act === 'buy') send({ t: 'buy', pile: cardEl.dataset.name });
    else if (act === 'cardsel') {
      const id = +cardEl.dataset.id;
      if (S.sel.has(id)) S.sel.delete(id);
      else { if (req.max === 1) S.sel.clear(); if (S.sel.size < req.max) S.sel.add(id); }
      render();
    } else if (act === 'pile') { const n = cardEl.dataset.name; S.sel = S.sel.has(n) && req.optional ? new Set() : new Set([n]); render(); }
    return;
  }
  if (!req) return;
  const op = t.closest('[data-opt]'); if (op) { send(op.dataset.opt); return; }
  const om = t.closest('[data-optm]'); if (om) { const id = om.dataset.optm; if (S.sel.has(id)) S.sel.delete(id); else if (S.sel.size < req.n) S.sel.add(id); render(); return; }
  if (t.closest('[data-confirm]')) {
    if (req.kind === 'cards') send([...S.sel]);
    else if (req.kind === 'pile') send(S.sel.size ? [...S.sel][0] : null);
    else if (req.kind === 'options') send([...S.sel]);
    return;
  }
  if (t.closest('[data-confirm-num]')) { send(+document.getElementById('num').value); }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'num') { document.getElementById('numv').textContent = e.target.value; S.num = +e.target.value; S.numSeq = S.session.privView.seq; }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $modal.hidden = true; });

// 再読み込み後にオンライン部屋へ自動復帰する場合のため、デバッグ用に公開
window.__dominion = { S, render };
render();
