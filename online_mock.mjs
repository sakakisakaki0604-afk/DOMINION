// OnlineSession のホスト/ゲスト動作を、メモリ上のFirebaseモックで検証する（セキュリティルール自体は含まない）。
import { OnlineSession, __setFactory } from '../js/net.js';
import { CARDS, SETS } from '../js/cards.js';

const tree = {}; const subs = [];
const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const split = (p) => p.split('/').filter(Boolean);
const getAt = (path) => { let n = tree; for (const k of split(path)) { if (n == null || typeof n !== 'object') return undefined; n = n[k]; } return n; };
const setAt = (path, val) => {
  const ks = split(path); let n = tree;
  for (let i = 0; i < ks.length - 1; i++) { if (typeof n[ks[i]] !== 'object' || n[ks[i]] === null) n[ks[i]] = {}; n = n[ks[i]]; }
  if (val === null || val === undefined) delete n[ks[ks.length - 1]]; else n[ks[ks.length - 1]] = clone(val);
};
const fire = (path) => { for (const s of subs.slice()) if (s.path.startsWith(path) || path.startsWith(s.path)) setTimeout(() => s.cb({ val: () => clone(getAt(s.path)), exists: () => getAt(s.path) !== undefined }), 0); };
const D = {
  ref: (db, path = '') => ({ path }),
  get: async (r) => { const v = getAt(r.path); return { val: () => clone(v), exists: () => v !== undefined }; },
  set: async (r, v) => { if (JSON.stringify(v).includes('undefined')) throw new Error('undef'); setAt(r.path, v); fire(r.path); },
  remove: async (r) => { setAt(r.path, null); fire(r.path); },
  update: async (r, obj) => { for (const [k, v] of Object.entries(obj)) { const p = r.path ? r.path + '/' + k : k; setAt(p, v); fire(p); } },
  onValue: (r, cb) => { const s = { path: r.path, cb }; subs.push(s); setTimeout(() => cb({ val: () => clone(getAt(r.path)) }), 0); return () => subs.splice(subs.indexOf(s), 1); },
};
let uidN = 0; const mkFb = (uid) => ({ D, db: {}, uid });
const uids = ['hostUid', 'guestUid']; let idx = 0;
__setFactory(async () => mkFb(uids[idx++]));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.error('FAIL:', m); } };

const host = new OnlineSession(); const guest = new OnlineSession(); host.botDelay = 1;
const code = await host.create('ホスト', {});
await guest.join(code, 'ゲスト');
await sleep(30);
ok(Object.keys(host.meta.players).length === 2, 'guest joined');
await host.addBot(); await sleep(30);
const kingdom = SETS.base.cards.slice(0, 10);
await host.start(kingdom); await sleep(100);
ok(host.game && host.view && host.privView, 'host game started');
ok(guest.view && guest.privView, 'guest got views');
// 秘密情報が他人の経路に無いこと
ok(!JSON.stringify(tree.rooms[code].public).includes('"hand":[{'), 'public has no hand cards');
ok(tree.rooms[code].hands.guestUid.hand.length === 5, 'guest private hand stored');
// プレイして進める
let steps = 0;
while (!host.view.over && steps < 6000) {
  steps++;
  await sleep(2);
  for (const s of [host, guest]) {
    const pv = s.privView;
    if (!pv || !pv.req || !s.view) continue;
    const r = pv.req;
    let ans;
    if (r.kind === 'turn') ans = s.view.t && s.view.t.phase === 'action' && pv.hand.some((c) => CARDS[c.name].types.includes('Action')) && s.view.t.actions > 0 ? { t: 'play', id: pv.hand.find((c) => CARDS[c.name].types.includes('Action')).id } : pv.hand.some((c) => CARDS[c.name].types.includes('Treasure')) ? { t: 'allTreasures' } : { t: 'end' };
    else if (r.kind === 'cards') ans = r.cards.slice(0, r.counts ? r.counts[0] : r.min).map((c) => c.id);
    else if (r.kind === 'pile') ans = r.optional ? null : r.piles[0];
    else if (r.kind === 'option') ans = r.def || r.options[0].id;
    else if (r.kind === 'options') ans = r.options.slice(0, r.n).map((o) => o.id);
    else ans = r.min;
    await s.send(ans);
  }
  if (host.botTimer === null && steps > 5999) break;
}
ok(host.view.over, 'game over online (steps=' + steps + ')');
ok(guest.view.over && guest.view.results, 'guest sees results');
// ホスト再接続（リプレイ復元）
const replayLen = Object.keys(tree.rooms[code].replay || {}).length;
ok(replayLen === host.game.answers.length, 'replay logged all answers ' + replayLen + '/' + host.game.answers.length);
// --- ホスト再読み込み：別セッションが replay から復元できる ---
{
  const code2 = await (async () => { idx = 0; const h = new OnlineSession(); h.botDelay = 1; const c = await h.create('H2', {}); await sleep(20); await h.addBot(); await sleep(20); await h.start(kingdom); await sleep(80);
    for (let i = 0; i < 40 && !h.game.over; i++) { const pv = h.privView; if (pv && pv.req) { const r = pv.req; await h.send(r.kind === 'turn' ? { t: 'end' } : r.kind === 'cards' ? r.cards.slice(0, r.min).map((c) => c.id) : r.kind === 'pile' ? r.piles[0] : r.kind === 'option' ? r.options[0].id : r.min); } await sleep(8); }
    const n = h.game.answers.length, hv = JSON.stringify(h.game.publicView()); h.close();
    idx = 0; const h2 = new OnlineSession(); h2.botDelay = 1; await h2.join(c, 'H2'); await sleep(100);
    ok(h2.game && h2.game.answers.length >= n, 'host resumed from replay ' + (h2.game && h2.game.answers.length) + '/' + n);
    return c; })();
}
console.log(fails ? 'ONLINE MOCK FAILED' : 'ONLINE MOCK PASSED', 'answers=' + replayLen);
process.exit(fails ? 1 : 0);
