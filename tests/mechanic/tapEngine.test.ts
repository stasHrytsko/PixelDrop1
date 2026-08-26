import { describe, expect, it } from 'vitest';
import { tapEngine } from '../../src/mechanic/engine/tapEngine.ts';
import type { Level } from '../../src/mechanic/engine/types.ts';

const level: Level = {
  id: 1,
  targets: [
    { id: 'a', x: 0.2, y: 0.2 },
    { id: 'b', x: 0.8, y: 0.8 },
  ],
};

describe('tapEngine', () => {
  it('starts with every target remaining and no taps', () => {
    const state = tapEngine.create(level);
    expect(state.remaining).toEqual(['a', 'b']);
    expect(state.taps).toBe(0);
    expect(tapEngine.isComplete(state)).toBe(false);
  });

  it('clears a target when it is tapped', () => {
    const state = tapEngine.apply(tapEngine.create(level), { type: 'tap', targetId: 'a' });
    expect(state.remaining).toEqual(['b']);
    expect(state.taps).toBe(1);
  });

  it('counts a tap on an already cleared target without clearing anything else', () => {
    let state = tapEngine.create(level);
    state = tapEngine.apply(state, { type: 'tap', targetId: 'a' });
    state = tapEngine.apply(state, { type: 'tap', targetId: 'a' });
    expect(state.remaining).toEqual(['b']);
    expect(state.taps).toBe(2);
  });

  it('counts a tap on empty board without clearing anything', () => {
    // docs/rules.md rule 3. The renderer reports a miss as targetId: null —
    // this used to be expressible in the engine but unreachable from the scene,
    // which only ever fired on a circle.
    const state = tapEngine.apply(tapEngine.create(level), { type: 'tap', targetId: null });
    expect(state.remaining).toEqual(['a', 'b']);
    expect(state.taps).toBe(1);
    expect(tapEngine.isComplete(state)).toBe(false);
  });

  it('is complete only once every target is cleared', () => {
    let state = tapEngine.create(level);
    state = tapEngine.apply(state, { type: 'tap', targetId: 'a' });
    expect(tapEngine.isComplete(state)).toBe(false);
    state = tapEngine.apply(state, { type: 'tap', targetId: 'b' });
    expect(tapEngine.isComplete(state)).toBe(true);
  });

  it('never mutates the state it is given', () => {
    const state = tapEngine.create(level);
    const before = structuredClone(state);
    tapEngine.apply(state, { type: 'tap', targetId: 'a' });
    expect(state).toEqual(before);
  });

  it('runs without a DOM — this project is configured to run it in Node', () => {
    expect(typeof globalThis.document).toBe('undefined');
  });
});
