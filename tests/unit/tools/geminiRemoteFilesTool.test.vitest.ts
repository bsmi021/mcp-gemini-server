// Using vitest globals - see vitest.config.ts globals: true
import { geminiRemoteFilesTool } from "../../../src/tools/geminiRemoteFilesTool.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GeminiService } from "../../../src/services/index.js";

// Mock logger
vi.mock("../../../src/utils/index.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe("geminiRemoteFilesTool", () => {
  // Mock server and service instances
  const mockTool = vi.fn();
  const mockServer = {
    tool: mockTool,
  } as unknown as McpServer;

  // Create a minimal mock service with just the necessary methods for testing
  const mockService = {
    generateContent: () => Promise.resolve("mock"),
  } as unknown as GeminiService;

  // Reset mocks before each test
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should register the tool with the server", () => {
    // Call the tool registration function
    geminiRemoteFilesTool(mockServer, mockService);

    // Verify the tool was registered with correct name and description
    expect(mockTool).toHaveBeenCalledTimes(1);
    expect(mockTool).toHaveBeenCalledWith(
      "gemini_remote_files",
      expect.stringContaining("Provides guidance on using inline data"),
      expect.any(Object),
      expect.any(Function)
    );
  });

  it("should return guidance for upload operation", async () => {
    let processRequest: any;

    // Capture the processRequest function when tool is registered
    mockTool.mockImplementation(
      (name: string, desc: string, params: any, handler: any) => {
        processRequest = handler;
      }
    );

    // Register the tool
    geminiRemoteFilesTool(mockServer, mockService);

    // Call processRequest with upload operation
    const result = await processRequest({
      operation: "upload",
    });

    // Verify the response contains inline data guidance
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    const response = JSON.parse(result.content[0].text);
    expect(response.message).toContain(
      "File operations are no longer supported"
    );
    expect(response.alternatives.upload).toContain(
      "gemini_generate_content_consolidated"
    );
  });

  it("should return guidance for list operation", async () => {
    let processRequest: any;

    // Capture the processRequest function when tool is registered
    mockTool.mockImplementation(
      (name: string, desc: string, params: any, handler: any) => {
        processRequest = handler;
      }
    );

    // Register the tool
    geminiRemoteFilesTool(mockServer, mockService);

    // Call processRequest with list operation
    const result = await processRequest({
      operation: "list",
    });

    // Verify the response contains inline data guidance
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    const response = JSON.parse(result.content[0].text);
    expect(response.message).toContain(
      "File operations are no longer supported"
    );
    expect(response.alternatives.list).toContain(
      "File listing is not available"
    );
  });

  it("should return guidance for get operation", async () => {
    let processRequest: any;

    // Capture the processRequest function when tool is registered
    mockTool.mockImplementation(
      (name: string, desc: string, params: any, handler: any) => {
        processRequest = handler;
      }
    );

    // Register the tool
    geminiRemoteFilesTool(mockServer, mockService);

    // Call processRequest with get operation
    const result = await processRequest({
      operation: "get",
      fileName: "files/test123",
    });

    // Verify the response contains inline data guidance
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    const response = JSON.parse(result.content[0].text);
    expect(response.message).toContain(
      "File operations are no longer supported"
    );
    expect(response.alternatives.get).toContain(
      "File retrieval is not available"
    );
  });

  it("should return guidance for delete operation", async () => {
    let processRequest: any;

    // Capture the processRequest function when tool is registered
    mockTool.mockImplementation(
      (name: string, desc: string, params: any, handler: any) => {
        processRequest = handler;
      }
    );

    // Register the tool
    geminiRemoteFilesTool(mockServer, mockService);

    // Call processRequest with delete operation
    const result = await processRequest({
      operation: "delete",
      fileName: "files/test123",
    });

    // Verify the response contains inline data guidance
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    const response = JSON.parse(result.content[0].text);
    expect(response.message).toContain(
      "File operations are no longer supported"
    );
    expect(response.alternatives.delete).toContain(
      "File deletion is not needed"
    );
  });

  it("should include examples in the guidance", async () => {
    let processRequest: any;

    // Capture the processRequest function when tool is registered
    mockTool.mockImplementation(
      (name: string, desc: string, params: any, handler: any) => {
        processRequest = handler;
      }
    );

    // Register the tool
    geminiRemoteFilesTool(mockServer, mockService);

    // Call processRequest with any operation
    const result = await processRequest({
      operation: "upload",
    });

    // Verify the response includes examples
    const response = JSON.parse(result.content[0].text);
    expect(response.examples).toBeDefined();
    expect(response.examples.imageContent).toBeDefined();
    expect(response.examples.textContent).toBeDefined();
    expect(response.examples.imageContent.tool).toBe(
      "gemini_generate_content_consolidated"
    );
  });

  it("should include limitations in the guidance", async () => {
    let processRequest: any;

    // Capture the processRequest function when tool is registered
    mockTool.mockImplementation(
      (name: string, desc: string, params: any, handler: any) => {
        processRequest = handler;
      }
    );

    // Register the tool
    geminiRemoteFilesTool(mockServer, mockService);

    // Call processRequest with any operation
    const result = await processRequest({
      operation: "upload",
    });

    // Verify the response includes limitations
    const response = JSON.parse(result.content[0].text);
    expect(response.limitations).toBeDefined();
    expect(Array.isArray(response.limitations)).toBe(true);
    expect(
      response.limitations.some((limit: string) =>
        limit.includes("Large files (>20MB) may exceed API limits")
      )
    ).toBe(true);
    expect(
      response.limitations.some((limit: string) =>
        limit.includes("Consider chunking large content")
      )
    ).toBe(true);
    expect(
      response.limitations.some((limit: string) =>
        limit.includes("Use the gemini_url_analysis tool")
      )
    ).toBe(true);
  });

  it("should handle errors gracefully", async () => {
    let processRequest: any;

    // Capture the processRequest function when tool is registered
    mockTool.mockImplementation(
      (name: string, desc: string, params: any, handler: any) => {
        processRequest = handler;
      }
    );

    // Register the tool
    geminiRemoteFilesTool(mockServer, mockService);

    // Mock an error scenario
    const originalStringify = JSON.stringify;
    JSON.stringify = vi.fn().mockImplementationOnce(() => {
      throw new Error("Test error");
    });

    // Expect the error to be mapped to MCP error
    await expect(processRequest({ operation: "upload" })).rejects.toThrow();

    // Restore JSON.stringify
    JSON.stringify = originalStringify;
  });
});
