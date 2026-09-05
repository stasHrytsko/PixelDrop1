import { describe, expect, it } from 'vitest';
import { MemorySaveRepository } from '../../src/mechanic/save/MemorySaveRepository.ts';
import { parseSave, SAVE_SCHEMA_VERSION, serializeSave } from '../../src/mechanic/save/SaveRepository.ts';

describe('parseSave', () => {
  it('accepts a blob it wrote itself', () => {
    const placements = { a: { row: 1, col: 2 } };
    const blob: unknown = JSON.parse(JSON.stringify(serializeSave(1, 3, placements)));
    expect(parseSave(blob, 1, 3)).toEqual(placements);
  });

  it('rejects a save for a different level id', () => {
    const blob = serializeSave(1, 1, {});
    expect(parseSave(blob, 2, 1)).toBeNull();
  });

  it('rejects a save for a different level version — the picture may have changed (docs/rules.md §9)', () => {
    const blob = serializeSave(1, 1, {});
    expect(parseSave(blob, 1, 2)).toBeNull();
  });

  it.each([
    ['not an object', 42],
    ['null', null],
    ['wrong schema version', { ...serializeSave(1, 1, {}), schemaVersion: 99 }],
    ['non-anchor placement', { schemaVersion: SAVE_SCHEMA_VERSION, levelId: 1, levelVersion: 1, placements: { a: 'nope' } }],
  ])('rejects %s', (_label, raw) => {
    expect(parseSave(raw, 1, 1)).toBeNull();
  });
});

describe('MemorySaveRepository', () => {
  it('round-trips a save and clears it', async () => {
    const repo = new MemorySaveRepository();
    expect(await repo.load(1, 1)).toBeNull();

    const placements = { a: { row: 0, col: 0 } };
    await repo.save(1, 1, placements);
    expect(await repo.load(1, 1)).toEqual(placements);

    await repo.clear(1);
    expect(await repo.load(1, 1)).toBeNull();
  });

  it('discards a save whose level version no longer matches', async () => {
    const repo = new MemorySaveRepository();
    await repo.save(1, 1, { a: { row: 0, col: 0 } });
    expect(await repo.load(1, 2)).toBeNull();
  });

  it('keeps saves for different levels independent', async () => {
    const repo = new MemorySaveRepository();
    await repo.save(1, 1, { a: { row: 0, col: 0 } });
    await repo.save(2, 1, { b: { row: 1, col: 1 } });

    expect(await repo.load(1, 1)).toEqual({ a: { row: 0, col: 0 } });
    expect(await repo.load(2, 1)).toEqual({ b: { row: 1, col: 1 } });
  });
});
