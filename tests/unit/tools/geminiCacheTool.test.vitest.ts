// Using vitest globals - see vitest.config.ts globals: true
import { geminiCacheTool } from "../../../src/tools/geminiCacheTool.js";
import { GeminiApiError } from "../../../src/utils/errors.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GeminiService } from "../../../src/services/index.js";

describe("geminiCacheTool", () => {
  // Mock server and service instances
  const mockTool = vi.fn();
  const mockServer = {
    tool: mockTool,
  } as unknown as McpServer;

  // Create mock functions for the service methods
  const mockCreateCache = vi.fn();
  const mockListCaches = vi.fn();
  const mockGetCache = vi.fn();
  const mockUpdateCache = vi.fn();
  const mockDeleteCache = vi.fn();

  // Create a minimal mock service with just the necessary methods for testing
  const mockService = {
    createCache: mockCreateCache,
    listCaches: mockListCaches,
    getCache: mockGetCache,
    updateCache: mockUpdateCache,
    deleteCache: mockDeleteCache,
    // Add empty implementations for required GeminiService methods
    generateContent: () => Promise.resolve("mock"),
  } as unknown as GeminiService;

  // Reset mocks before each test
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should register the tool with the server", () => {
    // Call the tool registration function
    geminiCacheTool(mockServer, mockService);

    // Verify tool was registered
    expect(mockTool).toHaveBeenCalledTimes(1);
    const [name, description, params, handler] = mockTool.mock.calls[0];

    // Check tool registration parameters
    expect(name).toBe("gemini_cache");
    expect(description).toContain("Manages cached content resources");
    expect(params).toBeDefined();
    expect(typeof handler).toBe("function");
  });

  describe("create operation", () => {
    it("should create a cache successfully", async () => {
      // Register tool to get the request handler
      geminiCacheTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Mock successful response
      const mockCacheMetadata = {
        name: "cachedContents/abc123xyz",
        displayName: "Test Cache",
        model: "gemini-1.5-flash",
        createTime: "2024-01-01T00:00:00Z",
        updateTime: "2024-01-01T00:00:00Z",
        expirationTime: "2024-01-02T00:00:00Z",
        state: "ACTIVE",
        usageMetadata: {
          totalTokenCount: 1000,
        },
      };
      mockCreateCache.mockResolvedValueOnce(mockCacheMetadata);

      // Prepare test request
      const testRequest = {
        operation: "create",
        model: "gemini-1.5-flash",
        contents: [
          {
            role: "user",
            parts: [{ text: "This is cached content" }],
          },
        ],
        displayName: "Test Cache",
        ttl: "3600s",
      };

      // Call the handler
      const result = await handler(testRequest);

      // Verify the service method was called with correct parameters
      expect(mockCreateCache).toHaveBeenCalledWith(
        "gemini-1.5-flash",
        testRequest.contents,
        {
          displayName: "Test Cache",
          ttl: "3600s",
        }
      );

      // Verify the result
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify(mockCacheMetadata, null, 2),
          },
        ],
      });
    });

    it("should create cache with system instruction and tools", async () => {
      // Register tool to get the request handler
      geminiCacheTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Mock successful response
      const mockCacheMetadata = {
        name: "cachedContents/def456xyz",
        model: "gemini-1.5-pro",
        createTime: "2024-01-01T00:00:00Z",
        updateTime: "2024-01-01T00:00:00Z",
      };
      mockCreateCache.mockResolvedValueOnce(mockCacheMetadata);

      // Prepare test request with optional parameters
      const testRequest = {
        operation: "create",
        model: "gemini-1.5-pro",
        contents: [
          {
            role: "user",
            parts: [{ text: "Cached content" }],
          },
        ],
        systemInstruction: {
          role: "system",
          parts: [{ text: "You are a helpful assistant" }],
        },
        tools: [
          {
            functionDeclarations: [
              {
                name: "get_weather",
                description: "Get weather information",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    location: {
                      type: "STRING",
                      description: "The location",
                    },
                  },
                },
              },
            ],
          },
        ],
        toolConfig: {
          functionCallingConfig: {
            mode: "AUTO",
          },
        },
      };

      // Call the handler
      const result = await handler(testRequest);
      expect(result).toBeDefined();

      // Verify all parameters were passed
      expect(mockCreateCache).toHaveBeenCalledWith(
        "gemini-1.5-pro",
        testRequest.contents,
        expect.objectContaining({
          systemInstruction: testRequest.systemInstruction,
          tools: testRequest.tools,
          toolConfig: testRequest.toolConfig,
        })
      );
    });

    it("should throw error if contents is missing", async () => {
      // Register tool to get the request handler
      geminiCacheTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Prepare test request without contents
      const testRequest = {
        operation: "create",
        model: "gemini-1.5-flash",
      };

      // Call the handler and expect error
      await expect(handler(testRequest)).rejects.toThrow(
        "contents is required for operation 'create'"
      );
    });
  });

  describe("list operation", () => {
    it("should list caches successfully", async () => {
      // Register tool to get the request handler
      geminiCacheTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Mock successful response
      const mockListResult = {
        cachedContents: [
          {
            name: "cachedContents/cache1",
            displayName: "Cache 1",
            model: "gemini-1.5-flash",
            state: "ACTIVE",
          },
          {
            name: "cachedContents/cache2",
            displayName: "Cache 2",
            model: "gemini-1.5-pro",
            state: "ACTIVE",
          },
        ],
        nextPageToken: "token123",
      };
      mockListCaches.mockResolvedValueOnce(mockListResult);

      // Prepare test request
      const testRequest = {
        operation: "list",
        pageSize: 50,
        pageToken: "previousToken",
      };

      // Call the handler
      const result = await handler(testRequest);

      // Verify the service method was called
      expect(mockListCaches).toHaveBeenCalledWith(50, "previousToken");

      // Verify the result
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify(mockListResult, null, 2),
          },
        ],
      });
    });
  });

  describe("get operation", () => {
    it("should get cache metadata successfully", async () => {
      // Register tool to get the request handler
      geminiCacheTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Mock successful response
      const mockCacheMetadata = {
        name: "cachedContents/abc123xyz",
        displayName: "Test Cache",
        model: "gemini-1.5-flash",
        createTime: "2024-01-01T00:00:00Z",
        updateTime: "2024-01-01T00:00:00Z",
        expirationTime: "2024-01-02T00:00:00Z",
        state: "ACTIVE",
      };
      mockGetCache.mockResolvedValueOnce(mockCacheMetadata);

      // Prepare test request
      const testRequest = {
        operation: "get",
        cacheName: "cachedContents/abc123xyz",
      };

      // Call the handler
      const result = await handler(testRequest);

      // Verify the service method was called
      expect(mockGetCache).toHaveBeenCalledWith("cachedContents/abc123xyz");

      // Verify the result
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify(mockCacheMetadata, null, 2),
          },
        ],
      });
    });

    it("should throw error if cacheName is missing", async () => {
      // Register tool to get the request handler
      geminiCacheTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Prepare test request without cacheName
      const testRequest = {
        operation: "get",
      };

      // Call the handler and expect error
      await expect(handler(testRequest)).rejects.toThrow(
        "cacheName is required for operation 'get'"
      );
    });

    it("should throw error if cacheName format is invalid", async () => {
      // Register tool to get the request handler
      geminiCacheTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Prepare test request with invalid cacheName
      const testRequest = {
        operation: "get",
        cacheName: "invalid-format",
      };

      // Call the handler and expect error
      await expect(handler(testRequest)).rejects.toThrow(
        "cacheName must start with 'cachedContents/'"
      );
    });
  });

  describe("update operation", () => {
    it("should update cache with TTL successfully", async () => {
      // Register tool to get the request handler
      geminiCacheTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Mock successful response
      const mockUpdatedMetadata = {
        name: "cachedContents/abc123xyz",
        displayName: "Test Cache",
        model: "gemini-1.5-flash",
        updateTime: "2024-01-01T01:00:00Z",
        expirationTime: "2024-01-03T00:00:00Z",
      };
      mockUpdateCache.mockResolvedValueOnce(mockUpdatedMetadata);

      // Prepare test request
      const testRequest = {
        operation: "update",
        cacheName: "cachedContents/abc123xyz",
        ttl: "7200s",
      };

      // Call the handler
      const result = await handler(testRequest);

      // Verify the service method was called
      expect(mockUpdateCache).toHaveBeenCalledWith("cachedContents/abc123xyz", {
        ttl: "7200s",
      });

      // Verify the result
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify(mockUpdatedMetadata, null, 2),
          },
        ],
      });
    });

    it("should update cache with displayName successfully", async () => {
      // Register tool to get the request handler
      geminiCacheTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Mock successful response
      const mockUpdatedMetadata = {
        name: "cachedContents/abc123xyz",
        displayName: "Updated Cache Name",
        model: "gemini-1.5-flash",
        updateTime: "2024-01-01T01:00:00Z",
      };
      mockUpdateCache.mockResolvedValueOnce(mockUpdatedMetadata);

      // Prepare test request
      const testRequest = {
        operation: "update",
        cacheName: "cachedContents/abc123xyz",
        displayName: "Updated Cache Name",
      };

      // Call the handler
      const result = await handler(testRequest);
      expect(result).toBeDefined();

      // Verify the service method was called
      expect(mockUpdateCache).toHaveBeenCalledWith("cachedContents/abc123xyz", {
        displayName: "Updated Cache Name",
      });
    });

    it("should throw error if neither ttl nor displayName is provided", async () => {
      // Register tool to get the request handler
      geminiCacheTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Prepare test request without update fields
      const testRequest = {
        operation: "update",
        cacheName: "cachedContents/abc123xyz",
      };

      // Call the handler and expect error
      await expect(handler(testRequest)).rejects.toThrow(
        "At least one of 'ttl' or 'displayName' must be provided for update operation"
      );
    });
  });

  describe("delete operation", () => {
    it("should delete cache successfully", async () => {
      // Register tool to get the request handler
      geminiCacheTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Mock successful response
      mockDeleteCache.mockResolvedValueOnce({ success: true });

      // Prepare test request
      const testRequest = {
        operation: "delete",
        cacheName: "cachedContents/abc123xyz",
      };

      // Call the handler
      const result = await handler(testRequest);

      // Verify the service method was called
      expect(mockDeleteCache).toHaveBeenCalledWith("cachedContents/abc123xyz");

      // Verify the result
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: "Cache cachedContents/abc123xyz deleted successfully",
            }),
          },
        ],
      });
    });
  });

  describe("error handling", () => {
    it("should map GeminiApiError to McpError", async () => {
      // Register tool to get the request handler
      geminiCacheTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Mock service to throw GeminiApiError
      const geminiError = new GeminiApiError("API error occurred");
      mockListCaches.mockRejectedValueOnce(geminiError);

      // Prepare test request
      const testRequest = {
        operation: "list",
      };

      // Call the handler and expect McpError
      try {
        await handler(testRequest);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        expect((error as McpError).message).toContain("API error occurred");
      }
    });

    it("should handle invalid operation", async () => {
      // Register tool to get the request handler
      geminiCacheTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Prepare test request with invalid operation
      const testRequest = {
        operation: "invalid_operation",
      };

      // Call the handler and expect error
      await expect(handler(testRequest)).rejects.toThrow(
        "Invalid operation: invalid_operation"
      );
    });
  });
});
