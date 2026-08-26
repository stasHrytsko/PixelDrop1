/**
 * The engine is the rules of the game and nothing else: no Phaser, no DOM, no
 * storage, no I/O. That is enforced by the linter (see eslint.config.js), not
 * by discipline — because discipline is what runs out at 2am.
 *
 * TState / TInput / TLevel are defined per game. Nothing here is `any` and
 * nothing here is `unknown`.
 */
export interface MechanicEngine<TState, TInput, TLevel> {
  create(level: TLevel): TState;
  apply(state: TState, input: TInput): TState;
  isComplete(state: TState): boolean;
}

// --- Types of the placeholder mechanic shipped with the template ------------
// Replace everything below when you build a real game.

/** A tappable target. Coordinates are normalised 0..1 so the renderer owns layout. */
export interface Target {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

export interface Level {
  /** 1-based level number, matching the position in levels.json. */
  readonly id: number;
  readonly targets: readonly Target[];
}

export interface TapInput {
  readonly type: 'tap';
  /** null when the tap landed on empty board — a miss still counts as a tap. */
  readonly targetId: string | null;
}

export interface LevelState {
  readonly remaining: readonly string[];
  readonly taps: number;
}
