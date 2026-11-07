import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  act,
  applyArenaEvent,
  createBattle,
  freshProgress,
  recordBattle,
  type Battle,
} from "../src/game.ts";
import {
  classifySignal,
  deriveModifiers,
  detectSettlementEvent,
  formatDistance,
  formatRpm,
  NEUTRAL_MODS,
  OFFLINE_AFTER_MS,
  parseSettlements,
  parseStats,
  parseStatus,
  SchemaError,
  type ArenaEvent,
  type Signal,
  type SqueekMods,
  type StatusSnapshot,
} from "../src/squeek.ts";
import { parseProgress } from "../src/storage.ts";

// Unedited responses captured from https://api.squeekchain.com. Stats keeps one
// bucket per day to stay small. These are test inputs and never reach dist/.
const fixture = (name: string) =>
  JSON.parse(readFileSync(`tests/fixtures/live-${name}.json`, "utf8"));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const fixed = () => 0.5;
const live: Signal = { status: "live", reason: "" };
const healthy = {
  ageMs: 5_000,
  sinceSuccessMs: 5_000,
  lastError: null,
};
function statusWith(
  change: (b: ReturnType<typeof fixture>) => void,
): StatusSnapshot {
  const body = fixture("status");
  change(body);
  return parseStatus(body);
}
/** A wheel reading in documented units, on the real captured response. */
const reading = (rpm: number, km = 0) =>
  statusWith((b) => {
    b.measurement.rpmMilli = Math.round(rpm * 1000);
    b.measurement.distanceMm = Math.round(km * 1_000_000);
  });

test("Real captured responses pass validation with their real values", () => {
  const status = parseStatus(fixture("status"));
  assert.equal(status.measurement?.provenance, "hardware");
  assert.equal(status.wheel?.moduleVersion, "0.2.1");
  assert.equal(status.oracleState, "accepted");
  const stats = parseStats(fixture("stats"));
  assert.equal(stats.previousDay?.distanceMm, 6_348_818);
  assert.equal(stats.peakRpmMilli, 87_707);
  const settlements = parseSettlements(fixture("settlements"), "live");
  assert.equal(settlements.status, "available");
  assert.ok(settlements.status === "available" && settlements.recent.length);
});

test("Status validation rejects anything outside the documented contract", () => {
  const broken: [string, (b: ReturnType<typeof fixture>) => void][] = [
    ["schema version", (b) => (b.schemaVersion = 2)],
    ["unknown provenance", (b) => (b.measurement.provenance = "hardwar")],
    ["missing provenance", (b) => delete b.measurement.provenance],
    ["unknown freshness", (b) => (b.measurement.freshness = "fresh")],
    ["string rpm", (b) => (b.measurement.rpmMilli = "87000")],
    ["fractional rpm", (b) => (b.measurement.rpmMilli = 1.5)],
    ["negative rpm", (b) => (b.measurement.rpmMilli = -1)],
    ["impossible rpm", (b) => (b.measurement.rpmMilli = 5_000_000)],
    ["negative distance", (b) => (b.measurement.distanceMm = -5)],
    ["bad time", (b) => (b.measurement.receivedAt = "yesterday")],
    ["no oracle", (b) => delete b.oracle],
    ["bad modules", (b) => (b.modules = "wheel")],
    ["unknown core status", (b) => (b.measurement.coreStatus = "SPINNING")],
  ];
  for (const [name, change] of broken) {
    const body = fixture("status");
    change(body);
    assert.throws(() => parseStatus(body), SchemaError, name);
  }
  for (const body of [null, [], "ok", 7, {}])
    assert.throws(() => parseStatus(body), SchemaError);
  assert.equal(
    statusWith((b) => (b.measurement = null)).measurement,
    null,
    "a null measurement is documented and means no reading yet",
  );
});

test("Stats and settlement validation reject wrong shapes and wrong deployments", () => {
  const stats = fixture("stats");
  delete stats.activity.days;
  assert.throws(() => parseStats(stats), SchemaError);
  const version = fixture("settlements");
  version.schemaVersion = 2;
  assert.throws(() => parseSettlements(version, "live"), SchemaError);
  const hash = fixture("settlements");
  hash.recentSettlements[0].transactionHash = "javascript:alert(1)";
  assert.throws(() => parseSettlements(hash, "live"), SchemaError);
  const chain = fixture("settlements");
  chain.chain.chainId = "1";
  assert.throws(() => parseSettlements(chain, "live"), SchemaError);
  const contract = fixture("settlements");
  contract.mining.economy.token = `0x${"1".repeat(40)}`;
  assert.throws(() => parseSettlements(contract, "live"), SchemaError);
  assert.deepEqual(
    parseSettlements(
      {
        schemaVersion: 3,
        status: "unavailable",
        reason: "indexer_unavailable",
      },
      "unavailable",
    ),
    {
      status: "unavailable",
      reason: "indexer_unavailable",
      source: "unavailable",
    },
  );
});

test("The real captured reading classifies as HARDWARE LIVE", () => {
  const signal = classifySignal({
    snapshot: parseStatus(fixture("status")),
    ...healthy,
  });
  assert.equal(signal.status, "live");
});

test("Simulated data never receives HARDWARE LIVE, in any combination", () => {
  const provenance = ["hardware", "simulated", "replay", "derived"];
  const moduleProvenance = ["hardware", "simulated", "replay", "derived"];
  const freshness = ["online", "stale"];
  const core = ["IDLE", "ACTIVE", "COUNTER_FAULT"];
  const state = ["ready", "degraded", "starting", "faulted", "stopped"];
  const ages = [1_000, 119_000, 121_000, null];
  const errors = [null, "Timed out"];
  let combinations = 0,
    liveCount = 0;
  for (const p of provenance)
    for (const mp of moduleProvenance)
      for (const f of freshness)
        for (const c of core)
          for (const s of state)
            for (const ageMs of ages)
              for (const lastError of errors) {
                const snapshot = statusWith((b) => {
                  b.measurement.provenance = p;
                  b.measurement.freshness = f;
                  b.measurement.coreStatus = c;
                  b.modules[0].provenance = mp;
                  b.modules[0].state = s;
                });
                const signal = classifySignal({
                  snapshot,
                  ageMs,
                  sinceSuccessMs: 1_000,
                  lastError,
                });
                combinations++;
                const allGood =
                  p === "hardware" &&
                  mp === "hardware" &&
                  f === "online" &&
                  c !== "COUNTER_FAULT" &&
                  s === "ready" &&
                  ageMs !== null &&
                  ageMs <= 120_000 &&
                  !lastError;
                assert.equal(signal.status === "live", allGood);
                if (allGood) liveCount++;
                if (p !== "hardware" || mp !== "hardware")
                  assert.equal(signal.status, "simulated");
                // A non-live status can never produce a bonus.
                if (!allGood)
                  assert.deepEqual(deriveModifiers(signal, snapshot, null), {
                    ...NEUTRAL_MODS,
                    source: signal.status,
                  });
              }
  assert.equal(combinations, 4 * 4 * 2 * 3 * 5 * 4 * 2);
  assert.ok(liveCount > 0);
});

test("Each failure maps to an honest status", () => {
  const snapshot = parseStatus(fixture("status"));
  const status = (input: Partial<Parameters<typeof classifySignal>[0]>) =>
    classifySignal({ snapshot, ...healthy, ...input }).status;
  assert.equal(status({ snapshot: null }), "offline");
  assert.equal(status({ sinceSuccessMs: null }), "offline");
  assert.equal(status({ sinceSuccessMs: OFFLINE_AFTER_MS + 1 }), "offline");
  assert.equal(status({ lastError: "Timed out" }), "stale");
  assert.equal(status({ ageMs: 120_001 }), "stale");
  assert.equal(status({ ageMs: 120_000 }), "live");
  const noReading = statusWith((b) => (b.measurement = null));
  assert.equal(status({ snapshot: noReading }), "offline");
  const fault = statusWith((b) => (b.measurement.coreStatus = "COUNTER_FAULT"));
  assert.equal(status({ snapshot: fault }), "offline");
  const noModule = statusWith((b) => (b.modules = []));
  assert.equal(status({ snapshot: noModule }), "stale");
  const stale = statusWith((b) => (b.measurement.freshness = "stale"));
  assert.equal(status({ snapshot: stale }), "stale");
});

test("Wheel RPM changes arena energy, at every tier boundary", () => {
  const energy = (rpm: number) =>
    deriveModifiers(live, reading(rpm), null).energyPerTurn;
  assert.deepEqual(
    [0, 0.9, 1, 29.9, 30, 59.9, 60, 88].map(energy),
    [0, 0, 4, 4, 8, 8, 12, 12],
  );
  assert.equal(deriveModifiers(live, reading(0), null).arenaEnergy, 0);
  assert.equal(deriveModifiers(live, reading(45), null).arenaEnergy, 50);
  assert.equal(deriveModifiers(live, reading(200), null).arenaEnergy, 100);
});

test("RPM counts even when coreStatus is IDLE, as in the documented example", () => {
  const snapshot = statusWith((b) => {
    b.measurement.coreStatus = "IDLE";
    b.measurement.rpmMilli = 77_005;
  });
  assert.equal(deriveModifiers(live, snapshot, null).wheelTier, "Sprinting");
});

test("Verified distance changes the damage bonus, at every tier boundary", () => {
  const damage = (km: number) =>
    deriveModifiers(live, reading(0, km), null).damagePct;
  assert.deepEqual(
    [0, 0.49, 0.5, 1.99, 2, 4.99, 5, 9].map(damage),
    [0, 0, 5, 5, 10, 10, 15, 15],
  );
});

test("The trail uses the better of today and the last finished device day", () => {
  const stats = parseStats(fixture("stats"));
  const asleep = deriveModifiers(live, reading(0, 0), stats);
  assert.equal(asleep.verifiedDistanceMm, 6_348_818);
  assert.equal(asleep.trailTier, "Marathon trail");
  assert.equal(asleep.energyPerTurn, 0);
  const longer = deriveModifiers(live, reading(0, 8), stats);
  assert.equal(longer.verifiedDistanceMm, 8_000_000);
});

test("Distance gives nothing unless the Oracle and signer back it", () => {
  const stats = parseStats(fixture("stats"));
  const blocked = statusWith((b) => {
    b.oracle.state = "blocked";
    b.oracle.reason = "counter_fault";
    b.measurement.distanceMm = 9_000_000;
  });
  const unsigned = statusWith((b) => {
    delete b.signer;
    b.measurement.distanceMm = 9_000_000;
  });
  const oldSigner = statusWith((b) => {
    b.signer.lastVerifiedAt = "2026-01-01T00:00:00.000Z";
    b.measurement.distanceMm = 9_000_000;
  });
  for (const snapshot of [blocked, unsigned, oldSigner]) {
    const mods = deriveModifiers(live, snapshot, stats);
    assert.equal(mods.damagePct, 0);
    assert.equal(mods.verifiedDistanceMm, null);
  }
});

test("Offline, stale and simulated readings all use neutral modifiers", () => {
  const stats = parseStats(fixture("stats"));
  const fast = reading(88, 9);
  for (const status of ["offline", "stale", "simulated"] as const) {
    const mods = deriveModifiers({ status, reason: "" }, fast, stats);
    assert.deepEqual(mods, { ...NEUTRAL_MODS, source: status });
    assert.equal(mods.energyPerTurn, 0);
    assert.equal(mods.damagePct, 0);
  }
  assert.equal(
    deriveModifiers({ status: "live", reason: "" }, null, stats).energyPerTurn,
    0,
  );
});

function fight(mods: SqueekMods) {
  const battle = createBattle("pip", "fighter", 0, fixed);
  return act(battle, "player", "attack", fixed, mods);
}
const boosted = (energyPerTurn: number, damagePct: number): SqueekMods => ({
  ...NEUTRAL_MODS,
  source: "live",
  energyPerTurn,
  damagePct,
});

test("Hardware RPM and distance measurably change a real battle turn", () => {
  const stats = parseStats(fixture("stats"));
  // The wheel's own recorded peak, on the real captured response and stats.
  const peak = deriveModifiers(live, reading(87.707), stats);
  const neutral = fight(NEUTRAL_MODS);
  const powered = fight(peak);
  assert.equal(neutral.player.energy, 55);
  assert.equal(powered.player.energy, 67);
  assert.ok(powered.enemy.hp < neutral.enemy.hp);
  const dealt = (b: Battle) => b.enemy.maxHp - b.enemy.hp;
  assert.equal(dealt(powered), Math.round(dealt(neutral) * 1.15));
  assert.equal(powered.power.bonusEnergy, 12);
  assert.equal(powered.power.boostedTurns, 1);
  assert.match(
    powered.events.at(-1)!.text,
    /Squeek Power: \+\d+ damage, \+12 energy/,
  );
});

test("A slower wheel gives less than a faster wheel, turn for turn", () => {
  const energy = (rpm: number) =>
    fight(deriveModifiers(live, reading(rpm), null)).player.energy;
  assert.ok(energy(0) < energy(10));
  assert.ok(energy(10) < energy(45));
  assert.ok(energy(45) < energy(70));
});

test("Neutral modifiers reproduce the original rules exactly", () => {
  const battle = createBattle("nyx", "champion", 0, fixed);
  const after = act(battle, "player", "defend", fixed);
  assert.equal(after.player.energy, 75);
  assert.equal(after.power.boostedTurns, 0);
  assert.equal(after.events.at(-1)!.text.includes("Squeek Power"), false);
});

test("The AI never receives Squeek Power", () => {
  const start = createBattle("pip", "fighter", 0, fixed);
  const enemyTurn = { ...start, turn: "enemy" as const };
  const plain = act(enemyTurn, "enemy", "attack", fixed);
  const passed = act(enemyTurn, "enemy", "attack", fixed, boosted(12, 15));
  assert.deepEqual(passed.player, plain.player);
  assert.deepEqual(passed.enemy, plain.enemy);
});

test("Energy from the wheel stays capped at 100", () => {
  let battle = createBattle("pip", "fighter", 0, fixed);
  battle = { ...battle, player: { ...battle.player, energy: 95 } };
  const after = act(battle, "player", "defend", fixed, boosted(12, 0));
  assert.equal(after.player.energy, 100);
  assert.equal(after.power.bonusEnergy, 0);
});

const snapshotCount = (n: string) => {
  const s = parseSettlements(fixture("settlements"), "live");
  assert.ok(s.status === "available");
  return { ...s, settlementCount: n };
};

test("The first settlement read only sets a baseline", () => {
  assert.equal(detectSettlementEvent(null, snapshotCount("271")), null);
  assert.equal(
    detectSettlementEvent(snapshotCount("271"), snapshotCount("271")),
    null,
  );
});

test("A new settlement fires one event, sized by what it completed", () => {
  const before = snapshotCount("271");
  const tremor = detectSettlementEvent(before, snapshotCount("272"));
  assert.equal(tremor?.kind, "settlement-tremor");
  assert.equal(tremor?.energy, 10);
  const block = {
    ...clone(before.recent[0]),
    transactionHash: `0x${"a".repeat(64)}`,
    completedBlockCount: "4",
  };
  const next = {
    ...snapshotCount("272"),
    recent: [block, ...before.recent],
  };
  const rush = detectSettlementEvent(before, next);
  assert.equal(rush?.kind, "block-rush");
  assert.equal(rush?.completedBlocks, 4);
  assert.equal(rush?.key, "settlement:272");
  const unsafe = {
    ...next,
    recent: [{ ...block, confirmationStatus: "pending" }],
  };
  assert.equal(
    detectSettlementEvent(before, unsafe)?.kind,
    "settlement-tremor",
  );
});

test("Cached or unavailable settlement data triggers nothing", () => {
  const before = snapshotCount("271");
  const cached = { ...snapshotCount("275"), source: "durable-cache" };
  assert.equal(detectSettlementEvent(before, cached), null);
  assert.equal(
    detectSettlementEvent(before, {
      status: "unavailable",
      reason: "indexer_unavailable",
      source: "unavailable",
    }),
    null,
  );
});

const rush: ArenaEvent = {
  key: "settlement:272",
  kind: "block-rush",
  name: "Block rush",
  energy: 20,
  surgePct: 25,
  transactionHash: null,
  completedBlocks: 1,
};

test("An arena event applies once and its surge lasts one hit", () => {
  const battle = createBattle("pip", "fighter", 0, fixed);
  const hit = applyArenaEvent(battle, rush);
  assert.equal(hit.player.energy, 60);
  assert.equal(hit.surgePct, 25);
  assert.equal(hit.events.at(-1)!.actor, "arena");
  assert.equal(applyArenaEvent(hit, rush), hit, "repeat is ignored");
  const plain = act(battle, "player", "attack", fixed);
  const surged = act(hit, "player", "attack", fixed);
  assert.ok(surged.enemy.hp < plain.enemy.hp);
  assert.equal(surged.surgePct, 0);
  const defended = act(hit, "player", "defend", fixed);
  assert.equal(defended.surgePct, 25, "a guard turn keeps the surge");
  const over = {
    ...battle,
    winner: "player" as const,
    turn: "finished" as const,
  };
  assert.equal(applyArenaEvent(over, rush), over);
});

test("Match records keep what the wheel did, and recording twice changes nothing", () => {
  let battle = createBattle("pip", "rookie", 0, fixed, "live");
  battle = act(battle, "player", "attack", fixed, boosted(8, 15));
  const done: Battle = { ...battle, turn: "finished", winner: "player" };
  const once = recordBattle(freshProgress(), done);
  const twice = recordBattle(once, done);
  assert.equal(twice, once);
  assert.equal(once.xp, 60);
  assert.equal(once.matches[0].power?.signal, "live");
  assert.equal(once.matches[0].power?.bonusEnergy, 8);
  const restored = parseProgress(JSON.stringify(once));
  assert.deepEqual(restored, once);
});

test("Saves from before Squeek Power still load, and bad power data does not", () => {
  const old = recordBattle(freshProgress(), {
    ...createBattle("mochi", "rookie", 0, fixed),
    turn: "finished",
    winner: "enemy",
  });
  delete old.matches[0].power;
  assert.deepEqual(parseProgress(JSON.stringify(old)), old);
  const bad = clone(old) as unknown as {
    matches: { power: unknown }[];
  };
  bad.matches[0].power = { signal: "hacked" };
  assert.throws(() => parseProgress(JSON.stringify(bad)));
});

test("Readings format in the documented units", () => {
  assert.equal(formatRpm(87_707), "87.7 RPM");
  assert.equal(formatDistance(6_348_818), "6.35 km");
  assert.equal(formatDistance(6_736), "7 m");
});
