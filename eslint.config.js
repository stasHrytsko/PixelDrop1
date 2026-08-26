// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'android/**',
      'ios/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },

  // --- Architectural boundaries, enforced by the linter rather than by good intentions. ---

  {
    // The engine is pure: no rendering library, no DOM, no storage, no I/O.
    files: ['src/mechanic/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['phaser', 'phaser/*'], message: 'engine must stay pure — no Phaser imports.' },
            { group: ['**/render/**'], message: 'engine must not depend on rendering.' },
            { group: ['**/shell/**'], message: 'engine must not depend on the shell.' },
            { group: ['@capacitor/*'], message: 'engine must stay pure — no platform imports.' },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'engine must stay pure — no DOM.' },
        { name: 'document', message: 'engine must stay pure — no DOM.' },
        { name: 'localStorage', message: 'engine must stay pure — no storage.' },
        { name: 'fetch', message: 'engine must stay pure — no I/O.' },
      ],
    },
  },

  {
    // The shell knows the contract, never the game.
    files: ['src/shell/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['phaser', 'phaser/*'], message: 'shell is DOM-only — Phaser lives in src/mechanic/render.' },
            { group: ['**/mechanic/**'], message: 'shell talks to the game only through src/shell-contract.ts.' },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'localStorage',
          message: 'use ProgressRepository — Android WebView may clear localStorage.',
        },
      ],
    },
  },

  {
    // Shell screens must not reach the network directly; signals go through SignalSink.
    files: ['src/shell/screens/**/*.ts', 'src/shell/progress/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'use SignalSink — screens do not talk to the network.' },
        { name: 'localStorage', message: 'use ProgressRepository.' },
      ],
    },
  },

  {
    files: ['scripts/**/*.ts', '*.config.ts', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },

  {
    // This file is not in tsconfig's include list, so type-aware rules have no
    // program to work from. Lint it for syntax and style only.
    files: ['eslint.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  {
    files: ['tests/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: { '@typescript-eslint/explicit-module-boundary-types': 'off' },
  },
);
