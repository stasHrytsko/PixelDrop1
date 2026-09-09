import {
  areTargetCellsInsideBoard,
  canCreateGridFromPlacements,
  computeTargetCells,
  createGridFromPlacements,
  findPiece,
  gridMatchesTarget,
  isValidPlacement,
} from './board.ts';
import type {
  GameInput,
  LevelConfig,
  LevelPhaseConfig,
  LevelState,
  MechanicEngine,
  Piece,
  Placement,
} from './types.ts';

function createState(
  pieces: readonly Piece[],
  placements: readonly Placement[],
  selectedPieceId: string | null,
  phases: readonly LevelPhaseConfig[],
  phaseIndex: number,
): LevelState {
  const phase = phases[phaseIndex];
  if (phase === undefined) throw new Error('Missing phase ' + String(phaseIndex + 1) + '.');
  const grid = createGridFromPlacements(pieces, placements);
  const pictureComplete = gridMatchesTarget(grid, phase.target);
  return {
    gameState: pictureComplete ? (phaseIndex === phases.length - 1 ? 'won' : 'phase_complete') : 'playing',
    grid,
    pieces,
    placements,
    selectedPieceId,
    target: phase.target,
    phases,
    phaseIndex,
  };
}

export const pixelDropEngine: MechanicEngine<LevelState, GameInput, LevelConfig> = {
  create(level: LevelConfig): LevelState {
    const firstPhase = level.phases[0];
    if (firstPhase === undefined) throw new Error('A level must contain at least one phase.');
    return createState(level.pieces, firstPhase.initialPlacements, null, level.phases, 0);
  },

  apply(state: LevelState, input: GameInput): LevelState {
    if (input.type === 'advance_phase') {
      if (state.gameState !== 'phase_complete') return state;
      const nextPhaseIndex = state.phaseIndex + 1;
      const nextPhase = state.phases[nextPhaseIndex];
      if (nextPhase === undefined) return state;
      return createState(state.pieces, nextPhase.initialPlacements, null, state.phases, nextPhaseIndex);
    }

    if (input.type === 'restart_phase') {
      const phase = state.phases[state.phaseIndex];
      if (phase === undefined || state.gameState === 'won') return state;
      return createState(state.pieces, phase.initialPlacements, null, state.phases, state.phaseIndex);
    }

    if (state.gameState !== 'playing') return state;

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
            state.phases,
            state.phaseIndex,
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

        return createState(state.pieces, swappedPlacements, null, state.phases, state.phaseIndex);
      }
    }
  },

  isComplete(state: LevelState): boolean {
    return state.gameState === 'won';
  },
};
