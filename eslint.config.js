import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'

export default [
  { ignores: ['out', 'dist', 'node_modules'] },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parser: tsparser, parserOptions: { ecmaVersion: 2022, sourceType: 'module' } },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Electron lanca erro em prompt() (e alert/confirm bloqueiam a UI). Bug real pego na
      // criacao de projeto (ProjectsSidebar usava window.prompt) — usar controle inline ou
      // projects.pickDirectory() em vez desses dialogs do navegador.
      'no-restricted-globals': [
        'error',
        { name: 'prompt', message: 'Electron nao suporta prompt() — use input inline ou projects.pickDirectory().' },
        { name: 'confirm', message: 'confirm() bloqueia a UI no Electron — use um controle inline.' },
        { name: 'alert', message: 'alert() bloqueia a UI no Electron — use feedback inline (setError etc).' }
      ],
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'prompt', message: 'Electron nao suporta window.prompt — use input inline ou projects.pickDirectory().' },
        { object: 'window', property: 'confirm', message: 'window.confirm bloqueia a UI no Electron.' },
        { object: 'window', property: 'alert', message: 'window.alert bloqueia a UI no Electron.' }
      ]
    }
  }
]
