import { canCreateGridFromPlacements } from './board.ts';
import { pixelDropEngine } from './pixelDropEngine.ts';
import type { LevelConfig, LevelSnapshot, LevelState, Placement } from './types.ts';

export function createLevelSnapshot(level: LevelConfig, state: LevelState, revealPending = false): LevelSnapshot {
  return {
    version: 1,
    levelId: level.id,
    phaseIndex: state.phaseIndex,
    placements: state.placements.map((placement) => ({ ...placement })),
    revealPending,
  };
}

export function restoreLevelSnapshot(level: LevelConfig, raw: unknown): LevelState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const snapshot = raw as Partial<LevelSnapshot>;
  if (snapshot.version !== 1 || snapshot.levelId !== level.id || !Number.isInteger(snapshot.phaseIndex)) return null;
  const phaseIndex = snapshot.phaseIndex as number;
  const phase = level.phases[phaseIndex];
  if (phase === undefined || !Array.isArray(snapshot.placements)) return null;

  const placements: Placement[] = [];
  for (const rawPlacement of snapshot.placements) {
    if (typeof rawPlacement !== 'object' || rawPlacement === null) return null;
    const placement = rawPlacement as Partial<Placement>;
    if (
      typeof placement.pieceId !== 'string' ||
      !Number.isInteger(placement.row) ||
      !Number.isInteger(placement.col)
    ) return null;
    placements.push({ pieceId: placement.pieceId, row: placement.row as number, col: placement.col as number });
  }
  if (placements.length !== phase.pieces.length) return null;
  if (new Set(placements.map((placement) => placement.pieceId)).size !== phase.pieces.length) return null;
  if (!canCreateGridFromPlacements(phase.pieces, placements)) return null;

  // Rebuild through the engine's placement path is impossible atomically, so
  // use the same validated board constructor via a temporary phase definition.
  const temporaryLevel: LevelConfig = {
    ...level,
    phases: level.phases.map((entry, index) =>
      index === phaseIndex ? { ...entry, initialPlacements: placements } : entry,
    ),
  };
  let restored = pixelDropEngine.create(temporaryLevel);
  for (let index = 0; index < phaseIndex; index += 1) {
    restored = { ...restored, gameState: 'phase_complete' };
    restored = pixelDropEngine.apply(restored, { type: 'advance_phase' });
  }
  return restored.gameState === 'won' && snapshot.revealPending !== true ? null : restored;
}
