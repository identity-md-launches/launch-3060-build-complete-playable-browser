# BATTLE HAMSTER

A free, single-player, turn-based pixel-art battle game for the Squeekchain Genesis community. Choose Pip, Mochi, or Nyx, fight an AI opponent, earn XP, and build a local battle record. A wallet is optional.

## Run and rebuild

Tested with Node.js 24 and npm 11. No environment file, API key, wallet, or paid service is needed.

```sh
npm ci
npm run dev
```

Create and preview the static website:

```sh
npm run typecheck
npm test
npm run test:ui
npm run build
npm run check:export
npm run preview
```

Vite prints the preview address. Open that HTTP address; opening `index.html` directly from the filesystem does not support JavaScript modules reliably.

`dist/` is the complete production export and is included in this delivery. Vite uses `base: './'`; HTML, CSS, fonts, sprites, and JavaScript chunks use relative asset URLs. The app needs no server routes, backend, or build step at serving time. Any static host can serve `dist/`, including an IPFS gateway subpath. The assignment's publishing pipeline pins this export to IPFS after submission; no CID or published URL was available during this run, and none is invented here.

## Play

Select **Play now**, choose a hamster and difficulty, then **Enter the arena**. You go first. Reduce the opponent's health to zero.

| Warrior | Health | Attack | Armor | Special, costing 60 energy |
| --- | ---: | ---: | ---: | --- |
| Pip | 110 | 20 | 6 | Sunflower slash: double attack power, ignoring half the opponent's armor |
| Mochi | 140 | 15 | 10 | Snack attack: 1.65× attack power and up to 30 health restored |
| Nyx | 95 | 23 | 4 | Starfall: 2.25× attack power, ignoring all armor |

- **Attack** deals damage and restores 15 energy.
- **Defend** restores 35 energy and reduces the next hit by 60%. The guard expires after the opponent's next action, even if the opponent defends.
- **Special** spends 60 energy. Both fighters start with 40; energy caps at 100. Hits vary by ±10% before rounding. Normal damage subtracts half the target's armor from attack power.

Use touch, mouse, or the `1`, `2`, and `3` battle shortcuts. Sound starts muted. The header controls sound and decorative animation; reduced-motion preferences also disable animation.

Rookie, Fighter, and Champion victories award 60, 100, and 160 XP. A loss or confirmed forfeit awards 15 XP. Level is `floor(sqrt(totalXP / 100)) + 1`. Each level adds 2% player health and attack, capped at 12%. Replay with the same setup or choose another warrior.

Career XP, wins, losses, streaks, preferences, and the last 50 completed matches use `localStorage` under `battle-hamster:progress:v1`. Active battles end on reload. Blocked storage produces a visible warning and leaves the current session playable. The leaderboard ranks real local victories by XP, fewer rounds, and remaining health. It is explicitly local, editable, and unverified; it contains no seeded opponents' scores. Completed records can be exported as JSON from the leaderboard.

## Squeekchain and wallets

The [official developer documentation](https://docs.squeekchain.com/developers/#deployments), reviewed on 6 November 2026, describes the current protocol deployment on **Ethereum Sepolia, chain 11155111**, for testing. This game does not assume a separate Squeekchain EVM chain.

The optional **Check network** action in **About the arena** calls the documented public [`GET https://api.squeekchain.com/v1/status`](https://docs.squeekchain.com/developers/api/#pipeline-status--get-v1status). It checks schema version 1 and the fields displayed, reports the API snapshot's measurement freshness, handles unknown/unavailable/malformed responses and an eight-second timeout, and respects `Retry-After` on 429/503. It does not poll or supply invented fallback data. No API response is bundled as live state.

One wallet control provides EIP-6963 discovery, a generic browser-wallet fallback, Coinbase Wallet/Smart Wallet, and mobile links for MetaMask, Coinbase, Rabby, and Phantom. Wagmi reconnects stored connections and handles switching/adding Sepolia. The transport uses viem's public Sepolia default, `https://11155111.rpc.thirdweb.com`; the game itself uses no RPC reads. No transaction or signature is requested. Wallet SDKs load separately from the game, and wallet load failures are isolated from gameplay.

**Deployment boundaries:** the documented protocol offers no game-match recording or game leaderboard endpoint. Match records therefore stay local. A trusted shared leaderboard needs an approved service that verifies battles; on-chain match records need an approved recording integration or additional deployment. Neither is deployed here. No contracts, tokens, paid APIs, fabricated transactions, or arbitrary protocol writes were added. Game XP and warrior levels are unrelated to Squeek NFT levels, $SQK, staking, or token rewards. Connecting does not sync progress to an address.

## Architecture and art

| Location | Responsibility |
| --- | --- |
| `src/game.ts` | Pure combat rules, difficulty, AI, progression, and idempotent match recording |
| `src/App.tsx` | Menu/selection/battle state, immediate action lock, delayed AI turn, navigation, and save effects |
| `src/storage.ts` | Versioned save validation and unavailable-storage recovery |
| `src/components/GameViews.tsx` | Playable screens, status bars, history, results, help, leaderboard, and JSON export |
| `src/components/Modal.tsx` | Native modal dialogs, Escape/backdrop closing, and focus restoration |
| `src/components/Wallet*.tsx`, `src/wallet.ts` | Lazy wallet loading, providers, discovery, network state, and mobile links |
| `src/components/Network.tsx` | Optional read-only official API status request |
| `src/styles.css`, `DESIGN.md` | Implemented visual tokens, states, motion, and responsive rules |
| `scripts/art.mjs`, `public/art/` | Original pixel sprites, arena, favicon, and SVG/PNG share card |

The AI timer is cancelled when the battle changes. A synchronous battle reference blocks rapid duplicate actions before React paints; finished matches are awarded once by ID. Nothing waits for a wallet or network call to advance a turn.

`npm run art` regenerates the original assets. `node scripts/notices.mjs` regenerates runtime dependency notices after a normal install. Pixelify Sans is bundled locally under the SIL OFL; wallet marks retain RainbowKit's license. See `public/THIRD-PARTY-NOTICES.txt`, `public/fonts/OFL.txt`, and `public/art/wallets/LICENSE.txt`. Design guidance attributions and licenses are retained in `artifacts/DESIGN-GUIDANCE-LICENSE.txt` and [the validation report](artifacts/validation.md).

## Validation

Results from the final source of the latest revision (6 November 2026):

| Command | Result |
| --- | --- |
| `npm run build` | Pass; export in `dist/` (777,078 bytes, relative asset URLs) |
| `npm run typecheck` | Pass (`tsc --noEmit`) |
| `npm test` | 11/11 engine tests pass, including 900 seeded simulated battles |
| `npm run test:ui` | 13/13 DOM interaction tests pass |
| `npm run check:export`, `npm run check:colors` | Pass |
| `npm run test:browser` (Chromium headless shell) | 14/14 Chromium checks pass: menu at a subpath, reflow at 320/390/820/1440, dialogs and focus return, empty leaderboard, all warriors and difficulties, combat and AI, full battle with save/replay/export, sound and motion toggles, axe scans, no runtime or resource errors |
| Design-critic taste probe | 16/16 checks pass at 320, 390 and 1440 |

Revision fixes, each reproduced in Chromium before the change and rechecked after it:

- The mobile progress strip squeezed the level meter to 34px at 320px, so "0 / 100 XP" was drawn over the wins number. At 760px and below, the emblem and meter now take the first row and the career stats wrap underneath.
- The battle result always said "Saved in this browser", and dismissing the save warning changed the header to "Local progress" even when the save had failed. The last save result is now stored separately from the warning.
- Closing the wallet dialog the first time sent focus to `<body>`, because the lazy-loaded wallet replaced the button that opened it. Focus now returns to the current wallet button.
- The menu had four short slogan-style lines. They are now one headline and plain sentences.
- A Special hit on the right-hand fighter made the page 10px too wide at 320px. Effects are now clipped to the arena.

**Limitations:** WebKit did not run because the installed build doesn't match Playwright 1.65. Physical phones, screen readers, real wallet approval and the live Squeekchain API weren't tested. DOM tests don't certify a browser or screen reader.

To rerun the browser checks:

```sh
npx playwright install chromium webkit
npm run test:browser
```

The script serves the real export under `/preview/` and writes results to `test/scratch/browser-tests/`. Set `BATTLE_CHROMIUM` to a Chromium executable path to use one that's already installed. See [artifacts/validation.md](artifacts/validation.md) for coverage, findings and limitations.

## Submission budget

The explicit path budget is 8 MiB: source/scripts/tests/config 512 KiB, `public/` 1 MiB, `dist/` 5 MiB, and documentation/licenses/lockfile 1.5 MiB. Generated dependencies, caches, browser downloads, and `test/scratch/` have a submission budget of **zero bytes** and are ignored. `dist/` remains included. No dependency tarballs, registry mirror, sourcemaps, or submodules are required or delivered.
