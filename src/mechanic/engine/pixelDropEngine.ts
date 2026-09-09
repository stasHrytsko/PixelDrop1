import {
  computeTargetCells,
  createGridFromPlacements,
  findPiece,
  gridMatchesTarget,
  isValidPlacement,
} from './board.ts';
import type { GameInput, LevelConfig, LevelState, MechanicEngine, Piece, Placement } from './types.ts';

function createState(
  pieces: readonly Piece[],
  placements: readonly Placement[],
  selectedPieceId: string | null,
  target: LevelConfig['target'],
): LevelState {
  const grid = createGridFromPlacements(pieces, placements);
  return {
    gameState: gridMatchesTarget(grid, target) ? 'won' : 'playing',
    grid,
    pieces,
    placements,
    selectedPieceId,
    target,
  };
}

export const pixelDropEngine: MechanicEngine<LevelState, GameInput, LevelConfig> = {
  create(level: LevelConfig): LevelState {
    return createState(level.pieces, [], null, level.target);
  },

  apply(state: LevelState, input: GameInput): LevelState {
    if (state.gameState === 'won') return state;

    switch (input.type) {
      case 'select_piece': {
        if (findPiece(state.pieces, input.pieceId) === null) return state;
        return { ...state, selectedPieceId: input.pieceId };
      }
      case 'clear_selection': {
        if (state.selectedPieceId === null) return state;
        return { ...state, selectedPieceId: null };
      }
      case 'place_piece': {
        const piece = findPiece(state.pieces, input.pieceId);
        if (piece === null) return state;

        const otherPlacements = state.placements.filter((placement) => placement.pieceId !== input.pieceId);
        const gridWithoutPiece = createGridFromPlacements(state.pieces, otherPlacements);
        const targetCells = computeTargetCells(input.row, input.col, piece);
        if (!isValidPlacement(gridWithoutPiece, targetCells)) return state;

        return createState(
          state.pieces,
          [...otherPlacements, { pieceId: input.pieceId, row: input.row, col: input.col }],
          null,
          state.target,
        );
      }
    }
  },

  isComplete(state: LevelState): boolean {
    return state.gameState === 'won';
  },
};
