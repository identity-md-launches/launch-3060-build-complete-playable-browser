// Capture actual public API responses and the production export, without fixtures.
// Run with the tsx loader, like verify-live-api.mjs. --curl supports a proxy on
// Node versions whose fetch does not use the environment's network proxy.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { createHash } from "node:crypto";

const scratch = "test/scratch/live-capture";
await mkdir(scratch, { recursive: true });
await mkdir("artifacts", { recursive: true });
const originalFetch = globalThis.fetch;
const run = promisify(execFile);
const captures = [];
const origin = "https://api.squeekchain.com";
const selectedHeaders = [
  "content-type", "access-control-allow-origin", "access-control-expose-headers",
  "x-squeek-settlement-source", "x-request-id", "etag",
];
async function apiFetch(url, init) {
  assert.ok(String(url).startsWith(`${origin}/v1/`), "Public API reads only");
  const startedAt = new Date().toISOString();
  let response;
  if (process.argv.includes("--curl")) {
    const stem = `${scratch}/${captures.length}-${crypto.randomUUID()}`;
    await run("curl", [
      "--silent", "--show-error", "--max-time", "20",
      "--header", "Origin: https://battle-hamster-squeekchain-genes.imd.site",
      "--dump-header", `${stem}.headers`, "--output", `${stem}.body`, String(url),
    ], { timeout: 25_000 });
    const headersText = await readFile(`${stem}.headers`, "utf8");
    const final = headersText.trim().split(/\r?\n\r?\n/).at(-1).split(/\r?\n/);
    const status = Number(final.shift().split(" ")[1]);
    const headers = new Headers(final.filter((s) => s.includes(":")).map((s) => {
      const at = s.indexOf(":");
      return [s.slice(0, at), s.slice(at + 1).trim()];
    }));
    response = new Response(await readFile(`${stem}.body`), { status, headers });
  } else {
    response = await originalFetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  }
  const bodyText = await response.clone().text();
  captures.push({
    url: String(url), startedAt, receivedAt: new Date().toISOString(),
    httpStatus: response.status,
    headers: Object.fromEntries(selectedHeaders.flatMap((h) =>
      response.headers.has(h) ? [[h, response.headers.get(h)]] : [])),
    sha256: createHash("sha256").update(bodyText).digest("hex"),
    body: JSON.parse(bodyText),
  });
  return response;
}
globalThis.fetch = apiFetch;
if (!process.argv.includes("--samples")) process.argv.push("--samples", "2");
if (!process.argv.includes("--interval")) process.argv.push("--interval", "1");
if (!process.argv.includes("--out")) process.argv.push("--out", "artifacts/hardware-evidence.json");
await import("./verify-live-api.mjs");

const require = createRequire(process.env.BATTLE_TOOLING_DIR
  ? resolve(process.env.BATTLE_TOOLING_DIR, "../package.json") : import.meta.url);
const { chromium } = require("playwright");
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".txt": "text/plain" };
const server = createServer(async (req, res) => {
  const path = new URL(req.url, "http://preview").pathname;
  if (!path.startsWith("/preview/")) return res.writeHead(404).end();
  const file = resolve("dist", path.slice(9) || "index.html");
  if (!file.startsWith(`${resolve("dist")}/`)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream" }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
let browser;
try {
  browser = await chromium.launch({ headless: true,
    ...(process.env.BATTLE_CHROMIUM ? { executablePath: process.env.BATTLE_CHROMIUM } : {}),
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const browserCaptureStart = captures.length;
  await context.route(`${origin}/**`, async (route) => {
    try {
      const response = await apiFetch(route.request().url());
      await route.fulfill({ status: response.status,
        headers: Object.fromEntries(selectedHeaders.flatMap((h) =>
          response.headers.has(h) ? [[h, response.headers.get(h)]] : [])),
        body: Buffer.from(await response.arrayBuffer()),
      });
    } catch { await route.abort("failed"); }
  });
  const statsReady = page.waitForResponse((r) => r.url().includes("/v1/measurement/stats") && r.status() === 200);
  await page.goto(`http://127.0.0.1:${server.address().port}/preview/`);
  await statsReady;
  await page.waitForFunction(() => document.querySelector(".power-strip .signal-badge")?.textContent.includes("HARDWARE LIVE"), null, { timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
  const menu = await page.locator(".power-strip").innerText();
  await page.screenshot({ path: "artifacts/live-hardware-390.png", fullPage: false });
  await page.getByRole("button", { name: "Play now", exact: true }).click();
  await page.getByRole("button", { name: "Enter the arena" }).click();
  await page.getByRole("button", { name: /^Attack/ }).click();
  const battleLog = await page.locator(".battle-log").innerText();
  assert.deepEqual(errors, []);
  const file = process.argv[process.argv.indexOf("--out") + 1];
  const report = JSON.parse(await readFile(file, "utf8"));
  report.captureMethod = {
    transport: process.argv.includes("--curl") ? "Public HTTPS GET via curl, forwarded without modifying API bodies" : "Public HTTPS GET via Node fetch, forwarded without modifying API bodies",
    browserTransport: "Playwright routes each API request through the public HTTPS reader. This verifies real API bodies in the production export, not direct browser-to-API networking.",
    browser: await browser.version(), viewport: { width: 390, height: 844 },
    capturedAt: new Date().toISOString(), screenshot: "live-hardware-390.png",
    screenshotSha256: createHash("sha256").update(await readFile("artifacts/live-hardware-390.png")).digest("hex"),
    powerStripText: menu, battleLog, pageErrors: errors,
    firstBrowserCaptureIndex: browserCaptureStart,
    historicalRpmMethod: "Past hardware passage boundary gaps, plus the stats peak, substituted into a copy of the live snapshot to exercise deriveModifiers and act. Not observed live RPM or a freshness/signature test.",
    signatureVerification: "API assertions only; no independent device-signature verification",
  };
  report.rawCaptures = captures;
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ screenshot: report.captureMethod.screenshot, powerStripText: menu, battleLog, rawCaptures: captures.length }, null, 2));
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
  globalThis.fetch = originalFetch;
}
