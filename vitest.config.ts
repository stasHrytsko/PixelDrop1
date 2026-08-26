import { defineConfig } from 'vitest/config';

/**
 * Two projects, on purpose.
 *
 * The mechanic project runs in Node with no DOM at all: if a pure-rules module
 * ever reaches for `document`, the test suite fails rather than silently
 * passing under jsdom. tests/e2e belongs to Playwright and is excluded here.
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
    ],
  },
});
