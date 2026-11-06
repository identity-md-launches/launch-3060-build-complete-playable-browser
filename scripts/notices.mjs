import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const deps = resolve(process.env.BATTLE_TOOLING_DIR || "node_modules");
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
let text =
  "BATTLE HAMSTER — third-party runtime notices\n\nOriginal game art and source are described in README.md. Pixelify Sans and\nwallet marks carry separate license files in fonts/ and art/wallets/.\n\n";
for (const [path, meta] of Object.entries(lock.packages)) {
  if (!path || meta.dev) continue;
  const directory = resolve(deps, path.replace(/^node_modules\//, ""));
  if (!existsSync(resolve(directory, "package.json"))) continue;
  const pkg = JSON.parse(
    readFileSync(resolve(directory, "package.json"), "utf8"),
  );
  const license = [
    "LICENSE",
    "LICENSE.md",
    "LICENSE.txt",
    "license",
    "license.md",
    "license.txt",
    "LICENCE",
  ]
    .map((name) => resolve(directory, name))
    .find(existsSync);
  text += `\n${"=".repeat(60)}\n${pkg.name} ${pkg.version}\nLicense: ${typeof pkg.license === "string" ? pkg.license : JSON.stringify(pkg.license)}\n${license ? readFileSync(license, "utf8") : "See the package distribution for the complete license."}\n`;
}
writeFileSync("public/THIRD-PARTY-NOTICES.txt", text);
console.log("Wrote runtime package license notices.");
