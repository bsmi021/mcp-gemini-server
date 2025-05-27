import fetch, { Response as FetchResponse } from "node-fetch";
import EventSource from "eventsource";

export interface MCPTestClientOptions {
  url: string;
  timeout?: number;
}

// Basic JSON-RPC 2.0 response union type used by this test client
type JsonRpcSuccess = {
  jsonrpc: "2.0";
  id: number | string | null;
  result: unknown;
  error?: never;
};

type JsonRpcError = {
  jsonrpc: "2.0";
  id: number | string | null;
  error: { message: string; [key: string]: unknown };
  result?: never;
};

type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

export class MCPTestClient {
  public sessionId?: string;
  private url: string;
  private timeout: number;
  private eventSource?: EventSource;

  constructor(optionsOrUrl: MCPTestClientOptions | string) {
    if (typeof optionsOrUrl === "string") {
      this.url = optionsOrUrl;
      this.timeout = 30000;
    } else {
      this.url = optionsOrUrl.url;
      this.timeout = optionsOrUrl.timeout || 30000;
    }
  }

  async initialize(): Promise<{
    protocolVersion: string;
    capabilities: unknown;
  }> {
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {},
          },
          clientInfo: {
            name: "mcp-test-client",
            version: "1.0.0",
          },
        },
      }),
    });

    this.sessionId = response.headers.get("Mcp-Session-Id") || undefined;
    const result = await this.parseResponse(response);

    if ("error" in result && result.error) {
      throw new Error(`Initialize failed: ${result.error.message}`);
    }

    return (result as JsonRpcSuccess).result as {
      protocolVersion: string;
      capabilities: unknown;
    };
  }

  async listTools(): Promise<{ tools: unknown[] }> {
    if (!this.sessionId) {
      throw new Error("Not initialized - call initialize() first");
    }

    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "Mcp-Session-Id": this.sessionId,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      }),
    });

    const result = await this.parseResponse(response);

    if ("error" in result && result.error) {
      throw new Error(`List tools failed: ${result.error.message}`);
    }

    return (result as JsonRpcSuccess).result as { tools: unknown[] };
  }

  async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<{
    content?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  }> {
    if (!this.sessionId) {
      throw new Error("Not initialized - call initialize() first");
    }

    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "Mcp-Session-Id": this.sessionId,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name,
          arguments: args,
        },
      }),
    });

    const result = await this.parseResponse(response);

    if ("error" in result && result.error) {
      throw new Error(`Tool call failed: ${result.error.message}`);
    }

    return (result as JsonRpcSuccess).result as {
      content?: Array<Record<string, unknown>>;
      [key: string]: unknown;
    };
  }

  async streamTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<AsyncIterable<unknown>> {
    if (!this.sessionId) {
      throw new Error("Not initialized - call initialize() first");
    }

    // For streaming, we need to handle SSE
    const url = `${this.url}?sessionId=${this.sessionId}`;
    this.eventSource = new EventSource(url);

    // Send the request to trigger streaming
    await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "Mcp-Session-Id": this.sessionId,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name,
          arguments: args,
        },
      }),
    });

    // Return async iterable for streaming data
    const eventSource = this.eventSource;
    return {
      async *[Symbol.asyncIterator]() {
        const chunks: unknown[] = [];
        let done = false;

        eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data);
          chunks.push(data);
        };

        eventSource.onerror = () => {
          done = true;
          eventSource.close();
        };

        while (!done) {
          if (chunks.length > 0) {
            yield chunks.shift();
          } else {
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        }
      },
    };
  }

  async disconnect(): Promise<void> {
    if (this.eventSource) {
      this.eventSource.close();
    }

    if (this.sessionId) {
      // Send disconnect/cleanup request if needed
      await fetch(this.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Mcp-Session-Id": this.sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "disconnect",
          params: {},
        }),
      }).catch(() => {
        // Ignore errors on disconnect
      });
    }

    this.sessionId = undefined;
  }

  // Alias for backward compatibility with existing tests
  async close(): Promise<void> {
    await this.disconnect();
  }

  private async parseResponse(
    response: FetchResponse
  ): Promise<JsonRpcResponse> {
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("text/event-stream")) {
      // Parse SSE format
      const text = await response.text();
      const lines = text.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            return JSON.parse(line.substring(6)) as JsonRpcResponse;
          } catch (e) {
            // Continue to next line
          }
        }
      }

      throw new Error("No valid JSON data in SSE response");
    } else {
      // Standard JSON response
      return (await response.json()) as JsonRpcResponse;
    }
  }
}
