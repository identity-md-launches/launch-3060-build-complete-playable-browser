import { useEffect, useReducer } from "react";
import {
  API_ORIGIN,
  classifySignal,
  deriveModifiers,
  detectSettlementEvent,
  parseSettlements,
  parseStats,
  parseStatus,
  SchemaError,
  type ArenaEvent,
  type SettlementsSnapshot,
  type Signal,
  type SqueekMods,
  type StatsSnapshot,
  type StatusSnapshot,
} from "./squeek";

// Polling stays well inside the documented budgets: status is shared for one
// second, settlements for five, and statistics are "too heavy to poll".
export const POLL = {
  status: 10_000,
  settlements: 30_000,
  stats: 900_000,
  maxBackoff: 120_000,
  timeout: 8_000,
};

export class ApiFailure extends Error {
  constructor(
    message: string,
    readonly retryAfterMs = 0,
  ) {
    super(message);
  }
}

function retryAfter(header: string | null) {
  if (!header) return 5_000;
  const seconds = /^\d+$/.test(header)
    ? Number(header)
    : (Date.parse(header) - Date.now()) / 1000;
  return Number.isFinite(seconds)
    ? Math.max(1, Math.min(3600, Math.ceil(seconds))) * 1000
    : 5_000;
}

/** One bounded request. Every failure comes back as an ApiFailure. */
export async function readApi(
  path: string,
  cache: RequestCache,
): Promise<{ body: unknown; headers: Headers }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), POLL.timeout);
  try {
    const response = await fetch(`${API_ORIGIN}${path}`, {
      signal: controller.signal,
      credentials: "omit",
      cache,
    });
    if (response.status === 429 || response.status === 503)
      throw new ApiFailure(
        response.status === 429
          ? "The API asked this game to slow down."
          : "The API is temporarily unavailable.",
        retryAfter(response.headers.get("Retry-After")),
      );
    if (!response.ok)
      throw new ApiFailure(`The API answered with error ${response.status}.`);
    return { body: await response.json(), headers: response.headers };
  } catch (error) {
    if (error instanceof ApiFailure) throw error;
    if (controller.signal.aborted)
      throw new ApiFailure("The API did not respond in time.");
    if (error instanceof SyntaxError)
      throw new ApiFailure("The API returned an unreadable response.");
    throw new ApiFailure("Unable to reach the API. Check your connection.");
  } finally {
    clearTimeout(timer);
  }
}

export interface SqueekView {
  signal: Signal;
  mods: SqueekMods;
  snapshot: StatusSnapshot | null;
  stats: StatsSnapshot | null;
  settlements: SettlementsSnapshot | null;
  settlementError: string | null;
  /** Reading age in milliseconds, or null without a reading. */
  ageMs: number | null;
  checking: boolean;
  /** True while the API has asked for no further requests. */
  coolingDown: boolean;
  pendingEvent: ArenaEvent | null;
}

type Channel = "status" | "stats" | "settlements";

export class SqueekFeed {
  private snapshot: StatusSnapshot | null = null;
  private stats: StatsSnapshot | null = null;
  private settlements: SettlementsSnapshot | null = null;
  private settlementError: string | null = null;
  private lastError: string | null = null;
  private lastSuccess: number | null = null;
  // Set only when generatedAt moves. A frozen or cached body therefore keeps
  // ageing instead of looking fresh, and the visitor's clock is never trusted.
  private anchor: { at: number; generatedAt: string; ageMs: number } | null =
    null;
  private pendingEvent: ArenaEvent | null = null;
  private inFlight = new Set<Channel>();
  private failures: Record<Channel, number> = {
    status: 0,
    stats: 0,
    settlements: 0,
  };
  private timers: Partial<Record<Channel, ReturnType<typeof setTimeout>>> = {};
  private coolUntil = 0;
  private listeners = new Set<() => void>();
  private running = false;

  constructor(private clock: () => number = () => performance.now()) {}

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }
  private emit() {
    for (const listener of this.listeners) listener();
  }

  private onVisibility = () => {
    if (!document.hidden) this.refresh();
  };

  start() {
    if (this.running) return;
    this.running = true;
    document.addEventListener("visibilitychange", this.onVisibility);
    void this.poll("status");
    void this.poll("settlements");
    void this.poll("stats");
  }
  stop() {
    this.running = false;
    document.removeEventListener("visibilitychange", this.onVisibility);
    for (const timer of Object.values(this.timers)) clearTimeout(timer);
    this.timers = {};
  }
  /** Reads status and settlements now, unless the API asked to wait. */
  refresh() {
    if (this.clock() < this.coolUntil) return;
    void this.poll("status");
    void this.poll("settlements");
  }

  private schedule(channel: Channel, delay: number) {
    clearTimeout(this.timers[channel]);
    if (!this.running) return;
    this.timers[channel] = setTimeout(() => {
      // A hidden tab makes no requests. Returning to it reads immediately.
      if (document.hidden) this.schedule(channel, POLL[channel]);
      else void this.poll(channel);
    }, delay);
  }

  private async read(channel: Channel) {
    if (channel === "status") {
      // no-store: a revalidated body would keep an old "online" forever.
      const { body } = await readApi("/v1/status", "no-store");
      const next = parseStatus(body);
      const now = this.clock();
      if (next.generatedAt !== this.anchor?.generatedAt) {
        const received = next.measurement?.receivedAt;
        this.anchor = {
          at: now,
          generatedAt: next.generatedAt,
          ageMs: received
            ? Math.max(0, Date.parse(next.generatedAt) - Date.parse(received))
            : 0,
        };
      }
      this.snapshot = next;
      this.lastSuccess = now;
      this.lastError = null;
    } else if (channel === "stats") {
      const { body } = await readApi(
        "/v1/measurement/stats?range=7d",
        "no-cache",
      );
      this.stats = parseStats(body);
    } else {
      const { body, headers } = await readApi("/v1/settlements", "no-cache");
      const next = parseSettlements(
        body,
        headers.get("X-Squeek-Settlement-Source"),
      );
      const event = detectSettlementEvent(this.settlements, next);
      this.settlements = next;
      this.settlementError = null;
      // A settlement seen without a live wheel has no effect on the arena.
      if (event && this.view().signal.status === "live")
        this.pendingEvent = event;
    }
  }

  private async poll(channel: Channel) {
    if (this.inFlight.has(channel)) return;
    this.inFlight.add(channel);
    this.emit();
    let delay = POLL[channel];
    try {
      await this.read(channel);
      this.failures[channel] = 0;
    } catch (error) {
      const failure =
        error instanceof ApiFailure
          ? error
          : error instanceof SchemaError
            ? new ApiFailure("The API response did not match its schema.")
            : new ApiFailure("The API response could not be read.");
      this.failures[channel] += 1;
      delay = Math.min(
        POLL.maxBackoff,
        Math.max(delay, POLL.status * 2 ** this.failures[channel]),
      );
      if (failure.retryAfterMs) {
        delay = Math.max(delay, failure.retryAfterMs);
        this.coolUntil = this.clock() + failure.retryAfterMs;
      }
      if (channel === "status") this.lastError = failure.message;
      if (channel === "settlements") this.settlementError = failure.message;
    }
    this.inFlight.delete(channel);
    this.schedule(channel, delay);
    this.emit();
  }

  view(): SqueekView {
    const now = this.clock();
    const ageMs = this.anchor
      ? this.anchor.ageMs + (now - this.anchor.at)
      : null;
    const signal = classifySignal({
      snapshot: this.snapshot,
      ageMs,
      sinceSuccessMs: this.lastSuccess === null ? null : now - this.lastSuccess,
      lastError: this.lastError,
    });
    return {
      signal,
      mods: deriveModifiers(signal, this.snapshot, this.stats),
      snapshot: signal.status === "offline" ? null : this.snapshot,
      stats: this.stats,
      settlements: this.settlements,
      settlementError: this.settlementError,
      ageMs: signal.status === "offline" ? null : ageMs,
      checking: this.inFlight.has("status"),
      coolingDown: now < this.coolUntil,
      pendingEvent: signal.status === "live" ? this.pendingEvent : null,
    };
  }

  /** Hands the banked event over exactly once. */
  takeEvent(): ArenaEvent | null {
    if (this.view().signal.status !== "live") return null;
    const event = this.pendingEvent;
    this.pendingEvent = null;
    if (event) this.emit();
    return event;
  }
}

/** Rerenders on each response and once a second, so ages and status stay true. */
export function useSqueek(feed: SqueekFeed): SqueekView {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const unsubscribe = feed.subscribe(rerender);
    feed.start();
    const tick = setInterval(rerender, 1000);
    return () => {
      unsubscribe();
      clearInterval(tick);
      feed.stop();
    };
  }, [feed]);
  return feed.view();
}
