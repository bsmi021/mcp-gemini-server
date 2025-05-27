// Using vitest globals - see vitest.config.ts globals: true
import { mcpClientTool } from "../../../src/tools/mcpClientTool.js";
import { ConfigurationManager } from "../../../src/config/ConfigurationManager.js";
import * as writeToFileModule from "../../../src/tools/writeToFileTool.js";

// Mock dependencies
vi.mock("../../../src/services/index.js");
vi.mock("../../../src/config/ConfigurationManager.js");
vi.mock("../../../src/tools/writeToFileTool.js");
vi.mock("uuid", () => ({
  v4: () => "test-uuid-123",
}));

describe("mcpClientTool", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockMcpClientService: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockConfigManager: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock McpClientService
    mockMcpClientService = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      listTools: vi.fn(),
      callTool: vi.fn(),
      getServerInfo: vi.fn(),
    };

    // Setup mock ConfigurationManager
    mockConfigManager = {
      getMcpConfig: vi.fn().mockReturnValue({
        clientId: "default-client-id",
        connectionToken: "default-token",
      }),
    };

    vi.mocked(ConfigurationManager.getInstance).mockReturnValue(
      mockConfigManager
    );
  });

  describe("Tool Configuration", () => {
    it("should have correct name and description", () => {
      expect(mcpClientTool.name).toBe("mcp_client");
      expect(mcpClientTool.description).toContain(
        "Manages MCP (Model Context Protocol) client connections"
      );
    });

    it("should have valid input schema", () => {
      expect(mcpClientTool.inputSchema).toBeDefined();
      expect(mcpClientTool.inputSchema._def.discriminator).toBe("operation");
    });
  });

  describe("Connect Operation", () => {
    it("should handle stdio connection", async () => {
      const mockServerInfo = { name: "Test Server", version: "1.0.0" };
      mockMcpClientService.connect.mockResolvedValue("connection-123");
      mockMcpClientService.getServerInfo.mockResolvedValue(mockServerInfo);

      const args = {
        operation: "connect_stdio" as const,
        transport: "stdio" as const,
        command: "node",
        args: ["server.js"],
        clientId: "custom-client-id",
      };

      const result = await mcpClientTool.execute(args, mockMcpClientService);

      expect(mockMcpClientService.connect).toHaveBeenCalledWith(
        "test-uuid-123",
        {
          type: "stdio",
          connectionToken: "default-token",
          stdioCommand: "node",
          stdioArgs: ["server.js"],
        }
      );

      expect(result.content[0].text).toBe(
        "Successfully connected to MCP server"
      );
      const resultData = JSON.parse(result.content[1].text);
      expect(resultData.connectionId).toBe("connection-123");
      expect(resultData.transport).toBe("stdio");
      expect(resultData.serverInfo).toEqual(mockServerInfo);
    });

    it("should handle SSE connection", async () => {
      const mockServerInfo = { name: "SSE Server", version: "2.0.0" };
      mockMcpClientService.connect.mockResolvedValue("sse-connection-456");
      mockMcpClientService.getServerInfo.mockResolvedValue(mockServerInfo);

      const args = {
        operation: "connect_sse" as const,
        transport: "sse" as const,
        url: "https://mcp-server.example.com/sse",
        connectionToken: "custom-token",
      };

      const result = await mcpClientTool.execute(args, mockMcpClientService);

      expect(mockMcpClientService.connect).toHaveBeenCalledWith(
        "test-uuid-123",
        {
          type: "sse",
          connectionToken: "custom-token",
          sseUrl: "https://mcp-server.example.com/sse",
        }
      );

      const resultData = JSON.parse(result.content[1].text);
      expect(resultData.connectionId).toBe("sse-connection-456");
      expect(resultData.transport).toBe("sse");
    });
  });

  describe("Disconnect Operation", () => {
    it("should handle disconnection", async () => {
      mockMcpClientService.disconnect.mockResolvedValue(undefined);

      const args = {
        operation: "disconnect" as const,
        connectionId: "connection-123",
      };

      const result = await mcpClientTool.execute(args, mockMcpClientService);

      expect(mockMcpClientService.disconnect).toHaveBeenCalledWith(
        "connection-123"
      );
      expect(result.content[0].text).toBe(
        "Successfully disconnected from MCP server"
      );

      const resultData = JSON.parse(result.content[1].text);
      expect(resultData.connectionId).toBe("connection-123");
      expect(resultData.status).toBe("disconnected");
    });
  });

  describe("List Tools Operation", () => {
    it("should list available tools", async () => {
      const mockTools = [
        { name: "tool1", description: "First tool" },
        { name: "tool2", description: "Second tool" },
      ];
      mockMcpClientService.listTools.mockResolvedValue(mockTools);

      const args = {
        operation: "list_tools" as const,
        connectionId: "connection-123",
      };

      const result = await mcpClientTool.execute(args, mockMcpClientService);

      expect(mockMcpClientService.listTools).toHaveBeenCalledWith(
        "connection-123"
      );
      expect(result.content[0].text).toContain("Available tools on connection");

      const toolsData = JSON.parse(result.content[1].text);
      expect(toolsData).toEqual(mockTools);
    });
  });

  describe("Call Tool Operation", () => {
    it("should call tool and return result", async () => {
      const mockResult = { status: "success", data: "Tool executed" };
      mockMcpClientService.callTool.mockResolvedValue(mockResult);

      const args = {
        operation: "call_tool" as const,
        connectionId: "connection-123",
        toolName: "exampleTool",
        toolParameters: { param1: "value1" },
        overwriteFile: true,
      };

      const result = await mcpClientTool.execute(args, mockMcpClientService);

      expect(mockMcpClientService.callTool).toHaveBeenCalledWith(
        "connection-123",
        "exampleTool",
        { param1: "value1" }
      );

      const resultData = JSON.parse(result.content[0].text);
      expect(resultData).toEqual(mockResult);
    });

    it("should write tool result to file when outputFilePath is provided", async () => {
      const mockResult = { status: "success", data: "Tool executed" };
      mockMcpClientService.callTool.mockResolvedValue(mockResult);

      vi.mocked(writeToFileModule.writeToFile.execute).mockResolvedValue({
        content: [{ type: "text", text: "File written" }],
      });

      const args = {
        operation: "call_tool" as const,
        connectionId: "connection-123",
        toolName: "exampleTool",
        toolParameters: {},
        outputFilePath: "/path/to/output.json",
        overwriteFile: true,
      };

      const result = await mcpClientTool.execute(args, mockMcpClientService);

      expect(mockMcpClientService.callTool).toHaveBeenCalled();
      expect(writeToFileModule.writeToFile.execute).toHaveBeenCalledWith({
        filePath: "/path/to/output.json",
        content: JSON.stringify(mockResult, null, 2),
        overwriteIfExists: true,
      });

      expect(result.content[0].text).toContain(
        "Tool exampleTool executed successfully"
      );
      expect(result.content[0].text).toContain("/path/to/output.json");
    });

    it("should handle string results", async () => {
      mockMcpClientService.callTool.mockResolvedValue("Simple string result");

      const args = {
        operation: "call_tool" as const,
        connectionId: "connection-123",
        toolName: "stringTool",
        toolParameters: {},
        overwriteFile: true,
      };

      const result = await mcpClientTool.execute(args, mockMcpClientService);

      expect(result.content[0].text).toBe("Simple string result");
    });

    it("should handle tool call errors", async () => {
      mockMcpClientService.callTool.mockRejectedValue(
        new Error("Tool not found")
      );

      const args = {
        operation: "call_tool" as const,
        connectionId: "connection-123",
        toolName: "nonExistentTool",
        toolParameters: {},
        overwriteFile: true,
      };

      await expect(
        mcpClientTool.execute(args, mockMcpClientService)
      ).rejects.toThrow();
    });
  });

  describe("Error Handling", () => {
    it("should handle connection errors", async () => {
      mockMcpClientService.connect.mockRejectedValue(
        new Error("Connection failed")
      );

      const args = {
        operation: "connect_stdio" as const,
        transport: "stdio" as const,
        command: "invalid-command",
      };

      await expect(
        mcpClientTool.execute(args, mockMcpClientService)
      ).rejects.toThrow();
    });

    it("should handle unknown operation", async () => {
      const args = {
        operation: "unknown",
        connectionId: "test-connection",
        toolName: "test-tool",
        overwriteFile: true,
      } as const;

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mcpClientTool.execute(args as any, mockMcpClientService)
      ).rejects.toThrow("Unknown operation");
    });
  });
});
