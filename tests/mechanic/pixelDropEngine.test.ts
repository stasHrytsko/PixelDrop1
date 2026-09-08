import { describe, expect, it } from 'vitest';
import { pixelDropEngine, validAnchorsForPiece } from '../../src/mechanic/engine/pixelDropEngine.ts';
import type { LevelConfig, LevelState } from '../../src/mechanic/engine/types.ts';
import { getLevel } from '../../src/mechanic/levels/loadLevels.ts';

function pieceId(level: LevelConfig, suffix: string): string {
  const piece = level.pieces.find((item) => item.id.endsWith(suffix));
  if (piece === undefined) throw new Error('Missing piece ' + suffix + '.');
  return piece.id;
}

function place(state: LevelState, piece: string, row: number, col: number): LevelState {
  return pixelDropEngine.apply(state, { type: 'place_piece', pieceId: piece, row, col });
}

function solve(level: LevelConfig): LevelState {
  let state = pixelDropEngine.create(level);
  state = place(state, pieceId(level, 'o-coral'), 0, 2);
  state = place(state, pieceId(level, 't-coral-a'), 1, 0);
  state = place(state, pieceId(level, 't-coral-b'), 1, 3);
  state = place(state, pieceId(level, 'j-mixed'), 3, 1);
  state = place(state, pieceId(level, 'i-mixed'), 5, 1);
  return place(state, pieceId(level, 'j-rose'), 3, 2);
}

describe('pixelDropEngine — picture mode', () => {
  const level = getLevel(0);

  it('starts with an empty 6×6 board and all six pieces available', () => {
    const state = pixelDropEngine.create(level);
    expect(state.grid).toHaveLength(6);
    expect(state.grid.every((row) => row.length === 6)).toBe(true);
    expect(state.grid.flat().every((cell) => cell === null)).toBe(true);
    expect(state.pieces).toHaveLength(6);
    expect(state.placements).toEqual([]);
    expect(state.gameState).toBe('playing');
  });

  it('selects a known piece and clears the selection', () => {
    const state = pixelDropEngine.create(level);
    const id = pieceId(level, 'j-mixed');
    const selected = pixelDropEngine.apply(state, { type: 'select_piece', pieceId: id });
    expect(selected.selectedPieceId).toBe(id);
    expect(pixelDropEngine.apply(selected, { type: 'clear_selection' }).selectedPieceId).toBeNull();
  });

  it('rejects placements outside the board or on another piece', () => {
    let state = pixelDropEngine.create(level);
    const horizontal = pieceId(level, 'i-mixed');
    expect(place(state, horizontal, 0, 4)).toBe(state);

    state = place(state, pieceId(level, 'o-coral'), 0, 2);
    expect(place(state, horizontal, 0, 1)).toBe(state);
  });

  it('moves an already placed piece atomically and leaves no old cells behind', () => {
    const id = pieceId(level, 'j-mixed');
    let state = pixelDropEngine.create(level);
    state = place(state, id, 0, 0);
    state = place(state, id, 3, 1);
    expect(state.placements).toEqual([{ pieceId: id, row: 3, col: 1 }]);
    expect(state.grid[0]?.[0]).toBeNull();
    expect(state.grid[3]?.[1]?.pieceId).toBe(id);
  });

  it('reports every currently valid anchor for a piece', () => {
    const state = pixelDropEngine.create(level);
    const anchors = validAnchorsForPiece(state, pieceId(level, 'i-mixed'));
    expect(anchors).toHaveLength(18);
    expect(anchors).toContainEqual({ row: 5, col: 1 });
  });

  it('wins only when the 6×6 board exactly matches the sample', () => {
    const state = solve(level);
    expect(state.gameState).toBe('won');
    expect(pixelDropEngine.isComplete(state)).toBe(true);
    expect(state.grid.map((row) => row.map((cell) => cell?.color ?? null))).toEqual(level.target);
  });
});
