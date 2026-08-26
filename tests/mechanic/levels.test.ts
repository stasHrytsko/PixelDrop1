import { describe, expect, it } from 'vitest';
import { GAME } from '../../src/game.config.ts';
import { getLevel, LEVELS, parseLevelPack } from '../../src/mechanic/levels/loadLevels.ts';

function pack(overrides: Record<string, unknown> = {}): unknown {
  return {
    schemaVersion: 1,
    levels: [{ id: 1, targets: [{ id: 't1', x: 0.5, y: 0.5 }] }],
    ...overrides,
  };
}

describe('shipped level pack', () => {
  it('has exactly GameDefinition.levelCount levels', () => {
    expect(LEVELS).toHaveLength(GAME.levelCount);
  });

  it('numbers levels 1..levelCount in order', () => {
    expect(LEVELS.map((level) => level.id)).toEqual(
      Array.from({ length: GAME.levelCount }, (_, index) => index + 1),
    );
  });

  it('keeps every target inside the normalised playfield', () => {
    for (const level of LEVELS) {
      for (const target of level.targets) {
        expect(target.x).toBeGreaterThanOrEqual(0);
        expect(target.x).toBeLessThanOrEqual(1);
        expect(target.y).toBeGreaterThanOrEqual(0);
        expect(target.y).toBeLessThanOrEqual(1);
      }
    }
  });

  it('exposes levels by index and refuses out-of-range ones', () => {
    expect(getLevel(0).id).toBe(1);
    expect(() => getLevel(GAME.levelCount)).toThrow(/No level at index/);
  });
});

describe('parseLevelPack', () => {
  it('accepts a well-formed pack', () => {
    expect(parseLevelPack(pack(), 1)).toHaveLength(1);
  });

  it('rejects a wrong schema version', () => {
    expect(() => parseLevelPack(pack({ schemaVersion: 2 }), 1)).toThrow(/schemaVersion/);
  });

  it('rejects a level count that disagrees with GameDefinition', () => {
    expect(() => parseLevelPack(pack(), 9)).toThrow(/levelCount/);
  });

  it('rejects mis-numbered levels', () => {
    const bad = pack({ levels: [{ id: 7, targets: [{ id: 't', x: 0, y: 0 }] }] });
    expect(() => parseLevelPack(bad, 1)).toThrow(/id must be 1/);
  });

  it('rejects duplicate target ids', () => {
    const bad = pack({
      levels: [
        {
          id: 1,
          targets: [
            { id: 'same', x: 0.1, y: 0.1 },
            { id: 'same', x: 0.9, y: 0.9 },
          ],
        },
      ],
    });
    expect(() => parseLevelPack(bad, 1)).toThrow(/not unique/);
  });

  it('rejects coordinates outside 0..1', () => {
    const bad = pack({ levels: [{ id: 1, targets: [{ id: 't', x: 1.5, y: 0.5 }] }] });
    expect(() => parseLevelPack(bad, 1)).toThrow(/must be a number in \[0, 1\]/);
  });

  it('rejects a level with no targets', () => {
    const bad = pack({ levels: [{ id: 1, targets: [] }] });
    expect(() => parseLevelPack(bad, 1)).toThrow(/non-empty array/);
  });
});
