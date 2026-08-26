/**
 * The engine is the rules of the game and nothing else: no Phaser, no DOM, no
 * storage, no I/O. That is enforced by the linter (see eslint.config.js), not
 * by discipline — because discipline is what runs out at 2am.
 *
 * TState / TInput / TLevel are defined per game. Nothing here is `any` and
 * nothing here is `unknown`.
 */
export interface MechanicEngine<TState, TInput, TLevel> {
  create(level: TLevel): TState;
  apply(state: TState, input: TInput): TState;
  isComplete(state: TState): boolean;
}

// --- Pixel Drop -------------------------------------------------------------
// Types mirror docs/rules.md §4–6 field for field. If a field here has no
// matching sentence in docs/rules.md, that is a bug in this file, not a
// judgement call — see docs/rules-template.md's whole point.

export type GameState = 'playing' | 'won';

export type ColorId = 'red' | 'blue' | 'green' | 'yellow' | 'purple';

export type Cell = null | { readonly color: ColorId };

export interface Run {
  readonly count: number;
  readonly color: ColorId;
}

/** A line's target: the ordered sequence of runs it must contain when solved. */
export type LineHint = readonly Run[];

export type LineStatus = 'ok' | 'pending' | 'wrong';

export interface PieceCell {
  /** [row, col] relative to the piece's anchor cell, which is always [0, 0]. */
  readonly offset: readonly [number, number];
  readonly color: ColorId;
}

export interface Piece {
  /** Unique across the whole level's trayPieces queue — see docs/rules.md §6. */
  readonly id: string;
  readonly cells: readonly PieceCell[];
}

export interface PlacedMove {
  readonly pieceId: string;
  readonly traySlot: number;
  readonly cells: readonly { readonly row: number; readonly col: number; readonly color: ColorId }[];
}

export const GRID_SIZE = 8;
export const TRAY_SIZE = 3;

export interface LevelState {
  readonly gameState: GameState;

  /** GRID_SIZE × GRID_SIZE, row-major: grid[row][col]. */
  readonly grid: readonly (readonly Cell[])[];
  /** Same shape as grid. Clear from an inactive cell is not the same as full. */
  readonly activeCells: readonly (readonly boolean[])[];

  readonly rowHints: readonly LineHint[];
  readonly colHints: readonly LineHint[];

  /** The level's whole deterministic piece queue, in order. Never mutated. */
  readonly trayPieces: readonly Piece[];
  /** Index into trayPieces of the next piece not yet dealt into the tray. */
  readonly nextPieceIndex: number;
  /** TRAY_SIZE slots. null = slot spent, waiting for the next refill. */
  readonly tray: readonly (Piece | null)[];

  readonly selectedPieceIdx: number | null;

  readonly lineStatus: {
    readonly rows: readonly LineStatus[];
    readonly cols: readonly LineStatus[];
  };

  /** Valid placements in the order they were made. The basis for Undo. */
  readonly history: readonly PlacedMove[];
  readonly undoBudget: number;

  readonly isStuck: boolean;
}

export type GameInput =
  | { readonly type: 'tap_piece'; readonly traySlot: 0 | 1 | 2 }
  | { readonly type: 'tap_cell'; readonly row: number; readonly col: number }
  | { readonly type: 'tap_background' }
  | { readonly type: 'tap_undo' };

export interface LevelConfig {
  readonly id: number;
  readonly gridSize: 8;

  /** [row, col] pairs. Must form a solid rectangle — see docs/rules.md §6. */
  readonly activeCells: readonly (readonly [number, number])[];

  readonly rowHints: readonly LineHint[];
  readonly colHints: readonly LineHint[];

  readonly trayPieces: readonly Piece[];
  readonly undoBudget: number;

  readonly onboardingStep:
    | 'runs'
    | 'forcing'
    | 'intersection'
    | 'repeated_color'
    | 'multicolor'
    | null;
}
