// @ts-check
// ESLint flat config for the package source, tests and build config.
import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const restrictedImports = [
  'node:*',
  'fs',
  'path',
  'os',
  'child_process',
  'bun',
  'bun:*',
];

export default tseslint.config(
  {
    ignores: ['dist/', 'node_modules/', 'coverage/', '.changeset/'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      // Allow intentionally unused parameters and destructured values when prefixed with _.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    // Everything in src/ is library code: no Node built-ins, no Bun.
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: restrictedImports,
              message: 'src/ must run in Node, Bun and browsers unchanged.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'Bun', message: 'No Bun.* globals in src/.' },
        {
          name: 'process',
          message: 'No process in src/; take options instead.',
        },
        { name: 'Buffer', message: 'Use Uint8Array in src/.' },
        { name: 'require', message: 'Use ES imports in src/.' },
      ],
    },
  },
  {
    // The core is runtime-neutral: no DOM either, and no React.
    files: ['src/index.ts', 'src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: restrictedImports,
              message: 'src/core must run in Node, Bun and browsers unchanged.',
            },
            {
              group: [
                'react',
                'react-dom',
                'react/*',
                'react-dom/*',
                '../react/*',
              ],
              message: 'src/core is framework-free; React lives in src/react.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'Bun', message: 'No Bun.* globals in src/core.' },
        { name: 'process', message: 'No process in src/core.' },
        { name: 'Buffer', message: 'Use Uint8Array in src/core.' },
        { name: 'require', message: 'Use ES imports in src/core.' },
        { name: 'window', message: 'No DOM in src/core.' },
        { name: 'document', message: 'No DOM in src/core.' },
        { name: 'fetch', message: 'src/core never fetches; take data in.' },
        { name: 'localStorage', message: 'Persist layouts in the app.' },
      ],
    },
  },
  {
    files: ['src/react/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['test/**/*.{ts,tsx}', '*.config.{js,ts}'],
    languageOptions: { globals: { ...globals.node } },
  }
);
