// HostRuntime: ゲーム権威側。ローカル(CPU対戦)でもオンライン(ホストのブラウザ)でも同じ実装を使う。
// - 操作の合法性・乱数・状態変更はすべてここ(エンジン)で決定
// - 各操作に ver(状態版数) を付け、古い/二重の操作を拒否
// - 公開状態(pub)と各プレイヤー専用の非公開状態(priv)を分けて出力 (非公開情報は本人にしか渡さない)
import { Game } from './engine.js';
import { smartAnswer, smartTurn } from './bot.js';

export class HostRuntime {
  // uids: 席順のuid配列 / bots: CPUのuid集合
  constructor({ game, bots = new Set(), onPublish, onPersist, botDelay = 650 }) {
    this.game = game; this.bots = bots; this.onPublish = onPublish; this.onPersist = onPersist; this.botDelay = botDelay;
    this.timer = null; this.stopped = false;
  }
  static create({ players, kingdom, seed, ...rest }) {
    return new HostRuntime({ game: new Game({ players, kingdom, seed }), ...rest });
  }
  static restore(ser, rest) { return new HostRuntime({ game: Game.restore(ser), ...rest }); }

  idxOf(uid) { return this.game.S.players.findIndex((p) => p.id === uid); }

  submit(uid, action, ver) {
    const g = this.game;
    const i = this.idxOf(uid);
    if (i < 0) return { ok: false, error: '参加者ではありません' };
    if (ver !== undefined && ver !== g.S.ver) return { ok: false, error: '古い操作です(画面が更新されていません)', stale: true };
    if (!action || typeof action.type !== 'string') return { ok: false, error: '不正な操作' };
    const r = g.act(i, action);
    if (r.ok) this._emit();
    return r;
  }

  start() { this._emit(); }
  stop() { this.stopped = true; clearTimeout(this.timer); }

  _emit() {
    const g = this.game;
    const privs = {};
    g.S.players.forEach((p, i) => { privs[p.id] = g.privateState(i); });
    if (this.onPersist) this.onPersist(g.serialize());
    if (this.onPublish) this.onPublish(g.publicState(), privs);
    this._scheduleBot();
  }

  _scheduleBot() {
    clearTimeout(this.timer);
    const g = this.game;
    if (this.stopped || g.S.over) return;
    const actor = g.pending ? g.pending.player : g.S.turn.player;
    if (!this.bots.has(g.S.players[actor].id)) return;
    this.timer = setTimeout(() => {
      if (this.stopped) return;
      const g2 = this.game;
      const a2 = g2.pending ? g2.pending.player : g2.S.turn.player;
      if (!this.bots.has(g2.S.players[a2].id)) return;
      let r;
      if (g2.pending) r = g2.act(a2, { type: 'answer', value: smartAnswer(g2, g2.pending) });
      else r = g2.act(a2, smartTurn(g2, a2));
      if (!r.ok) { console.error('CPU操作エラー', r.error); r = g2.act(a2, { type: 'endTurn' }); }
      this._emit();
    }, this.botDelay);
  }
}
