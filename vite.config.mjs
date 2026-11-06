import { resolve } from "node:path";
import { readFileSync } from "node:fs";

// Optional dependency location lets restricted build workers keep generated files
// in scratch. A normal npm ci uses Vite's standard dependency resolution.
const dependencyRoot = process.env.BATTLE_TOOLING_DIR;
function dependencyImport(name) {
  const parts = name.split("/");
  const length = name.startsWith("@") ? 2 : 1;
  const packageName = parts.slice(0, length).join("/");
  const subpath = parts.slice(length).join("/");
  const directory = resolve(dependencyRoot, packageName);
  const metadata = JSON.parse(
    readFileSync(resolve(directory, "package.json"), "utf8"),
  );
  let entry = metadata.exports?.[subpath ? `./${subpath}` : "."];
  while (entry && typeof entry === "object")
    entry = entry.import ?? entry.default;
  if (typeof entry !== "string") entry = metadata.module ?? metadata.main;
  if (!entry) throw new Error(`Cannot resolve dependency ${name}`);
  return resolve(directory, entry);
}
export default {
  base: "./",
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: dependencyRoot
      ? [
          "react",
          "react/jsx-runtime",
          "react/jsx-dev-runtime",
          "react-dom/client",
          "wagmi",
          "wagmi/chains",
          "wagmi/connectors/injected",
          "wagmi/connectors/coinbaseWallet",
          "viem",
          "@tanstack/react-query",
        ].map((name) => ({
          find: new RegExp(`^${name.replaceAll("/", "\\/")}$`),
          replacement: dependencyImport(name),
        }))
      : [],
  },
  build: { target: "es2022", chunkSizeWarningLimit: 650 },
};
