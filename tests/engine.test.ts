import test from "node:test";
import assert from "node:assert/strict";
import {
  act,
  chooseAI,
  createBattle,
  DIFFICULTIES,
  freshProgress,
  levelFor,
  recordBattle,
  WARRIORS,
  type Action,
  type Battle,
  type Difficulty,
} from "../src/game.ts";
import { parseProgress } from "../src/storage.ts";
const fixed = () => 0.5;
function random(seed: number) {
  let n = seed;
  return () => {
    n = (n * 1664525 + 1013904223) >>> 0;
    return n / 4294967296;
  };
}
test("Every character and difficulty produces a valid battle with a different opponent", () => {
  for (const w of WARRIORS)
    for (const difficulty of Object.keys(DIFFICULTIES) as Difficulty[]) {
      const b = createBattle(w.id, difficulty, 0, fixed);
      assert.notEqual(b.enemy.id, w.id);
      assert.equal(b.player.maxHp, w.hp);
      assert.equal(b.player.energy, 40);
      assert.equal(b.turn, "player");
      assert.ok(b.enemy.maxHp > 0);
    }
});
test("Attack builds energy and prevents a second player action until the AI acts", () => {
  const before = createBattle("pip", "fighter", 0, fixed);
  const after = act(before, "player", "attack", fixed);
  assert.equal(after.player.energy, 55);
  assert.ok(after.enemy.hp < before.enemy.hp);
  assert.equal(before.enemy.hp, before.enemy.maxHp, "input stays immutable");
  assert.equal(act(after, "player", "attack", fixed), after);
  assert.equal(act(after, "enemy", "attack", fixed).turn, "player");
});
test("Defend reduces the next attack by 60%, restores energy, and then expires", () => {
  const before = createBattle("pip", "fighter", 0, fixed);
  const guarded = act(before, "player", "defend", fixed);
  assert.equal(guarded.player.energy, 75);
  assert.equal(guarded.player.guarding, true);
  const hit = act(guarded, "enemy", "attack", fixed);
  const raw = act({ ...before, turn: "enemy" }, "enemy", "attack", fixed);
  assert.ok(
    before.player.hp - hit.player.hp <=
      (before.player.hp - raw.player.hp) * 0.4 + 1,
  );
  assert.equal(hit.player.guarding, false);
  const bothDefend = act(guarded, "enemy", "defend", fixed);
  assert.equal(bothDefend.player.guarding, false);
  assert.equal(bothDefend.enemy.guarding, true);
});
test("Special cannot run without energy; every character has a distinct effective special", () => {
  const damage = [];
  for (const w of WARRIORS) {
    const b = createBattle(w.id, "fighter", 0, fixed);
    assert.equal(act(b, "player", "special"), b);
    const ready = {
      ...b,
      player: { ...b.player, energy: 100, hp: b.player.maxHp - 40 },
    };
    const special = act(ready, "player", "special", fixed);
    assert.equal(special.player.energy, 40);
    assert.ok(special.enemy.hp < b.enemy.hp);
    assert.equal(
      special.player.hp - ready.player.hp,
      w.id === "mochi" ? 30 : 0,
    );
    damage.push(special.events[0].damage);
  }
  assert.equal(new Set(damage).size, 3);
});
test("Energy is capped and healing cannot exceed maximum health", () => {
  let b = createBattle("mochi", "rookie", 0, fixed);
  b = { ...b, player: { ...b.player, energy: 95 } };
  assert.equal(act(b, "player", "defend").player.energy, 100);
  assert.equal(act(b, "player", "attack").player.energy, 100);
  const healed = act(b, "player", "special");
  assert.equal(healed.player.hp, b.player.maxHp);
  assert.equal(healed.events[0].healed, 0);
});
test("A final blow finishes immediately, prevents AI retaliation, and awards XP exactly once", () => {
  const b = createBattle("nyx", "champion", 0, fixed);
  const win = act(
    { ...b, enemy: { ...b.enemy, hp: 1 } },
    "player",
    "attack",
    fixed,
  );
  assert.equal(win.enemy.hp, 0);
  assert.equal(win.turn, "finished");
  assert.equal(win.winner, "player");
  assert.equal(act(win, "enemy", "attack"), win);
  const p = recordBattle(freshProgress(), win);
  assert.equal(p.xp, 160);
  assert.equal(p.wins, 1);
  assert.equal(p.streak, 1);
  assert.equal(recordBattle(p, win), p);
  assert.equal(levelFor(p.xp), 2);
});
test("Losses award 15 XP and reset the current streak without losing the best streak", () => {
  const b = createBattle("pip", "rookie", 0, fixed);
  const p = { ...freshProgress(), streak: 4, bestStreak: 4 };
  const lost = recordBattle(p, { ...b, turn: "finished", winner: "enemy" });
  assert.equal(lost.xp, 15);
  assert.equal(lost.losses, 1);
  assert.equal(lost.streak, 0);
  assert.equal(lost.bestStreak, 4);
});
test("An enemy finishing blow records the round that was actually played", () => {
  const b = createBattle("pip", "champion", 0, fixed);
  const ending = act(
    { ...b, round: 4, turn: "enemy", player: { ...b.player, hp: 1 } },
    "enemy",
    "attack",
    fixed,
  );
  assert.equal(ending.winner, "enemy");
  assert.equal(ending.round, 4);
});
test("Progression bonuses cap at 12% and histories retain only the last 50 completed battles", () => {
  assert.equal(
    createBattle("pip", "rookie", 1_000_000, fixed).player.maxHp,
    Math.round(110 * 1.12),
  );
  let p = freshProgress();
  for (let i = 0; i < 60; i++)
    p = recordBattle(p, {
      ...createBattle("pip", "rookie", 0, fixed),
      turn: "finished",
      winner: "player",
    });
  assert.equal(p.matches.length, 50);
  assert.equal(p.wins, 60);
  assert.equal(p.xp, 3600);
  assert.deepEqual(parseProgress(JSON.stringify(p)), p);
});
test("Malformed saves fail safely, including null, nonfinite values, and invalid match records", () => {
  assert.deepEqual(parseProgress(null), freshProgress());
  for (const s of [
    "null",
    "{",
    "{}",
    JSON.stringify({ ...freshProgress(), xp: -1 }),
    JSON.stringify({ ...freshProgress(), xp: "100" }),
    JSON.stringify({ ...freshProgress(), matches: [null] }),
  ])
    assert.throws(() => parseProgress(s));
});
test("Seeded simulation: 900 complete battles terminate and retain health/energy invariants", () => {
  let wins = 0,
    losses = 0;
  for (const w of WARRIORS)
    for (const difficulty of Object.keys(DIFFICULTIES) as Difficulty[])
      for (let i = 0; i < 100; i++) {
        const rng = random(i + w.hp * 100);
        let b: Battle = createBattle(w.id, difficulty, 0, rng),
          moves = 0;
        while (!b.winner && moves < 150) {
          const move: Action =
            b.turn === "enemy"
              ? chooseAI(b, rng)
              : b.player.energy >= 60
                ? "special"
                : moves % 7 === 0
                  ? "defend"
                  : "attack";
          b = act(b, b.turn === "player" ? "player" : "enemy", move, rng);
          moves++;
          for (const f of [b.player, b.enemy]) {
            assert.ok(f.hp >= 0 && f.hp <= f.maxHp);
            assert.ok(f.energy >= 0 && f.energy <= 100);
          }
        }
        assert.ok(
          b.winner,
          `battle did not terminate: ${w.id}, ${difficulty}, seed ${i}`,
        );
        if (b.winner === "player") wins++;
        else losses++;
      }
  assert.ok(wins > 0 && losses > 0, "both outcomes are reachable");
});
