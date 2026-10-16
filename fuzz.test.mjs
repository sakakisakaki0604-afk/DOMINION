import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/engine.js';
import { KINGDOM_NAMES } from '../js/cards.js';
import { chaosAnswer, chaosTurn, smartAnswer, smartTurn } from '../js/bot.js';

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x9e3779b9) >>> 0; let t = s ^ (s >>> 15); t = Math.imul(t, 0x85ebca6b); t ^= t >>> 13; t = Math.imul(t, 0xc2b2ae35); return ((t ^ (t >>> 16)) >>> 0) / 4294967296; }; }
function kingdom(r) { const a = [...KINGDOM_NAMES]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, 10); }

function playGame(seed, mode) {
  const r = rng(seed), n = 2 + Math.floor(r() * 3);
  const g = new Game({ players: Array.from({ length: n }, (_, i) => ({ id: 'u' + i, name: 'P' + i })), kingdom: kingdom(r), seed });
  let steps = 0, restores = 0;
  while (!g.S.over) {
    if (++steps > 20000) throw new Error('終了しない対局 seed=' + seed);
    let res;
    if (g.pending) {
      const p = g.pending;
      res = g.act(p.player, { type: 'answer', value: mode === 'chaos' ? chaosAnswer(g, p, r) : smartAnswer(g, p) });
    } else {
      const i = g.S.turn.player;
      res = g.act(i, mode === 'chaos' ? chaosTurn(g, i, r) : smartTurn(g, i));
    }
    assert.equal(res.ok, true, `seed=${seed} ${res.error}`);
    g.audit();
    // 時々 直列化→復元 して同一性を確認
    if (r() < 0.05) {
      const h = Game.restore(JSON.parse(JSON.stringify(g.serialize())));
      assert.deepEqual(h.S, g.S); assert.deepEqual(h.pending, g.pending); restores++;
      // 復元したゲームで続行
      Object.assign(g, { S: h.S, pending: h.pending, gen: h.gen, checkpoint: h.checkpoint });
    }
  }
  assert.ok(g.S.result.winners.length >= 1);
  return { g, steps, restores };
}

test('ランダム合法手 600局: 保存則/復元/終了', () => {
  let restores = 0;
  for (let s = 1; s <= 600; s++) restores += playGame(s, 'chaos').restores;
  assert.ok(restores > 100);
});
test('CPU(smart) 300局: 必ず終了し勝者が決まる', () => {
  let dur = 0;
  for (let s = 1000; s < 1300; s++) { const { g } = playGame(s, 'smart'); dur += g.S.turn.n; }
  assert.ok(dur / 300 < 120, '平均手番が長すぎる');
});
