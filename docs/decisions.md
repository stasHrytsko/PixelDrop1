# Decisions

Decisions taken while building the template, and what each one costs. Recorded
so that a future change is an informed reversal rather than a rediscovery.

`docs/architecture.md` describes the design. This file describes where reality
argued with it.

---

## D-001 — TypeScript 6, not 7

**Decision:** pin `typescript@6.0.3`.

TypeScript 7 is released (7.0.2) but `typescript-eslint@8.68.0` declares
`typescript: >=4.8.4 <6.1.0`. On TS 7 the entire `npm run lint` step — including
the rules that enforce the Shell/Mechanic boundary — stops working.

**Cost:** one major version behind. **Reversal:** bump when typescript-eslint
ships TS 7 support; nothing else in the project depends on the version.

---

## D-002 — Phaser 4, with the official skills as the antidote

Kept from the architecture document. What changed is the mitigation: Phaser
4.2.1 ships **first-party Claude skills** in `node_modules/phaser/skills/` — 28
of them, including `v3-to-v4-migration` and `v4-new-features`. They are
versioned with the exact Phaser installed, which a third-party plugin cannot be.

`scripts/sync-phaser-skills.ts` copies them into `.claude/skills/phaser-*` on
postinstall, so an agent picks them up automatically and they are re-synced
whenever Phaser is upgraded. The copies are git-ignored — they belong to the
installed version, not to the repository.

The third-party alternative, `Yakoub-ai/phaser4-gamedev`, was checked and not
installed: it targets Phaser **4.0.0-rc.7** while this project runs 4.2.1, so
its skills would teach an older API than the one installed — the exact failure
it exists to prevent. Its genuinely distinct piece is a PreToolUse hook that
blocks v3 API before a file is written; that hook is worth revisiting if the
project keeps drifting into v3 idioms.

**Cost:** 28 extra skill descriptions in an agent's context in this repository.
**Reversal:** falling back to Phaser 3 still does not touch shell, contract,
progress, signals or CI.

---

## D-003 — `android/` is not committed in the template

`npx cap add android` writes `MainActivity.java` into
`android/app/src/main/java/com/example/gametemplate/`. The appId is part of a
**directory path**, so `new-game` cannot rename it with a text substitution
without producing a project that does not compile.

**Decision:** the template ignores `android/`. Each game runs
`npm run android:add` right after `npm run new-game`, and commits `android/`
from then on. `scripts/check-placeholders.ts` still scans it, so a stale native
project cannot ship unnoticed.

**Cost:** one extra command per game, and CI regenerates the project on every
run. **Reversal:** delete the `android/` line from `.gitignore` in a game repo.

---

## D-004 — Safe areas come from two different mechanisms

`@capacitor/android` 8 contains `com.getcapacitor.plugin.SystemBars`, which
injects `--safe-area-inset-*` as an **inline style on `documentElement`** rather
than populating `env(safe-area-inset-*)`.

A layout written only against `env()` looks correct in Chrome and clips under
the status bar on a real Android 15+ phone. `src/styles/tokens.css` therefore
reads `var(--safe-area-inset-top, env(safe-area-inset-top, 0px))`, and
`capacitor.config.ts` pins `SystemBars.insetsHandling: 'css'`.

**Cost:** the indirection has to be explained, which is what this entry is for.

---

## D-005 — The ntfy request is a CORS "simple request"

Sending ntfy's `Title`/`Tags`/`Priority` headers turns the POST into a
preflighted cross-origin request — an extra `OPTIONS` round-trip that has to
succeed from both a browser and the Android WebView, for a two-word payload.

**Decision:** `text/plain` body, no custom headers, no preflight.
**Cost:** the phone notification shows the raw message instead of a formatted
title. **Reversal:** add the headers back and verify the preflight on-device.

---

## D-006 — `onboarding.rules: string[]`, and a `tagline`

The architecture document specified `onboarding.body: string`. The game standard
in the parent `CLAUDE.md` specifies a list of 4-6 rules with icons. A single
string cannot be rendered as a list without the shell parsing prose.

**Decision:** `GameDefinition.onboarding.rules` is an array, and `tagline` was
added for the one-line description under the title.

The two documents also disagreed about where the rules appear. Resolution: the
rules live **only** in the Onboarding screen — shown automatically when the
stored onboarding version is stale, and reachable any time from the menu's
"Как играть". The main menu does not repeat them. A first-run player still sees
the rules before the first level, which was the intent of both documents.

---

## D-007 — There is no loss path in the contract

`MechanicHost` reports `onComplete` and `onExit`. There is no `onFail`, so the
shell cannot show the "Поражение" popup that the parent `CLAUDE.md` standard
describes. The architecture document's contract has no such event either, and
`CLAUDE.md` forbids widening it unasked.

**Current state:** deliberate gap. `src/shell/screens/Popup.ts` is already
generic enough that a loss popup is a call to the same function.

**If a game needs it:** add `onFail(reason: string): void` to
`CreateLevelParams`, handle it in `ShellApp.#levelFailed`, and record the change
here. That is roughly fifteen lines.

---

## D-008 — Callbacks are properties, not methods

`CreateLevelParams.onComplete: () => void` rather than `onComplete(): void`.
Method syntax makes them unbound methods, which the linter correctly flags the
moment they are passed around — and they exist to be passed around.

---

## D-009 — Phaser is one 1.4 MB chunk, on purpose

`dist/assets/index-*.js` is ~1.4 MB (367 kB gzipped), almost entirely Phaser.
Splitting it would require the shell to load the mechanic lazily, which means an
async seam in the contract.

Inside an APK the bundle is read from the local filesystem, so the download
argument does not apply and only parse time remains.

**Decision:** keep it in one chunk; `chunkSizeWarningLimit` is raised so the
build does not print an unactionable warning. **Reversal:** if cold start on a
cheap phone is measurably bad, make `ShellAppDeps.mechanic` a
`() => Promise<MechanicHost>`.

---

## D-010 — E2E taps real pixels, and no test hook exists in `src/`

The playthrough test computes tap coordinates from the same `levels.json` the
game ships and clicks the real canvas, then intercepts the real `https://ntfy.sh`
request with `page.route`.

There is deliberately **no** test-only sink, query flag or `window` hook in
production code. **Cost:** the test knows `@capacitor/preferences` stores under
`CapacitorStorage.<key>` in the browser, used to seed progress in one test.
That coupling is documented at the constant.
