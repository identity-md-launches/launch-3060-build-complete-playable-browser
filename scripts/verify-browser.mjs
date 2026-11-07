import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(
  process.env.BATTLE_TOOLING_DIR
    ? resolve(process.env.BATTLE_TOOLING_DIR, "../package.json")
    : import.meta.url,
);
const { chromium, webkit } = require("playwright");
const { default: AxeBuilder } = await import(
  require.resolve("@axe-core/playwright")
);
import { installApi, powerChecks } from "./verify-power.mjs";
const output = "test/scratch/browser-tests";
await mkdir(output, { recursive: true });
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".txt": "text/plain",
};
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://local");
  if (!url.pathname.startsWith("/preview/")) {
    res.writeHead(404).end();
    return;
  }
  const pathname =
    decodeURIComponent(url.pathname.slice("/preview/".length)) || "index.html";
  const filename = resolve("dist", pathname);
  if (!filename.startsWith(resolve("dist") + "/")) {
    res.writeHead(403).end();
    return;
  }
  try {
    res.writeHead(200, {
      "content-type": mime[extname(filename)] || "application/octet-stream",
    });
    res.end(await readFile(filename));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/preview/`;
const results = [];
async function check(name, fn) {
  const start = Date.now();
  try {
    const detail = await fn();
    results.push({ name, passed: true, ms: Date.now() - start, detail });
    console.log(`PASS ${name}`);
  } catch (e) {
    results.push({
      name,
      passed: false,
      ms: Date.now() - start,
      error: e.stack,
    });
    console.error(`FAIL ${name}: ${e.message}`);
  }
}
const engines = process.argv.includes("--webkit-only")
  ? [["webkit", webkit]]
  : process.argv.includes("--chromium-only")
    ? [["chromium", chromium]]
    : [
        ["chromium", chromium],
        ["webkit", webkit],
      ];
try {
  for (const [engineName, engine] of engines) {
    let browser;
    await check(`${engineName}: launch`, async () => {
      browser = await engine.launch({
        headless: true,
        ...(engineName === "chromium" && process.env.BATTLE_CHROMIUM
          ? { executablePath: process.env.BATTLE_CHROMIUM }
          : {}),
      });
    });
    if (!browser) continue;
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    });
    await installApi(context, { mode: "idle" });
    const page = await context.newPage();
    const errors = [],
      missing = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("response", (r) => {
      if (r.url().startsWith(url) && r.status() >= 400)
        missing.push(`${r.status()} ${r.url().replace(url, "")}`);
    });
    await page.goto(url);
    await page.evaluate(() => document.fonts.ready);
    await check(
      `${engineName}: menu, relative subpath assets and first-screen primary action`,
      async () => {
        assert.match(await page.title(), /BATTLE HAMSTER/);
        const box = await page
          .getByRole("button", { name: "Play now", exact: true })
          .boundingBox();
        assert.ok(box && box.y + box.height < 844);
        assert.ok(await page.locator(".brand").isVisible());
        assert.equal(
          await page.evaluate(() => document.fonts.check("600 40px Pixelify")),
          true,
        );
        assert.equal(missing.length, 0);
      },
    );
    async function overflow() {
      return page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }));
    }
    for (const width of [320, 375, 390, 768, 1024, 1440])
      await check(`${engineName}: menu reflow at ${width}px`, async () => {
        await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
        assert.ok((await overflow()).content <= width);
        await page.screenshot({
          path: `${output}/${engineName}-menu-${width}.png`,
          fullPage: true,
        });
      });
    await page.setViewportSize({ width: 390, height: 844 });
    await check(
      `${engineName}: help dialog, Escape and focus restoration`,
      async () => {
        const button = page.getByRole("button", {
          name: "How to play",
          exact: true,
        });
        await button.focus();
        await page.keyboard.press("Enter");
        assert.equal(await page.getByRole("dialog").isVisible(), true);
        await page.keyboard.press("Escape");
        assert.equal(await page.getByRole("dialog").count(), 0);
        assert.equal(
          await button.evaluate((el) => el === document.activeElement),
          true,
        );
      },
    );
    await check(
      `${engineName}: empty leaderboard contains no invented scores`,
      async () => {
        await page
          .getByRole("button", { name: "Leaderboard", exact: true })
          .click();
        assert.equal(await page.getByRole("table").count(), 0);
        assert.ok(
          await page.getByText("A tiny legend starts here.").isVisible(),
        );
        await page.getByRole("button", { name: "Close dialog" }).click();
      },
    );
    await check(
      `${engineName}: all character choices, difficulty radios and keyboard controls`,
      async () => {
        await page
          .getByRole("button", { name: "Play now", exact: true })
          .click();
        for (const name of ["Pip", "Mochi", "Nyx"]) {
          await page
            .getByRole("button", { name: new RegExp(`^${name} `) })
            .click();
          assert.ok(
            await page
              .getByRole("heading", { name: `${name}’s loadout` })
              .isVisible(),
          );
        }
        for (const name of ["Rookie", "Fighter", "Champion"]) {
          await page.getByRole("radio", { name: new RegExp(name) }).check();
          assert.ok(
            await page
              .getByRole("radio", { name: new RegExp(name) })
              .isChecked(),
          );
        }
        await page.getByRole("button", { name: /^Pip / }).click();
        await page.getByRole("radio", { name: /Rookie/ }).check();
        for (const width of [320, 375, 390, 768, 1024, 1440]) {
          await page.setViewportSize({ width, height: 844 });
          assert.ok((await overflow()).content <= width);
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({
          path: `${output}/${engineName}-selection-390.png`,
          fullPage: true,
        });
        await page.getByRole("button", { name: "Enter the arena" }).click();
      },
    );
    await page.clock.install();
    await check(
      `${engineName}: attack, defend, special, AI response and rapid-click lock`,
      async () => {
        const special = page.getByRole("button", { name: /^Special/ });
        assert.equal(await special.isDisabled(), true);
        await page.keyboard.press("2");
        await page.clock.fastForward(500);
        assert.ok(await page.locator(".live-action").textContent());
        assert.equal(await special.isEnabled(), true);
        await page.keyboard.press("3");
        await page.clock.fastForward(500);
        const before = await page.locator(".battle-log summary").textContent();
        await page.evaluate(() => {
          const b = document.querySelector(".battle-action.attack");
          for (let i = 0; i < 8; i++) b.click();
        });
        await page.clock.fastForward(500);
        const after = await page.locator(".battle-log summary").textContent();
        assert.ok(
          Number(after.match(/\d+/)[0]) - Number(before.match(/\d+/)[0]) <= 2,
        );
        for (const width of [320, 375, 390, 768, 1024, 1440]) {
          await page.setViewportSize({ width, height: 844 });
          assert.ok((await overflow()).content <= width);
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({
          path: `${output}/${engineName}-battle-390.png`,
          fullPage: true,
        });
      },
    );
    await check(
      `${engineName}: complete a battle, persist XP, replay and export records`,
      async () => {
        let moves = 0;
        while ((await page.locator(".battle-action").count()) && moves < 70) {
          const special = page.getByRole("button", { name: /^Special/ });
          const attack = page.getByRole("button", { name: /^Attack/ });
          if (await attack.isEnabled())
            await ((await special.isEnabled()) ? special : attack).click();
          await page.clock.fastForward(500);
          moves++;
        }
        assert.ok(moves < 70);
        assert.ok(
          await page.getByRole("button", { name: "Battle again" }).isVisible(),
        );
        const saved = await page.evaluate(() =>
          JSON.parse(localStorage.getItem("battle-hamster:progress:v1")),
        );
        assert.equal(saved.matches.length, 1);
        assert.ok(saved.xp >= 15);
        await page.screenshot({
          path: `${output}/${engineName}-result-390.png`,
          fullPage: true,
        });
        await page.reload();
        const restored = await page.evaluate(() =>
          JSON.parse(localStorage.getItem("battle-hamster:progress:v1")),
        );
        assert.deepEqual(restored, saved);
        if (saved.matches[0].won) {
          await page
            .getByRole("button", { name: "Leaderboard", exact: true })
            .click();
          // One row in the leaderboard and one in the battle history.
          assert.equal(await page.locator("tbody tr").count(), 2);
          const downloadPromise = page.waitForEvent("download");
          await page
            .getByRole("button", { name: "Export match records" })
            .click();
          const download = await downloadPromise;
          assert.equal(
            download.suggestedFilename(),
            "battle-hamster-records.json",
          );
          await download.saveAs(`${output}/${engineName}-records.json`);
          await page.getByRole("button", { name: "Close dialog" }).click();
        }
        await page
          .getByRole("button", { name: "Play now", exact: true })
          .click();
        await page.getByRole("button", { name: "Enter the arena" }).click();
        await page.getByRole("button", { name: "Leave", exact: true }).click();
        await page.getByRole("button", { name: "Keep fighting" }).click();
        assert.ok(await page.locator(".battle-action").count());
        await page.getByRole("button", { name: "Leave", exact: true }).click();
        await page
          .getByRole("button", { name: "Leave battle", exact: true })
          .click();
        const final = await page.evaluate(() =>
          JSON.parse(localStorage.getItem("battle-hamster:progress:v1")),
        );
        assert.equal(final.matches.length, 2);
        assert.equal(final.matches[0].won, false);
      },
    );
    await check(
      `${engineName}: sound, animation toggle and reduced-motion behavior`,
      async () => {
        await page.getByRole("button", { name: "Enable sound" }).click();
        assert.equal(
          await page
            .getByRole("button", { name: "Mute sound" })
            .getAttribute("aria-pressed"),
          "true",
        );
        await page.getByRole("button", { name: "Pause animations" }).click();
        assert.equal(
          await page
            .locator(".app")
            .evaluate((el) => el.classList.contains("no-motion")),
          true,
        );
        assert.equal(
          await page
            .locator(".preview-pip .sprite")
            .evaluate((el) => getComputedStyle(el).animationName),
          "none",
        );
      },
    );
    await check(
      `${engineName}: accessibility scan of menu, selection and battle`,
      async () => {
        const audits = [];
        audits.push(
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze(),
        );
        await page
          .getByRole("button", { name: "Play now", exact: true })
          .click();
        audits.push(
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze(),
        );
        await page.getByRole("button", { name: "Enter the arena" }).click();
        audits.push(
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze(),
        );
        await writeFile(
          `${output}/${engineName}-axe.json`,
          JSON.stringify(
            audits.map((a) => a.violations),
            null,
            2,
          ),
        );
        assert.equal(audits.flatMap((a) => a.violations).length, 0);
      },
    );
    await check(
      `${engineName}: no runtime or local resource errors`,
      async () => {
        assert.deepEqual(errors, []);
        assert.deepEqual(missing, []);
      },
    );
    await context.close();
    await powerChecks({
      engineName,
      browser,
      url,
      output,
      check,
      axe: AxeBuilder,
    });
    await browser.close();
  }
} finally {
  await new Promise((r) => server.close(r));
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
}
console.log(
  JSON.stringify(
    results.map(({ name, passed, error }) => ({
      name,
      passed,
      ...(error ? { error: error.split("\n")[0] } : {}),
    })),
    null,
    2,
  ),
);
if (results.some((r) => !r.passed)) process.exitCode = 1;
