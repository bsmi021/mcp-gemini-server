declare module "@modelcontextprotocol/sdk" {
  export interface Tool {
    (
      req: import("express").Request,
      res: import("express").Response,
      services: Record<string, unknown>
    ): Promise<void>;
  }
}

declare module "@modelcontextprotocol/sdk/types.js" {
  export enum ErrorCode {
    InvalidParams = "INVALID_PARAMS",
    InvalidRequest = "INVALID_REQUEST",
    InternalError = "INTERNAL_ERROR",
  }

  export class McpError extends Error {
    constructor(code: ErrorCode, message: string, details?: unknown);
    code: ErrorCode;
    details?: unknown;
  }

  export interface CallToolResult {
    content: Array<
      | {
          type: "text";
          text: string;
          [x: string]: unknown;
        }
      | {
          type: "image";
          data: string;
          mimeType: string;
          [x: string]: unknown;
        }
      | {
          type: "resource";
          resource:
            | {
                text: string;
                uri: string;
                mimeType?: string;
                [x: string]: unknown;
              }
            | {
                uri: string;
                blob: string;
                mimeType?: string;
                [x: string]: unknown;
              };
          [x: string]: unknown;
        }
    >;
    isError?: boolean;
    [x: string]: unknown;
  }
}

declare module "@modelcontextprotocol/sdk/server/mcp.js" {
  export interface Transport {
    start(): Promise<void>;
    send(message: unknown): Promise<void>;
    close(): Promise<void>;
  }

  export class McpServer {
    constructor(options: {
      name: string;
      version: string;
      description: string;
    });
    connect(transport: Transport): Promise<void>;
    disconnect(): Promise<void>;
    registerTool(
      name: string,
      handler: (args: unknown) => Promise<unknown>,
      schema: unknown
    ): void;

    // Add the tool method that's being used in the codebase
    tool(
      name: string,
      description: string,
      params: unknown,
      handler: (args: unknown) => Promise<unknown>
    ): void;
  }
}

declare module "@modelcontextprotocol/sdk/server/stdio.js" {
  import { Transport } from "@modelcontextprotocol/sdk/server/mcp.js";

  export class StdioServerTransport implements Transport {
    constructor();
    start(): Promise<void>;
    send(message: unknown): Promise<void>;
    close(): Promise<void>;
  }
}

declare module "@modelcontextprotocol/sdk/server/streamableHttp.js" {
  import { Transport } from "@modelcontextprotocol/sdk/server/mcp.js";
  import type { Request, Response } from "express";

  export interface StreamableHTTPServerTransportOptions {
    sessionIdGenerator?: () => string;
    onsessioninitialized?: (sessionId: string) => void;
  }

  export class StreamableHTTPServerTransport implements Transport {
    constructor(options?: StreamableHTTPServerTransportOptions);
    start(): Promise<void>;
    send(message: unknown): Promise<void>;
    close(): Promise<void>;

    readonly sessionId?: string;
    onclose?: () => void;

    handleRequest(req: Request, res: Response, body?: unknown): Promise<void>;
  }
}
