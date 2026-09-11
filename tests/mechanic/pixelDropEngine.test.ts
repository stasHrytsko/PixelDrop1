import { describe, expect, it } from 'vitest';
import { validAnchorsForPiece } from '../../src/mechanic/engine/board.ts';
import { pixelDropEngine } from '../../src/mechanic/engine/pixelDropEngine.ts';
import type { LevelState, Piece } from '../../src/mechanic/engine/types.ts';
import { getLevel } from '../../src/mechanic/levels/index.ts';

function patternAt(state: LevelState, piece: Piece, row: number, col: number): boolean {
  return piece.cells.every((cell) => state.target[row + cell.offset[0]]?.[col + cell.offset[1]] === cell.color);
}

function solution(state: LevelState): Map<string, { row: number; col: number }> {
  const result = new Map<string, { row: number; col: number }>();
  const used = new Set<string>();
  for (const piece of state.pieces) {
    for (let row = 0; row < 10 && !result.has(piece.id); row += 2) for (let col = 0; col < 10; col += 2) {
      const key = String(row) + ',' + String(col);
      if (!used.has(key) && patternAt(state, piece, row, col)) {
        result.set(piece.id, { row, col }); used.add(key); break;
      }
    }
  }
  return result;
}

function solve(state: LevelState): LevelState {
  const desired = solution(state);
  let next = state;
  for (const piece of state.pieces) {
    const target = desired.get(piece.id);
    if (target === undefined) throw new Error('Missing solution for ' + piece.id);
    const current = next.placements.find((placement) => placement.pieceId === piece.id);
    if (current?.row === target.row && current.col === target.col) continue;
    next = pixelDropEngine.apply(next, { type: 'place_piece', pieceId: piece.id, ...target });
  }
  return next;
}

describe('pixelDropEngine — voxel projection mode', () => {
  const level = getLevel(0);

  it('starts the dog level with a phase-specific set on a 10×10 board', () => {
    const state = pixelDropEngine.create(level);
    expect(state.grid).toHaveLength(10);
    expect(state.pieces).toHaveLength(12);
    expect(state.placements).toHaveLength(12);
    expect(state.grid.flat().filter(Boolean)).toHaveLength(48);
    expect(state.gameState).toBe('playing');
  });

  it('moves a whole tetromino atomically and rejects out-of-board placement', () => {
    const state = pixelDropEngine.create(level);
    const piece = state.pieces[0]!;
    expect(pixelDropEngine.apply(state, { type: 'place_piece', pieceId: piece.id, row: 9, col: 9 })).toBe(state);
    const moved = pixelDropEngine.apply(state, { type: 'place_piece', pieceId: piece.id, row: 6, col: 0 });
    expect(moved.grid.flat().filter((cell) => cell?.pieceId === piece.id)).toHaveLength(4);
  });

  it('swaps two aligned figures without changing occupied-cell count', () => {
    const state = pixelDropEngine.create(level);
    const first = state.placements[0]!;
    const second = state.placements[1]!;
    const swapped = pixelDropEngine.apply(state, { type: 'place_piece', pieceId: first.pieceId, row: second.row, col: second.col });
    expect(swapped.placements.find((placement) => placement.pieceId === first.pieceId)).toMatchObject({ row: second.row, col: second.col });
    expect(swapped.grid.flat().filter(Boolean)).toHaveLength(48);
  });

  it('reports valid free or swappable anchors', () => {
    const state = pixelDropEngine.create(level);
    expect(validAnchorsForPiece(state, state.pieces[0]!.id).length).toBeGreaterThan(10);
  });

  it('uses 12, 13 and 13 different pieces and wins only after all projections', () => {
    let state = solve(pixelDropEngine.create(level));
    expect(state.gameState).toBe('phase_complete');
    state = pixelDropEngine.apply(state, { type: 'advance_phase' });
    expect(state.pieces).toHaveLength(13);
    state = solve(state);
    expect(state.gameState).toBe('phase_complete');
    state = pixelDropEngine.apply(state, { type: 'advance_phase' });
    expect(state.pieces).toHaveLength(13);
    state = solve(state);
    expect(state.gameState).toBe('won');
    expect(pixelDropEngine.isComplete(state)).toBe(true);
  });
});
