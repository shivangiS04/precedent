/** Jest runs TypeScript unit tests for pure backend logic (no Forge runtime needed). */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs', moduleResolution: 'node', jsx: 'react', esModuleInterop: true, strict: true, skipLibCheck: true, isolatedModules: true } }],
  },
};
