// Deliberate rule breaks run only in ignored scratch copies, never in src/.
// This measures ten selected mutations, not an exhaustive mutation score.
import assert from "node:assert/strict";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const deps = process.env.BATTLE_TOOLING_DIR || resolve("node_modules");
const require = createRequire(resolve(deps, "../package.json"));
const loader = require.resolve("tsx/esm");
const startedAt = new Date().toISOString();
const original = Object.fromEntries(await Promise.all(["src/game.ts", "src/squeek.ts"].map(async (p) => [p, await readFile(p, "utf8")])));
const hash = (s) => createHash("sha256").update(s).digest("hex");
const runTests = (cwd) => {
  const r = spawnSync(process.execPath, ["--import", loader, "--test", "--test-reporter=tap", "tests/engine.test.ts", "tests/squeek.test.ts"], { cwd, encoding: "utf8", timeout: 30_000 });
  const output = `${r.stdout || ""}\n${r.stderr || ""}`;
  return {
    exitCode: r.status, signal: r.signal,
    tests: Number(output.match(/^# tests (\d+)$/m)?.[1] || 0),
    passed: Number(output.match(/^# pass (\d+)$/m)?.[1] || 0),
    failed: Number(output.match(/^# fail (\d+)$/m)?.[1] || 0),
    failingTests: [...output.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1]),
    assertionFailure: output.includes("ERR_ASSERTION"),
    ...(r.error ? { error: r.error.message.replaceAll(resolve("."), ".") } : {}),
  };
};
const baseline = runTests(resolve("."));
assert.equal(baseline.exitCode, 0, "Unmodified baseline must pass");
assert.ok(baseline.tests > 0, "Run the complete engine/API test set");
const mutants = [
  ["M01", "Accept non-hardware measurement provenance", "src/squeek.ts", 'if (m.provenance !== "hardware")', "if (false)"],
  ["M02", "Accept non-hardware wheel module provenance", "src/squeek.ts", 'if (wheel && wheel.provenance !== "hardware")', "if (false)"],
  ["M03", "Accept readings older than the stale threshold", "src/squeek.ts", "ageMs > m.staleAfterSeconds * 1000", "false"],
  ["M04", "Allow non-live readings to grant modifiers", "src/squeek.ts", 'signal.status !== "live" || !snapshot || !m', "!snapshot || !m"],
  ["M05", "Remove Sprinting energy", "src/squeek.ts", '{ name: "Sprinting", minRpm: 60, energyPerTurn: 12 }', '{ name: "Sprinting", minRpm: 60, energyPerTurn: 0 }'],
  ["M06", "Remove Marathon trail damage", "src/squeek.ts", '{ name: "Marathon trail", minKm: 5, damagePct: 15 }', '{ name: "Marathon trail", minKm: 5, damagePct: 0 }'],
  ["M07", "Skip the distance Oracle acceptance check", "src/squeek.ts", 'snapshot.oracleState !== "accepted"', "false"],
  ["M08", "Allow cached settlement events", "src/squeek.ts", 'if (next.source !== "live") return null;', "// mutation: accept cached settlements"],
  ["M09", "Allow duplicate arena events", "src/game.ts", "if (battle.winner || battle.power.events.includes(event.key)) return battle;", "if (battle.winner) return battle;"],
  ["M10", "Allow duplicate XP and match records", "src/game.ts", "if (!battle.winner || progress.matches.some((m) => m.id === battle.id))", "if (!battle.winner)"],
];
const results = [];
for (const [id, description, file, before, after] of mutants) {
  assert.equal(original[file].split(before).length, 2, `${id}: mutation must match exactly once`);
  const cwd = resolve("test/scratch/mutations", id);
  await mkdir(cwd, { recursive: true });
  for (const p of ["src", "tests", "package.json"]) await cp(p, resolve(cwd, p), { recursive: true });
  await writeFile(resolve(cwd, file), original[file].replace(before, after));
  const result = runTests(cwd);
  const killed = result.exitCode === 1 && result.tests === baseline.tests && result.failed > 0 && result.assertionFailure;
  results.push({ id, description, file, before, after, killed, ...result });
  console.log(`${killed ? "KILLED" : "NOT KILLED"} ${id}: ${description}`);
}
for (const [p, s] of Object.entries(original)) assert.equal(await readFile(p, "utf8"), s, "Production source must be untouched");
const report = {
  schemaVersion: 1, startedAt, completedAt: new Date().toISOString(),
  method: `Ten independent scratch copies, each with one exact rule change; full unchanged engine/API tests run against each. Killed requires test assertions, exit 1 and all ${baseline.tests} tests executing. No production source is mutated.`,
  command: "node scripts/verify-mutations.mjs", evidenceKind: "deliberately mutated test copies; no live hardware or real wallet",
  sourceSha256: Object.fromEntries(Object.entries(original).map(([p, s]) => [p, hash(s)])),
  baseline, results, killed: results.filter((r) => r.killed).length,
  total: results.length, passed: results.every((r) => r.killed),
  limitations: ["Selected mutation checks only; not an exhaustive mutation analysis or an independent certification."]
};
await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/mutation-check.json", `${JSON.stringify(report, null, 2)}\n`);
if (!report.passed) process.exitCode = 1;
