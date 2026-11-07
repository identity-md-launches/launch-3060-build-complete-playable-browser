// Reads the real Squeekchain API and runs the game's own rules on what comes
// back. Writes docs/evidence/hardware-evidence.json. Run: node scripts/tool.mjs live
// A proxied network needs NODE_USE_ENV_PROXY=1.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { act, createBattle } from "../src/game.ts";
import {
  API_ORIGIN,
  classifySignal,
  currentFinishedDay,
  deriveModifiers,
  detectSettlementEvent,
  lastFinishedDeviceDay,
  NEUTRAL_MODS,
  parseSettlements,
  parseStats,
  parseStatus,
  WHEEL_TIERS,
} from "../src/squeek.ts";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const samples = Number(arg("samples", 3));
const intervalMs = Number(arg("interval", 5)) * 1000;
const baselineFile = arg("settlement-baseline");
const output = arg("out", "docs/evidence/hardware-evidence.json");

async function read(path) {
  const started = Date.now();
  const response = await fetch(`${API_ORIGIN}${path}`, {
    headers: { Origin: "https://battle-hamster-squeekchain-genes.imd.site" },
  });
  return {
    path,
    httpStatus: response.status,
    cors: response.headers.get("access-control-allow-origin"),
    settlementSource: response.headers.get("x-squeek-settlement-source"),
    requestId: response.headers.get("x-request-id"),
    ms: Date.now() - started,
    body: await response.json(),
  };
}
const fixed = () => 0.5;
function battleTurn(mods) {
  const battle = createBattle("pip", "fighter", 0, fixed, mods.source);
  const after = act(battle, "player", "attack", fixed, mods);
  return {
    energy: after.player.energy,
    damage: battle.enemy.hp - after.enemy.hp,
    log: after.events.at(-1).text,
  };
}

const statsResponse = await read("/v1/measurement/stats?range=7d");
const stats = parseStats(statsResponse.body);
const settlementResponse = await read("/v1/settlements");
const settlements = parseSettlements(
  settlementResponse.body,
  settlementResponse.settlementSource,
);
const runsResponse = await read("/v1/measurement/runs?limit=100");

const readings = [];
let last;
for (let i = 0; i < samples; i++) {
  if (i) await new Promise((r) => setTimeout(r, intervalMs));
  const response = await read("/v1/status");
  const snapshot = parseStatus(response.body);
  const m = snapshot.measurement;
  const ageMs = m
    ? Date.parse(snapshot.generatedAt) - Date.parse(m.receivedAt)
    : null;
  const signal = classifySignal({
    snapshot,
    ageMs,
    sinceSuccessMs: 0,
    lastError: null,
  });
  const mods = deriveModifiers(signal, snapshot, stats);
  last = { snapshot, signal, mods };
  readings.push({
    requestId: response.requestId,
    corsHeader: response.cors,
    generatedAt: snapshot.generatedAt,
    receivedAt: m?.receivedAt ?? null,
    provenance: m?.provenance ?? null,
    freshness: m?.freshness ?? null,
    coreStatus: m?.coreStatus ?? null,
    rpmMilli: m?.rpmMilli ?? null,
    speedMmPerSecond: m?.speedMmPerSecond ?? null,
    distanceMm: m?.distanceMm ?? null,
    wheelModule: snapshot.wheel,
    oracleState: snapshot.oracleState,
    signerKind: snapshot.signer?.kind ?? null,
    gameSignal: signal.status,
    modifiers: mods,
  });
}

// The device's own signed passages: one passage is one wheel turn, so a gap
// gives a real RPM that was measured even while the wheel sleeps now.
const gaps = runsResponse.body.items
  .filter((item) => item.provenance === "hardware" && !item.discontinuity)
  .map((item) => ({
    at: item.startAt,
    gapMs: Number(item.boundaryGapNs) / 1e6,
  }))
  .filter((item) => item.gapMs > 0 && item.gapMs < 60_000);
const recordedRpm = gaps.map((g) => ({ at: g.at, rpm: 60_000 / g.gapMs }));
const pick = (rpm) =>
  recordedRpm.reduce((best, r) =>
    Math.abs(r.rpm - rpm) < Math.abs(best.rpm - rpm) ? r : best,
  );
const recordedInputs = recordedRpm.length
  ? [
      {
        label: "slowest recorded gap in this page",
        ...recordedRpm.reduce((a, b) => (a.rpm < b.rpm ? a : b)),
      },
      { label: "closest recorded gap to 45 RPM", ...pick(45) },
      {
        label: "fastest recorded gap in this page",
        ...recordedRpm.reduce((a, b) => (a.rpm > b.rpm ? a : b)),
      },
    ]
  : [];
if (stats.peakRpmMilli !== null)
  recordedInputs.push({
    label: "peakObservedRpmMilli from /v1/measurement/stats",
    rpm: stats.peakRpmMilli / 1000,
    at: statsResponse.body.records.peakObservedRpmMilli.occurredAt,
  });
const asLive = { status: "live", reason: "recorded hardware value" };
const withRpm = (rpm) => ({
  ...last.snapshot,
  measurement: {
    ...last.snapshot.measurement,
    rpmMilli: Math.round(rpm * 1000),
  },
});
const recordedHardwareEffect = recordedInputs.map((input) => {
  const mods = deriveModifiers(asLive, withRpm(input.rpm), stats);
  return {
    ...input,
    rpm: Number(input.rpm.toFixed(3)),
    wheelTier: mods.wheelTier,
    energyPerTurn: mods.energyPerTurn,
    turn: battleTurn(mods),
  };
});

let settlementEvent = null;
if (baselineFile) {
  const baseline = parseSettlements(
    JSON.parse(await readFile(baselineFile, "utf8")),
    "live",
  );
  const event = detectSettlementEvent(baseline, settlements);
  settlementEvent = {
    baselineCount: baseline.settlementCount,
    baselineReadAt: baseline.generatedAt,
    currentCount: settlements.settlementCount,
    currentReadAt: settlements.generatedAt,
    event,
  };
}

const report = {
  note: "Machine-written by scripts/verify-live-api.mjs from the public API. live.readings are what the wheel reported at capture time. recordedHardwareEffect runs past hardware measurements through the same rules; those values are historical, and the game itself only ever uses the current reading.",
  capturedAt: new Date().toISOString(),
  endpoint: API_ORIGIN,
  live: {
    readings,
    wheelMovingAtCapture: readings.some((r) => (r.rpmMilli ?? 0) > 0),
    neutralTurn: battleTurn(NEUTRAL_MODS),
    liveTurn: battleTurn(last.mods),
  },
  stats: {
    httpStatus: statsResponse.httpStatus,
    windowDistanceMm: stats.windowDistanceMm,
    lifetimeDistanceMm: stats.lifetimeDistanceMm,
    previousDay: stats.previousDay,
    lastFinishedDeviceDayAtCapture: lastFinishedDeviceDay(
      last.snapshot.generatedAt,
    ),
    previousDayCountsTowardsBonus:
      currentFinishedDay(stats, last.snapshot) !== null,
    peakRpmMilli: stats.peakRpmMilli,
    records: statsResponse.body.records,
  },
  settlements: {
    httpStatus: settlementResponse.httpStatus,
    source: settlements.source,
    settlementCount: settlements.settlementCount,
    safeThroughBlock: settlements.safeThroughBlock,
    newest: settlements.recent?.[0] ?? null,
    settlementEvent,
  },
  recordedHardwareEffect,
  wheelTiers: WHEEL_TIERS,
  profileReportedByRuns: runsResponse.body.items[0]?.profile ?? null,
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      signal: readings.map((r) => r.gameSignal),
      provenance: readings.map((r) => r.provenance),
      rpmMilli: readings.map((r) => r.rpmMilli),
      modifiers: last.mods,
      neutralTurn: report.live.neutralTurn,
      liveTurn: report.live.liveTurn,
      recordedHardwareEffect: recordedHardwareEffect.map((r) => ({
        rpm: r.rpm,
        tier: r.wheelTier,
        energy: r.turn.energy,
      })),
      settlementEvent,
    },
    null,
    2,
  ),
);
