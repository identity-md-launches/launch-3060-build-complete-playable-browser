import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const [command, ...args] = process.argv.slice(2);
const local = resolve("node_modules");
const scratch = resolve("test/scratch/deps/node_modules");
const deps =
  process.env.BATTLE_TOOLING_DIR ||
  (existsSync(`${local}/vite`) ? local : scratch);
const env = {
  ...process.env,
  ...(deps !== local ? { BATTLE_TOOLING_DIR: deps } : {}),
};
let bin, params;
if (command === "typecheck") {
  bin = `${deps}/typescript/bin/tsc`;
  params = ["--noEmit"];
  if (deps !== local) {
    mkdirSync("test/scratch", { recursive: true });
    const base = JSON.parse(readFileSync("tsconfig.json", "utf8"));
    const paths = Object.fromEntries(
      ["react", "react-dom"].flatMap((name) => [
        [name, [`${deps}/@types/${name}`]],
        [`${name}/*`, [`${deps}/@types/${name}/*`]],
      ]),
    );
    for (const name of [
      "wagmi",
      "viem",
      "@tanstack/react-query",
      "vitest",
      "@testing-library/react",
      "@testing-library/user-event",
    ])
      paths[name] = [`${deps}/${name}`];
    paths["wagmi/chains"] = [`${deps}/wagmi/dist/types/exports/chains.d.ts`];
    paths["wagmi/connectors/injected"] = [
      `${deps}/wagmi/dist/types/exports/injected.d.ts`,
    ];
    paths["wagmi/connectors/coinbaseWallet"] = [
      `${deps}/wagmi/dist/types/exports/coinbaseWallet.d.ts`,
    ];
    writeFileSync(
      "test/scratch/tsconfig.json",
      JSON.stringify({
        ...base,
        compilerOptions: {
          ...base.compilerOptions,
          baseUrl: resolve("."),
          paths,
          typeRoots: [`${deps}/@types`],
        },
        include: [resolve("src"), resolve("tests")],
      }),
    );
    params.push("-p", "test/scratch/tsconfig.json");
  }
} else if (command === "art") {
  bin = resolve("scripts/art.mjs");
  params = [];
} else if (command === "browser") {
  bin = resolve("scripts/verify-browser.mjs");
  params = args;
} else if (command === "live") {
  bin = "--import";
  params = [
    `${deps}/tsx/dist/loader.mjs`,
    "scripts/verify-live-api.mjs",
    ...args,
  ];
} else if (command === "test:ui") {
  bin = `${deps}/vitest/vitest.mjs`;
  params = ["run", "--config", "vitest.config.mjs"];
} else if (command === "test") {
  bin = "--import";
  params = [
    `${deps}/tsx/dist/loader.mjs`,
    "--test",
    "tests/engine.test.ts",
    "tests/squeek.test.ts",
  ];
} else {
  bin = `${deps}/vite/bin/vite.js`;
  params = args;
}
if (bin !== "--import" && !existsSync(bin)) {
  console.error("Dependencies are missing. Run npm ci, then try again.");
  process.exit(1);
}
const result = spawnSync(process.execPath, [bin, ...params], {
  env,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
