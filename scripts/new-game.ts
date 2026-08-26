import { randomInt } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { escapeFor, TEMPLATE_FILES } from './placeholders.ts';

/**
 * Turns the template into a specific game.
 *
 * Every Android app needs its own appId, label and package name, and a signal
 * topic that nobody else shares. Forgetting one of those is discovered at
 * upload time to Google Play, which is the worst possible moment — so this is
 * a script rather than a checklist.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const APP_ID_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/;
const TOPIC_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const TOPIC_LENGTH = 32;

interface Args {
  name: string;
  appId: string;
  slug: string | null;
  dryRun: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const values = new Map<string, string>();
  let dryRun = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === undefined || !arg.startsWith('--')) continue;

    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      fail(`Option ${arg} needs a value.`);
    }
    values.set(arg.slice(2), next);
    i += 1;
  }

  const name = values.get('name');
  const appId = values.get('id');

  if (name === undefined || appId === undefined) {
    fail(
      'Usage: npm run new-game -- --name "Screw Mahjong" --id "com.example.screwmahjong" [--slug screw-mahjong] [--dry-run]',
    );
  }

  return { name, appId, slug: values.get('slug') ?? null, dryRun };
}

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug.length === 0) {
    fail(`Cannot derive a slug from ${JSON.stringify(name)}. Pass --slug explicitly.`);
  }
  return slug;
}

/**
 * The ntfy topic doubles as the password for the channel, so it is generated
 * rather than typed. 32 chars from a 62-symbol alphabet is far past guessable.
 *
 * randomInt rather than `randomBytes()[i] % 62`: 256 is not a multiple of 62,
 * so the modulo would make 8 of the 62 characters slightly likelier. The bias
 * costs well under a bit here and would never be the weak link — but a
 * uniform primitive already exists, so there is nothing to trade off.
 */
function generateTopic(): string {
  let topic = '';
  for (let i = 0; i < TOPIC_LENGTH; i += 1) {
    topic += TOPIC_ALPHABET[randomInt(TOPIC_ALPHABET.length)];
  }
  return topic;
}

/**
 * A newline or a control character in an app label is never intentional, and it
 * would corrupt the line-oriented files this script rewrites. Checked by code
 * point rather than by regex — a literal control range inside a pattern is
 * exactly what `no-control-regex` exists to catch, and it reads worse.
 */
function hasControlCharacter(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

const args = parseArgs(process.argv.slice(2));

if (!APP_ID_PATTERN.test(args.appId)) {
  fail(
    `Invalid --id ${JSON.stringify(args.appId)}. An Android appId looks like "com.yourname.yourgame": ` +
      'lowercase, at least one dot, letters/digits/underscore only.',
  );
}
const name = args.name.trim();
if (name.length === 0) {
  fail('--name cannot be empty.');
}
if (hasControlCharacter(name)) {
  fail('--name cannot contain newlines or control characters.');
}

const slug = args.slug === null ? slugify(name) : args.slug;
if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
  fail(`Invalid slug ${JSON.stringify(slug)}. Use lowercase letters, digits and dashes.`);
}

const topic = generateTopic();

/** Applied in order; no token is a prefix of another, so order is not load-bearing. */
const replacements: readonly (readonly [string, string])[] = [
  ['com.example.gametemplate', args.appId],
  ['REPLACE_ME_WITH_A_RANDOM_TOPIC', topic],
  ['Game Template', name],
  ['game-template', slug],
];

const changed: string[] = [];

for (const relative of TEMPLATE_FILES) {
  const absolute = join(repoRoot, relative);
  if (!existsSync(absolute)) continue;

  const before = readFileSync(absolute, 'utf8');
  let after = before;
  for (const [token, value] of replacements) {
    const escaped = escapeFor(relative, value);
    // A function replacement, so that a `$` in the name stays a literal `$`
    // instead of being read as a replacement pattern like `$&` or `$'`.
    after = after.replaceAll(token, () => escaped);
  }

  if (after === before) continue;
  changed.push(relative);
  if (!args.dryRun) writeFileSync(absolute, after);
}

console.log(args.dryRun ? 'Dry run — nothing written.\n' : 'Updated:\n');
for (const file of changed) console.log(`  ${file}`);

console.log(`
  name     ${name}
  appId    ${args.appId}
  slug     ${slug}
  topic    ${topic}

Keep the topic somewhere you can subscribe to it — it is not stored anywhere else.
Subscribe with the ntfy app, or: curl -s https://ntfy.sh/${topic}/json
`);

if (args.dryRun) process.exit(0);

if (existsSync(join(repoRoot, 'android'))) {
  console.log(
    'WARNING: android/ already exists and still carries the old package name.\n' +
      'It cannot be renamed in place - the package is part of a directory path.\n' +
      'Delete it and regenerate:  rm -rf android && npm run build && npx cap add android\n',
  );
}

console.log(`Next:
  1. npm run build && npx cap add android      (generates android/ with the new appId)
  2. Put the game concept in docs/rules.md.
  3. Fill in tagline and onboarding rules in src/game.config.ts.
  4. Implement src/mechanic/** — engine, levels, render. Leave src/shell/** alone.
  5. npm run check && npm run verify-template
`);
