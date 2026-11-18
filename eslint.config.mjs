// Einfaches ESLint für client/ und server/ (`npm run lint`). Nur Hinweise – es wird kein Code automatisch umgeschrieben.
// Regeln, die beim Einführen (2026-10-31) schon verletzt waren, stehen unten auf „warn“, damit `npm run lint` grün bleibt;
// sie werden nach und nach behoben und dann wieder streng gestellt.
import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/storage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['client/**/*.{ts,tsx}'],
    ...jsxA11y.flatConfigs.recommended,
    plugins: { ...jsxA11y.flatConfigs.recommended.plugins, 'react-hooks': reactHooks },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Heute verletzt → vorerst nur Hinweis (Anzahl beim Einführen in Klammern).
      'jsx-a11y/label-has-associated-control': 'warn', // (5)
      'jsx-a11y/media-has-caption': 'warn', // (2)
      'jsx-a11y/no-autofocus': 'warn', // (2)
      'jsx-a11y/click-events-have-key-events': 'warn', // (1)
      'jsx-a11y/no-noninteractive-element-interactions': 'warn', // (1)
      'jsx-a11y/interactive-supports-focus': 'warn', // (1)
    },
  },
  {
    // Keine neuen Riesendateien (CLAUDE.md: Ziel ≤ 300, höchstens 500 Zeilen) – vorerst nur im Server-Code.
    files: ['server/src/**/*.ts'],
    rules: { 'max-lines': ['error', { max: 500 }] },
  },
  {
    rules: {
      // Heute verletzt → vorerst nur Hinweis (Anzahl beim Einführen in Klammern, siehe docs/PROTOKOLL.md).
      '@typescript-eslint/no-explicit-any': 'warn', // (108, alle in server/test)
      '@typescript-eslint/no-unused-vars': 'warn', // (9)
      '@typescript-eslint/no-empty-object-type': 'warn', // (1)
      '@typescript-eslint/no-unused-expressions': 'warn', // (1)
      'no-irregular-whitespace': 'warn', // (1)
      'prefer-const': 'warn', // (1)
      'no-constant-binary-expression': 'warn', // (1)
    },
  },
);
