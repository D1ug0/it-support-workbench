import js from '@eslint/js'
import ts from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import prettier from 'eslint-config-prettier'

export default ts.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: ts.parser },
      globals: {
        document: 'readonly',
        window: 'readonly',
        navigator: 'readonly',
        File: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLSelectElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        HTMLDialogElement: 'readonly',
        HTMLElement: 'readonly',
        ServiceWorkerRegistration: 'readonly',
        URL: 'readonly',
        caches: 'readonly',
        Event: 'readonly',
        KeyboardEvent: 'readonly',
        setTimeout: 'readonly',
      },
    },
  },
  { rules: { 'vue/multi-word-component-names': 'off' } },
  prettier,
)
