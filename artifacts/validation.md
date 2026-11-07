# Revision validation

Date: 7 November 2026. Scope: reproduce and resolve finding `37c4e3f0a8d9e1f7d21cf84647b37449cf3e66736b2a6c02b3f0ae522182bdac`, restoring repository deliverables without changing the accepted game. Results below were run locally on the delivered source/export. They are worker observations, not an independent certification.

## Reproduction and correction

At entry, `existsSync` returned false for all six paths named in the finding: Genesis readiness, hardware evidence, live screenshot, validation report, browser results and mutation results. `git check-ignore` also excluded all six `artifacts/` paths. README links therefore resolved to nothing in the submitted tree.

Changes:

- Deliver the six files, including actual new captures and test results rather than reconstructing the missing earlier outputs.
- `.gitignore:18` explicitly admits named evidence files; generated dependencies and scratch outputs stay ignored. Artifacts have a 1 MiB budget inside the existing documentation budget.
- `scripts/verify-live-api.mjs:28` now defaults to `artifacts/hardware-evidence.json`, matching the README instead of writing under `docs/evidence/`.
- Add repeatable live-browser capture, isolated mutation verification and read-only delivery-integrity scripts. Update README counts and qualify readiness and evidence.
- Preserve `src/`, `public/`, dependency/build configuration, lockfile and `dist/`. No game rewrite, dependency upgrade or chain mutation.

## Commands and actual results

Runtime: Node 22.22.1, npm 9.2.0, existing locked dependencies. Dependencies, browser download and missing browser libraries were installed only under ignored `test/scratch/`. The first browser launch failed for missing runtime libraries; after providing them locally, the suite ran to completion. No dependency manifest or lockfile changed.

| Command | Observed result |
| --- | --- |
| `npm run build` | Exit 0. Vite production build passed. Existing dependency `use client` directive warnings were non-fatal. Rebuilt export matches the accepted export. |
| `npm run typecheck` | Exit 0, `tsc --noEmit`. |
| `npm test` | Exit 0; 38/38. Engine, all characters/difficulties, 900 complete seeded battles, XP/idempotence, API schema/provenance, modifiers, events and saves. |
| `npm run test:ui` | Exit 0; 41/41 across game, feed and wallet tests. |
| `npm run test:browser -- --chromium-only` | **Exit 1; 40/42**, Chromium 158.0.8127.18 / Playwright 1.65.0. Two layout assertions failed. Full case names, durations and failures are in [browser-results.json](browser-results.json). |
| `npm run check:export` | Exit 0; 20 files, 12 asset references checked, 804,865 export bytes, relative URLs and required share metadata present. |
| `npm run check:colors` | Exit 0; [17/17 declared solid pairs](contrast.json). This is a token calculation, not measurement over artwork. |
| `node scripts/verify-mutations.mjs` | Exit 0; unmodified baseline 38/38, then [10/10 selected mutations caught](mutation-check.json). Each ran in a separate scratch copy; production source was not mutated. |
| Pinned `taste.mjs --out test/scratch/taste --offline` | Exit 0; [16/16 entry-screen checks](design-review.json) at 320, 390 and 1440. External API requests were blocked for this probe. |
| `node --import ./node_modules/tsx/dist/loader.mjs scripts/capture-live-evidence.mjs --curl --settlement-baseline tests/fixtures/live-settlements.json` | Exit 0, using the scratch dependency path in this environment. Eight actual HTTPS API responses, 390×844 production screenshot and a real battle turn were captured. |
| `node scripts/verify-deliverables.mjs` | Pass; six nonempty, nonignored required files, JSON parsing, PNG dimensions, screenshot hash, documentation links, result counts and explicit artifact budgets. This checks delivery integrity, not a clean browser verdict. |

Final delivery checks passed all 42 local documentation links. The Git-visible submission contains 91 files, under 2.4 MB total; evidence is under 0.8 MB, within its explicit 1 MiB budget and the overall 8 MiB limit. No generated dependencies, caches, dependency archives or submodules are added. A protected-path diff confirms the game, art, export, manifest, lockfile and build configuration are unchanged.

## Evidence provenance

[hardware-evidence.json](hardware-evidence.json) contains the API-derived summaries, eight raw public response bodies, request IDs, selected public headers and capture timestamps. SHA-256 values record the decoded HTTP bodies at capture time; the screenshot hash binds the delivered PNG to the report. They are fingerprints, not independent authentication of the wheel.

Captured at 01:24:43 UTC; screenshot at 01:24:46 UTC. Status provenance `hardware`, freshness `online`, wheel module `ready`, Oracle `accepted`; signer `ed25519`. RPM, speed and current counter distance are all zero. Two status samples have the same generation timestamp and request ID, so they represent a cached snapshot. The last completed device day has **6,348,818 mm**, yielding **+15% damage** while current hardware remains live.

The actual `act` function with fixed random 0.5 produces **18 damage neutral versus 21 with the live modifiers**, energy 55 in both. The production browser shows the +15% modifier and its actual first Attack logs **16 damage, including +2 Squeek Power damage**. This browser turn has normal game randomness; it is separate from the fixed-random comparison. See [live-hardware-390.png](live-hardware-390.png).

Historical passage-gap RPM inputs **5.354 / 46.936 / 76.183**, and recorded peak **87.707**, produce end-of-Attack energy **59 / 63 / 67 / 67**, neutral **55**. This is recorded-input rule validation. It deliberately substitutes historical RPM into a copy of a live snapshot and does not establish a moving wheel now. No recorded input reaches the shipped game or gets presented as a current hardware capture.

Settlement evidence compares the real retained fixture at 00:11:49 (271) with the real new response at 01:24:41 (279), producing Settlement tremor. It is not a newly observed live-browser event. Test fixtures in the DOM/browser suites intentionally modify timestamps, RPM, distance and settlement counts to reach all states; their HARDWARE LIVE scenarios are test doubles, never delivered as live hardware evidence.

The capture script forwards original public HTTPS response bodies through Node/curl into Chromium without changing their timestamps or readings. Therefore the screenshot demonstrates the real API data path through the production game, while direct browser-to-internet networking remains unverified. No private data, account credentials, local RPC addresses or machine configuration are included.

## Gameplay, API and wallet coverage

Engine checks cover all three characters, all difficulties, distinct Specials, defending, energy limits, healing, AI, health, match completion, progression upgrades, save validation and 900 deterministic full battles. The signal matrix runs **15,360 combinations** (`4 × 4 × 2 × 3 × 5 × 4 × 2`), verifying live eligibility and neutral modifiers otherwise.

The 41 DOM checks cover initial polling, hidden tabs, timeout, malformed schemas, failed networking, 429/503 Retry-After, stale/offline transitions, frozen/cached responses, visitor clock skew, device-day rollover, event banking/application, loss of a banked surge, cross-tab XP merging and save failures. UI checks complete victories, replay, leaving/cancelling and all character loadouts. No non-live state receives a bonus.

The 40 passing browser cases include all ten API states, RPM/distance effects in a real rendered battle, immediate neutral mechanics after losing signal, duplicate event/XP protection, two simultaneous finishing tabs, a touch battle at 375px, full keyboard battle, dialogs/focus return, local record export, reduced motion, axe scans, asset loading and no game runtime errors. The menu reflows at 320, 375, 390, 768, 1024 and 1440; selection is checked at those widths too. The more comprehensive all-screen reflow loop stops at its first 320px live-state overlap, so this revision **does not claim all screens/dialogs passed every width**.

Wallet tests use a test provider for EIP-6963 discovery, connect, network switch to Sepolia, restore, rejection and disconnect. Mobile links and the Coinbase Smart Wallet entry exist and pass UI checks. No `sign` or `send` request is made by these tested flows. Real extension approvals, physical wallet browsers and Coinbase's popup are not verified. Game records remain explicitly local; API settlement links alone describe on-chain records.

## Better Interface review

Reviewed the pinned workflow, six domain principles, documentation method, design-critic thresholds and the implemented [DESIGN.md](../DESIGN.md). Existing visual direction and game source were preserved. Light theme, localization and remote image systems are not product features and were not added.

| Domain | Coverage and result | Limits |
| --- | --- | --- |
| Accessibility — Checked | Source names/semantics, native controls/dialogs, `src/components/Modal.tsx:33`, focus styles `src/styles.css:80`, live statuses `src/components/SqueekPower.tsx:54`, keyboard battle/focus restoration, axe on screens/dialogs, reduced-motion behavior. Required primary controls are on the first screen at 390px. | No screen reader, physical touch device, native 200% zoom or exhaustive visible-focus walkthrough. Three entry controls are below the 44px comfort recommendation but meet the probe's 24px/spacing criterion. |
| Layout — Checked, two findings | Viewed the real 390px capture and follow-up screenshots at 320 and 1001px. Reflow measurements, hero/sprite test and the comprehensive loop exposed the failures below. | All-screen reflow loop exits at first failed assertion. RTL and pseudo-localization not checked. |
| Writing — Checked | Labels and effects reviewed in `src/components/GameViews.tsx:568`, `src/components/SqueekPower.tsx:26`, `src/components/Wallet.tsx:110`; local record labels and Unknown values are explicit. Documentation now distinguishes live, historical and mocked data. | No user comprehension study. Exact uppercase signal labels are required by the brief. |
| Typography — Checked | Six implemented source sizes, local Pixelify loaded, natural tracking and wrapping measured by taste; body fallback here is DejaVu Sans. Menu text/sprite collision reproduced at 1001px. | Font/OS combinations beyond this runtime and native text zoom are unverified. |
| Colors — Checked | Reused semantic tokens from `src/styles.css:8`; [17 measured solid token pairs](contrast.json); entry-screen rendered solid backgrounds pass the probe. State labels include icon and text. | Probe excludes 16 text boxes over artwork/gradients. No claim that their contrast was measured. |
| UI — Checked | Existing surfaces, icon set, disabled/pending/empty/error states and 150ms explicit transitions reviewed; automated sound/motion toggles, wallet rejection and signal failures exercised. | No 10%-speed animation-panel inspection, screen-reader session or physical Safari test. |

### Findings and disposition

| Severity | Source | Reproduction and impact | Disposition |
| --- | --- | --- | --- |
| High, reported | `README.md:10`, `README.md:14`; live writer `scripts/verify-live-api.mjs:28` | All six evidence paths absent and ignored; promised readiness/test/hardware reports unavailable. | **Fixed.** Six files delivered, named paths admitted with budgets, writer path corrected, README linked claims updated and delivery check added. |
| Medium, discovered during rerun | `src/styles.css:1904`, `src/styles.css:1553` | At 320px with live idle hardware and DejaVu Sans, badge spans x=29..181.36 and Wheel details x=153.33..291 at intersecting heights, masking the badge's end. [Screenshot](layout-320.png). | **Outstanding.** Accepted game source preserved per bounded revision instruction. Readiness report explicitly withholds unconditional layout acceptance. |
| Medium, discovered during rerun | `src/styles.css:392`, `src/styles.css:1889` | At 1001px the unrestricted menu paragraph crosses Pip; the compact paragraph rule starts at 1000px. [Screenshot](layout-1001.png). | **Outstanding.** Same revision-scope limit; recorded instead of claiming the browser suite passed. |

## Completion and remaining limits

**Complete for the stated missing-deliverable revision scope.** All six requested paths now contain substantive delivered evidence/documentation. **Broader production readiness remains incomplete** because the two existing layout checks fail and full live-motion/browser/wallet coverage is unavailable. [Genesis readiness](genesis-readiness.md) records those conditions and who controls external publication/hardware.

WebKit/Safari, direct browser API transport, live non-zero RPM, independent signature verification, real wallet approval, Coinbase popup, screen readers, native 200% zoom, RTL and physical devices were not verified. No additional paid job, API, deployment or shared match backend was created. Local match records remain editable in browser storage and an active match is not resumed after reload.
