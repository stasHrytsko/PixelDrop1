import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface E2ETarget {
  id: string;
  x: number;
  y: number;
}

export interface E2ELevel {
  id: number;
  targets: E2ETarget[];
}

interface LevelPack {
  schemaVersion: number;
  levels: E2ELevel[];
}

const packPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../src/mechanic/levels/levels.json',
);

/**
 * The E2E suite taps real pixels on a real canvas, so it needs to know where
 * the targets are. Reading the same JSON the game ships keeps the test honest:
 * change the levels and the test follows automatically.
 */
export const LEVELS: E2ELevel[] = (JSON.parse(readFileSync(packPath, 'utf8')) as LevelPack).levels;
