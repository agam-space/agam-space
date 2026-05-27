const base = require('../../jest.preset.js');

/** @type {import('jest').Config} */
const config = {
  ...base,
  displayName: 'core',
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
};

module.exports = config;
