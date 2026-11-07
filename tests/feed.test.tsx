import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act as flush,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import App from "../src/App";
import { STORAGE_KEY } from "../src/storage";
import { POLL, SqueekFeed } from "../src/squeekFeed";
import { createBattle, freshProgress, recordBattle } from "../src/game";

const fixture = (name: string) =>
  JSON.parse(readFileSync(`tests/fixtures/live-${name}.json`, "utf8"));
const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });

type Override = (b: ReturnType<typeof fixture>) => void;
/** A controllable API built on real captured responses, stamped with "now". */
function fakeApi() {
  const state = {
    status: (() => undefined) as Override,
    settlementCount: 271,
    settlementSource: "live",
    freezeAt: null as string | null,
    fail: null as null | (() => Response | Promise<Response>),
    settlementFail: null as null | (() => Response),
    settlements: (() => undefined) as Override,
    statsFail: null as null | (() => Promise<Response>),
    calls: [] as { url: string; cache?: RequestCache }[],
  };
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    state.calls.push({ url, cache: init?.cache });
    if (url.endsWith("/v1/status")) {
      if (state.fail) return state.fail();
      const body = fixture("status");
      const now = new Date().toISOString();
      body.generatedAt = state.freezeAt ?? now;
      body.measurement.receivedAt = state.freezeAt ?? now;
      body.signer.lastVerifiedAt = state.freezeAt ?? now;
      state.status(body);
      return json(body);
    }
    if (url.includes("/v1/settlements")) {
      if (state.settlementFail) return state.settlementFail();
      const body = fixture("settlements");
      body.summary.settlementCount = String(state.settlementCount);
      state.settlements(body);
      return json(body, {
        headers: {
          "Content-Type": "application/json",
          "X-Squeek-Settlement-Source": state.settlementSource,
        },
      });
    }
    if (state.statsFail) return state.statsFail();
    return json(fixture("stats"));
  });
  vi.stubGlobal("fetch", fetchMock);
  return { state, fetchMock };
}
const running =
  (rpm: number, km = 0): Override =>
  (b) => {
    b.measurement.rpmMilli = rpm * 1000;
    b.measurement.distanceMm = km * 1_000_000;
    b.measurement.coreStatus = "ACTIVE";
  };
async function advance(ms: number) {
  await flush(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
function newFeed() {
  const feed = new SqueekFeed(() => Date.now());
  feed.start();
  return feed;
}

// The captured statistics' last finished day is 2026-11-05, which is current
// until 2026-11-07T12:00Z. Tests run at the capture time, not the host's clock.
const CAPTURED_AT = new Date("2026-11-07T00:12:00.000Z");
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(CAPTURED_AT);
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Squeekchain API client", () => {
  it("reads the three documented endpoints with valid queries and no credentials", async () => {
    const { state, fetchMock } = fakeApi();
    const feed = newFeed();
    await advance(10);
    expect(state.calls.map((c) => c.url).sort()).toEqual([
      "https://api.squeekchain.com/v1/measurement/stats?range=7d",
      "https://api.squeekchain.com/v1/settlements",
      "https://api.squeekchain.com/v1/status",
    ]);
    for (const [, init] of fetchMock.mock.calls)
      expect((init as RequestInit).credentials).toBe("omit");
    expect(state.calls.find((c) => c.url.endsWith("status"))?.cache).toBe(
      "no-store",
    );
    expect(feed.view().signal.status).toBe("live");
    feed.stop();
  });
  it("keeps polling, and never asks for statistics on the status schedule", async () => {
    const { state } = fakeApi();
    const feed = newFeed();
    await advance(60_000);
    const count = (part: string) =>
      state.calls.filter((c) => c.url.includes(part)).length;
    expect(count("/v1/status")).toBe(7);
    expect(count("/v1/settlements")).toBe(3);
    expect(count("/v1/measurement/stats")).toBe(1);
    feed.stop();
  });
  it("makes no requests from a hidden tab, and reads at once on return", async () => {
    const { state } = fakeApi();
    const feed = newFeed();
    await advance(10);
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    const before = state.calls.length;
    await advance(60_000);
    expect(state.calls.length).toBe(before);
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event("visibilitychange"));
    await advance(10);
    expect(state.calls.length).toBeGreaterThan(before);
    feed.stop();
  });
  it("times out a hung request and reports it instead of waiting forever", async () => {
    const { state } = fakeApi();
    const hung = (_: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      });
    vi.stubGlobal("fetch", vi.fn(hung));
    const feed = newFeed();
    await advance(POLL.timeout + 10);
    expect(feed.view().signal.status).toBe("offline");
    expect(feed.view().signal.reason).toContain("did not respond in time");
    expect(feed.view().mods.energyPerTurn).toBe(0);
    feed.stop();
    state.fail = null;
  });
  it("treats a network failure, HTTP error, bad JSON and bad schema as offline", async () => {
    const cases: [() => Promise<Response>, string][] = [
      [() => Promise.reject(new TypeError("offline")), "Unable to reach"],
      [async () => json({ error: "internal_error" }, { status: 500 }), "500"],
      [async () => new Response("<html>", { status: 200 }), "unreadable"],
      [async () => json({ schemaVersion: 1 }), "did not match its schema"],
      [async () => json(null), "did not match its schema"],
    ];
    for (const [respond, message] of cases) {
      const { state } = fakeApi();
      state.fail = respond;
      const feed = newFeed();
      await advance(10);
      const view = feed.view();
      expect(view.signal.status).toBe("offline");
      expect(view.signal.reason).toContain(message);
      expect(view.snapshot).toBeNull();
      expect(view.mods.damagePct).toBe(0);
      feed.stop();
    }
  });
  it("honours Retry-After on 429 and 503, and holds manual checks", async () => {
    for (const status of [429, 503]) {
      const { state } = fakeApi();
      state.fail = () =>
        new Response('{"error":"rate_limited"}', {
          status,
          headers: { "Retry-After": "90" },
        });
      const feed = newFeed();
      await advance(10);
      expect(feed.view().coolingDown).toBe(true);
      const statusCalls = () =>
        state.calls.filter((c) => c.url.endsWith("/v1/status")).length;
      expect(statusCalls()).toBe(1);
      feed.refresh();
      await advance(89_000);
      expect(statusCalls()).toBe(1);
      await advance(2_000);
      expect(statusCalls()).toBe(2);
      feed.stop();
    }
  });
  it("drops to STALE on the first failed poll, then OFFLINE after 5 minutes", async () => {
    const { state } = fakeApi();
    const feed = newFeed();
    await advance(10);
    expect(feed.view().signal.status).toBe("live");
    state.fail = () => Promise.reject(new TypeError("gone"));
    await advance(POLL.status + 10);
    const stale = feed.view();
    expect(stale.signal.status).toBe("stale");
    expect(stale.snapshot).not.toBeNull();
    expect(stale.mods.source).toBe("stale");
    await advance(300_000);
    const offline = feed.view();
    expect(offline.signal.status).toBe("offline");
    expect(offline.snapshot).toBeNull();
    feed.stop();
  });
  it("recovers to HARDWARE LIVE when the API answers again", async () => {
    const { state } = fakeApi();
    const feed = newFeed();
    await advance(10);
    state.fail = () => Promise.reject(new TypeError("gone"));
    await advance(POLL.status + 10);
    expect(feed.view().signal.status).toBe("stale");
    state.fail = null;
    await advance(POLL.maxBackoff + 10);
    expect(feed.view().signal.status).toBe("live");
    feed.stop();
  });
  it("ages a frozen response even though the body still says online", async () => {
    const { state } = fakeApi();
    state.freezeAt = new Date().toISOString();
    const feed = newFeed();
    await advance(10);
    expect(feed.view().signal.status).toBe("live");
    await advance(119_000);
    expect(feed.view().signal.status).toBe("live");
    await advance(2_000);
    expect(feed.view().snapshot?.measurement?.freshness).toBe("online");
    expect(feed.view().signal.status).toBe("stale");
    expect(feed.view().mods.energyPerTurn).toBe(0);
    feed.stop();
  });
  it("does not trust the visitor's clock", async () => {
    const { state } = fakeApi();
    // The API's time is an hour behind this browser, and the reading is fresh.
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
    state.status = (b) => {
      b.generatedAt = hourAgo;
      b.measurement.receivedAt = hourAgo;
      b.signer.lastVerifiedAt = hourAgo;
    };
    const feed = newFeed();
    await advance(10);
    expect(feed.view().signal.status).toBe("live");
    feed.stop();
  });
  it("drops an expired finished day at the noon rollover, even while statistics fail", async () => {
    vi.setSystemTime(new Date("2026-11-07T11:55:00.000Z"));
    const { state } = fakeApi();
    const feed = newFeed();
    await advance(10);
    const before = feed.view();
    expect(before.signal.status).toBe("live");
    expect(before.mods.verifiedDistanceMm).toBe(6_348_818);
    expect(before.mods.damagePct).toBe(15);
    state.statsFail = () => Promise.reject(new TypeError("gone"));
    const statsCalls = () =>
      state.calls.filter((c) => c.url.includes("/v1/measurement/stats")).length;
    const callsBefore = statsCalls();
    await advance(25 * 60_000);
    const after = feed.view();
    expect(after.signal.status).toBe("live");
    expect(after.stats?.previousDay?.date).toBe("2026-11-05");
    expect(after.mods.verifiedDistanceMm).toBe(0);
    expect(after.mods.trailTier).toBe("No trail");
    expect(after.mods.damagePct).toBe(0);
    expect(after.statsError).toMatch(/Unable to reach the API/);
    // Failed reads retry on the 2-minute backoff plus one rollover re-read,
    // never once per 10-second status poll.
    expect(statsCalls() - callsBefore).toBeGreaterThan(0);
    expect(statsCalls() - callsBefore).toBeLessThanOrEqual(25 / 2 + 2);
    feed.stop();
  });
  it("banks one event per settlement, and only with a live wheel", async () => {
    const { state } = fakeApi();
    const feed = newFeed();
    await advance(10);
    expect(feed.view().pendingEvent).toBeNull();
    state.settlementCount = 272;
    await advance(POLL.settlements + 10);
    expect(feed.view().pendingEvent?.key).toBe("settlement:272");
    expect(feed.takeEvent()?.key).toBe("settlement:272");
    expect(feed.takeEvent()).toBeNull();
    await advance(POLL.settlements + 10);
    expect(feed.view().pendingEvent).toBeNull();
    state.status = (b) => (b.measurement.provenance = "simulated");
    await advance(POLL.status + 10);
    state.settlementCount = 273;
    await advance(POLL.settlements + 10);
    expect(feed.view().pendingEvent).toBeNull();
    // It must not fire late either, once the wheel is live again.
    state.status = () => undefined;
    await advance(POLL.status + 10);
    expect(feed.view().signal.status).toBe("live");
    expect(feed.view().pendingEvent).toBeNull();
    feed.stop();
  });
  it("ignores cached settlements and reports unavailable ones as unknown", async () => {
    const { state } = fakeApi();
    const feed = newFeed();
    await advance(10);
    state.settlementSource = "durable-cache";
    state.settlementCount = 280;
    await advance(POLL.settlements + 10);
    expect(feed.view().pendingEvent).toBeNull();
    state.settlementFail = () =>
      json({
        schemaVersion: 3,
        status: "unavailable",
        reason: "indexer_unavailable",
      });
    await advance(POLL.settlements + 10);
    expect(feed.view().settlements?.status).toBe("unavailable");
    expect(feed.view().signal.status).toBe("live");
    feed.stop();
  });
});

describe("Squeek Power in the game", () => {
  const click = (name: string | RegExp) =>
    fireEvent.click(screen.getByRole("button", { name }));
  const start = () => {
    click("Play now");
    click("Enter the arena");
  };
  const enemyHealth = () =>
    Number(
      (
        screen.getByRole("progressbar", {
          name: "Opponent health",
        }) as HTMLProgressElement
      ).value,
    );
  const playerEnergy = () =>
    Number(
      (
        screen.getByRole("progressbar", {
          name: "Your energy",
        }) as HTMLProgressElement
      ).value,
    );

  it("shows a live wheel, and the wheel changes the turn", async () => {
    const { state } = fakeApi();
    state.status = running(46, 3);
    render(<App />);
    await advance(10);
    const strip = screen.getByRole("region", { name: "Live Squeek Power" });
    expect(strip.textContent).toContain("HARDWARE LIVE");
    expect(strip.textContent).toContain("+8 energy a turn");
    expect(strip.textContent).toContain("46.0 RPM");
    start();
    expect(
      screen.getByRole("button", { name: /^Attack/ }).textContent,
    ).toContain("+23 energy");
    click(/^Attack/);
    expect(playerEnergy()).toBe(63);
    expect(
      screen.getAllByText(/Squeek Power: \+\d+ damage, \+8 energy/),
    ).toBeTruthy();
    await advance(500);
  });
  it("gives a simulated wheel no HARDWARE LIVE label and no bonus", async () => {
    const { state } = fakeApi();
    state.status = (b) => {
      running(88, 9)(b);
      b.measurement.provenance = "simulated";
      b.modules[0].provenance = "simulated";
    };
    render(<App />);
    await advance(10);
    const strip = screen.getByRole("region", { name: "Live Squeek Power" });
    expect(strip.textContent).toContain("SIMULATED");
    expect(strip.textContent).not.toContain("HARDWARE LIVE");
    expect(strip.textContent).toContain("Neutral rules");
    start();
    click(/^Attack/);
    expect(playerEnergy()).toBe(55);
    await advance(500);
  });
  it("uses neutral rules when the API cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("nope")));
    render(<App />);
    await advance(10);
    const strip = screen.getByRole("region", { name: "Live Squeek Power" });
    expect(strip.textContent).toContain("OFFLINE");
    expect(strip.textContent).toContain("Unable to reach the API");
    click("Wheel details");
    expect(screen.getAllByText("Unknown").length).toBeGreaterThan(5);
    click("Close dialog");
    start();
    click(/^Attack/);
    expect(playerEnergy()).toBe(55);
    await advance(500);
  });
  it("goes neutral mid-battle the moment the signal is lost", async () => {
    const { state } = fakeApi();
    state.status = running(70, 6);
    render(<App />);
    await advance(10);
    start();
    click(/^Attack/);
    expect(playerEnergy()).toBe(67);
    await advance(500);
    state.fail = () => Promise.reject(new TypeError("gone"));
    await advance(POLL.status + 10);
    expect(
      screen.getByRole("region", { name: "Live Squeek Power" }).textContent,
    ).toContain("STALE");
    const hp = enemyHealth();
    click(/^Attack/);
    expect(playerEnergy()).toBe(82);
    expect(hp - enemyHealth()).toBe(18);
    await advance(500);
  });
  it("cancels a Block rush surge when the signal stops being live before the hit", async () => {
    const { state } = fakeApi();
    render(<App />);
    await advance(10);
    start();
    state.settlementCount = 272;
    state.settlements = (b) => {
      b.recentSettlements[0].transactionHash = "0x" + "b".repeat(64);
      b.recentSettlements[0].completedBlockCount = "3";
    };
    await advance(POLL.settlements + 10);
    expect(playerEnergy()).toBe(60);
    expect(screen.getAllByText(/Block rush/).length).toBeGreaterThan(0);
    state.fail = () => Promise.reject(new TypeError("gone"));
    await advance(POLL.status + 10);
    expect(
      screen.getByRole("region", { name: "Live Squeek Power" }).textContent,
    ).toContain("STALE");
    expect(screen.getAllByText(/surge is cancelled/).length).toBeGreaterThan(0);
    // Recovering the signal does not bring the cancelled surge back.
    state.fail = null;
    await advance(POLL.maxBackoff + 10);
    state.fail = () => Promise.reject(new TypeError("gone"));
    await advance(POLL.maxBackoff + 10);
    expect(
      screen.getByRole("region", { name: "Live Squeek Power" }).textContent,
    ).not.toContain("HARDWARE LIVE");
    const hp = enemyHealth();
    click(/^Attack/);
    expect(hp - enemyHealth()).toBe(18);
    expect(screen.queryAllByText(/Squeek Power: \+/).length).toBe(0);
    await advance(500);
  });
  it("applies a settlement during a battle exactly once", async () => {
    const { state } = fakeApi();
    render(<App />);
    await advance(10);
    start();
    state.settlementCount = 272;
    await advance(POLL.settlements + 10);
    expect(playerEnergy()).toBe(50);
    expect(screen.getAllByText(/Settlement tremor/).length).toBeGreaterThan(0);
    await advance(POLL.settlements + 10);
    expect(playerEnergy()).toBe(50);
  });
  it("banks a settlement seen on the menu for the next battle", async () => {
    const { state } = fakeApi();
    render(<App />);
    await advance(10);
    state.settlementCount = 272;
    await advance(POLL.settlements + 10);
    expect(screen.getByText(/is ready for your next battle/)).toBeTruthy();
    start();
    expect(playerEnergy()).toBe(50);
    expect(screen.queryByText(/is ready for your next battle/)).toBeNull();
  });
  it("records what the wheel did, labels it local, and saves XP once", async () => {
    const { state } = fakeApi();
    state.status = running(70, 6);
    render(<App />);
    await advance(10);
    start();
    let moves = 0;
    while (screen.queryByRole("button", { name: /^Attack/ }) && moves < 40) {
      const special = screen.getByRole("button", { name: /^Special/ });
      click(
        special.getAttribute("aria-disabled") === "true"
          ? /^Attack/
          : /^Special/,
      );
      await advance(500);
      moves++;
    }
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.matches).toHaveLength(1);
    expect(saved.xp).toBe(60);
    expect(saved.matches[0].power.signal).toBe("live");
    expect(saved.matches[0].power.bonusEnergy).toBeGreaterThan(0);
    expect(screen.getByText(/Squeek Power added/)).toBeTruthy();
    expect(
      screen.getByText(/Local record, saved in this browser/),
    ).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Battle again" }),
    );
    click("Leaderboard");
    expect(
      screen.getByRole("heading", { name: "Battle history" }),
    ).toBeTruthy();
    expect(screen.getByText(/None of these matches are on-chain/)).toBeTruthy();
    expect(screen.getAllByText("Local").length).toBe(1);
  });
  it("closes the Leave dialog when the AI ends the battle behind it", async () => {
    fakeApi();
    render(<App />);
    await advance(10);
    start();
    let moves = 0;
    while (screen.queryByRole("button", { name: /^Defend/ }) && moves < 60) {
      click(/^Defend/);
      // A real click focuses the button; jsdom's synthetic click does not.
      screen.getByRole("button", { name: "Leave" }).focus();
      click("Leave");
      await advance(500);
      moves++;
      if (screen.queryByRole("button", { name: "Keep fighting" }))
        click("Keep fighting");
    }
    expect(moves).toBeLessThan(60);
    expect(
      screen.queryByRole("heading", { name: "Leave this battle?" }),
    ).toBeNull();
    const replay = screen.getByRole("button", { name: "Battle again" });
    expect(document.activeElement).toBe(replay);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).losses).toBe(1);
  });
  it("reads the wheel again from Check now", async () => {
    const { state } = fakeApi();
    render(<App />);
    await advance(10);
    click("Wheel details");
    const reads = () =>
      state.calls.filter((c) => c.url.endsWith("/v1/status")).length;
    const before = reads();
    click("Check now");
    await advance(10);
    expect(reads()).toBe(before + 1);
    expect(screen.getByRole("heading", { name: "Wheel reading" })).toBeTruthy();
  });
  it("links each confirmed settlement to its transaction on Sepolia", async () => {
    fakeApi();
    render(<App />);
    await advance(10);
    click("Wheel details");
    const links = screen.getAllByRole("link", { name: /View transaction/ });
    expect(links).toHaveLength(3);
    const hash = fixture("settlements").recentSettlements[0].transactionHash;
    expect(links[0].getAttribute("href")).toBe(
      `https://sepolia.etherscan.io/tx/${hash}`,
    );
  });
  it("offers a way back to the menu from every screen", async () => {
    fakeApi();
    render(<App />);
    await advance(10);
    click("Play now");
    click("Menu");
    expect(screen.getByRole("button", { name: "Play now" })).toBeTruthy();
    start();
    click("Menu");
    expect(
      screen.getByRole("heading", { name: "Leave this battle?" }),
    ).toBeTruthy();
    click("Keep fighting");
  });
  it("keeps keyboard focus on the action while the AI thinks", async () => {
    fakeApi();
    render(<App />);
    await advance(10);
    start();
    const attack = screen.getByRole("button", { name: /^Attack/ });
    attack.focus();
    click(/^Attack/);
    expect(attack.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(attack);
    await advance(500);
    expect(attack.getAttribute("aria-disabled")).toBe("false");
  });
  it("takes in progress from another tab instead of overwriting it", async () => {
    fakeApi();
    render(<App />);
    await advance(10);
    const other = {
      version: 1,
      xp: 400,
      wins: 4,
      losses: 0,
      streak: 4,
      bestStreak: 4,
      matches: [],
      sound: false,
      motion: true,
    };
    await flush(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: STORAGE_KEY,
          newValue: JSON.stringify(other),
        }),
      );
    });
    expect(screen.getByText(/Level 3/)).toBeTruthy();
  });
  it("keeps both battles when two tabs finish at the same moment", async () => {
    fakeApi();
    render(<App />);
    await advance(10);
    // This tab forfeits a battle and saves a one-match record.
    start();
    click("Leave");
    click("Leave battle");
    await advance(10);
    const mine = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(mine.matches.length).toBe(1);
    // The other tab finished at the same moment from the same empty start, so
    // its save holds only its own battle and overwrites ours.
    const theirs = recordBattle(freshProgress(), {
      ...createBattle("mochi", "rookie", 0, () => 0.5),
      turn: "finished",
      winner: "enemy",
    });
    const raw = JSON.stringify(theirs);
    localStorage.setItem(STORAGE_KEY, raw);
    await flush(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: STORAGE_KEY, newValue: raw }),
      );
    });
    const merged = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(merged.matches.length).toBe(2);
    expect(merged.losses).toBe(2);
    expect(merged.xp).toBe(30);
    expect(new Set(merged.matches.map((m: { id: string }) => m.id)).size).toBe(
      2,
    );
    // The other tab adopts the merged record and echoes it back: nothing is
    // counted twice, and this tab's battle is now confirmed.
    await flush(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: STORAGE_KEY,
          newValue: JSON.stringify(merged),
        }),
      );
    });
    const settled = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(settled.xp).toBe(30);
    expect(settled.matches.length).toBe(2);
    expect(screen.getByText(/30 \/ 100 XP/)).toBeTruthy();
  });
  it("shows character upgrades in the loadout", async () => {
    fakeApi();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        xp: 400,
        wins: 4,
        losses: 0,
        streak: 0,
        bestStreak: 4,
        matches: [],
        sound: false,
        motion: true,
      }),
    );
    render(<App />);
    await advance(10);
    click("Play now");
    expect(screen.getByText(/Level 3 upgrade: \+4%/)).toBeTruthy();
    expect(screen.getByText("114")).toBeTruthy();
  });
});
