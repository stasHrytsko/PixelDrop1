export interface MechanicEngine<TState, TInput, TLevel> {
  create(level: TLevel): TState;
  apply(state: TState, input: TInput): TState;
  isComplete(state: TState): boolean;
}

export type GameState = 'playing' | 'phase_complete' | 'won';

export type ColorId = 'coral' | 'rose' | 'purple';

export interface Cell {
  readonly color: ColorId;
  readonly pieceId: string;
}

export interface PieceCell {
  /** [row, col] relative to the piece's top-left anchor. */
  readonly offset: readonly [number, number];
  readonly color: ColorId;
}

export interface Piece {
  readonly id: string;
  readonly label: string;
  readonly cells: readonly PieceCell[];
}

export interface Placement {
  readonly pieceId: string;
  readonly row: number;
  readonly col: number;
}

export const GRID_SIZE = 10;
export const PIECE_COUNT = 6;
export const PHASE_COUNT = 3;

export interface LevelPhaseConfig {
  readonly id: number;
  readonly pictureId: string;
  readonly title: string;
  readonly instruction: string;
  readonly sampleAlt: string;
  readonly target: readonly (readonly (ColorId | null)[])[];
  readonly initialPlacements: readonly Placement[];
}

export interface LevelState {
  readonly gameState: GameState;
  readonly grid: readonly (readonly (Cell | null)[])[];
  readonly pieces: readonly Piece[];
  readonly placements: readonly Placement[];
  readonly selectedPieceId: string | null;
  readonly target: readonly (readonly (ColorId | null)[])[];
  readonly phases: readonly LevelPhaseConfig[];
  readonly phaseIndex: number;
}

export type GameInput =
  | { readonly type: 'select_piece'; readonly pieceId: string }
  | { readonly type: 'place_piece'; readonly pieceId: string; readonly row: number; readonly col: number }
  | { readonly type: 'clear_selection' }
  | { readonly type: 'advance_phase' }
  | { readonly type: 'restart_phase' };

export interface LevelConfig {
  readonly id: number;
  readonly gridSize: 10;
  readonly pieces: readonly Piece[];
  readonly phases: readonly LevelPhaseConfig[];
}
