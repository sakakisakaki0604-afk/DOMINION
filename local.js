// ひとり用（ボット対戦）セッション。ブラウザ内でエンジンを動かし、途中経過を localStorage に保存して再開できる。
import { Game } from './engine.js';
import { botStep } from './ai.js';

const KEY = 'dom_local_save_v1';

export class LocalSession {
  constructor(cfg, saved) {
    this.listeners = [];
    this.cfg = cfg;
    this.game = new Game({ seed: cfg.seed, players: cfg.players, kingdom: cfg.kingdom, first: cfg.first });
    if (saved && saved.length) this.game.replay(saved);
    this.me = cfg.players.find((p) => !p.bot).id;
    this.timer = null;
    this.speed = 1;
  }
  static loadSave() { try { const s = JSON.parse(localStorage.getItem(KEY)); return s && s.cfg ? s : null; } catch { return null; } }
  static clearSave() { try { localStorage.removeItem(KEY); } catch {} }
  save() { try { if (this.game.over) localStorage.removeItem(KEY); else localStorage.setItem(KEY, JSON.stringify({ cfg: this.cfg, answers: this.game.answers })); } catch {} }
  onUpdate(cb) { this.listeners.push(cb); }
  emit() { this.listeners.forEach((f) => f()); }
  get view() { return this.game.publicView(); }
  get privView() { return this.game.privateView(this.me); }
  start() { this.emit(); this.schedule(); }
  send(ans) {
    const r = this.game.respond(this.me, ans);
    if (!r.ok) return r;
    this.save(); this.emit(); this.schedule();
    return r;
  }
  schedule() {
    clearTimeout(this.timer);
    const g = this.game;
    if (g.over || !g.pending || g.pending.pid === this.me) return;
    this.timer = setTimeout(() => {
      botStep(g); this.save(); this.emit(); this.schedule();
    }, (g.pending.kind === 'turn' ? 550 : 350) / this.speed);
  }
  close() { clearTimeout(this.timer); }
}
