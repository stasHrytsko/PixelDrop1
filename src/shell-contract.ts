/**
 * The single boundary between the reusable shell and the per-game mechanic.
 *
 * The shell knows nothing about rules, rendering or input. It knows one thing:
 * the lifecycle of a level. Whether the player taps a tile, swipes, or drags a
 * line is entirely the mechanic's business and never crosses this file.
 *
 * Do not widen this interface without a deliberate decision recorded in
 * docs/decisions.md — every addition here is a new thing every future game
 * must care about.
 */

/** A mounted, running level. Calling destroy() must release every resource. */
export interface LevelSession {
  /** Tear down the level. Must be safe to call twice. */
  destroy(): void;
}

export interface CreateLevelParams {
  /** The element the mechanic owns for the lifetime of the session. */
  container: HTMLElement;
  /** 0-based. Always < GameDefinition.levelCount. */
  levelIndex: number;
  /** The level was solved. Called at most once per session. */
  onComplete: () => void;
  /** The player asked to leave from inside the game surface. */
  onExit: () => void;
}

export interface MechanicHost {
  /** Mount a level into the given container and hand back its session. */
  createLevel(params: CreateLevelParams): LevelSession;
}
