import assert from "node:assert/strict";
import { readdir, readFile, stat, lstat } from "node:fs/promises";
import { resolve, dirname, extname } from "node:path";
const root = resolve("dist");
async function files(dir) {
  return (
    await Promise.all(
      (await readdir(dir, { withFileTypes: true })).map((e) =>
        e.isDirectory() ? files(resolve(dir, e.name)) : [resolve(dir, e.name)],
      ),
    )
  ).flat();
}
const all = await files(root);
const html = await readFile(resolve(root, "index.html"), "utf8");
for (const needed of [
  "<title>",
  'name="description"',
  'rel="icon"',
  'property="og:title"',
  'property="og:image"',
])
  assert.ok(html.includes(needed), `Missing ${needed}`);
let urls = 0;
for (const file of all) {
  assert.equal(
    (await lstat(file)).isSymbolicLink(),
    false,
    "Export contains a symlink",
  );
  assert.ok(
    !/node_modules|\.tgz$|\.map$|package-lock/.test(file),
    "Unnecessary packaging file",
  );
  if (![".html", ".css", ".js"].includes(extname(file))) continue;
  const source = await readFile(file, "utf8");
  const found =
    extname(file) === ".html"
      ? [...source.matchAll(/(?:src|href|content)="([^"\n]+)"/g)]
          .map((m) => m[1])
          .filter((u) => u.startsWith("./"))
      : extname(file) === ".css"
        ? [...source.matchAll(/url\(["']?([^)'"\s]+)["']?\)/g)].map((m) => m[1])
        : [
            ...source.matchAll(
              /(?:from\s*|import\s*\()(["'])(\.[^"']+\.js)\1/g,
            ),
          ].map((m) => m[2]);
  for (const url of found) {
    if (/^(data:|https?:)/.test(url)) continue;
    assert.ok(!url.startsWith("/"), `Absolute asset URL ${url}`);
    const target = resolve(dirname(file), url.split("?")[0]);
    assert.ok(target.startsWith(root + "/"), `Asset outside export: ${url}`);
    assert.ok((await stat(target)).isFile(), `Missing asset: ${url}`);
    urls++;
  }
}
const total = (await Promise.all(all.map((f) => stat(f)))).reduce(
  (n, s) => n + s.size,
  0,
);
assert.ok(total < 5 * 1024 * 1024, "Export exceeds its 5 MiB path budget");
console.log(
  JSON.stringify(
    {
      passed: true,
      files: all.length,
      checkedAssetReferences: urls,
      exportBytes: total,
      relativeAssetURLs: true,
    },
    null,
    2,
  ),
);
