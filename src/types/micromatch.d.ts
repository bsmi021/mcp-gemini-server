// Type definitions for micromatch
declare module "micromatch" {
  interface MicromatchOptions {
    basename?: boolean;
    bash?: boolean;
    dot?: boolean;
    posix?: boolean;
    nocase?: boolean;
    noextglob?: boolean;
    nonegate?: boolean;
    noglobstar?: boolean;
    nobrace?: boolean;
    regex?: boolean;
    unescape?: boolean;
    contains?: boolean;
    matchBase?: boolean;
    onMatch?: (match: string) => void;
    onResult?: (result: string) => void;
    [key: string]: unknown;
  }

  interface Micromatch {
    (
      list: string[],
      patterns: string | string[],
      options?: MicromatchOptions
    ): string[];
    match(
      list: string[],
      patterns: string | string[],
      options?: MicromatchOptions
    ): string[];
    isMatch(
      str: string,
      patterns: string | string[],
      options?: MicromatchOptions
    ): boolean;
    contains(
      str: string,
      pattern: string,
      options?: MicromatchOptions
    ): boolean;
    matcher(
      pattern: string,
      options?: MicromatchOptions
    ): (str: string) => boolean;
    any(str: string, patterns: string[], options?: MicromatchOptions): boolean;
    not(
      list: string[],
      patterns: string | string[],
      options?: MicromatchOptions
    ): string[];
    filter(
      patterns: string | string[],
      options?: MicromatchOptions
    ): (str: string) => boolean;
    some(
      list: string[],
      patterns: string | string[],
      options?: MicromatchOptions
    ): boolean;
    every(
      list: string[],
      patterns: string | string[],
      options?: MicromatchOptions
    ): boolean;
    all(str: string, patterns: string[], options?: MicromatchOptions): boolean;
    capture(
      str: string,
      pattern: string,
      options?: MicromatchOptions
    ): string[] | null;
    test(str: string, pattern: string, options?: MicromatchOptions): boolean;
    matchKeys(
      obj: object,
      patterns: string | string[],
      options?: MicromatchOptions
    ): object;
    braces(str: string, options?: MicromatchOptions): string[];
    braceExpand(str: string, options?: MicromatchOptions): string[];
    makeRe(pattern: string, options?: MicromatchOptions): RegExp;
    scan(str: string, options?: MicromatchOptions): string[];
    parse(str: string, options?: MicromatchOptions): object;
    compile(str: string, options?: MicromatchOptions): (str: string) => boolean;
    create(str: string, options?: MicromatchOptions): object;
  }

  const micromatch: Micromatch;
  export = micromatch;
}
