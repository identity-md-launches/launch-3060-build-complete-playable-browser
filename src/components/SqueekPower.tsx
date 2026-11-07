import { type CSSProperties } from "react";
import {
  ARENA_EVENTS,
  currentFinishedDay,
  EXPLORER_TX,
  formatAge,
  formatDistance,
  formatRpm,
  formatSpeed,
  isDistanceVerified,
  SIGNAL_LABEL,
  TRAIL_TIERS,
  WHEEL_TIERS,
  type SignalStatus,
} from "../squeek";
import type { SqueekView } from "../squeekFeed";
import { Icon, type IconName } from "./Icon";

const SIGNAL_ICON: Record<SignalStatus, IconName> = {
  live: "wheel",
  simulated: "flask",
  stale: "clock",
  offline: "unplugged",
};

export function SignalBadge({ status }: { status: SignalStatus }) {
  return (
    <span className={`signal-badge ${status}`}>
      <Icon name={SIGNAL_ICON[status]} size={16} />
      {SIGNAL_LABEL[status]}
    </span>
  );
}

/** Seconds per wheel turn, drawn at the real rate within a readable range. */
function wheelSpin(rpmMilli: number): CSSProperties | undefined {
  if (rpmMilli <= 0) return undefined;
  const seconds = Math.min(3, Math.max(0.4, 60_000 / rpmMilli));
  return { "--wheel-spin": `${seconds.toFixed(2)}s` } as CSSProperties;
}

export function PowerStrip({
  view,
  onOpen,
}: {
  view: SqueekView;
  onOpen: () => void;
}) {
  const { signal, mods, snapshot, ageMs, pendingEvent, checking } = view;
  const live = signal.status === "live";
  const reading = snapshot?.measurement;
  return (
    <section className="power-strip" aria-label="Live Squeek Power">
      <span className="visually-hidden" role="status">
        Wheel signal: {SIGNAL_LABEL[signal.status]}
      </span>
      <span
        className={`power-wheel ${live && reading?.rpmMilli ? "spinning" : ""}`}
        style={live && reading ? wheelSpin(reading.rpmMilli) : undefined}
      >
        <SignalBadge status={signal.status} />
      </span>
      {live && reading ? (
        <div className="power-summary">
          <strong>
            Arena energy {mods.arenaEnergy}% · +{mods.energyPerTurn} energy a
            turn · +{mods.damagePct}% damage
          </strong>
          <span className="small muted">
            {mods.wheelTier} at {formatRpm(reading.rpmMilli)}
            {mods.verifiedDistanceMm !== null
              ? ` · ${mods.trailTier}, ${formatDistance(mods.verifiedDistanceMm)}`
              : " · Distance not verified"}
            {ageMs !== null ? ` · Updated ${formatAge(ageMs)}` : ""}
          </span>
          {pendingEvent && (
            <span className="small power-event">
              <Icon name="spark" size={14} />
              {pendingEvent.name} is ready for your next battle.
            </span>
          )}
          <progress
            className="arena-progress"
            value={mods.arenaEnergy}
            max={100}
            aria-label="Arena energy from wheel speed"
          />
        </div>
      ) : (
        <div className="power-summary">
          <strong>Neutral rules · No Squeek Power</strong>
          <span className="small muted">
            {checking && signal.status === "offline"
              ? "Checking the wheel…"
              : signal.reason}
          </span>
        </div>
      )}
      <button className="button secondary power-open" onClick={onOpen}>
        Wheel details
      </button>
    </section>
  );
}

export function PowerDetails({
  view,
  onRefresh,
}: {
  view: SqueekView;
  onRefresh: () => void;
}) {
  const {
    signal,
    mods,
    snapshot,
    stats,
    settlements,
    settlementError,
    statsError,
    ageMs,
    checking,
    coolingDown,
  } = view;
  const reading = snapshot?.measurement ?? null;
  const finishedDay = currentFinishedDay(stats, snapshot);
  const unknown = "Unknown";
  const heading =
    signal.status === "live"
      ? "Wheel reading"
      : signal.status === "stale"
        ? "Last reading, no longer current"
        : signal.status === "simulated"
          ? "Simulated reading, not hardware"
          : "Wheel reading unavailable";
  const rows: [string, string][] = [
    ["Wheel speed", reading ? formatRpm(reading.rpmMilli) : unknown],
    [
      "Running speed",
      reading ? formatSpeed(reading.speedMmPerSecond) : unknown,
    ],
    ["Distance today", reading ? formatDistance(reading.distanceMm) : unknown],
    [
      "Hardware status",
      reading
        ? `${reading.coreStatus}, wheel module ${snapshot?.wheel?.state ?? "not reported"}`
        : unknown,
    ],
    ["Provenance", reading?.provenance ?? unknown],
    [
      "Freshness",
      reading
        ? `${reading.freshness}, stale after ${reading.staleAfterSeconds}s`
        : unknown,
    ],
    [
      "Last update",
      reading
        ? `${new Date(reading.receivedAt).toLocaleTimeString()}${ageMs !== null ? `, ${formatAge(ageMs)}` : ""}`
        : unknown,
    ],
  ];
  return (
    <div className="power-details">
      <div className="power-state">
        <SignalBadge status={signal.status} />
        <p className="small">{signal.reason}</p>
        <button
          className="button secondary"
          disabled={checking || coolingDown}
          onClick={onRefresh}
        >
          <Icon name="bolt" size={16} />
          {checking
            ? "Checking…"
            : coolingDown
              ? "Waiting for API"
              : "Check now"}
        </button>
      </div>

      <h3>{heading}</h3>
      <dl className="reading-list">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <h3>What the wheel changes in battle</h3>
      <p className="small muted">
        Bonuses apply on your turns while the signal is HARDWARE LIVE. Any other
        status uses neutral rules.
      </p>
      <div className="power-rules">
        <table>
          <thead>
            <tr>
              <th scope="col">Wheel speed</th>
              <th scope="col">Extra energy a turn</th>
            </tr>
          </thead>
          <tbody>
            {WHEEL_TIERS.map((tier, i) => {
              const current = mods.wheelTier === tier.name;
              return (
                <tr key={tier.name} className={current ? "current" : ""}>
                  <td>
                    {tier.name}
                    <span className="muted">
                      {i === 0
                        ? " · below 1 RPM"
                        : ` · ${tier.minRpm} RPM or more`}
                    </span>
                    {current && " · Now"}
                  </td>
                  <td>+{tier.energyPerTurn}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <table>
          <thead>
            <tr>
              <th scope="col">Verified distance</th>
              <th scope="col">Extra damage</th>
            </tr>
          </thead>
          <tbody>
            {TRAIL_TIERS.map((tier, i) => {
              const current = mods.trailTier === tier.name;
              return (
                <tr key={tier.name} className={current ? "current" : ""}>
                  <td>
                    {tier.name}
                    <span className="muted">
                      {i === 0
                        ? " · below 0.5 km"
                        : ` · ${tier.minKm} km or more`}
                    </span>
                    {current && " · Now"}
                  </td>
                  <td>+{tier.damagePct}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="small muted">
        Verified distance is the higher of today and the last finished device
        day, which runs 12:00 to 12:00 UTC.
        {finishedDay
          ? ` Last finished day, ${finishedDay.date}: ${formatDistance(finishedDay.distanceMm)}.`
          : stats?.previousDay && snapshot
            ? ` The last statistics read covers ${stats.previousDay.date}, which is no longer the last finished day, so only today's distance counts.`
            : " The last finished day is not available, so only today's distance counts."}
        {statsError ? ` Statistics: ${statsError}` : ""}
        {snapshot && !isDistanceVerified(snapshot)
          ? " The Oracle or signer has not confirmed this reading, so distance gives no bonus."
          : ""}
      </p>
      <p className="small muted">
        A new settlement triggers an arena event:{" "}
        {ARENA_EVENTS["block-rush"].name} gives +
        {ARENA_EVENTS["block-rush"].energy} energy and +
        {ARENA_EVENTS["block-rush"].surgePct}% on your next hit when blocks
        completed. {ARENA_EVENTS["settlement-tremor"].name} gives +
        {ARENA_EVENTS["settlement-tremor"].energy} energy otherwise.
      </p>

      <h3>Confirmed on Sepolia</h3>
      {settlements?.status === "available" ? (
        <>
          <p className="small muted">
            {settlements.settlementCount} settlements, read at Ethereum block{" "}
            {settlements.safeThroughBlock}.
            {settlements.source !== "live"
              ? " This is a cached snapshot, so it triggers no events."
              : ""}
          </p>
          {settlements.recent.length ? (
            <ul className="settlement-list">
              {settlements.recent.slice(0, 3).map((s) => (
                <li key={s.transactionHash}>
                  <span>
                    Squeek block {s.blockHeight} · {s.workAdded} work units
                  </span>
                  <span className="small muted">
                    {new Date(s.blockTimestamp).toLocaleString()} ·{" "}
                    {s.confirmationStatus}
                  </span>
                  <a
                    className="inline-link small"
                    href={`${EXPLORER_TX}${s.transactionHash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View transaction {s.transactionHash.slice(0, 10)}…
                    <Icon name="external" size={14} />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted">
              No settlement has completed a block yet.
            </p>
          )}
        </>
      ) : (
        <p className="small">
          {settlementError ??
            (settlements
              ? `Settlements are unavailable: ${settlements.reason}.`
              : "Settlements are loading.")}
        </p>
      )}

      {stats && (
        <>
          <h3>Wheel records</h3>
          <dl className="reading-list">
            <div>
              <dt>Last 7 days</dt>
              <dd>{formatDistance(stats.windowDistanceMm)}</dd>
            </div>
            <div>
              <dt>All time</dt>
              <dd>{formatDistance(stats.lifetimeDistanceMm)}</dd>
            </div>
            {stats.peakRpmMilli !== null && (
              <div>
                <dt>Peak wheel speed</dt>
                <dd>{formatRpm(stats.peakRpmMilli)}</dd>
              </div>
            )}
          </dl>
        </>
      )}

      {snapshot && (
        <details className="power-source">
          <summary>Data source</summary>
          <dl className="reading-list">
            <div>
              <dt>Installation</dt>
              <dd>{snapshot.installationId}</dd>
            </div>
            <div>
              <dt>Oracle</dt>
              <dd>{snapshot.oracleState}</dd>
            </div>
            <div>
              <dt>Device signer</dt>
              <dd>{snapshot.signer?.kind ?? "Not reported"}</dd>
            </div>
            <div>
              <dt>Wheel driver</dt>
              <dd>
                {snapshot.wheel
                  ? `${snapshot.wheel.driverId} ${snapshot.wheel.moduleVersion}`
                  : "Not reported"}
              </dd>
            </div>
            <div>
              <dt>API snapshot</dt>
              <dd>{new Date(snapshot.generatedAt).toLocaleTimeString()}</dd>
            </div>
          </dl>
        </details>
      )}
      <p className="small muted">
        Provenance is what the official API reports. This browser does not check
        the device signature itself. The wheel never changes XP, and game XP is
        not $SQK.
      </p>
      <a
        className="inline-link small"
        href="https://docs.squeekchain.com/developers/api/"
        target="_blank"
        rel="noreferrer"
      >
        Read the Squeekchain API docs
        <Icon name="external" size={14} />
      </a>
    </div>
  );
}
