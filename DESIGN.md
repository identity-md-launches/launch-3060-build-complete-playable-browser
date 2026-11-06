# BATTLE HAMSTER design system

## Overview

An approachable arcade game for the Squeekchain Genesis community. The visual idea is a tiny, torchlit underground fighting arena: crisp original pixel characters carry the personality, while a restrained dark interface keeps turns, health, energy, and the primary action readable. The initial screen contains the game name, arena, and Play action; it is a menu for a playable game.

The implemented source is the authority. The responsive rules below come from the CSS. In the latest revision they were also checked in headless Chromium at widths from 320 to 1440px (320, 360, 390, 520, 700, 761, 820, 1024 and 1440), with screenshots of the menu, the progress strip and the battle arena (see `artifacts/validation.md`). Physical devices weren't tested.

## Colors

Semantic values live in `:root` in `src/styles.css`. The interface has one dark theme.

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#13131c` | Page |
| `--surface` | `#1c1c27` | Character choices and dialogs |
| `--surface-raised` | `#242431` | Secondary controls and wallet rows |
| `--surface-hover` | `#2c2b39` | Interactive hover fill |
| `--line` | `#353441` | Structural separators, outlines, and meter track |
| `--text` | `#f3ece3` | Primary text |
| `--muted` | `#b1aabd` | Supporting text |
| `--subtle` | `#928a9e` | Low-emphasis footer and history text |
| `--accent` | `#efb679` | Primary actions and Pip's identity |
| `--accent-hover` | `#f8cb99` | Primary hover |
| `--accent-ink` | `#302018` | Text/icons on the primary fill |
| `--success` | `#9ccfb5` | Health, guard, and Mochi's identity |
| `--danger` | `#f19a9e` | Errors and low health |
| `--energy` | `#b6a1e5` | Energy and Nyx's identity |
| `--focus` | `#f9d69f` | Keyboard focus perimeter |

Character colors encode identity, with names, role text, and icons as redundant cues. Guard status and health always have text/numeric equivalents. Arena/art palettes are independently defined in `scripts/art.mjs`; they are not extra UI themes.

Calculated solid token contrast includes primary text/page **15.75:1**, supporting text/page **8.22:1**, subtle text/page **5.58:1**, and primary-button ink/fill **8.65:1**. These are calculations from declared values, not measurements over the rendered arena. All 14 computed pairs and the scope limit are in `artifacts/contrast.json`.

## Typography

`--font-game: Pixelify, Arial, sans-serif` uses the local variable `public/fonts/pixelify-latin.woff2`, defined with weights 400–700 and `font-display: swap`. It supplies game headings, warrior names, level numerals, and damage numbers. `--font-body: Arial, Helvetica, sans-serif` supplies instructions, labels, dialogs, and history. No remote font request is needed.

The six-size scale in `src/styles.css` is:

| Token | Size at the 16px root | Role |
| --- | ---: | --- |
| `--text-sm` | 14px | Supporting copy, navigation, labels |
| `--text-body` | 16px | Body, actions |
| `--text-lg` | 20px | Compact names and headings |
| `--text-title` | 24px | Section/dialog headings |
| `--text-display` | 40px | Screen headings and phone menu title |
| `--text-hero` | 64px | Desktop menu title |

Weights are 400, 600, and 700. Headings use line-height 1.1; the menu title uses 1–1.03. Body text uses 1.6 and compact text uses 1.5. Display tracking is slightly negative (`-.035em` or `-.025em`); body tracking is natural. Numeric health, energy, XP, and table values use tabular numerals. Text is not truncated; the full wallet address wraps in its dialog. Heading balance and paragraph pretty wrapping are progressive enhancements.

## Layout

`.app` is centered at a maximum of 1280px, including its padding. The header anchors the brand left and utility controls right. A separate menu navigation row precedes the game. The content order is menu scene, warrior previews, career progression, then footer. Selection replaces the scene with choices, a loadout, difficulty, and the start control. Battle replaces it with the arena/HUD, actions, and log.

Spacing tokens are 4, 8, 12, 16, 24, 32, and 48px; component-specific optical gaps also occur in source. Main gutters are 48px, then 32px below 1100px, 20px below 760px, 16px below 520px, and 12px below 350px.

Implemented adaptations:

- Above 1100px, selection has three choices and a side loadout. At 1100px and below, loadout moves beneath the choices into a two-column stats/ability layout.
- At 760px and below, previews become vertical compact buttons, action icons stack over their labels, and optional desktop hints disappear. In the progress strip, the level emblem and XP meter fill the first row (`.level-progress { flex: 1 0 calc(100% - 54px) }`) and the three career stats wrap onto a second row, so the XP label never shares a row with the numbers.
- At 520px and below, the menu copy is above the pair of fighters; the 40px title and Play action remain near the top. The scene is at least 480px tall. Selection art and HUD spacing shrink; battle actions remain three columns. A wrong-network wallet label can wrap the header into another row.
- At 640px and below, the wallet picker/account dialog is a full-width bottom sheet with safe-area padding. Other dialogs are inset and scroll internally.
- At 350px and below, header and choice spacing tighten further. Leaderboard columns remain available in a contained scroll region.
- At 1500px and above, the menu scene minimum height increases from 436px to 456px.

These rules were reviewed in source. Actual 320/390/820/1440 reflow, 200% native zoom, and RTL mirroring were not verified.

## Elevation & Depth

Panels use thin structural borders and tonal background changes without card shadows. The arena uses a dark overlay so text is separate from the illustrated stonework. Pixel corners mark the scene frame. Sprite-only drop shadows ground characters on the floor; their small colored glows belong to the scene. Native modal backdrops use `#080910c9` and a 5px blur. A modal's native top layer supplies stacking and background inertness.

## Shapes

Buttons, previews, and scene frames use 5px radii; smaller badges/meters use 1–3px. General dialogs use 8px, wallet sheets use 12px at the top, and status dots are circles. Pixel art uses integer-coordinate rectangles and paths, SVG `shape-rendering="crispEdges"`, and CSS `image-rendering: pixelated`. Do not smooth or replace the sprites with emoji.

## Components

| Component/pattern | Source | Implemented behavior |
| --- | --- | --- |
| `Icon` | `src/components/Icon.tsx` | One current-color outlined icon set; decorative SVGs have `aria-hidden` |
| `.button`, `.icon-button`, `.wallet-button` | `src/styles.css` | Primary/secondary/text treatments, explicit hover, active, focus, and disabled states; primary action is apricot |
| `Modal` | `src/components/Modal.tsx` | Native `dialog.showModal()`, labelled heading, close control, Escape, outside click, scroll containment, and focus return to the opener. An optional `returnFocus` ref covers openers that get replaced while the dialog opens, such as the lazy-loaded wallet button. |
| `Sprite` | `src/components/GameViews.tsx` | Three local original SVG assets; decorative by default, meaningful alt available |
| `Menu`, `Selection` | `src/components/GameViews.tsx` | Actionable scene, character buttons with `aria-pressed`, native difficulty radios with legend, visible ability costs |
| `FighterHealth`, `BattleView` | `src/components/GameViews.tsx` | Named native meters, numeric values, guard label, turn feedback, 60-energy Special gate, polite combat/result text, recent history, replay |
| `ProgressBar`, `Leaderboard` | `src/components/GameViews.tsx` | Local XP/career summary; true empty state; explicit local scope; results table and JSON export |
| `WalletLauncher`, `Wallet` | `src/components/WalletLauncher.tsx`, `src/components/Wallet.tsx` | Lazy load, error isolation, EIP-6963 rows, pending/rejected states, mobile links, switch/disconnect, full address disclosure |
| `Network` | `src/components/Network.tsx` | Explicit request, loading/available/unavailable/error, snapshot time, timeout, retry and rate-limit backoff |

CSS transitions name background/color/border properties and run for 150ms. Press scales are `.96` only when motion is allowed. Combat uses short lunge/hit/impact keyframes, damage text, and a result fade; numeric and textual feedback persists without motion. Decorative idle bobs can be paused in the header. `prefers-reduced-motion`, `.no-motion`, and forced-colors rules are implemented. Native keyboard/focus behavior has not been verified in a rendered browser.

## Do's and Don'ts

- Reuse the existing page width, gutters, six sizes, and semantic color tokens.
- Keep the game and its primary action before supporting explanation. A new screen should use `.view-heading`, then its task content, then the existing career strip.
- Use the apricot fill for the view's main action. Use green/lavender as character or state information, with names/icons.
- Keep decorative animation inside the reduced-motion guards and make its meaning available as text or numbers.
- Preserve clear local-only labeling and empty states. Never seed leaderboard entries or represent game XP as on-chain value.
- Keep network and wallet dependencies out of turn resolution. Do not add a signing action without a separately approved, documented integration.

Design guidance was adapted from Jakub Krehel's Better Interface (MIT); documentation method from Paul Bakaus's Impeccable (Apache-2.0), with notices retained in `artifacts/DESIGN-GUIDANCE-LICENSE.txt`.
