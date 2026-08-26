import { defineConfig } from 'vitest/config';

/**
 * Three projects, on purpose.
 *
 * The mechanic project runs in Node with no DOM at all: if a pure-rules module
 * ever reaches for `document`, the test suite fails rather than silently
 * passing under jsdom. tests/e2e belongs to Playwright and is excluded here.
 *
 * The tooling project tests the repository's own machinery — the ESLint rules
 * that enforce the Shell/Mechanic split, and the substitution new-game.ts does.
 * The boundary is only as real as the rule that rejects a violation, so those
 * rules are under test like any other load-bearing code.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'mechanic',
          include: ['tests/mechanic/**/*.test.ts'],
          environment: 'node',
          restoreMocks: true,
        },
      },
      {
        test: {
          name: 'shell',
          include: ['tests/shell/**/*.test.ts'],
          environment: 'jsdom',
          restoreMocks: true,
        },
      },
      {
        test: {
          name: 'tooling',
          include: ['tests/tooling/**/*.test.ts'],
          environment: 'node',
          restoreMocks: true,
          // Each case boots ESLint against the real project config.
          testTimeout: 60_000,
        },
      },
    ],
  },
});
