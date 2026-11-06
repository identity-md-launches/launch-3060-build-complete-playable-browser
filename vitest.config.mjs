import base from "./vite.config.mjs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
const deps = process.env.BATTLE_TOOLING_DIR;
const require = deps
  ? createRequire(resolve(deps, "../package.json"))
  : createRequire(import.meta.url);
export default {
  ...base,
  resolve: {
    ...base.resolve,
    alias: [
      ...base.resolve.alias,
      ...(deps
        ? [
            {
              find: /^vitest$/,
              replacement: resolve(deps, "vitest/dist/index.js"),
            },
            {
              find: /^@testing-library\/react$/,
              replacement: require.resolve("@testing-library/react"),
            },
            {
              find: /^@testing-library\/user-event$/,
              replacement: require.resolve("@testing-library/user-event"),
            },
          ]
        : []),
    ],
  },
  test: {
    environment: "jsdom",
    include: ["tests/*.test.tsx"],
    setupFiles: ["tests/setup.ts"],
    maxWorkers: 1,
  },
};
