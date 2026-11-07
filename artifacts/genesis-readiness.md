# Genesis submission readiness

Reviewed 7 November 2026. This is the contributor's assessment of the delivered tree, not independent certification.

**Decision: documentation revision complete; unrestricted production readiness remains conditional.** The playable static export, live API evidence and test results are delivered. Two existing layout failures reproduced in this browser environment, and the live wheel was idle. The accepted game source and production export are unchanged in this bounded revision.

Public game address: [BATTLE HAMSTER](https://battle-hamster-squeekchain-genes.imd.site/). IMD publishes the submitted `dist/` under the existing name after completion. This revision does not claim the public address already serves this submission; publication is controlled by IMD.

## Delivered material

| Requirement | Assessment and evidence |
| --- | --- |
| Preserve the existing game | `src/`, pixel art, characters, battle engine, wallet and `dist/` are unchanged. Pip, Mochi and Nyx, all difficulties, AI, Attack/Defend/Special, progression, replay and local history are covered by the tests. |
| Source, install and rebuild instructions | [README](../README.md), existing manifest and lockfile; [implemented design](../DESIGN.md). |
| Technical architecture | [README architecture](../README.md#technical-architecture): validated API feed → classified signal → turn modifiers → local battle record. |
| Genuine hardware integration | [Hardware evidence](hardware-evidence.json) and [390px live capture](live-hardware-390.png). Real public HTTPS responses, API-reported hardware provenance, timestamps, CORS headers and request IDs are included. |
| Activity changes mechanics | Current real distance produces +15% damage. Fixed-random neutral Attack: 18 damage; with captured live modifiers: 21. Historical hardware RPM inputs yield 59, 63 and 67 energy after Attack, compared with neutral 55. See the evidence distinctions below. |
| Honest signal states and neutral fallback | Engine/API and DOM tests pass simulated, replay, stale, malformed and offline cases. The 15,360-case signal matrix never promotes non-hardware provenance to HARDWARE LIVE. All non-live modifiers are neutral. |
| Gameplay/API/wallet results | [Validation report](validation.md), [browser results](browser-results.json), [mutation results](mutation-check.json). 38 engine/API tests and 41 DOM tests pass; browser checks: 40/42. |
| Wallet functionality | EIP-6963 discovery, injected fallback, Coinbase connector/Smart Wallet and four mobile wallet links remain intact. Mock-provider connect, switch to Sepolia, reconnect, rejection and disconnect pass. No real wallet approval or Coinbase popup was exercised. |
| Records and blockchain honesty | XP, leaderboard and matches remain local and export `onChain: false`. The API's Sepolia settlement records link to their transactions. No match transaction, contract deployment, token deployment or mint occurred. |
| Production export | Build and TypeScript checks pass; 20 runtime files, 804,865 bytes; relative asset references, metadata and local assets pass export validation. |
| Design coverage | Six domains reviewed in [validation](validation.md#better-interface-review). Entry-screen taste probe: [16/16](design-review.json); declared solid contrast pairs: [17/17](contrast.json). These narrower passes do not override the two layout failures below. |

## What the hardware evidence establishes

**Live observation, 01:24 UTC:** `/v1/status` reports `hardware`, `online`, `IDLE`, 0 RPM, 0 mm/s and 0 mm in the current counter period. The wheel module is `usb-rp2040-a3144e-lm393`, version 0.2.1, `ready`; the Oracle is `accepted`, signer kind `ed25519`. Both sampled reads classified as HARDWARE LIVE. Their identical `generatedAt` values are one cached snapshot, not evidence of two device updates.

**Real historical distance used during that live observation:** `/v1/measurement/stats?range=7d` reports 6,348,818 mm for the last finished device day, 2026-11-05. This is separate from the current counter's zero distance. The game uses the greater distance while the current wheel and verification checks hold. The production browser showed `Arena energy 0% · +0 energy a turn · +15% damage`; an actual player Attack logged `Squeek Power: +2 damage`.

**Recorded RPM rule exercise:** `recordedHardwareEffect` uses past passage gaps from `/v1/measurement/runs` and the API's historical peak, substituted into a copy of the live snapshot. These are real recorded inputs, not a wheel observed moving now. This exercises modifiers and combat; it does not test current freshness or independently verify signatures. Non-zero live RPM remains unobserved.

**Settlement comparison:** the retained real fixture at 00:11:49 UTC has count 271; the new real capture at 01:24:41 UTC has count 279. Comparing those dated snapshots produces one Settlement tremor. This is a historical-to-current comparison, not an event witnessed arriving in the live screenshot session. Browser tests separately inject synthetic increments to verify event application and deduplication.

**Browser transport:** the live screenshot uses unmodified API bodies fetched over public HTTPS by curl and forwarded by Playwright. It is neither mocked data nor a direct browser-to-API transport test. The standalone browser suite uses explicitly mocked API fixtures and a mock wallet; it is labelled accordingly in its delivered JSON.

## Outstanding blockers and limits

1. **320px live-state layout:** HARDWARE LIVE and Wheel details overlap with the DejaVu Sans fallback used here. [Capture](layout-320.png), source `src/styles.css:1904` and `src/styles.css:1553`. The button masks part of the badge. This prevents an unconditional claim that every required live-state layout is clear.
2. **1001px menu layout:** the description extends over Pip. [Capture](layout-1001.png), source `src/styles.css:392` and `src/styles.css:1889`. This fails the intermediate-width overlap check. These two source issues are recorded, not fixed or silently marked passed: this revision is limited to restoring the missing documentation/evidence and preserving the accepted game.
3. **Live motion evidence:** the hardware owner/device must produce a fresh non-zero RPM reading to close the end-to-end moving-wheel observation gap. No timer wait, fake reading or replacement infrastructure was used.
4. **Browser and wallet coverage:** direct internet transport from a normally connected browser, Safari/WebKit, physical phones, real wallet approval and Coinbase's popup remain unverified. Screen readers, native 200% zoom, RTL and slow-motion animation inspection were not performed.
5. **Trust and chain scope:** provenance and signer verification are API assertions, not independent browser signature verification. The deployment is Sepolia/staging. Matches and rankings are local; no approved on-chain match service is supplied. These are product limits, not invented on-chain functionality.
6. **Publication:** IMD must publish the completed bundle to update the public name. This worker can deliver the export and documentation but cannot certify a future hosting operation.

The missing-deliverable finding is resolved by delivering all six requested files, correcting the live script's output path, explicitly including named evidence files in Git with a 1 MiB artifact budget, and adding `node scripts/verify-deliverables.mjs`. No additional payment, job, paid API, deployment or infrastructure is required by this revision.
