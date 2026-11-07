// Read-only submission check: missing or Git-ignored evidence must not ship.
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, dirname, extname } from "node:path";
import { spawnSync } from "node:child_process";

const required = [
  "artifacts/genesis-readiness.md", "artifacts/hardware-evidence.json",
  "artifacts/live-hardware-390.png", "artifacts/validation.md",
  "artifacts/browser-results.json", "artifacts/mutation-check.json",
];
for (const path of required) {
  assert.ok((await stat(path)).size > 0, `Empty deliverable: ${path}`);
  const ignored = spawnSync("git", ["check-ignore", "--quiet", path]);
  assert.equal(ignored.status, 1, `Git ignores required deliverable: ${path}`);
  if (extname(path) === ".json") JSON.parse(await readFile(path, "utf8"));
}
const png = await readFile("artifacts/live-hardware-390.png");
assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
assert.equal(png.readUInt32BE(16), 390, "Live screenshot width");
assert.equal(png.readUInt32BE(20), 844, "Live screenshot height");
let links = 0;
const docs = ["README.md", "DESIGN.md", "artifacts/genesis-readiness.md", "artifacts/validation.md"];
for (const path of docs) {
  const source = await readFile(path, "utf8");
  for (const [, href] of source.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)) {
    if (/^(https?:|mailto:|#)/.test(href)) continue;
    const target = resolve(dirname(path), decodeURIComponent(href.split("#")[0]));
    assert.ok(target.startsWith(`${resolve(".")}/`), `Link outside repository: ${href}`);
    await stat(target);
    links++;
  }
}
let artifactBytes = 0;
let reportBytes = 0;
let reviewImageBytes = 0;
for (const name of await readdir("artifacts")) {
  const bytes = (await stat(`artifacts/${name}`)).size;
  artifactBytes += bytes;
  if (name === "hardware-evidence.json") assert.ok(bytes <= 384 * 1024);
  else if (name === "live-hardware-390.png") assert.ok(bytes <= 128 * 1024);
  else if (name.endsWith(".png")) reviewImageBytes += bytes;
  else reportBytes += bytes;
}
assert.ok(reportBytes <= 128 * 1024, "Reports exceed their explicit budget");
assert.ok(reviewImageBytes <= 384 * 1024, "Review screenshots exceed their explicit budget");
assert.ok(artifactBytes <= 1024 * 1024, "Evidence exceeds its explicit 1 MiB budget");
const evidence = JSON.parse(await readFile("artifacts/hardware-evidence.json", "utf8"));
const { createHash } = await import("node:crypto");
assert.equal(createHash("sha256").update(png).digest("hex"), evidence.captureMethod.screenshotSha256, "Screenshot must match the capture report");
const browser = JSON.parse(await readFile("artifacts/browser-results.json", "utf8"));
assert.equal(browser.total, browser.results.length);
assert.equal(browser.passed, browser.results.filter((r) => r.passed).length);
assert.equal(browser.failed, browser.results.filter((r) => !r.passed).length);
const mutation = JSON.parse(await readFile("artifacts/mutation-check.json", "utf8"));
assert.equal(mutation.total, mutation.results.length);
assert.equal(mutation.killed, mutation.results.filter((r) => r.killed).length);
const responses = JSON.parse(await readFile(".imd-responses.json", "utf8"));
assert.ok(responses.responses.some((r) => r.finding === "37c4e3f0a8d9e1f7d21cf84647b37449cf3e66736b2a6c02b3f0ae522182bdac" && ["fixed", "not_reproducible", "disputed"].includes(r.verdict) && r.detail));
assert.ok((await stat(".imd-responses.json")).size <= 4096);
assert.equal(spawnSync("git", ["check-ignore", "--quiet", ".imd-responses.json"]).status, 1, "Git ignores the review response");
console.log(JSON.stringify({ passed: true, requiredFiles: required.length, checkedLocalLinks: links, artifactBytes,
  scope: "Delivery integrity only; browser failures and remaining readiness limitations are reported separately."
}, null, 2));
