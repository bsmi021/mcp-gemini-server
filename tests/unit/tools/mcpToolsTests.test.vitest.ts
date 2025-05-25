// Using vitest globals - see vitest.config.ts globals: true

/*
 * DEPRECATED TEST FILE
 *
 * This test file was written for the old individual MCP tools:
 * - mcpConnectToServerTool
 * - mcpListServerToolsTool
 * - mcpCallServerTool
 * - mcpDisconnectFromServerTool
 *
 * These tools have been refactored and consolidated into a single mcpClientTool.
 *
 * TODO: Rewrite these tests to test the new mcpClientTool functionality
 * or create separate test files for the new consolidated architecture.
 */

// Import the current tools to be tested
import { writeToFileTool } from "../../../src/tools/writeToFileTool.js";

// Import relevant constants/types for testing
import { TOOL_NAME as WRITE_FILE_TOOL_NAME } from "../../../src/tools/schemas/writeToFileParams.js";

// Mock fs/promises
vi.mock("fs/promises", () => ({
  writeFile: vi.fn().mockImplementation(async () => undefined),
  access: vi.fn().mockImplementation(async () => undefined),
  lstat: vi.fn().mockImplementation(async (_path: string) => ({
    isSymbolicLink: () => false,
  })),
  realpath: vi.fn().mockImplementation(async (path: string) => path),
}));

// Mock FileSecurityService
vi.mock("../../../src/utils/FileSecurityService.js", () => {
  return {
    FileSecurityService: vi.fn().mockImplementation(() => {
      return {
        secureWriteFile: vi.fn().mockImplementation(async () => undefined),
        validateAndResolvePath: vi
          .fn()
          .mockImplementation((path: string) => path),
        isPathWithinAllowedDirs: vi.fn().mockReturnValue(true),
        setAllowedDirectories: vi.fn().mockImplementation(() => undefined),
      };
    }),
  };
});

describe("MCP Tools Tests (Legacy)", () => {
  describe("writeToFileTool", () => {
    it("should be a function that registers the tool", () => {
      expect(typeof writeToFileTool).toBe("function");
    });

    it("should register a tool with the correct name when called", () => {
      const mockServer = {
        tool: vi.fn(),
      };

      writeToFileTool(mockServer as any);

      expect(mockServer.tool).toHaveBeenCalledTimes(1);
      const [toolName] = mockServer.tool.mock.calls[0];
      expect(toolName).toBe(WRITE_FILE_TOOL_NAME);
    });
  });

  // Note: All other MCP tool tests have been disabled because the individual tools
  // (mcpConnectToServerTool, mcpListServerToolsTool, mcpCallServerTool, mcpDisconnectFromServerTool)
  // have been refactored into a consolidated mcpClientTool.
  //
  // The new mcpClientTool should be tested separately with tests that reflect
  // its consolidated architecture and unified interface.
});
