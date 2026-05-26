const base = require('../../jest.preset.js');

/** @type {import('jest').Config} */
const config = {
  ...base,
  displayName: 'api-server',
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  coverageDirectory: '<rootDir>/coverage',
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.test.json',
      },
    ],
  },
  moduleNameMapper: {
    ...base.moduleNameMapper,
    '^src/(.*)$': '<rootDir>/src/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};

module.exports = config;
