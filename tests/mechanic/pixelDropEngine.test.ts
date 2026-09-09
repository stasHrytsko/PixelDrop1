import { describe, expect, it } from 'vitest';
import { validAnchorsForPiece } from '../../src/mechanic/engine/board.ts';
import { pixelDropEngine } from '../../src/mechanic/engine/pixelDropEngine.ts';
import type { LevelConfig, LevelState } from '../../src/mechanic/engine/types.ts';
import { getLevel } from '../../src/mechanic/levels/index.ts';

function pieceId(level: LevelConfig, suffix: string): string {
  const piece = level.pieces.find((item) => item.id.endsWith(suffix));
  if (piece === undefined) throw new Error('Missing piece ' + suffix + '.');
  return piece.id;
}

function place(state: LevelState, piece: string, row: number, col: number): LevelState {
  return pixelDropEngine.apply(state, { type: 'place_piece', pieceId: piece, row, col });
}

function solve(level: LevelConfig): LevelState {
  return solveFromState(level, pixelDropEngine.create(level));
}

function solveFromState(level: LevelConfig, initialState: LevelState): LevelState {
  let state = initialState;
  state = place(state, pieceId(level, 'o-coral'), 2, 4);
  state = place(state, pieceId(level, 'i-mixed'), 7, 3);
  state = place(state, pieceId(level, 't-coral-a'), 3, 2);
  state = place(state, pieceId(level, 't-coral-b'), 3, 5);
  state = place(state, pieceId(level, 'j-mixed'), 5, 3);
  return place(state, pieceId(level, 'j-rose'), 5, 4);
}

function solveAtTopLeft(level: LevelConfig): LevelState {
  let state = pixelDropEngine.create(level);
  state = place(state, pieceId(level, 'i-mixed'), 5, 1);
  state = place(state, pieceId(level, 'j-mixed'), 3, 1);
  state = place(state, pieceId(level, 'o-coral'), 0, 2);
  state = place(state, pieceId(level, 't-coral-a'), 1, 0);
  state = place(state, pieceId(level, 't-coral-b'), 1, 3);
  return place(state, pieceId(level, 'j-rose'), 3, 2);
}

describe('pixelDropEngine — picture mode', () => {
  const level = getLevel(0);

  it('starts with all six pieces spread across the 10×10 board', () => {
    const state = pixelDropEngine.create(level);
    expect(state.grid).toHaveLength(10);
    expect(state.grid.every((row) => row.length === 10)).toBe(true);
    expect(state.grid.flat().filter((cell) => cell !== null)).toHaveLength(24);
    expect(state.pieces).toHaveLength(6);
    expect(state.placements).toHaveLength(6);
    expect(state.gameState).toBe('playing');
  });

  it('selects a known piece and clears the selection', () => {
    const state = pixelDropEngine.create(level);
    const id = pieceId(level, 'j-mixed');
    const selected = pixelDropEngine.apply(state, { type: 'select_piece', pieceId: id });
    expect(selected.selectedPieceId).toBe(id);
    expect(pixelDropEngine.apply(selected, { type: 'clear_selection' }).selectedPieceId).toBeNull();
  });

  it('rejects placements outside the board', () => {
    const state = pixelDropEngine.create(level);
    const horizontal = pieceId(level, 'i-mixed');
    expect(place(state, horizontal, 0, 8)).toBe(state);
  });

  it('moves an already placed piece atomically and leaves no old cells behind', () => {
    const id = pieceId(level, 'j-mixed');
    let state = pixelDropEngine.create(level);
    state = place(state, id, 2, 0);
    expect(state.placements.find((placement) => placement.pieceId === id)).toEqual({ pieceId: id, row: 2, col: 0 });
    expect(state.grid[0]?.[0]).toBeNull();
    expect(state.grid[2]?.[0]?.pieceId).toBe(id);
    expect(state.grid.flat().filter((cell) => cell?.pieceId === id)).toHaveLength(4);
  });

  it('swaps two figures when one is dropped onto the other', () => {
    const movingId = pieceId(level, 'j-mixed');
    const displacedId = pieceId(level, 'o-coral');
    const state = place(pixelDropEngine.create(level), movingId, 0, 6);

    expect(state.placements.find((placement) => placement.pieceId === movingId)).toEqual({
      pieceId: movingId,
      row: 0,
      col: 6,
    });
    expect(state.placements.find((placement) => placement.pieceId === displacedId)).toEqual({
      pieceId: displacedId,
      row: 0,
      col: 0,
    });
    expect(state.grid.flat().filter((cell) => cell !== null)).toHaveLength(24);
  });

  it('reports every currently valid anchor for a piece', () => {
    const state = pixelDropEngine.create(level);
    const anchors = validAnchorsForPiece(state, pieceId(level, 'i-mixed'));
    expect(anchors.length).toBeGreaterThan(20);
    expect(anchors).toContainEqual({ row: 7, col: 3 });
    expect(anchors).not.toContainEqual({ row: 0, col: 8 });
  });

  it('completes the first picture when the 10×10 board exactly matches the sample', () => {
    const state = solve(level);
    expect(state.gameState).toBe('phase_complete');
    expect(pixelDropEngine.isComplete(state)).toBe(false);
    expect(state.grid.map((row) => row.map((cell) => cell?.color ?? null))).toEqual(level.phases[0]?.target);
  });

  it('completes a picture assembled elsewhere on the board', () => {
    const state = solveAtTopLeft(level);

    expect(state.gameState).toBe('phase_complete');
    expect(pixelDropEngine.isComplete(state)).toBe(false);
    expect(state.grid.map((row) => row.map((cell) => cell?.color ?? null))).not.toEqual(level.phases[0]?.target);
  });

  it('advances through three pictures and wins only after the third', () => {
    const firstPicture = level.phases[0];
    if (firstPicture === undefined) throw new Error('Missing test phase.');
    const repeatedLevel: LevelConfig = {
      ...level,
      phases: [
        firstPicture,
        { ...firstPicture, id: 2 },
        { ...firstPicture, id: 3 },
      ],
    };

    let state = solve(repeatedLevel);
    expect(state.gameState).toBe('phase_complete');
    expect(pixelDropEngine.isComplete(state)).toBe(false);

    state = pixelDropEngine.apply(state, { type: 'advance_phase' });
    expect(state.phaseIndex).toBe(1);
    expect(state.gameState).toBe('playing');
    state = solveFromState(repeatedLevel, state);
    expect(state.gameState).toBe('phase_complete');

    state = pixelDropEngine.apply(state, { type: 'advance_phase' });
    expect(state.phaseIndex).toBe(2);
    state = solveFromState(repeatedLevel, state);
    expect(state.gameState).toBe('won');
    expect(pixelDropEngine.isComplete(state)).toBe(true);
    expect(pixelDropEngine.apply(state, { type: 'advance_phase' })).toBe(state);
  });
});
