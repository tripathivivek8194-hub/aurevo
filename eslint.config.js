const tseslint = require('typescript-eslint');
const prettier = require('eslint-config-prettier');

// Flat config for the AUREVO monorepo (ESLint 9).
// Uses the recommended typescript-eslint rule set but relaxes the rules that
// don't yet have wide coverage in this codebase (deliberate `any` for supplier
// adapters/Prisma payloads, and a few stylistic classes) so lint stays a real,
// actionable gate without a multi-week cleanup churn. Tighten these as the
// codebase matures.
module.exports = tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/build/**',
      '**/*.d.ts',
      '**/*.js',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  prettier
);