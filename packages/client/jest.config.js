const base = require('../../jest.preset.js');

/** @type {import('jest').Config} */
const config = {
  ...base,
  displayName: 'client',
  rootDir: '../..',
  setupFilesAfterEnv: ['<rootDir>/packages/client/test/setup.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/packages/client/tsconfig.test.json',
      },
    ],
  },
  moduleNameMapper: {
    '^@agam-space/(.*)$': '<rootDir>/packages/$1/src',
  },
  testMatch: ['<rootDir>/packages/client/test/**/*.test.ts'],
  coverageDirectory: '<rootDir>/packages/client/coverage',
  collectCoverageFrom: [
    'packages/client/src/**/*.{ts,tsx}',
    '!packages/client/src/**/*.d.ts',
    '!packages/client/src/**/*.test.ts',
    '!packages/client/src/**/*.spec.ts',
  ],
};

module.exports = config;
