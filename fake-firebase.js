// E2E用のFirebase SDK偽実装 (同一ブラウザ内の複数タブを localStorage + BroadcastChannel で結ぶ)。
// 実際のFirebaseセキュリティルールは評価しない。通信層(net.js)・ホスト進行・ロビー・再接続の論理検証用。
const KEY = 'fakefb_tree';
const CH = new BroadcastChannel('fakefb');
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const save = (t) => localStorage.setItem(KEY, JSON.stringify(t));
const segs = (p) => p.split('/').filter(Boolean);
const getAt = (t, p) => { let c = t; for (const s of segs(p)) { if (c == null || typeof c !== 'object') return null; c = c[s]; } return c === undefined ? null : c; };
function setAt(t, p, v) {
  const s = segs(p); if (!s.length) return v === null ? {} : v;
  let c = t; for (let i = 0; i < s.length - 1; i++) { if (c[s[i]] == null || typeof c[s[i]] !== 'object') c[s[i]] = {}; c = c[s[i]]; }
  if (v === null) delete c[s[s.length - 1]]; else c[s[s.length - 1]] = JSON.parse(JSON.stringify(v));
  return t;
}
const prune = (v) => { if (v && typeof v === 'object') { for (const k of Object.keys(v)) { v[k] = prune(v[k]); if (v[k] === null) delete v[k]; } return Object.keys(v).length ? v : null; } return v; };
const listeners = [];
const snapOf = (path, val) => ({ exists: () => val !== null, val: () => (val === null ? null : JSON.parse(JSON.stringify(val))), key: segs(path).pop() || null, ref: { __path: path } });
function notify() {
  const t = load();
  for (const l of [...listeners]) {
    const v = getAt(t, l.path);
    if (l.type === 'value') { const s = JSON.stringify(v); if (s !== l.last) { l.last = s; setTimeout(() => l.cb(snapOf(l.path, v)), 0); } }
    else if (v && typeof v === 'object') for (const k of Object.keys(v).sort()) if (!l.seen.has(k)) { l.seen.add(k); setTimeout(() => l.cb(snapOf(l.path + '/' + k, v[k])), 0); }
  }
}
CH.onmessage = () => notify();
const commit = (t) => { save(prune(t) || {}); CH.postMessage(1); setTimeout(notify, 0); };

export const initializeApp = (cfg) => ({ cfg });
const uid = (() => { let u = sessionStorage.getItem('fakefb_uid'); if (!u) { u = 'u' + Math.random().toString(36).slice(2, 10); sessionStorage.setItem('fakefb_uid', u); } return u; })();
export const getAuth = () => ({ currentUser: { uid }, authStateReady: async () => {} });
export const signInAnonymously = async () => ({});
export const getDatabase = () => ({});
export const ref = (db, path = '') => ({ __path: path });
export const set = async (r, v) => { commit(setAt(load(), r.__path, v)); };
export const get = async (r) => snapOf(r.__path, getAt(load(), r.__path));
export const remove = async (r) => { commit(setAt(load(), r.__path, null)); };
export const update = async (r, obj) => { let t = load(); for (const [k, v] of Object.entries(obj)) t = setAt(t, r.__path + '/' + k, v); commit(t); };
let pc = 0;
export const push = async (r, v) => { const k = Date.now().toString(36).padStart(9, '0') + (pc++).toString(36).padStart(4, '0') + Math.random().toString(36).slice(2, 5); const p = r.__path + '/' + k; commit(setAt(load(), p, v)); return { __path: p, key: k }; };
export const runTransaction = async (r, fn) => { const t = load(); const cur = getAt(t, r.__path); const nv = fn(cur); if (nv === undefined) return { committed: false }; commit(setAt(t, r.__path, nv)); return { committed: true }; };
export const onValue = (r, cb) => {
  if (r.__path === '.info/connected') { setTimeout(() => cb(snapOf(r.__path, true)), 0); return () => {}; }
  const l = { type: 'value', path: r.__path, cb, last: undefined }; listeners.push(l); setTimeout(notify, 0); return () => listeners.splice(listeners.indexOf(l), 1);
};
export const onChildAdded = (r, cb) => { const l = { type: 'child', path: r.__path, cb, seen: new Set() }; listeners.push(l); setTimeout(notify, 0); return () => listeners.splice(listeners.indexOf(l), 1); };
export const onDisconnect = (r) => ({ remove: () => { addEventListener('pagehide', () => { try { commit(setAt(load(), r.__path, null)); } catch {} }); } });
