// Using vitest globals - see vitest.config.ts globals: true
import { MCPTestClient } from "./clients/mcp-test-client.js";
import { spawn, ChildProcess } from "node:child_process";

interface Tool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

describe("Streamable HTTP Transport E2E Tests", () => {
  let serverProcess: ChildProcess | null = null;
  let client: MCPTestClient;
  const testPort = 3002;
  const baseUrl = `http://localhost:${testPort}`;

  // Store original environment variables
  const originalEnv = process.env;

  beforeEach(async () => {
    // Set environment variables for the test
    process.env = {
      ...originalEnv,
      MCP_TRANSPORT: "streamable",
      MCP_SERVER_PORT: testPort.toString(),
      MCP_ENABLE_STREAMING: "true",
      MCP_SESSION_TIMEOUT: "60",
      GOOGLE_GEMINI_API_KEY:
        process.env.GOOGLE_GEMINI_API_KEY || "test-api-key",
      GOOGLE_GEMINI_MODEL: "gemini-1.5-flash",
      NODE_ENV: "test",
    };

    // Start the server
    await startServerProcess();

    // Create test client
    client = new MCPTestClient(baseUrl);
  });

  afterEach(async () => {
    // Close client if it has cleanup
    if (client && typeof client.close === "function") {
      await client.close();
    }

    // Stop the server process
    if (serverProcess) {
      await stopServerProcess();
    }

    // Restore environment
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  async function startServerProcess(): Promise<void> {
    return new Promise((resolve, reject) => {
      serverProcess = spawn("node", ["dist/server.js"], {
        env: process.env,
        stdio: "pipe",
      });

      let serverReady = false;
      const timeout = setTimeout(() => {
        if (!serverReady) {
          reject(new Error("Server startup timeout"));
        }
      }, 15000);

      serverProcess!.stdout?.on("data", (data: Buffer) => {
        const output = data.toString();
        console.log(`Server output: ${output}`);

        if (
          output.includes("HTTP server listening") ||
          output.includes(`port ${testPort}`) ||
          output.includes("MCP Server connected and listening")
        ) {
          serverReady = true;
          clearTimeout(timeout);
          // Give server a moment to fully initialize
          setTimeout(() => resolve(), 500);
        }
      });

      serverProcess!.stderr?.on("data", (data: Buffer) => {
        console.error(`Server error: ${data.toString()}`);
      });

      serverProcess!.on("error", (error) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to start server: ${error.message}`));
      });

      serverProcess!.on("exit", (code, signal) => {
        clearTimeout(timeout);
        if (!serverReady) {
          reject(
            new Error(`Server exited early: code ${code}, signal ${signal}`)
          );
        }
      });
    });
  }

  async function stopServerProcess(): Promise<void> {
    if (!serverProcess) return;

    return new Promise((resolve) => {
      serverProcess!.on("exit", () => {
        serverProcess = null;
        resolve();
      });

      serverProcess!.kill("SIGTERM");

      // Force kill after timeout
      setTimeout(() => {
        if (serverProcess) {
          serverProcess.kill("SIGKILL");
        }
      }, 5000);
    });
  }

  describe("Session Management", () => {
    it("should initialize a session and return session ID", async () => {
      const result = await client.initialize();

      expect(result).toBeDefined();
      expect(result.protocolVersion).toBe("2024-11-05");
      expect(result.capabilities).toBeDefined();
      expect(client.sessionId).toBeTruthy();
      expect(client.sessionId).toMatch(/^[a-f0-9-]{36}$/); // UUID format
    });

    it("should maintain session across multiple requests", async () => {
      // Initialize session
      await client.initialize();
      const firstSessionId = client.sessionId;

      // Make another request with same session
      const tools = await client.listTools();

      expect(tools).toBeDefined();
      expect(client.sessionId).toBe(firstSessionId);
    });

    it("should reject requests without valid session", async () => {
      // Don't initialize, just try to list tools
      await expect(client.listTools()).rejects.toThrow();
    });

    it("should handle session expiration gracefully", async () => {
      // This test would require waiting for session timeout or mocking time
      // For now, we'll just verify the session exists
      await client.initialize();
      expect(client.sessionId).toBeTruthy();
    });
  });

  describe("Tool Operations", () => {
    beforeEach(async () => {
      await client.initialize();
    });

    it("should list available tools", async () => {
      const result = await client.listTools();

      expect(result).toBeDefined();
      expect(result.tools).toBeInstanceOf(Array);
      expect(result.tools.length).toBeGreaterThan(0);

      // Check for some expected tools
      const toolNames = (result.tools as Tool[]).map((t) => t.name);
      expect(toolNames).toContain("gemini_generate_content");
      expect(toolNames).toContain("gemini_start_chat");
    });

    it("should call a tool successfully", async () => {
      const result = await client.callTool("gemini_generate_content", {
        prompt: "Say hello in one word",
        modelName: "gemini-1.5-flash",
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.content?.[0]).toBeDefined();
      expect(result.content?.[0].text).toBeTruthy();
    });

    it("should handle tool errors gracefully", async () => {
      await expect(client.callTool("non_existent_tool", {})).rejects.toThrow();
    });
  });

  describe("SSE Streaming", () => {
    beforeEach(async () => {
      await client.initialize();
    });

    it("should stream content using SSE", async () => {
      const chunks: string[] = [];

      const stream = await client.streamTool("gemini_generate_content_stream", {
        prompt: "Count from 1 to 3",
        modelName: "gemini-1.5-flash",
      });

      // Collect chunks from the async iterable
      for await (const chunk of stream) {
        chunks.push(String(chunk));
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.join("")).toContain("1");
      expect(chunks.join("")).toContain("2");
      expect(chunks.join("")).toContain("3");
    });

    it("should handle SSE connection errors", async () => {
      // Test with invalid session
      client.sessionId = "invalid-session-id";

      await expect(
        client.streamTool("gemini_generate_content_stream", {
          prompt: "Test",
          modelName: "gemini-1.5-flash",
        })
      ).rejects.toThrow();
    });
  });

  describe("Transport Selection", () => {
    it("should use streamable transport when configured", async () => {
      // The server logs should indicate streamable transport is selected
      // This is more of a server configuration test
      await client.initialize();

      // If we got here, the streamable transport is working
      expect(client.sessionId).toBeTruthy();
    });
  });

  describe("CORS and Headers", () => {
    it("should handle CORS preflight requests", async () => {
      const response = await fetch(`${baseUrl}/mcp`, {
        method: "OPTIONS",
        headers: {
          Origin: "http://example.com",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "Content-Type, Mcp-Session-Id",
        },
      });

      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
        "POST"
      );
      expect(response.headers.get("Access-Control-Allow-Headers")).toContain(
        "Mcp-Session-Id"
      );
    });

    it("should include proper headers in responses", async () => {
      await client.initialize();

      const response = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Mcp-Session-Id": client.sessionId!,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {},
        }),
      });

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });
  });
});
