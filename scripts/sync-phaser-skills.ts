import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * Makes Phaser's own agent skills discoverable in this repository.
 *
 * phaser@4 ships 28 first-party SKILL.md files in node_modules/phaser/skills.
 * They are versioned with the exact Phaser installed, which is the whole point:
 * most Phaser material in the world is v3, and v3 answers are frequently wrong
 * on v4. Copying them into .claude/skills/ turns them from a folder nobody
 * opens into skills an agent picks up automatically.
 *
 * Copies rather than symlinks: symlinks need elevation on Windows.
 * Runs on postinstall, so the skills always match the installed Phaser.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(repoRoot, 'node_modules', 'phaser', 'skills');
const destination = join(repoRoot, '.claude', 'skills');
const PREFIX = 'phaser-';

if (!existsSync(source)) {
  console.log('phaser skills not found — skipping (is phaser installed?).');
  process.exit(0);
}

mkdirSync(destination, { recursive: true });

// Drop previously synced skills so a Phaser upgrade cannot leave stale ones.
for (const entry of readdirSync(destination, { withFileTypes: true })) {
  if (entry.isDirectory() && entry.name.startsWith(PREFIX)) {
    rmSync(join(destination, entry.name), { recursive: true, force: true });
  }
}

let copied = 0;
for (const entry of readdirSync(source, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  if (!existsSync(join(source, entry.name, 'SKILL.md'))) continue;

  cpSync(join(source, entry.name), join(destination, PREFIX + entry.name), {
    recursive: true,
  });
  copied += 1;
}

writeFileSync(
  join(destination, 'README.md'),
  [
    '# Synced skills',
    '',
    'Everything in `phaser-*/` is copied from `node_modules/phaser/skills/` by',
    '`scripts/sync-phaser-skills.ts` on every install. Do not edit it here —',
    'the next `npm install` overwrites it.',
    '',
    'These directories are git-ignored: they belong to the installed Phaser',
    'version, not to this repository.',
    '',
  ].join('\n'),
);

console.log(`Synced ${String(copied)} Phaser skills into .claude/skills/`);
