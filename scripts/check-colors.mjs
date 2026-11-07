import { readFileSync } from "node:fs";
const css = readFileSync("src/styles.css", "utf8");
const tokens = Object.fromEntries(
  [...css.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]),
);
const pairs = [
  ["Primary text on page", "--text", "--bg", 4.5],
  ["Secondary text on page", "--muted", "--bg", 4.5],
  ["Subtle text on page", "--subtle", "--bg", 4.5],
  ["Primary text on surface", "--text", "--surface", 4.5],
  ["Secondary text on surface", "--muted", "--surface", 4.5],
  ["Primary button label", "--accent-ink", "--accent", 4.5],
  ["Primary hover label", "--accent-ink", "--accent-hover", 4.5],
  ["Secondary button label", "--text", "--surface-raised", 4.5],
  ["Focus ring on page", "--focus", "--bg", 3],
  ["Focus ring on raised surface", "--focus", "--surface-raised", 3],
  ["Success text on surface", "--success", "--surface", 4.5],
  ["Energy text on surface", "--energy", "--surface", 4.5],
  ["Stale signal on surface", "--warning", "--surface", 4.5],
  ["Offline signal on surface", "--danger", "--surface", 4.5],
  ["Signal text on raised surface", "--warning", "--surface-raised", 4.5],
  ["Health fill on track", "--success", "--line", 3],
  ["Energy fill on track", "--energy", "--line", 3],
];
const luminance = (hex) =>
  hex
    .slice(1)
    .match(/../g)
    .map((n) => parseInt(n, 16) / 255)
    .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4))
    .reduce((n, c, i) => n + c * [0.2126, 0.7152, 0.0722][i], 0);
const results = pairs.map(([role, fg, bg, minimum]) => {
  const values = [luminance(tokens[fg]), luminance(tokens[bg])].sort(
    (a, b) => b - a,
  );
  const ratio = (values[0] + 0.05) / (values[1] + 0.05);
  return {
    role,
    foreground: tokens[fg],
    background: tokens[bg],
    ratio: Number(ratio.toFixed(2)),
    minimum,
    passed: ratio >= minimum,
  };
});
console.log(
  JSON.stringify(
    {
      scope: "Declared solid token pairs only. Not a rendered contrast audit.",
      results,
    },
    null,
    2,
  ),
);
if (results.some((r) => !r.passed)) process.exitCode = 1;
