declare module "node-fetch" {
  export interface HeadersInit {
    [key: string]: string | string[];
  }

  export interface RequestInit {
    body?: string | Blob | ArrayBuffer | NodeJS.ReadableStream;
    headers?: HeadersInit;
    method?: string;
    redirect?: string;
    signal?: AbortSignal;
    timeout?: number;
    compress?: boolean;
    size?: number;
    follow?: number;
    agent?: import("http").Agent | import("https").Agent | false;
  }

  export default function fetch(
    url: string | URL,
    options?: RequestInit
  ): Promise<Response>;

  export class Response {
    ok: boolean;
    status: number;
    statusText: string;
    headers: Headers;
    json(): Promise<unknown>;
    text(): Promise<string>;
    buffer(): Promise<Buffer>;
    arrayBuffer(): Promise<ArrayBuffer>;
    clone(): Response;
  }

  export class Headers {
    constructor(init?: HeadersInit);
    get(name: string): string | null;
    has(name: string): boolean;
    set(name: string, value: string): void;
    append(name: string, value: string): void;
    delete(name: string): void;
    forEach(callback: (value: string, name: string) => void): void;
  }
}
