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

// --- Pixel Drop v2 -----------------------------------------------------------
// Types mirror docs/rules.md §4–6 field for field. If a field here has no
// matching sentence in docs/rules.md, that is a bug in this file, not a
// judgement call — see docs/rules-template.md's whole point.

export type GameState = 'playing' | 'won';

export type ColorId = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange' | 'pink';

export type Cell = null | { readonly color: ColorId };

export interface PieceCell {
  /** [row, col] relative to the piece's anchor cell, which is always [0, 0]. */
  readonly offset: readonly [number, number];
  readonly color: ColorId;
}

export interface Piece {
  /** Unique across the level's pieces — see docs/rules.md §6. */
  readonly id: string;
  /** Exactly 4 cells, a classic tetromino, fixed orientation — docs/rules.md §3 "Фигуры". */
  readonly cells: readonly PieceCell[];
}

/** Where a piece currently sits: null = in the tray, otherwise its anchor on the board. */
export type Placement = { readonly row: number; readonly col: number } | null;

export interface LevelState {
  readonly gameState: GameState;

  readonly rows: number;
  readonly cols: number;

  /** The target picture. Fixed for the level — see docs/rules.md §2. */
  readonly targetGrid: readonly (readonly Cell[])[];

  /** The level's whole fixed set of pieces, in tray display order. Never mutated. */
  readonly pieces: readonly Piece[];

  /** The one source of truth for where every piece is. Keyed by Piece.id. */
  readonly placements: Readonly<Record<string, Placement>>;

  /** Derived from placements, recomputed on every change — never stored independently. */
  readonly grid: readonly (readonly Cell[])[];
}

export type GameInput =
  | { readonly type: 'place'; readonly pieceId: string; readonly anchorRow: number; readonly anchorCol: number }
  | { readonly type: 'unplace'; readonly pieceId: string };

export interface LevelConfig {
  readonly id: number;
  /** Bumped when the picture/pieces change — see docs/rules.md §9 (save compatibility). */
  readonly version: number;

  readonly rows: number;
  readonly cols: number;

  /** Colours actually used by this level — an authoring aid, not read by the engine. */
  readonly palette: readonly ColorId[];

  /** rows × cols. The same matrix backs the thumbnail preview and the win check. */
  readonly targetGrid: readonly (readonly Cell[])[];

  readonly pieces: readonly Piece[];

  /**
   * One proven way to assemble targetGrid with these pieces. An authoring and
   * test-time artefact — docs/rules.md §6: it never reaches gameplay, because
   * more than one placement can win (§2 "Условие ПОБЕДЫ").
   */
  readonly solutionPlacements: Readonly<Record<string, { readonly row: number; readonly col: number }>>;
}
