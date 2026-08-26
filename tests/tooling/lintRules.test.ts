import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ESLint } from 'eslint';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * The Shell/Mechanic boundary is only real if the linter actually rejects a
 * violation. It once did not: `no-restricted-globals` sees a bare identifier
 * and nothing else, so `window.localStorage` in the shell passed cleanly while
 * both CLAUDE.md and eslint.config.js advertised the rule as enforced.
 *
 * These tests lint throwaway files placed in the directories the rules govern
 * and assert on the rule id that fires. A boundary that stops being enforced
 * fails here instead of being discovered by a wiped save file on a phone.
 */

const repoRoot = join(import.meta.dirname, '..', '..');
const eslint = new ESLint({ cwd: repoRoot });
const written: string[] = [];

afterAll(() => {
  for (const file of written) rmSync(file, { force: true });
});

/** Lints `source` as if it lived at `relativePath`, and returns the rule ids that fired. */
async function rulesFiredFor(relativePath: string, source: string): Promise<string[]> {
  const absolute = join(repoRoot, relativePath);
  writeFileSync(absolute, source);
  written.push(absolute);

  const [result] = await eslint.lintFiles([absolute]);
  if (result === undefined) throw new Error(`ESLint returned nothing for ${relativePath}`);

  const fatal = result.messages.filter((message) => message.fatal === true);
  if (fatal.length > 0) throw new Error(`Parse error in fixture: ${fatal[0]?.message ?? ''}`);

  return result.messages.map((message) => message.ruleId ?? '(fatal)');
}

describe('the shell may not touch storage directly', () => {
  it.each([
    ['bare', 'localStorage.setItem("k", "v");'],
    ['via window', 'window.localStorage.setItem("k", "v");'],
    ['via globalThis', 'globalThis.localStorage.setItem("k", "v");'],
    ['via self', 'self.localStorage.setItem("k", "v");'],
    ['bracketed', 'window["localStorage"].setItem("k", "v");'],
  ])('rejects localStorage reached %s', async (_label, statement) => {
    const fired = await rulesFiredFor(
      'src/shell/__boundary_fixture.ts',
      `export function probe(): void { ${statement} }\n`,
    );
    expect(fired.some((rule) => rule.startsWith('no-restricted-'))).toBe(true);
  });
});

describe('shell screens may not reach the network', () => {
  it.each([
    ['bare', 'void fetch("https://example.com");'],
    ['via window', 'void window.fetch("https://example.com");'],
    ['via globalThis', 'void globalThis.fetch("https://example.com");'],
  ])('rejects fetch called %s', async (_label, statement) => {
    const fired = await rulesFiredFor(
      'src/shell/screens/__boundary_fixture.ts',
      `export function probe(): void { ${statement} }\n`,
    );
    expect(fired.some((rule) => rule.startsWith('no-restricted-'))).toBe(true);
  });
});

describe('the engine stays pure', () => {
  it.each([
    ['document, bare', 'return document.body.childElementCount;'],
    ['document, via globalThis', 'return globalThis.document.body.childElementCount;'],
    ['fetch, bare', 'void fetch("https://example.com"); return 0;'],
    ['fetch, via globalThis', 'void globalThis.fetch("https://example.com"); return 0;'],
    ['localStorage, via window', 'window.localStorage.setItem("k", "v"); return 0;'],
  ])('rejects %s', async (_label, statement) => {
    const fired = await rulesFiredFor(
      'src/mechanic/engine/__boundary_fixture.ts',
      `export function probe(): number { ${statement} }\n`,
    );
    expect(fired.some((rule) => rule.startsWith('no-restricted-'))).toBe(true);
  });

  it('rejects importing Phaser', async () => {
    const fired = await rulesFiredFor(
      'src/mechanic/engine/__boundary_fixture.ts',
      'import Phaser from "phaser";\nexport const probe = Phaser.VERSION;\n',
    );
    expect(fired).toContain('no-restricted-imports');
  });
});

describe('the shell talks to the game only through the contract', () => {
  it('rejects importing anything under mechanic/', async () => {
    const fired = await rulesFiredFor(
      'src/shell/__boundary_fixture.ts',
      'import { createMechanicHost } from "../mechanic/index.ts";\nexport const probe = createMechanicHost;\n',
    );
    expect(fired).toContain('no-restricted-imports');
  });

  it('allows importing the contract itself', async () => {
    const fired = await rulesFiredFor(
      'src/shell/__boundary_fixture.ts',
      'import type { MechanicHost } from "../shell-contract.ts";\nexport type Probe = MechanicHost;\n',
    );
    expect(fired).toEqual([]);
  });
});
