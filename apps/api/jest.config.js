/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          target: 'ES2021',
          module: 'commonjs',
          moduleResolution: 'node',
          esModuleInterop: true,
          strict: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          isolatedModules: true,
        },
      },
    ],
  },
  moduleNameMapper: {
    '^@aurevo/shared$': '<rootDir>/../../packages/shared/dist/index.js',
    '^@aurevo/shared/(.*)$': '<rootDir>/../../packages/shared/dist/$1',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.test.ts'],
};