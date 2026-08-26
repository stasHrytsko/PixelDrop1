# Game Template

Android game template: DOM shell + Phaser mechanic + Capacitor.

## Architecture

- `docs/architecture.md` — why the project is shaped this way. Read it once.
- `docs/decisions.md` — decisions taken while building, with their trade-offs.
- `docs/rules.md` — the rules of the **current** game. Rewritten per game.
- `src/shell-contract.ts` — the Shell ↔ Mechanic boundary.
- `src/game.config.ts` — the single source of truth about this game.

## Boundaries

- `src/shell/**` — do not modify unless explicitly asked to fix a shell bug.
- `src/mechanic/**` — this is what changes per game. Implement `MechanicHost`
  from `src/shell-contract.ts`.
- Do not change `src/shell-contract.ts` without approval. Every field added
  there is a field every future game has to care about.
- Read `docs/rules.md` before writing mechanic code. If a rule is missing or
  ambiguous, stop and ask — do not invent it. `docs/rules-template.md` lists
  what a complete rules document must answer; use it to name precisely what is
  missing instead of reporting a vague "unclear".

The linter enforces the boundaries; it is not a style preference. `src/mechanic/engine/**`
cannot import Phaser, the DOM, storage or `fetch`. `src/shell/**` cannot import
Phaser, cannot import anything under `mechanic/`, and cannot touch
`window.localStorage`. If a rule is in your way, that is the design talking.

## Tech

- TypeScript strict. No `any` anywhere. `unknown` only where untrusted input
  enters (`parseProgress`, `parseLevelPack`) and is narrowed immediately.
- `src/mechanic/engine` — pure functions. No mutation of the state passed in.
- Shell screens are HTML/CSS. Phaser renders the game only.
- Colours, spacing and fonts live in `src/styles/tokens.css`. The Phaser scene
  reads them at runtime via `src/mechanic/render/theme.ts` — do not hard-code a
  colour in a scene.
- Levels: versioned JSON in `src/mechanic/levels`, validated on load.
- Progress via `ProgressRepository` — never `window.localStorage` directly.
- Signals via `SignalSink` — never call ntfy from shell logic.
- Safe areas: use the `--safe-*` tokens, never bare `env(safe-area-inset-*)`.
  On Android, Capacitor injects `--safe-area-inset-*` instead; the tokens
  already handle both.
- Every interactive element gets a `data-testid`. The E2E suite locates by it.
- No new production dependencies without approval. Keep `package-lock.json`.

## Phaser 4

`phaser@4.2.1` ships 28 official skills. `npm install` copies them into
`.claude/skills/phaser-*` (via `scripts/sync-phaser-skills.ts`), so they are
picked up automatically — no plugin, no marketplace, and always matching the
installed Phaser version.

When unsure about an API, use those skills instead of guessing — in particular
`phaser-v3-to-v4-migration` and `phaser-v4-new-features`, because most Phaser
code in the wild is v3 and v3 answers are frequently wrong here.

Known v4 breakages: pipelines → render nodes, FX/masks → filters,
`Geom.Point` → `Vector2`, `Mesh`/`Plane` removed.

## Commands

```
npm run typecheck && npm run lint && npm test && npm run build && npm run e2e
```

`npm run check` runs all five. All must pass before declaring anything done.
`npm run verify-template` must also pass before shipping a game (it fails while
template placeholders remain).

## Workflow

Before coding: read the task, `docs/rules.md` and `src/shell-contract.ts`,
present a short plan, flag ambiguities. After coding: run all checks, show the
diff, state what is done and what is risky. Report failures with their output —
never describe a red suite as green.
