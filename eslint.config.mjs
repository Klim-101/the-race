// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

const SPDX_HEADER_LINES = ['// Copyright The RACE Authors', '// SPDX-License-Identifier: Apache-2.0'];

// Every source file carries the Apache-2.0 header; no maintained, dependency-free flat-config
// plugin does this, so it is a small local rule.
const spdxHeaderRule = {
  meta: {
    type: 'problem',
    fixable: 'code',
    schema: [],
    messages: {
      missing: 'Add the Apache-2.0 SPDX header.',
    },
  },
  create(context) {
    return {
      Program(node) {
        // A Windows checkout can leave CRLF on disk for an LF blob; the check must not depend on it.
        const text = context.sourceCode.getText().replace(/\r\n/g, '\n');
        // A shebang must stay the literal first line for the OS to exec the file.
        const shebangMatch = /^#!.*\n/.exec(text);
        const afterShebang = shebangMatch ? text.slice(shebangMatch[0].length) : text;
        if (!afterShebang.startsWith(SPDX_HEADER_LINES.join('\n'))) {
          context.report({
            node,
            messageId: 'missing',
            fix: (fixer) =>
              fixer.insertTextAfterRange(
                [0, shebangMatch ? shebangMatch[0].length : 0],
                `${SPDX_HEADER_LINES.join('\n')}\n\n`,
              ),
          });
        }
      },
    };
  },
};

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'dev/private/**',
      // Generated from agents/, which is linted at the source.
      'plugins/the-race/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.ts'],
    extends: [...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        // Root-level *.config.ts files sit outside every package's tsconfig "include".
        projectService: { allowDefaultProject: ['*.config.ts'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.{ts,js,mjs,cjs}'],
    plugins: { local: { rules: { 'spdx-header': spdxHeaderRule } } },
    rules: { 'local/spdx-header': 'error' },
  },
  {
    // Tests may assert that a fixture element exists; production code narrows instead.
    files: ['**/*.test.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  eslintConfigPrettier,
);
