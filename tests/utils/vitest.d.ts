/**
 * Type definitions for Vitest
 * This helps to ensure we have proper types for our tests
 */

declare module "vitest" {
  interface Mock {
    <This, Args extends any[] = any[], Return = any>(
      this: This,
      ...args: Args
    ): Return;
    mockImplementation(fn: (...args: any[]) => any): this;
    mockReturnValue(val: any): this;
    mockResolvedValue(val: any): this;
    mockRejectedValue(val: any): this;
  }

  function mocked<T>(item: T, deep?: boolean): T;
}
