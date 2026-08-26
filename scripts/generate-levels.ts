import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeRuns } from '../src/mechanic/engine/pixelDropEngine.ts';
import type { ColorId, LevelConfig, Piece } from '../src/mechanic/engine/types.ts';

/**
 * Authoring tool for src/mechanic/levels/levels.json — docs/rules.md §6:
 * "Уровень без прогона солвером — не уровень." This does not run in the
 * shipped game; it is how the shipped game's levels.json gets produced.
 *
 * CURRENT STATE: placeholder content. Every level here is single-cell pieces
 * only, one piece per target cell, so solvability is trivial by construction
 * (there is exactly one way to place a 1×1 piece). That satisfies parseLevel's
 * shape checks and gets a real, playable 9-level pack in place, but it does
 * NOT yet implement docs/rules.md §6's actual design: multi-cell L/T/Z pieces,
 * repeated colours across pieces, and a real backtracking solver proving a
 * solution exists for a *given* piece set (rather than the picture dictating
 * the pieces 1:1). That solver plus real polyomino piece authoring is
 * tracked as follow-up work, not done here.
 *
 * rowHints/colHints are derived from the target picture with the engine's own
 * computeRuns — the same function the game uses to grade a placement — so a
 * hint here can never disagree with what the game itself would compute.
 */

const outPath = join(dirname(fileURLToPath(import.meta.url)), '../src/mechanic/levels/levels.json');

interface Picture {
  readonly activeCells: readonly (readonly [number, number])[];
  /** Row-major, GRID_SIZE × GRID_SIZE. null = inactive or intentionally empty. */
  readonly grid: readonly (readonly (ColorId | null)[])[];
  readonly undoBudget: number;
  readonly onboardingStep: LevelConfig['onboardingStep'];
}

const GRID_SIZE = 8;

function rectangle(topRow: number, topCol: number, size: number): [number, number][] {
  const cells: [number, number][] = [];
  for (let r = topRow; r < topRow + size; r += 1) {
    for (let c = topCol; c < topCol + size; c += 1) cells.push([r, c]);
  }
  return cells;
}

function emptyPictureGrid(): (ColorId | null)[][] {
  return Array.from({ length: GRID_SIZE }, () => Array.from({ length: GRID_SIZE }, () => null));
}

function buildLevel(id: number, picture: Picture): LevelConfig {
  const rowHints = picture.grid.map((row) => computeRuns(row.map((c) => (c === null ? null : { color: c }))));
  const colHints = Array.from({ length: GRID_SIZE }, (_, col) =>
    computeRuns(
      picture.grid.map((row) => {
        const color = row[col];
        return color === null || color === undefined ? null : { color };
      }),
    ),
  );

  const trayPieces: Piece[] = [];
  for (const [row, col] of picture.activeCells) {
    const color = picture.grid[row]?.[col];
    if (color === null || color === undefined) continue;
    trayPieces.push({ id: `l${String(id)}-p${String(trayPieces.length + 1)}`, cells: [{ offset: [0, 0], color }] });
  }

  return {
    id,
    gridSize: 8,
    activeCells: picture.activeCells,
    rowHints,
    colHints,
    trayPieces,
    undoBudget: picture.undoBudget,
    onboardingStep: picture.onboardingStep,
  };
}

/**
 * A size×size box anchored at (top, left), banded into `colors.length`
 * contiguous horizontal stripes.
 *
 * Contiguous, not cyclic: docs/rules.md §3 rule 25 forbids a colour forming
 * more than one run in any line. Every column here reads through the same
 * band order top-to-bottom, so each colour appears in exactly one run per
 * column by construction — loadLevels.ts's checkNoColorRepeatsInAnyHint
 * enforces this on load, and a cyclic (row % colors.length) stripe pattern
 * fails it the moment size exceeds colors.length.
 */
function stripedPicture(
  top: number,
  left: number,
  size: number,
  colors: readonly ColorId[],
  onboardingStep: LevelConfig['onboardingStep'],
  undoBudget: number,
): Picture {
  const grid = emptyPictureGrid();
  const activeCells = rectangle(top, left, size);
  for (const [row, col] of activeCells) {
    const band = Math.floor(((row - top) * colors.length) / size);
    const color = colors[band];
    if (color !== undefined) grid[row]![col] = color;
  }
  return { activeCells, grid, undoBudget, onboardingStep };
}

const levels: LevelConfig[] = [
  buildLevel(1, stripedPicture(0, 0, 4, ['red', 'blue'], 'runs', 3)),
  buildLevel(2, stripedPicture(0, 0, 4, ['red', 'blue'], 'forcing', 3)),
  buildLevel(3, stripedPicture(0, 0, 5, ['red', 'blue'], 'intersection', 3)),
  buildLevel(4, stripedPicture(0, 0, 5, ['red', 'blue', 'green'], 'repeated_color', 3)),
  buildLevel(5, stripedPicture(0, 0, 6, ['red', 'blue', 'green'], null, 3)),
  buildLevel(6, stripedPicture(0, 0, 6, ['red', 'blue', 'green', 'yellow'], null, 3)),
  buildLevel(7, stripedPicture(0, 0, 7, ['red', 'blue', 'green', 'yellow'], 'multicolor', 3)),
  buildLevel(8, stripedPicture(0, 0, 7, ['red', 'blue', 'green', 'yellow', 'purple'], null, 3)),
  buildLevel(9, stripedPicture(0, 0, 8, ['red', 'blue', 'green', 'yellow', 'purple'], null, 3)),
];

writeFileSync(outPath, `${JSON.stringify({ schemaVersion: 1, levels }, null, 2)}\n`);
console.log(`Wrote ${String(levels.length)} levels to ${outPath}`);
