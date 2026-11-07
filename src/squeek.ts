// Squeekchain integration rules: response validation, signal classification,
// battle modifiers and settlement events. Pure functions only, so every rule
// about what may count as real hardware can be tested without a network.
// Contract: https://docs.squeekchain.com/developers/api/

export const API_ORIGIN = "https://api.squeekchain.com";
export const EXPLORER_TX = "https://sepolia.etherscan.io/tx/";
const CHAIN_ID = "11155111";
const DEPLOYMENT = {
  mining: "0x2dccb11fcc2defdd188555e45acb52231e82e218",
  token: "0xd78a3956cf63164d1fa1c622ad3c66623162fa1e",
};

export type SignalStatus = "live" | "simulated" | "stale" | "offline";
export const SIGNAL_LABEL: Record<SignalStatus, string> = {
  live: "HARDWARE LIVE",
  simulated: "SIMULATED",
  stale: "STALE",
  offline: "OFFLINE",
};

/** A response that does not match the documented contract. */
export class SchemaError extends Error {}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);
function fail(path: string): never {
  throw new SchemaError(`Unexpected value at ${path}`);
}
function object(v: unknown, path: string): Json {
  return isObject(v) ? v : fail(path);
}
function text(v: unknown, path: string): string {
  return typeof v === "string" && v.length > 0 && v.length <= 200
    ? v
    : fail(path);
}
function oneOf<T extends string>(
  v: unknown,
  allowed: readonly T[],
  path: string,
): T {
  return allowed.includes(v as T) ? (v as T) : fail(path);
}
function time(v: unknown, path: string): string {
  return typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : fail(path);
}
function integer(v: unknown, path: string, max = Number.MAX_SAFE_INTEGER) {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= max
    ? v
    : fail(path);
}
/** Large values arrive as decimal strings. They stay strings for display. */
function decimal(v: unknown, path: string): string {
  return typeof v === "string" && /^\d{1,78}$/.test(v) ? v : fail(path);
}
function count(v: unknown, path: string): number {
  const value = typeof v === "number" ? v : Number(decimal(v, path));
  return integer(value, path);
}

export interface Measurement {
  freshness: "online" | "stale";
  observedAt: string;
  receivedAt: string;
  staleAfterSeconds: number;
  provenance: "hardware" | "simulated" | "replay" | "derived";
  coreStatus: "IDLE" | "ACTIVE" | "COUNTER_FAULT";
  rpmMilli: number;
  speedMmPerSecond: number;
  distanceMm: number;
  counterEpoch: string;
  cumulativeWorkUnits: string;
}
export interface WheelModule {
  state: "disabled" | "starting" | "ready" | "degraded" | "faulted" | "stopped";
  provenance: string;
  driverId: string;
  moduleVersion: string;
}
export interface StatusSnapshot {
  installationId: string;
  generatedAt: string;
  measurement: Measurement | null;
  oracleState: "accepted" | "stale" | "blocked" | "unavailable";
  signer: { kind: string; lastVerifiedAt: string } | null;
  wheel: WheelModule | null;
}

export function parseStatus(body: unknown): StatusSnapshot {
  const root = object(body, "status");
  if (root.schemaVersion !== 1) fail("status.schemaVersion");
  const raw = root.measurement;
  let measurement: Measurement | null = null;
  if (raw !== null) {
    const m = object(raw, "measurement");
    measurement = {
      freshness: oneOf(
        m.freshness,
        ["online", "stale"],
        "measurement.freshness",
      ),
      observedAt: time(m.observedAt, "measurement.observedAt"),
      receivedAt: time(m.receivedAt, "measurement.receivedAt"),
      staleAfterSeconds: integer(
        m.staleAfterSeconds,
        "measurement.staleAfterSeconds",
        86_400,
      ),
      // Anything outside the documented list is rejected, so it can never be
      // mistaken for hardware.
      provenance: oneOf(
        m.provenance,
        ["hardware", "simulated", "replay", "derived"],
        "measurement.provenance",
      ),
      coreStatus: oneOf(
        m.coreStatus,
        ["IDLE", "ACTIVE", "COUNTER_FAULT"],
        "measurement.coreStatus",
      ),
      // Ceilings sit far above anything a hamster wheel can do.
      rpmMilli: integer(m.rpmMilli, "measurement.rpmMilli", 1_000_000),
      speedMmPerSecond: integer(
        m.speedMmPerSecond,
        "measurement.speedMmPerSecond",
        50_000,
      ),
      distanceMm: integer(
        m.distanceMm,
        "measurement.distanceMm",
        1_000_000_000,
      ),
      counterEpoch: text(m.counterEpoch, "measurement.counterEpoch"),
      cumulativeWorkUnits: decimal(
        m.cumulativeWorkUnits,
        "measurement.cumulativeWorkUnits",
      ),
    };
  }
  const oracle = object(root.oracle, "oracle");
  const signer = root.signer == null ? null : object(root.signer, "signer");
  const modules = root.modules === undefined ? [] : root.modules;
  if (!Array.isArray(modules)) fail("modules");
  const wheelModule = modules
    .map((item, i) => object(item, `modules[${i}]`))
    .find((item) => item.moduleType === "wheel.counter");
  return {
    installationId: text(root.installationId, "installationId"),
    generatedAt: time(root.generatedAt, "generatedAt"),
    measurement,
    oracleState: oneOf(
      oracle.state,
      ["accepted", "stale", "blocked", "unavailable"],
      "oracle.state",
    ),
    signer: signer && {
      kind: text(signer.kind, "signer.kind"),
      lastVerifiedAt: time(signer.lastVerifiedAt, "signer.lastVerifiedAt"),
    },
    wheel: wheelModule
      ? {
          state: oneOf(
            wheelModule.state,
            ["disabled", "starting", "ready", "degraded", "faulted", "stopped"],
            "module.state",
          ),
          provenance: text(wheelModule.provenance, "module.provenance"),
          driverId: text(wheelModule.driverId, "module.driverId"),
          moduleVersion: text(
            wheelModule.moduleVersion,
            "module.moduleVersion",
          ),
        }
      : null,
  };
}

export interface StatsSnapshot {
  generatedAt: string;
  lifetimeDistanceMm: number;
  windowDistanceMm: number;
  /** The most recent finished device day, which runs 12:00 to 12:00 UTC. */
  previousDay: { date: string; distanceMm: number } | null;
  peakRpmMilli: number | null;
}

export function parseStats(body: unknown): StatsSnapshot {
  const root = object(body, "stats");
  if (root.schemaVersion !== 1) fail("stats.schemaVersion");
  const lifetime = object(root.lifetime, "lifetime");
  const activity = object(root.activity, "activity");
  const summary = object(activity.summary, "activity.summary");
  const records = object(root.records, "records");
  if (!Array.isArray(activity.days)) fail("activity.days");
  const days = activity.days.map((item, i) => {
    const day = object(item, `activity.days[${i}]`);
    const date = text(day.date, `activity.days[${i}].date`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(`activity.days[${i}].date`);
    return {
      date,
      distanceMm:
        day.distanceMm === null
          ? null
          : count(day.distanceMm, `activity.days[${i}].distanceMm`),
    };
  });
  const previous = days.at(-2);
  const peak =
    records.peakObservedRpmMilli == null
      ? null
      : object(records.peakObservedRpmMilli, "records.peakObservedRpmMilli");
  return {
    generatedAt: time(root.generatedAt, "generatedAt"),
    lifetimeDistanceMm: count(
      lifetime.observedDistanceMm,
      "lifetime.observedDistanceMm",
    ),
    windowDistanceMm: count(
      summary.observedDistanceMm,
      "activity.summary.observedDistanceMm",
    ),
    previousDay:
      previous && previous.distanceMm !== null
        ? { date: previous.date, distanceMm: previous.distanceMm }
        : null,
    peakRpmMilli: peak && count(peak.value, "records.peakObservedRpmMilli"),
  };
}

export interface Settlement {
  transactionHash: string;
  settledThroughRound: string;
  workAdded: string;
  completedBlockCount: string;
  blockHeight: string;
  ethereumBlockNumber: string;
  blockTimestamp: string;
  confirmationStatus: string;
}
export type SettlementsSnapshot =
  | {
      status: "available";
      generatedAt: string;
      /** Header value: live, or durable-cache when the indexer has fallen behind. */
      source: string;
      settlementCount: string;
      safeThroughBlock: string;
      recent: Settlement[];
    }
  | { status: "unavailable"; reason: string; source: string };

export function parseSettlements(
  body: unknown,
  source: string | null,
): SettlementsSnapshot {
  const root = object(body, "settlements");
  if (root.schemaVersion !== 3) fail("settlements.schemaVersion");
  const header = source ?? "unknown";
  if (root.status === "unavailable")
    return {
      status: "unavailable",
      reason: text(root.reason, "reason"),
      source: header,
    };
  if (root.status !== "available") fail("settlements.status");
  const chain = object(root.chain, "chain");
  if (chain.chainId !== CHAIN_ID) fail("chain.chainId");
  const mining = isObject(root.mining) ? root.mining : null;
  if (mining && isObject(mining.economy)) {
    const economy = mining.economy;
    if (
      String(economy.mining).toLowerCase() !== DEPLOYMENT.mining ||
      String(economy.token).toLowerCase() !== DEPLOYMENT.token
    )
      fail("mining.economy");
  }
  const summary = object(root.summary, "summary");
  if (!Array.isArray(root.recentSettlements)) fail("recentSettlements");
  const recent = root.recentSettlements.map((item, i) => {
    const path = `recentSettlements[${i}]`;
    const s = object(item, path);
    const hash = text(s.transactionHash, `${path}.transactionHash`);
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) fail(`${path}.transactionHash`);
    return {
      transactionHash: hash,
      settledThroughRound: decimal(s.settledThroughRound, `${path}.round`),
      workAdded: decimal(s.workAdded, `${path}.workAdded`),
      completedBlockCount: decimal(
        s.completedBlockCount,
        `${path}.completedBlockCount`,
      ),
      blockHeight: decimal(s.blockHeight, `${path}.blockHeight`),
      ethereumBlockNumber: decimal(
        s.ethereumBlockNumber,
        `${path}.ethereumBlockNumber`,
      ),
      blockTimestamp: time(s.blockTimestamp, `${path}.blockTimestamp`),
      confirmationStatus: text(
        s.confirmationStatus,
        `${path}.confirmationStatus`,
      ),
    };
  });
  return {
    status: "available",
    generatedAt: time(root.generatedAt, "generatedAt"),
    source: header,
    settlementCount: decimal(
      summary.settlementCount,
      "summary.settlementCount",
    ),
    safeThroughBlock: decimal(chain.safeThroughBlock, "chain.safeThroughBlock"),
    recent,
  };
}

/** After this long without one good response, the last reading is dropped. */
export const OFFLINE_AFTER_MS = 300_000;

export interface Signal {
  status: SignalStatus;
  reason: string;
}
export interface SignalInput {
  snapshot: StatusSnapshot | null;
  /** Age of the reading, measured without trusting the visitor's clock. */
  ageMs: number | null;
  /** Time since the last valid response. */
  sinceSuccessMs: number | null;
  /** Why the most recent request failed, when it did. */
  lastError: string | null;
}

/**
 * The only place a reading can become HARDWARE LIVE. Every condition has to
 * hold, and non-hardware provenance is decided first so that no later branch
 * can promote it.
 */
export function classifySignal(input: SignalInput): Signal {
  const { snapshot, ageMs, sinceSuccessMs, lastError } = input;
  if (!snapshot)
    return {
      status: "offline",
      reason: lastError ?? "Waiting for the first reading.",
    };
  if (sinceSuccessMs === null || sinceSuccessMs > OFFLINE_AFTER_MS)
    return {
      status: "offline",
      reason: lastError ?? "The API has not answered for over 5 minutes.",
    };
  const m = snapshot.measurement;
  if (!m)
    return {
      status: "offline",
      reason: "No accepted wheel reading exists yet.",
    };
  const wheel = snapshot.wheel;
  if (m.provenance !== "hardware")
    return {
      status: "simulated",
      reason: `The API labels this reading "${m.provenance}", not hardware.`,
    };
  if (wheel && wheel.provenance !== "hardware")
    return {
      status: "simulated",
      reason: `The wheel module reports "${wheel.provenance}", not hardware.`,
    };
  if (m.coreStatus === "COUNTER_FAULT")
    return { status: "offline", reason: "The wheel counter reports a fault." };
  if (wheel && ["faulted", "stopped", "disabled"].includes(wheel.state))
    return { status: "offline", reason: `The wheel module is ${wheel.state}.` };
  if (lastError)
    return {
      status: "stale",
      reason: `Showing the last reading. ${lastError}`,
    };
  if (
    m.freshness !== "online" ||
    ageMs === null ||
    ageMs > m.staleAfterSeconds * 1000
  )
    return {
      status: "stale",
      reason: `No accepted reading in the last ${m.staleAfterSeconds} seconds.`,
    };
  if (!wheel)
    return { status: "stale", reason: "The wheel module was not reported." };
  if (wheel.state !== "ready")
    return { status: "stale", reason: `The wheel module is ${wheel.state}.` };
  return {
    status: "live",
    reason: "The device reading is fresh, signed and labelled hardware.",
  };
}

export const WHEEL_TIERS = [
  { name: "Resting", minRpm: 0, energyPerTurn: 0 },
  { name: "Jogging", minRpm: 1, energyPerTurn: 4 },
  { name: "Running", minRpm: 30, energyPerTurn: 8 },
  { name: "Sprinting", minRpm: 60, energyPerTurn: 12 },
] as const;
export const TRAIL_TIERS = [
  { name: "No trail", minKm: 0, damagePct: 0 },
  { name: "Short trail", minKm: 0.5, damagePct: 5 },
  { name: "Long trail", minKm: 2, damagePct: 10 },
  { name: "Marathon trail", minKm: 5, damagePct: 15 },
] as const;
/** Full meter. Set just above the wheel's recorded peak of about 88 RPM. */
const ARENA_ENERGY_FULL_RPM = 90;

export interface SqueekMods {
  source: SignalStatus;
  /** Extra energy on each of the player's turns, from wheel speed. */
  energyPerTurn: number;
  /** Extra outgoing damage, from verified distance. */
  damagePct: number;
  /** Arena energy meter, 0 to 100. */
  arenaEnergy: number;
  wheelTier: string;
  trailTier: string;
  /** Null when no verified distance is available. */
  verifiedDistanceMm: number | null;
}
export const NEUTRAL_MODS: SqueekMods = {
  source: "offline",
  energyPerTurn: 0,
  damagePct: 0,
  arenaEnergy: 0,
  wheelTier: "None",
  trailTier: "None",
  verifiedDistanceMm: null,
};

/** Distance counts only when the Oracle accepted it and the signer checked out. */
export function isDistanceVerified(snapshot: StatusSnapshot): boolean {
  const m = snapshot.measurement;
  if (!m || snapshot.oracleState !== "accepted" || !snapshot.signer)
    return false;
  const signerAge =
    Date.parse(m.receivedAt) - Date.parse(snapshot.signer.lastVerifiedAt);
  return signerAge <= m.staleAfterSeconds * 1000;
}

export function deriveModifiers(
  signal: Signal,
  snapshot: StatusSnapshot | null,
  stats: StatsSnapshot | null,
): SqueekMods {
  const m = snapshot?.measurement;
  if (signal.status !== "live" || !snapshot || !m)
    return { ...NEUTRAL_MODS, source: signal.status };
  const rpm = m.rpmMilli / 1000;
  const wheel = [...WHEEL_TIERS].reverse().find((t) => rpm >= t.minRpm)!;
  // The device's daily distance resets at 12:00 UTC, while hamsters run at
  // night, so the better of today and the last finished day sets the trail.
  const distance = isDistanceVerified(snapshot)
    ? Math.max(m.distanceMm, stats?.previousDay?.distanceMm ?? 0)
    : null;
  const km = (distance ?? 0) / 1_000_000;
  const trail = [...TRAIL_TIERS].reverse().find((t) => km >= t.minKm)!;
  return {
    source: "live",
    energyPerTurn: wheel.energyPerTurn,
    damagePct: trail.damagePct,
    arenaEnergy: Math.min(100, Math.round((rpm / ARENA_ENERGY_FULL_RPM) * 100)),
    wheelTier: wheel.name,
    trailTier: trail.name,
    verifiedDistanceMm: distance,
  };
}

export interface ArenaEvent {
  /** One key per settlement, so an event can only ever be applied once. */
  key: string;
  kind: "block-rush" | "settlement-tremor";
  name: string;
  energy: number;
  surgePct: number;
  transactionHash: string | null;
  completedBlocks: number;
}
export const ARENA_EVENTS = {
  "block-rush": { name: "Block rush", energy: 20, surgePct: 25 },
  "settlement-tremor": { name: "Settlement tremor", energy: 10, surgePct: 0 },
} as const;

/**
 * Compares two settlement reads. The first read only sets a baseline, so
 * opening or reloading the page never triggers anything. A cached snapshot is
 * not evidence of something new.
 */
export function detectSettlementEvent(
  previous: SettlementsSnapshot | null,
  next: SettlementsSnapshot,
): ArenaEvent | null {
  if (previous?.status !== "available" || next.status !== "available")
    return null;
  if (next.source !== "live") return null;
  if (BigInt(next.settlementCount) <= BigInt(previous.settlementCount))
    return null;
  const newest = next.recent[0];
  const isNewBlock =
    newest &&
    newest.transactionHash !== previous.recent[0]?.transactionHash &&
    newest.confirmationStatus === "safe" &&
    BigInt(newest.completedBlockCount) > 0n;
  const kind = isNewBlock ? "block-rush" : "settlement-tremor";
  return {
    key: `settlement:${next.settlementCount}`,
    kind,
    ...ARENA_EVENTS[kind],
    transactionHash: isNewBlock ? newest.transactionHash : null,
    completedBlocks: isNewBlock ? Number(newest.completedBlockCount) : 0,
  };
}

export const formatRpm = (rpmMilli: number) =>
  `${(rpmMilli / 1000).toFixed(1)} RPM`;
export const formatSpeed = (mmPerSecond: number) =>
  `${(mmPerSecond / 1000).toFixed(2)} m/s`;
export function formatDistance(mm: number) {
  return mm >= 1_000_000
    ? `${(mm / 1_000_000).toFixed(2)} km`
    : `${Math.round(mm / 1000)} m`;
}
export function formatAge(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 90) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return minutes < 90
    ? `${minutes} min ago`
    : `${Math.round(minutes / 60)} h ago`;
}
