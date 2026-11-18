import js from '@eslint/js';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

const WEB_FILES = ['apps/web/**/*.{js,jsx,mjs,ts,tsx}'];
const TS_FILES = ['**/*.{ts,tsx,mts,cts}'];
const JS_FILES = ['**/*.{js,jsx,mjs,cjs}'];

// Files allowed to read process.env (contracts/http-and-env.md §3).
const PROCESS_ENV_FILES = [
  'apps/web/src/server/env.ts',
  'apps/web/src/instrumentation.ts',
  'packages/db/src/env.ts',
  '**/next.config.ts',
  '**/playwright.config.ts',
  '**/vitest.config.ts',
];

const BASE_RESTRICTED_SYNTAX = [
  {
    selector: 'CallExpression > MemberExpression.callee[property.name="only"]',
    message: 'Focused tests (.only) must not be committed.',
  },
  {
    // A `key` after a spread makes the JSX transform fall back to createElement, where React 19 reports
    // a false "unique key" warning for mixed static + mapped children (e.g. a placeholder <option>).
    selector: 'JSXSpreadAttribute ~ JSXAttribute[name.name="key"]',
    message: 'Put the `key` prop before any {...spread} attribute.',
  },
];

// User-facing attributes that `react/jsx-no-literals` (ignoreProps) does not cover. `alt=""` for
// decorative images stays allowed.
const TEXT_ATTRIBUTE = 'JSXAttribute[name.name=/^(aria-label|title|alt|placeholder)$/]';
const TEXT_ATTRIBUTE_MESSAGE =
  'User-facing attribute text must come from the message catalogs (constitution IV).';
const TEXT_ATTRIBUTE_SYNTAX = [
  `${TEXT_ATTRIBUTE} > Literal[value=/\\S/]`,
  `${TEXT_ATTRIBUTE} > JSXExpressionContainer > Literal[value=/\\S/]`,
  `${TEXT_ATTRIBUTE} > JSXExpressionContainer > TemplateLiteral[expressions.length=0]`,
].map((selector) => ({ selector, message: TEXT_ATTRIBUTE_MESSAGE }));

// Layer rules for apps/web/src (plan.md "Structure Decision").
const webRestrictedImports = ({ allowDbAuth = false, forbidOtherFeatureActions = false } = {}) => [
  'error',
  {
    paths: [
      { name: 'pg', message: 'Database access goes through @masari/db repositories.' },
      { name: 'drizzle-orm', message: 'Database access goes through @masari/db repositories.' },
      {
        name: '@masari/db/admin',
        message: '@masari/db/admin is for operator scripts and tests only.',
      },
      ...(allowDbAuth
        ? []
        : [
            {
              name: '@masari/db/auth',
              message: '@masari/db/auth may be imported only in src/server/auth/auth.ts.',
            },
          ]),
    ],
    patterns: [
      {
        group: ['pg/*', 'drizzle-orm/*'],
        message: 'Database access goes through @masari/db repositories.',
      },
      ...(forbidOtherFeatureActions
        ? [
            {
              group: ['@/features/*/actions', '../*/actions', '../../*/actions'],
              message:
                "A feature must not import another feature's actions; import your own as '../actions'.",
            },
          ]
        : []),
    ],
  },
];

export default defineConfig([
  globalIgnores([
    '**/node_modules/',
    '**/.next/',
    '**/coverage/',
    '**/playwright-report/',
    '**/test-results/',
    'apps/web/next-env.d.ts',
    'packages/db/migrations/',
    '.specify/',
    '.claude/',
  ]),

  js.configs.recommended,
  {
    files: TS_FILES,
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: JS_FILES,
    extends: [tseslint.configs.disableTypeChecked],
  },

  {
    files: WEB_FILES,
    extends: [nextCoreWebVitals],
    settings: { next: { rootDir: 'apps/web/' } },
  },

  {
    rules: {
      'no-console': 'error',
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message:
            'Read configuration through getEnv() / getDbEnv() (contracts/http-and-env.md §3).',
        },
      ],
      'no-restricted-syntax': ['error', ...BASE_RESTRICTED_SYNTAX],
    },
  },
  {
    files: PROCESS_ENV_FILES,
    rules: { 'no-restricted-properties': 'off' },
  },
  {
    files: ['apps/web/src/server/log.ts', 'packages/db/scripts/**'],
    rules: { 'no-console': 'off' },
  },
  // End-to-end harness: Playwright fixtures call `use()`, which the React hooks rule mistakes for
  // React's `use`; only the database preparation script and the script-budget report print to the terminal.
  {
    files: ['apps/web/e2e/**'],
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
  {
    files: ['apps/web/e2e/support/prepare-db.ts', 'apps/web/e2e/perf-budget.spec.ts'],
    rules: { 'no-console': 'off' },
  },

  // No literal user-facing text in components: every string comes from the message catalogs
  // (research.md §12). Props (className, href, …) are ignored except the user-facing attributes below.
  {
    files: ['apps/web/src/**/*.tsx'],
    ignores: ['apps/web/src/**/*.test.tsx', 'apps/web/src/components/ui/**'],
    rules: {
      'react/jsx-no-literals': ['error', { noStrings: true, ignoreProps: true }],
      'no-restricted-syntax': ['error', ...BASE_RESTRICTED_SYNTAX, ...TEXT_ATTRIBUTE_SYNTAX],
    },
  },

  {
    files: ['apps/web/src/**'],
    rules: { 'no-restricted-imports': webRestrictedImports() },
  },
  {
    files: ['apps/web/src/features/**'],
    rules: { 'no-restricted-imports': webRestrictedImports({ forbidOtherFeatureActions: true }) },
  },
  {
    files: ['apps/web/src/server/auth/auth.ts'],
    rules: { 'no-restricted-imports': webRestrictedImports({ allowDbAuth: true }) },
  },
]);
