/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/src/__tests__/setup-env.ts'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
  clearMocks: true,
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
};
