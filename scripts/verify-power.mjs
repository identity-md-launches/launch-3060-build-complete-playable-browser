// Browser checks for Squeek Power, wallets and responsive layout. The API is
// answered by a test double built on real captured responses, so every signal
// state can be reached on demand. None of this reaches the export.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fixture = (name) =>
  JSON.parse(readFileSync(`tests/fixtures/live-${name}.json`, "utf8"));
const cors = {
  "access-control-allow-origin": "*",
  "access-control-expose-headers":
    "ETag,X-Squeek-Settlement-Source,Retry-After,X-Request-Id",
  "content-type": "application/json",
};
const WIDTHS = [320, 375, 768, 1024, 1440];

export const scenarios = {
  idle: (b) => b,
  running: (b) => {
    b.measurement.coreStatus = "ACTIVE";
    b.measurement.rpmMilli = 46_000;
    b.measurement.speedMmPerSecond = 673;
    b.measurement.distanceMm = 3_000_000;
  },
  sprinting: (b) => {
    b.measurement.coreStatus = "ACTIVE";
    b.measurement.rpmMilli = 87_707;
    b.measurement.speedMmPerSecond = 1_283;
    b.measurement.distanceMm = 6_348_818;
  },
  simulated: (b) => {
    scenarios.sprinting(b);
    b.measurement.provenance = "simulated";
    b.modules[0].provenance = "simulated";
  },
  replay: (b) => {
    scenarios.sprinting(b);
    b.measurement.provenance = "replay";
  },
  stale: (b) => {
    scenarios.sprinting(b);
    const old = new Date(Date.now() - 300_000).toISOString();
    b.measurement.freshness = "stale";
    b.measurement.receivedAt = old;
    b.measurement.observedAt = old;
  },
  fault: (b) => {
    b.measurement.coreStatus = "COUNTER_FAULT";
  },
  noReading: (b) => {
    b.measurement = null;
  },
};

/** Answers the Squeekchain API for one browser context. */
export async function installApi(context, api) {
  await context.route("https://api.squeekchain.com/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (api.mode === "offline") return route.abort("failed");
    if (api.mode === "rate-limited")
      return route.fulfill({
        status: 429,
        headers: { ...cors, "retry-after": "30" },
        body: '{"error":"rate_limited"}',
      });
    if (api.mode === "malformed")
      return route.fulfill({ status: 200, headers: cors, body: "<html>" });
    if (path === "/v1/status") {
      const body = fixture("status");
      const now = new Date().toISOString();
      body.generatedAt = now;
      body.measurement.receivedAt = now;
      body.measurement.observedAt = now;
      body.signer.lastVerifiedAt = now;
      scenarios[api.mode](body);
      return route.fulfill({
        status: 200,
        headers: cors,
        body: JSON.stringify(body),
      });
    }
    if (path === "/v1/settlements") {
      const body = fixture("settlements");
      body.summary.settlementCount = String(api.settlements ?? 271);
      if (api.newBlock) {
        body.recentSettlements[0].transactionHash = `0x${"b".repeat(64)}`;
        body.recentSettlements[0].completedBlockCount = "3";
      }
      return route.fulfill({
        status: 200,
        headers: { ...cors, "x-squeek-settlement-source": "live" },
        body: JSON.stringify(body),
      });
    }
    return route.fulfill({
      status: 200,
      headers: cors,
      body: JSON.stringify(fixture("stats")),
    });
  });
}

const fixedRandom = () => {
  Math.random = () => 0.5;
};
export function walletDouble() {
  const calls = [];
  window.__walletCalls = calls;
  const hex = [...crypto.getRandomValues(new Uint8Array(20))]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
  const account = sessionStorage.getItem("test-account") ?? `0x${hex}`;
  sessionStorage.setItem("test-account", account);
  let chainId = sessionStorage.getItem("test-chain") ?? "0x1";
  const listeners = {};
  const provider = {
    async request({ method, params }) {
      calls.push(method);
      if (window.__rejectWallet) {
        const error = new Error("User rejected the request.");
        error.code = 4001;
        throw error;
      }
      if (method === "eth_requestAccounts") {
        sessionStorage.setItem("test-approved", "yes");
        return [account];
      }
      // Like a real wallet, only an approved site can read the account.
      if (method === "eth_accounts")
        return sessionStorage.getItem("test-approved") ? [account] : [];
      if (method === "eth_chainId") return chainId;
      if (method === "wallet_revokePermissions") {
        sessionStorage.removeItem("test-approved");
        return null;
      }
      if (/Permissions$/.test(method)) return [];
      if (method === "wallet_switchEthereumChain") {
        chainId = params[0].chainId;
        sessionStorage.setItem("test-chain", chainId);
        listeners.chainChanged?.forEach((fn) => fn(chainId));
        return null;
      }
      throw new Error(`Unsupported ${method}`);
    },
    on(name, fn) {
      (listeners[name] ??= new Set()).add(fn);
    },
    removeListener(name, fn) {
      listeners[name]?.delete(fn);
    },
  };
  const announce = () =>
    window.dispatchEvent(
      new CustomEvent("eip6963:announceProvider", {
        detail: Object.freeze({
          info: {
            uuid: "7c2f3d0a-5a1e-4d5b-9c1f-1f1f1f1f1f1f",
            name: "Arena Test Wallet",
            icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28'><rect width='28' height='28' fill='%23888'/></svg>",
            rdns: "test.arena.wallet",
          },
          provider,
        }),
      }),
    );
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
}

/** Moves a fake clock in steps, so in-flight requests finish between them. */
async function advance(page, seconds) {
  for (let i = 0; i < seconds; i++) {
    await page.clock.runFor(1000);
    await page.waitForTimeout(15);
  }
}
const strip = (page) => page.locator(".power-strip");
async function waitForSignal(page, label) {
  await page.waitForFunction(
    (text) =>
      document.querySelector(".power-strip .signal-badge")?.textContent ===
      text,
    label,
    { timeout: 6000 },
  );
}
const meter = (page, name) =>
  page.getByRole("progressbar", { name }).evaluate((el) => el.value);
async function noOverflow(page, width, where) {
  const size = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  assert.ok(
    size.content <= width,
    `${where} overflows at ${width}: ${size.content}`,
  );
  const outside = await page.evaluate(() => {
    const dialog = document.querySelector("dialog[open]");
    const scope = dialog ?? document.body;
    const view = document.documentElement.clientWidth;
    return [...scope.querySelectorAll("button, a[href]")]
      .filter((el) => {
        if (el.closest(".leaderboard-table") || el.closest(".skip-link"))
          return false;
        const box = el.getBoundingClientRect();
        return box.width && (box.left < -1 || box.right > view + 1);
      })
      .map((el) => el.textContent.trim().slice(0, 30));
  });
  assert.deepEqual(outside, [], `${where} controls off screen at ${width}`);
}
/** Two text boxes that intersect mean drawn-over text. */
async function noOverlap(page, selector, where) {
  const hits = await page.evaluate((selector) => {
    const boxes = [...document.querySelectorAll(selector)]
      .filter((el) => el.getBoundingClientRect().width)
      .map((el) => ({
        text: el.textContent.trim().slice(0, 24),
        box: el.getBoundingClientRect(),
      }));
    const out = [];
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].box,
          b = boxes[j].box;
        if (
          a.left < b.right - 1 &&
          b.left < a.right - 1 &&
          a.top < b.bottom - 1 &&
          b.top < a.bottom - 1
        )
          out.push(`${boxes[i].text} / ${boxes[j].text}`);
      }
    return out;
  }, selector);
  assert.deepEqual(hits, [], `${where} overlaps`);
}

export async function powerChecks({
  engineName,
  browser,
  url,
  output,
  check,
  axe,
}) {
  async function session(mode, options = {}) {
    const api = { mode, settlements: 271 };
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
      ...options,
    });
    await installApi(context, api);
    const page = await context.newPage();
    return { api, context, page };
  }
  const shot = (page, name) =>
    page.screenshot({
      path: `${output}/${engineName}-${name}.png`,
      fullPage: true,
    });

  for (const [mode, label, neutral] of [
    ["idle", "HARDWARE LIVE", false],
    ["sprinting", "HARDWARE LIVE", false],
    ["simulated", "SIMULATED", true],
    ["replay", "SIMULATED", true],
    ["stale", "STALE", true],
    ["fault", "OFFLINE", true],
    ["noReading", "OFFLINE", true],
    ["offline", "OFFLINE", true],
    ["malformed", "OFFLINE", true],
    ["rate-limited", "OFFLINE", true],
  ])
    await check(`${engineName}: API state ${mode} shows ${label}`, async () => {
      const { context, page } = await session(mode);
      await page.goto(url);
      await waitForSignal(page, label);
      const text = await strip(page).innerText();
      assert.equal(text.includes("Neutral rules"), neutral);
      if (label !== "HARDWARE LIVE")
        assert.equal(text.includes("HARDWARE LIVE"), false);
      await shot(page, `signal-${mode}`);
      await page.getByRole("button", { name: "Wheel details" }).click();
      const details = await page.locator(".power-details").innerText();
      if (mode === "sprinting") {
        for (const value of [
          "87.7 RPM",
          "1.28 m/s",
          "6.35 km",
          "ACTIVE, wheel module ready",
          "hardware",
          "online, stale after 120s",
        ])
          assert.ok(details.includes(value), value);
      }
      if (mode === "simulated")
        assert.ok(details.includes("Simulated reading, not hardware"));
      if (mode === "stale")
        assert.ok(details.includes("Last reading, no longer current"));
      if (mode === "offline") assert.ok(details.includes("Unknown"));
      await context.close();
    });

  await check(
    `${engineName}: real-wheel values change a battle, neutral states do not`,
    async () => {
      const outcomes = {};
      for (const mode of [
        "sprinting",
        "running",
        "idle",
        "simulated",
        "offline",
      ]) {
        const { context, page } = await session(mode);
        await page.addInitScript(fixedRandom);
        await page.goto(url);
        await page.locator(".power-strip .signal-badge").waitFor();
        await page.waitForTimeout(400);
        await page
          .getByRole("button", { name: "Play now", exact: true })
          .click();
        await page.getByRole("button", { name: "Enter the arena" }).click();
        const before = await meter(page, "Opponent health");
        await page.getByRole("button", { name: /^Attack/ }).click();
        outcomes[mode] = {
          energy: await meter(page, "Your energy"),
          damage: before - (await meter(page, "Opponent health")),
          log: await page.locator(".live-action").textContent(),
        };
        await context.close();
      }
      assert.equal(outcomes.offline.energy, 55);
      assert.equal(outcomes.simulated.energy, 55);
      assert.equal(outcomes.simulated.damage, outcomes.offline.damage);
      assert.equal(outcomes.idle.energy, 55);
      assert.equal(outcomes.running.energy, 63);
      assert.equal(outcomes.sprinting.energy, 67);
      assert.ok(outcomes.sprinting.damage > outcomes.offline.damage);
      assert.match(outcomes.sprinting.log, /Squeek Power/);
      assert.equal(outcomes.offline.log.includes("Squeek Power"), false);
      return outcomes;
    },
  );

  await check(
    `${engineName}: losing the signal mid-battle goes neutral at once`,
    async () => {
      const { api, context, page } = await session("sprinting");
      await page.clock.install();
      await page.addInitScript(fixedRandom);
      await page.goto(url);
      await waitForSignal(page, "HARDWARE LIVE");
      await page.getByRole("button", { name: "Play now", exact: true }).click();
      await page.getByRole("button", { name: "Enter the arena" }).click();
      await page.getByRole("button", { name: /^Attack/ }).click();
      assert.equal(await meter(page, "Your energy"), 67);
      await page.clock.runFor(1000);
      api.mode = "offline";
      await page.clock.runFor(11_000);
      await waitForSignal(page, "STALE");
      await page.getByRole("button", { name: /^Attack/ }).click();
      assert.equal(await meter(page, "Your energy"), 82);
      assert.equal(
        (await page.locator(".live-action").textContent()).includes(
          "Squeek Power",
        ),
        false,
      );
      await context.close();
    },
  );

  await check(
    `${engineName}: a new settlement triggers one arena event in battle`,
    async () => {
      const { api, context, page } = await session("idle");
      await page.clock.install();
      await page.addInitScript(fixedRandom);
      await page.goto(url);
      await waitForSignal(page, "HARDWARE LIVE");
      await page.waitForTimeout(300);
      await page.getByRole("button", { name: "Play now", exact: true }).click();
      await page.getByRole("button", { name: "Enter the arena" }).click();
      assert.equal(await meter(page, "Your energy"), 40);
      api.settlements = 272;
      api.newBlock = true;
      await advance(page, 32);
      assert.match(
        await page.locator(".live-action").textContent(),
        /Block rush/,
      );
      assert.equal(await meter(page, "Your energy"), 60);
      await shot(page, "arena-event");
      await advance(page, 32);
      assert.equal(await meter(page, "Your energy"), 60);
      await page.getByRole("button", { name: /^Attack/ }).click();
      assert.match(
        await page.locator(".live-action").textContent(),
        /Squeek Power: \+\d+ damage/,
      );
      await context.close();
    },
  );

  await check(
    `${engineName}: every screen reflows at 320, 375, 768, 1024 and 1440`,
    async () => {
      for (const mode of ["sprinting", "offline"]) {
        const { context, page } = await session(mode);
        await page.goto(url);
        await page.evaluate(() => {
          const match = (i) => ({
            id: `seed-${i}`,
            warrior: "pip",
            opponent: "nyx",
            difficulty: "champion",
            won: i % 2 === 0,
            xp: 160,
            rounds: 7,
            date: "2026-11-06T12:00:00.000Z",
            health: 40,
            power: {
              signal: "live",
              boostedTurns: 4,
              bonusEnergy: 48,
              bonusDamage: 12,
              events: 1,
            },
          });
          localStorage.setItem(
            "battle-hamster:progress:v1",
            JSON.stringify({
              version: 1,
              xp: 1600,
              wins: 3,
              losses: 3,
              streak: 1,
              bestStreak: 3,
              matches: [0, 1, 2, 3, 4, 5].map(match),
              sound: false,
              motion: true,
            }),
          );
        });
        await page.reload();
        await page.waitForTimeout(400);
        for (const width of WIDTHS) {
          await page.setViewportSize({
            width,
            height: width < 600 ? 800 : 900,
          });
          await noOverflow(page, width, "menu");
          await noOverlap(
            page,
            ".power-strip .signal-badge, .power-summary strong, .power-summary .muted, .power-open",
            "power strip",
          );
          if (mode === "sprinting") await shot(page, `menu-${width}`);
          await page.getByRole("button", { name: "Wheel details" }).click();
          await noOverflow(page, width, "wheel details");
          if (mode === "sprinting") await shot(page, `details-${width}`);
          await page.getByRole("button", { name: "Close dialog" }).click();
          await page
            .getByRole("button", { name: "Leaderboard", exact: true })
            .click();
          await noOverflow(page, width, "leaderboard");
          if (mode === "sprinting" && width === 320)
            await shot(page, `leaderboard-${width}`);
          await page.getByRole("button", { name: "Close dialog" }).click();
          await page
            .getByRole("button", { name: "How to play", exact: true })
            .click();
          await noOverflow(page, width, "help");
          await page.getByRole("button", { name: "Close dialog" }).click();
          await page
            .getByRole("button", { name: /Connect/ })
            .first()
            .click();
          await page.getByRole("dialog").waitFor();
          await noOverflow(page, width, "wallet sheet");
          await page.getByRole("button", { name: "Close dialog" }).click();
          await page
            .getByRole("button", { name: "Play now", exact: true })
            .click();
          await noOverflow(page, width, "selection");
          await page.getByRole("button", { name: "Enter the arena" }).click();
          await noOverflow(page, width, "battle");
          await noOverlap(page, ".battle-action", "battle actions");
          await noOverlap(
            page,
            ".fighter-health.player, .fighter-health.enemy",
            "health panels",
          );
          if (mode === "sprinting") await shot(page, `battle-${width}`);
          await page
            .getByRole("button", { name: "Leave", exact: true })
            .click();
          await page
            .getByRole("button", { name: "Leave battle", exact: true })
            .click();
        }
        await context.close();
      }
    },
  );

  await check(
    `${engineName}: hero text never touches the fighters at any width`,
    async () => {
      const { context, page } = await session("idle");
      await page.goto(url);
      for (const width of [
        320, 375, 430, 521, 600, 700, 760, 761, 768, 900, 1000, 1001, 1024,
        1101, 1280, 1440,
      ]) {
        await page.setViewportSize({ width, height: 900 });
        const hits = await page.evaluate(() => {
          const texts = [
            ...document.querySelectorAll(
              ".menu-copy h1, .menu-copy p, .play-now",
            ),
          ];
          // Sprites keep transparent margins, so measure their inner area.
          const sprites = [
            ...document.querySelectorAll(".menu-fighters .sprite"),
          ].map((el) => {
            const b = el.getBoundingClientRect();
            const inset = b.width * 0.12;
            return {
              left: b.left + inset,
              right: b.right - inset,
              top: b.top + inset,
              bottom: b.bottom,
            };
          });
          const out = [];
          for (const t of texts) {
            const range = document.createRange();
            range.selectNodeContents(t);
            for (const a of range.getClientRects())
              for (const s of sprites)
                if (
                  a.left < s.right &&
                  s.left < a.right &&
                  a.top < s.bottom &&
                  s.top < a.bottom
                )
                  out.push(t.textContent.slice(0, 20));
          }
          return [...new Set(out)];
        });
        assert.deepEqual(hits, [], `text meets a sprite at ${width}`);
      }
      await context.close();
    },
  );

  await check(
    `${engineName}: a phone-sized touch session plays a full battle`,
    async () => {
      const { context, page } = await session("sprinting", {
        viewport: { width: 375, height: 667 },
        hasTouch: true,
        isMobile: engineName === "chromium",
      });
      await page.goto(url);
      await waitForSignal(page, "HARDWARE LIVE");
      await page.getByRole("button", { name: "Play now", exact: true }).tap();
      await page.getByRole("button", { name: /^Nyx / }).tap();
      await page.getByRole("button", { name: "Enter the arena" }).tap();
      let turns = 0;
      while ((await page.locator(".battle-action").count()) && turns < 60) {
        const special = page.getByRole("button", { name: /^Special/ });
        const attack = page.getByRole("button", { name: /^Attack/ });
        if ((await attack.getAttribute("aria-disabled")) !== "true")
          await (
            (await special.getAttribute("aria-disabled")) === "true"
              ? attack
              : special
          ).tap();
        await page.waitForTimeout(450);
        turns++;
      }
      await page.getByRole("button", { name: "Battle again" }).waitFor();
      await shot(page, "phone-result");
      await page.getByRole("button", { name: "Battle again" }).tap();
      await page.getByRole("button", { name: /^Attack/ }).waitFor();
      await context.close();
    },
  );

  await check(
    `${engineName}: accessibility scan of the Squeek Power, records and wallet dialogs`,
    async () => {
      const { context, page } = await session("sprinting");
      await page.goto(url);
      await waitForSignal(page, "HARDWARE LIVE");
      await page.evaluate(() =>
        localStorage.setItem(
          "battle-hamster:progress:v1",
          JSON.stringify({
            version: 1,
            xp: 160,
            wins: 1,
            losses: 0,
            streak: 1,
            bestStreak: 1,
            matches: [
              {
                id: "a11y",
                warrior: "pip",
                opponent: "nyx",
                difficulty: "champion",
                won: true,
                xp: 160,
                rounds: 7,
                date: "2026-11-06T12:00:00.000Z",
                health: 40,
              },
            ],
            sound: false,
            motion: true,
          }),
        ),
      );
      await page.reload();
      await waitForSignal(page, "HARDWARE LIVE");
      const scan = async () =>
        (
          await new axe({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`);
      const found = [...(await scan())];
      await page.getByRole("button", { name: "Wheel details" }).click();
      found.push(...(await scan()));
      await page.getByRole("button", { name: "Close dialog" }).click();
      await page
        .getByRole("button", { name: "Leaderboard", exact: true })
        .click();
      found.push(...(await scan()));
      await page.getByRole("button", { name: "Close dialog" }).click();
      await page
        .getByRole("button", { name: /Connect/ })
        .first()
        .click();
      await page.getByRole("dialog").waitFor();
      found.push(...(await scan()));
      assert.deepEqual(found, []);
      await context.close();
    },
  );

  await check(
    `${engineName}: main action and live status sit on the first screen at 390`,
    async () => {
      const { context, page } = await session("sprinting");
      await page.goto(url);
      await waitForSignal(page, "HARDWARE LIVE");
      const play = await page
        .getByRole("button", { name: "Play now", exact: true })
        .boundingBox();
      const badge = await page
        .locator(".power-strip .signal-badge")
        .boundingBox();
      assert.ok(play.y + play.height <= 844);
      assert.ok(badge.y + badge.height <= 844);
      await page.getByRole("button", { name: "Play now", exact: true }).click();
      await page.getByRole("button", { name: "Enter the arena" }).click();
      const attack = await page
        .getByRole("button", { name: /^Attack/ })
        .boundingBox();
      assert.ok(attack.y + attack.height <= 844, "actions on the first screen");
      await context.close();
    },
  );

  await check(
    `${engineName}: a whole battle works from the keyboard, and focus is kept`,
    async () => {
      const { context, page } = await session("idle");
      await page.addInitScript(fixedRandom);
      await page.goto(url);
      await page.waitForTimeout(300);
      await page.keyboard.press("Tab");
      assert.equal(
        await page.evaluate(() => document.activeElement.textContent),
        "Skip to game",
      );
      await page.getByRole("button", { name: "Play now", exact: true }).focus();
      await page.keyboard.press("Enter");
      await page.getByRole("button", { name: "Enter the arena" }).focus();
      await page.keyboard.press("Enter");
      const attack = page.getByRole("button", { name: /^Attack/ });
      await attack.focus();
      await page.keyboard.press("Enter");
      assert.equal(
        await attack.evaluate((el) => el === document.activeElement),
        true,
        "focus stays on the action while the AI moves",
      );
      let turns = 0;
      while ((await page.locator(".battle-action").count()) && turns < 60) {
        await page.waitForTimeout(450);
        await page.keyboard.press("1");
        turns++;
      }
      await page.getByRole("button", { name: "Battle again" }).waitFor();
      assert.equal(
        await page.evaluate(() => document.activeElement.textContent.trim()),
        "Battle again",
      );
      await context.close();
    },
  );

  await check(
    `${engineName}: XP is recorded once, across rapid clicks, reloads and tabs`,
    async () => {
      const { context, page } = await session("idle");
      await page.goto(url);
      await page.waitForTimeout(300);
      await page.getByRole("button", { name: "Play now", exact: true }).click();
      await page.getByRole("button", { name: "Enter the arena" }).click();
      const other = await context.newPage();
      await other.goto(url);
      let turns = 0;
      while ((await page.locator(".battle-action").count()) && turns < 80) {
        await page.evaluate(() => {
          const b = document.querySelector(".battle-action.attack");
          for (let i = 0; i < 6; i++) b?.click();
        });
        await page.waitForTimeout(450);
        turns++;
      }
      await page.getByRole("button", { name: "Battle again" }).waitFor();
      const read = (p) =>
        p.evaluate(() =>
          JSON.parse(localStorage.getItem("battle-hamster:progress:v1")),
        );
      const saved = await read(page);
      assert.equal(saved.matches.length, 1);
      assert.equal(saved.wins + saved.losses, 1);
      assert.equal(saved.xp, saved.matches[0].xp);
      await page.reload();
      assert.deepEqual(await read(page), saved);
      await other.waitForFunction(
        () =>
          document.querySelector(".career-stat strong")?.textContent !== null,
      );
      assert.equal(
        await other.locator(".career-stat strong").nth(1).textContent(),
        "1",
        "the other tab picked up the finished battle",
      );
      await other.getByRole("button", { name: "Enable sound" }).click();
      assert.equal((await read(other)).matches.length, 1);
      await context.close();
    },
  );

  await check(
    `${engineName}: wallet connects, switches to Sepolia, restores and disconnects`,
    async () => {
      const { context, page } = await session("idle");
      await page.addInitScript(walletDouble);
      await page.goto(url);
      await page.getByRole("button", { name: "Connect wallet" }).click();
      const row = page.getByRole("button", { name: /Arena Test Wallet/ });
      await row.waitFor();
      assert.equal(
        await page.locator("dialog input, dialog textarea").count(),
        0,
      );
      await shot(page, "wallet-sheet");
      await row.click();
      await page
        .getByRole("button", { name: "Switch to Sepolia" })
        .first()
        .waitFor();
      await page
        .getByRole("button", { name: "Switch to Sepolia" })
        .first()
        .click();
      await page
        .getByRole("dialog")
        .getByText("Connected to Sepolia")
        .waitFor();
      assert.ok(
        await page
          .getByRole("dialog")
          .getByText("Confirmed on-chain battle records")
          .isVisible(),
      );
      await page.getByRole("button", { name: "Close dialog" }).click();
      const label = await page
        .locator(".wallet-button")
        .getAttribute("aria-label");
      assert.match(label, /^Wallet 0x[0-9a-fA-F]{4}…[0-9a-fA-F]{4}$/);
      await page.reload();
      await page.getByRole("button", { name: label }).waitFor();
      await page.getByRole("button", { name: label }).click();
      await page.getByRole("button", { name: "Disconnect" }).click();
      await page.getByRole("button", { name: "Connect wallet" }).waitFor();
      const calls = await page.evaluate(() => window.__walletCalls);
      assert.equal(
        calls.some((m) => /sign|send/i.test(m)),
        false,
        "no signature or transaction was requested",
      );
      await context.close();
    },
  );

  await check(
    `${engineName}: a rejected wallet prompt recovers, and play is unaffected`,
    async () => {
      const { context, page } = await session("idle");
      await page.addInitScript(walletDouble);
      await page.goto(url);
      await page.evaluate(() => {
        window.__rejectWallet = true;
      });
      await page.getByRole("button", { name: "Connect wallet" }).click();
      const row = page.getByRole("button", { name: /Arena Test Wallet/ });
      await row.click();
      await page.getByText("Connection was not completed").waitFor();
      assert.equal(await row.isEnabled(), true);
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Play now", exact: true }).click();
      await page.getByRole("button", { name: "Enter the arena" }).click();
      await page.getByRole("button", { name: /^Attack/ }).click();
      await context.close();
    },
  );

  await check(
    `${engineName}: a phone browser gets the wallet links and Smart Wallet`,
    async () => {
      const { context, page } = await session("idle", {
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
        hasTouch: true,
        isMobile: engineName === "chromium",
      });
      await page.goto(url);
      await page.getByRole("button", { name: "Connect wallet" }).click();
      for (const name of ["MetaMask", "Coinbase Wallet", "Rabby", "Phantom"])
        await page.getByRole("link", { name: `Open in ${name}` }).waitFor();
      await page
        .getByRole("button", { name: /Coinbase Smart Wallet/ })
        .waitFor();
      await shot(page, "wallet-phone");
      await context.close();
    },
  );
}
