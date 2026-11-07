# BATTLE HAMSTER: Squeekchain Genesis edition

A free, turn-based pixel-art battle game where a real hamster wheel powers the arena. Choose Pip, Mochi or Nyx, fight an AI opponent, earn XP, and build a local battle record. While the Squeekchain wheel reports fresh hardware data, its speed, distance and on-chain settlements change your battles. A wallet is optional.

**Public game:** https://battle-hamster-squeekchain-genes.imd.site/ (`battle-hamster-squeekchain-genes.identitymd.eth`). The network publishes this `dist/` under that name after the job completes. This build was tested locally and had not been published when this was written.

| Deliverable | Where |
| --- | --- |
| Source, README, technical architecture | This file, `src/`, [DESIGN.md](DESIGN.md) |
| Evidence of real hardware integration | [Evidence](#evidence-of-real-hardware-integration), [artifacts/hardware-evidence.json](artifacts/hardware-evidence.json), [artifacts/live-hardware-390.png](artifacts/live-hardware-390.png) |
| Gameplay and API test results | [Validation](#validation), [artifacts/validation.md](artifacts/validation.md), [artifacts/browser-results.json](artifacts/browser-results.json) |
| Wallet integration details | [Wallet](#wallet-and-records) |
| Known limitations | [Known limitations](#known-limitations) |
| Genesis submission readiness | [artifacts/genesis-readiness.md](artifacts/genesis-readiness.md) |

## Install, preview and rebuild

Tested with Node.js 24 and npm 11. No environment file, API key, wallet or paid service is needed.

```sh
npm ci
npm run dev        # development server
npm run build      # writes the static export to dist/
npm run preview    # serves dist/
```

Open the HTTP address Vite prints. Opening `index.html` from the filesystem does not load JavaScript modules reliably.

`dist/` is the complete production export. Vite uses `base: './'`, so HTML, CSS, fonts, sprites and JavaScript use relative URLs and work at an IPFS gateway subpath. There is no server, build step or backend at serving time; the browser reads the public Squeekchain API directly.

## Play

Select **Play now**, choose a hamster and difficulty, then **Enter the arena**. You go first. Reduce the opponent's health to zero.

| Warrior | Health | Attack | Armor | Special, costing 60 energy |
| --- | ---: | ---: | ---: | --- |
| Pip | 110 | 20 | 6 | Sunflower slash: double attack power, ignoring half the opponent's armor |
| Mochi | 140 | 15 | 10 | Snack attack: 1.65× attack power and up to 30 health restored |
| Nyx | 95 | 23 | 4 | Starfall: 2.25× attack power, ignoring all armor |

- **Attack** deals damage and restores 15 energy.
- **Defend** restores 35 energy and reduces the next hit by 60%. The guard expires after the opponent's next action.
- **Special** spends 60 energy. Both fighters start with 40; energy caps at 100. Hits vary by ±10% before rounding.

Use touch, mouse, or the `1`, `2` and `3` keys. Sound starts muted. The header controls sound and animation; reduced-motion preferences also disable animation.

Rookie, Fighter and Champion victories award 60, 100 and 160 XP. A loss or confirmed forfeit awards 15 XP. Level is `floor(sqrt(totalXP / 100)) + 1`. Each level adds 2% health and attack, capped at 12%, and the loadout shows the upgraded numbers. **Battle again** replays the same setup. **Leaderboard** shows your best local victories, the full battle history and a JSON export.

## Live Squeek Power

Every screen shows the wheel's status. **Wheel details** shows RPM, running speed, distance, hardware status, provenance, freshness, last update, every bonus tier, and the latest settlements with links to Sepolia.

| Status | Meaning | Battle effect |
| --- | --- | --- |
| **HARDWARE LIVE** | Valid reading, provenance `hardware` on both the measurement and the wheel module, freshness `online`, age within `staleAfterSeconds`, wheel module `ready`, no counter fault, and the last request succeeded | Bonuses below |
| **SIMULATED** | The API labels the reading `simulated`, `replay` or `derived`, or the wheel module is not `hardware` | Neutral rules |
| **STALE** | The reading is too old, the API says `stale`, a request failed but a reading is under 5 minutes old, or the wheel module is degraded or unreported | Neutral rules |
| **OFFLINE** | No reading, a malformed or unrecognised response, a timeout with no reading, a counter fault, or no valid response for 5 minutes | Neutral rules |

Neutral rules are the original game exactly. The game has no built-in simulator, so nothing in it can produce a wheel reading of its own.

What real activity does while the status is HARDWARE LIVE:

| Input | Source | Effect on your turns |
| --- | --- | --- |
| Wheel speed | `measurement.rpmMilli` | Arena energy. Resting (below 1 RPM) +0, Jogging (1+) +4, Running (30+) +8, Sprinting (60+) +12 extra energy each turn |
| Verified distance | Higher of `measurement.distanceMm` and the last finished day in `/v1/measurement/stats`, and only with `oracle.state: accepted` and a recently verified signer | Damage. Below 0.5 km +0%, 0.5 km +5%, 2 km +10%, 5 km +15% |
| New settlement | `summary.settlementCount` rising in `/v1/settlements`, source `live` | Arena event. **Block rush** (blocks completed, `confirmationStatus: safe`): +20 energy and +25% on your next hit. **Settlement tremor** (otherwise): +10 energy |

The bonuses are temporary. They are read at the moment you act, so a lost signal is neutral on your very next move. The AI never receives them, and they never change XP. A settlement during a battle hits the arena at once; one seen on another screen is held for your next battle. Each settlement can apply once. The first read after loading only sets a baseline, so reloading never triggers an event.

The tiers come from real data: the wheel's recorded peak is 87.7 RPM and its best day is 6.35 km. Distance uses the last finished day as well as today because the device's counter resets at 12:00 UTC and the hamster mostly runs from about 02:30 to 07:30 UTC, so today's figure alone would give nothing for much of the day.

## Technical architecture

| Location | Responsibility |
| --- | --- |
| `src/squeek.ts` | Pure rules: response validation, `classifySignal` (the only route to HARDWARE LIVE), `deriveModifiers`, `detectSettlementEvent`, formatters |
| `src/squeekFeed.ts` | `SqueekFeed`: polling, timeouts, backoff, `Retry-After`, skew-free reading age, event banking; `useSqueek` hook |
| `src/game.ts` | Combat rules with `act(..., mods)`, `applyArenaEvent`, difficulty, AI, progression, idempotent `recordBattle` |
| `src/App.tsx` | Screens, turn lock, delayed AI turn, event application, save effects, cross-tab sync |
| `src/storage.ts` | Versioned save validation; older saves load unchanged |
| `src/components/SqueekPower.tsx` | `SignalBadge`, `PowerStrip`, `PowerDetails` |
| `src/components/GameViews.tsx` | Playable screens, health and energy bars, results, help, leaderboard, history, export |
| `src/components/Modal.tsx` | Native modal dialogs, Escape and backdrop closing, focus restoration |
| `src/components/Wallet*.tsx`, `src/wallet.ts` | Lazy wallet loading, providers, discovery, network state, mobile links |
| `src/styles.css`, `DESIGN.md` | Visual tokens, states, motion and responsive rules |
| `scripts/art.mjs`, `public/art/` | Original pixel sprites, arena, favicon and share card |

Data flow: `SqueekFeed` reads the API, `src/squeek.ts` validates and classifies each response, the game reads the resulting modifiers when you act, and `recordBattle` stores what they changed.

API usage follows the [developer docs](https://docs.squeekchain.com/developers/api/):

| Endpoint | Schedule | Notes |
| --- | --- | --- |
| `GET /v1/status` | Every 10 seconds | `cache: no-store`. Schema version 1 |
| `GET /v1/settlements` | Every 30 seconds | Browser-revalidated. Schema version 3. Chain ID and contract addresses are checked against the documented deployment |
| `GET /v1/measurement/stats?range=7d` | Every 15 minutes | Documented as too heavy to poll. Schema version 1 |

All requests are credential-free and time out after 8 seconds. Failures back off up to 2 minutes, `Retry-After` is honoured on 429 and 503, and a hidden tab makes no requests. Three details matter for honesty:

- `unavailable` and missing values show as Unknown, never as zero.
- Reading age is measured from the API's own timestamps plus local elapsed time, so a wrong visitor clock cannot fake freshness or staleness.
- That age only resets when `generatedAt` moves. A frozen or cached body that still says `online` ages into STALE.

Duplicate protection: a synchronous battle reference blocks rapid repeat actions, matches are recorded once by ID, and arena events are recorded once per settlement. A `storage` listener keeps tabs in step, so an older tab cannot overwrite newer XP.

Security: no secrets exist in the source or export. `index.html` sets a Content-Security-Policy with `script-src 'self'`. API data is rendered as text by React, and transaction hashes are checked against a strict pattern before they become links.

## Evidence of real hardware integration

Captured from the public API by `node scripts/tool.mjs live` on 7 November 2026 at 00:35 UTC. Full output is in [artifacts/hardware-evidence.json](artifacts/hardware-evidence.json).

**Live reading:** provenance `hardware`, freshness `online`, wheel module `usb-rp2040-a3144e-lm393` 0.2.1 `ready`, Oracle `accepted`, signer `ed25519`, core status `IDLE`, 0 RPM. The game classified it HARDWARE LIVE. Real distance from the last finished day (6.35 km) gave a real +15% damage: the same seeded Attack dealt 18 damage on neutral rules and 21 with the live modifiers.

**The real export on real API responses, in Chromium:** the strip read `HARDWARE LIVE`, `Arena energy 0% · +0 energy a turn · +15% damage`, `Resting at 0.0 RPM · Marathon trail, 6.35 km`, and the first turn logged `Pip uses Attack for 19 damage. Squeek Power: +2 damage.` See [artifacts/live-hardware-390.png](artifacts/live-hardware-390.png).

**Settlements:** the real count rose from 270 at 23:54 UTC to 274 at 00:35 UTC during this job. Passing those two real reads to the detector produced one `Settlement tremor`.

**The wheel was not turning during this job,** because the hamster's active hours fall after the job's time limit. No moving wheel was observed live. To show RPM changing a battle, the rules were run on real recorded hardware values, including gaps between the device's signed wheel passages from `/v1/measurement/runs`. These are past measurements, used for this test only:

| Recorded hardware value | Recorded at (UTC) | Tier | Player energy after one Attack (neutral: 55) |
| ---: | --- | --- | ---: |
| 5.354 RPM | 2026-11-05 04:17 | Jogging | 59 |
| 46.936 RPM | 2026-11-05 02:42 | Running | 63 |
| 76.183 RPM | 2026-11-05 04:18 | Sprinting | 67 |
| 87.707 RPM (recorded peak) | 2026-11-06 06:43 | Sprinting | 67 |

Run `NODE_USE_ENV_PROXY=1 node scripts/tool.mjs live` during those hours to capture a moving wheel. `NODE_USE_ENV_PROXY` is only needed behind a proxy.

## Wallet and records

One control provides EIP-6963 discovery, a generic browser-wallet fallback, Coinbase Wallet and Smart Wallet, and mobile links for MetaMask, Coinbase, Rabby and Phantom. Wagmi restores stored connections and handles switching to Sepolia (chain 11155111), the [documented deployment](https://docs.squeekchain.com/developers/#deployments). The transport is viem's public Sepolia default, and the game makes no RPC reads of its own. Wallet SDKs load separately, so a wallet failure cannot stop play.

The game never asks for a private key or seed phrase and has no input that could take one. It requests no signature and no transaction.

**Local and on-chain records are kept apart.** Match records are local: the leaderboard, history, result card and wallet dialog all say so, and the export carries `"onChain": false`. Only settlements are shown as confirmed on-chain, each linked to its Sepolia transaction. The protocol has no game-match endpoint, so on-chain match records and a shared leaderboard would need an approved recording service or a new contract. Neither exists here, and no contract, token, paid API or transaction was added. Game XP is unrelated to Squeek NFT levels, $SQK, staking or rewards.

## Validation

Results from the final source on 7 November 2026.

| Command | Result |
| --- | --- |
| `npm run build` | Pass. Export 803,501 bytes, relative asset URLs |
| `npm run typecheck` | Pass (`tsc --noEmit`) |
| `npm test` | 35/35: engine, 900 seeded battles, API validation, a 3,840-case signal matrix proving no non-hardware state reaches HARDWARE LIVE, modifiers, events, XP |
| `npm run test:ui` | 38/38 DOM tests: polling, timeouts, 429/503, malformed data, stale and offline transitions, frozen responses, every game flow, wallet |
| `npm run test:browser -- --chromium-only` | 39/39 on the real export at a subpath. See below |
| `npm run check:export`, `npm run check:colors` | Pass. 17/17 declared colour pairs |
| Design-critic taste probe | 16/16 at 320, 390 and 1440 |
| Mutation check | 10/10 deliberate rule breaks caught ([artifacts/mutation-check.json](artifacts/mutation-check.json)). One survived at first and exposed a weak test, which was strengthened |

The Chromium run covers:

- all ten API states, including simulated, replay, stale, counter fault, malformed and rate-limited
- real-wheel values changing a battle while neutral states do not, and neutral rules applying the moment the signal is lost mid-battle
- arena events firing once
- every screen and dialog at 320, 375, 768, 1024 and 1440 with no overflow, and hero text clear of the fighters at 16 widths
- a touch-only phone session, and a full keyboard battle
- XP recorded once across rapid clicks, reloads and two tabs
- wallet connect, switch, restore, reject and disconnect, with no signature or transaction requested
- axe scans of all screens and dialogs
- no runtime or local resource errors

`NODE_USE_ENV_PROXY=1 node scripts/tool.mjs live` passed against the real API.

To rerun the browser checks:

```sh
npx playwright install chromium webkit
npm run test:browser
```

The suite serves the real export under `/preview/` and answers the API with a test double built on real captured responses in `tests/fixtures/`, so every state can be reached on demand. These fixtures are test inputs and are not in `dist/`. Results go to `test/scratch/browser-tests/`.

## Known limitations

- **No moving wheel was seen live.** The wheel was idle for this whole job, so the live RPM path has only run at 0 RPM. Non-zero RPM was tested with real recorded values and with the test double.
- **Browser-to-API transport was not tested directly.** This machine's sandbox proxy blocks Chromium from reaching the internet, so the live browser run passed real API responses through Node. `curl` confirmed `Access-Control-Allow-Origin: *` on GET and on the preflight, and the docs state that browsers may call these reads.
- **"Hardware" is what the API reports.** The browser does not verify the device signature, and the docs reviewed do not publish a way to do so. The live signer is `ed25519` with no key slot, while the docs' example shows `trust-m`, and `/v1/measurement/runs` reports `profile: staging`.
- **WebKit did not run.** It downloaded but cannot launch here because system libraries are missing, so Safari and iPhone behaviour is untested. Mobile checks are Chromium emulation, not physical phones.
- **Real wallet approval was not tested.** The wallet checks used a test provider. Coinbase's popup flow was not exercised.
- **Screen readers were not tested.** Axe scans do not certify accessibility, and 200% native zoom and RTL were not checked.
- **Records are local.** They can be edited in browser storage, and an active battle ends on reload without a record.
- **The protocol is on Sepolia,** for testing. The API is documented as in active development.

## Art and licences

`npm run art` regenerates the original assets. `node scripts/notices.mjs` regenerates dependency notices after a normal install. Pixelify Sans is bundled locally under the SIL OFL; wallet marks retain RainbowKit's licence. See `public/THIRD-PARTY-NOTICES.txt`, `public/fonts/OFL.txt` and `public/art/wallets/LICENSE.txt`. Design guidance attributions are in `artifacts/DESIGN-GUIDANCE-LICENSE.txt`.

## Submission budget

The explicit path budget is 8 MiB: source, scripts, tests and config 512 KiB; `public/` 1 MiB; `dist/` 5 MiB; documentation, licences, evidence and lockfile 1.5 MiB. Generated dependencies, caches, browser downloads and `test/scratch/` have a budget of zero bytes and are ignored. `dist/` is included. No dependency tarballs, registry mirror, sourcemaps or submodules are delivered.
