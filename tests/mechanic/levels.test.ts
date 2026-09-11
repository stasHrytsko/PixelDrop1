import { describe, expect, it } from 'vitest';
import { getAllLevels, getLevel, parseLevelPack } from '../../src/mechanic/levels/index.ts';

function removePrefix(id: string): string { return id.replace(/^l\d+p\d+-/, ''); }

function validPack(): unknown {
  const source = getLevel(0);
  const pieceSets = Object.fromEntries(source.phases.map((phase) => [
    'set-' + String(phase.id),
    phase.pieces.map((piece) => ({ ...piece, id: removePrefix(piece.id) })),
  ]));
  const pictures = Object.fromEntries(source.phases.map((phase) => [
    'picture-' + String(phase.id),
    { title: phase.title, instruction: phase.instruction, sampleAlt: phase.sampleAlt, target: phase.target },
  ]));
  return {
    schemaVersion: 6,
    pieceSets,
    pictures,
    objects: { dog: source.object },
    levels: [{
      id: 1, gridSize: 10, object: 'dog',
      phases: source.phases.map((phase) => ({
        id: phase.id, view: phase.view, picture: 'picture-' + String(phase.id), pieceSet: 'set-' + String(phase.id),
        initialPlacements: phase.initialPlacements.map((placement) => ({ ...placement, pieceId: removePrefix(placement.pieceId) })),
      })),
    }],
  };
}

describe('level pack v6', () => {
  it('ships nine levels and a complete dog prototype in level one', () => {
    const levels = getAllLevels();
    expect(levels).toHaveLength(9);
    expect(levels[0]?.object?.size).toEqual([6, 10, 9]);
    expect(levels[0]?.object?.voxels.length).toBeGreaterThan(100);
    expect(levels[0]?.phases.map((phase) => phase.view)).toEqual(['front', 'side', 'bottom']);
    expect(levels[0]?.phases.map((phase) => phase.pieces.length)).toEqual([12, 13, 13]);
    for (const level of levels) for (const phase of level.phases) {
      expect(phase.target).toHaveLength(10);
      expect(phase.initialPlacements).toHaveLength(phase.pieces.length);
      expect(phase.pieces.every((piece) => piece.cells.length === 4)).toBe(true);
    }
  });

  it('returns deep copies of phase sets and voxel data', () => {
    const first = getLevel(0);
    const second = getLevel(0);
    expect(first).toEqual(second);
    expect(first.phases[0]?.pieces).not.toBe(second.phases[0]?.pieces);
    expect(first.object?.voxels).not.toBe(second.object?.voxels);
  });

  it('accepts a valid pack and rejects old schemas', () => {
    expect(parseLevelPack(validPack(), 1)).toHaveLength(1);
    const invalid = validPack() as Record<string, unknown>;
    invalid['schemaVersion'] = 5;
    expect(() => parseLevelPack(invalid, 1)).toThrow(/schemaVersion must be 6/);
  });

  it('rejects a phase that reuses an unknown piece set', () => {
    const invalid = validPack() as { levels: Array<{ phases: Array<Record<string, unknown>> }> };
    invalid.levels[0]!.phases[0]!['pieceSet'] = 'missing';
    expect(() => parseLevelPack(invalid, 1)).toThrow(/unknown set/);
  });
});
