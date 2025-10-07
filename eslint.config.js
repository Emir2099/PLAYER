import { defineConfig } from 'eslint';
import react from 'eslint-plugin-react';

export default defineConfig({
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: { react },
  extends: ['eslint:recommended', 'plugin:react/recommended'],
  settings: { react: { version: 'detect' } },
  ignorePatterns: ['dist', 'electron/*.js'],
});
