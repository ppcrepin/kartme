// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // supabase/functions = Edge Functions Deno (runtime & imports différents).
    ignores: ['dist/*', 'node_modules/*', '.expo/*', 'e2e/*', 'supabase/functions/*', 'jest.setup.js'],
  },
]);
