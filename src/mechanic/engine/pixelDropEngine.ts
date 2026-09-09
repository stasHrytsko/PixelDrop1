import {
  areTargetCellsInsideBoard,
  canCreateGridFromPlacements,
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
    return createState(level.pieces, level.initialPlacements, null, level.target);
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

        const currentPlacement = state.placements.find((placement) => placement.pieceId === input.pieceId);
        if (currentPlacement === undefined) return state;
        const otherPlacements = state.placements.filter((placement) => placement.pieceId !== input.pieceId);
        const gridWithoutPiece = createGridFromPlacements(state.pieces, otherPlacements);
        const targetCells = computeTargetCells(input.row, input.col, piece);
        if (!areTargetCellsInsideBoard(targetCells)) return state;

        const overlappingPieceIds = new Set(
          targetCells
            .map(({ row, col }) => gridWithoutPiece[row]?.[col]?.pieceId)
            .filter((pieceId): pieceId is string => pieceId !== undefined),
        );

        if (overlappingPieceIds.size === 0) {
          if (!isValidPlacement(gridWithoutPiece, targetCells)) return state;
          return createState(
            state.pieces,
            [...otherPlacements, { pieceId: input.pieceId, row: input.row, col: input.col }],
            null,
            state.target,
          );
        }

        if (overlappingPieceIds.size !== 1) return state;
        const displacedPieceId = [...overlappingPieceIds][0];
        const displacedPlacement = state.placements.find((placement) => placement.pieceId === displacedPieceId);
        if (displacedPieceId === undefined || displacedPlacement === undefined) return state;

        const stationaryPlacements = otherPlacements.filter(
          (placement) => placement.pieceId !== displacedPieceId,
        );
        const swappedPlacements: readonly Placement[] = [
          ...stationaryPlacements,
          {
            pieceId: input.pieceId,
            row: displacedPlacement.row,
            col: displacedPlacement.col,
          },
          {
            pieceId: displacedPieceId,
            row: currentPlacement.row,
            col: currentPlacement.col,
          },
        ];
        if (!canCreateGridFromPlacements(state.pieces, swappedPlacements)) return state;

        return createState(state.pieces, swappedPlacements, null, state.target);
      }
    }
  },

  isComplete(state: LevelState): boolean {
    return state.gameState === 'won';
  },
};
