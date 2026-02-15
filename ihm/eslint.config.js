import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],

  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
    rules: {
      // Vue SFCs use TS parser — no-undef doesn't understand globals like HTMLElement
      'no-undef': 'off',
    },
  },

  {
    rules: {
      // Allow unused vars prefixed with _
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Already cleaned up, keep as warn for future additions
      '@typescript-eslint/no-explicit-any': 'warn',
      // Allow ternary expressions as statements (common in Vue)
      '@typescript-eslint/no-unused-expressions': 'off',
      'no-unused-expressions': 'off',
      // Vue formatting — project uses compact single-line style
      'vue/multi-word-component-names': 'off',
      'vue/require-default-prop': 'off',
      'vue/html-self-closing': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/first-attribute-linebreak': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/html-closing-bracket-spacing': 'off',
      'vue/html-indent': 'off',
      'vue/attributes-order': 'off',
      'vue/multiline-html-element-content-newline': 'off',
    },
  },

  { ignores: ['dist/', 'node_modules/'] },
]
