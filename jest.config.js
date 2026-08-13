/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // Les tests e2e Playwright vivent sous e2e/ et ont leur propre runner.
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
};
