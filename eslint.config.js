const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const globals = require('globals');
const hooks = require('eslint-plugin-react-hooks');
const refresh = require('eslint-plugin-react-refresh');

module.exports = tseslint.config(
  { ignores: ['**/dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': hooks, 'react-refresh': refresh },
    rules: {
      ...hooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }]
    }
  }
);
