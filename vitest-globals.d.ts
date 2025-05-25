/// <reference types="vitest/globals" />

// This file ensures vitest globals are available throughout the project
// when using vitest with globals: true configuration

declare global {
  const describe: typeof import("vitest").describe;
  const it: typeof import("vitest").it;
  const test: typeof import("vitest").test;
  const expect: typeof import("vitest").expect;
  const beforeAll: typeof import("vitest").beforeAll;
  const afterAll: typeof import("vitest").afterAll;
  const beforeEach: typeof import("vitest").beforeEach;
  const afterEach: typeof import("vitest").afterEach;
  const vi: typeof import("vitest").vi;
}

export {};
