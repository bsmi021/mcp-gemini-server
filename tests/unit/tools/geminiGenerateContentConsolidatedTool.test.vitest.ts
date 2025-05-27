// Using vitest globals - see vitest.config.ts globals: true
import { geminiGenerateContentConsolidatedTool } from "../../../src/tools/geminiGenerateContentConsolidatedTool.js";
import { GeminiApiError } from "../../../src/utils/errors.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GeminiService } from "../../../src/services/index.js";

describe("geminiGenerateContentConsolidatedTool", () => {
  // Mock server and service instances
  const mockTool = vi.fn();
  const mockServer = {
    tool: mockTool,
  } as unknown as McpServer;

  // Create mock functions for the service methods
  const mockGenerateContent = vi.fn();
  const mockGenerateContentStream = vi.fn();

  // Create a minimal mock service with just the necessary methods for testing
  const mockService = {
    generateContent: mockGenerateContent,
    generateContentStream: mockGenerateContentStream,
    // Add empty implementations for required GeminiService methods
  } as unknown as GeminiService;

  // Reset mocks before each test
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should register the tool with the server", () => {
    // Call the tool registration function
    geminiGenerateContentConsolidatedTool(mockServer, mockService);

    // Verify tool was registered
    expect(mockTool).toHaveBeenCalledTimes(1);
    const [name, description, params, handler] = mockTool.mock.calls[0];

    // Check tool registration parameters
    expect(name).toBe("gemini_generate_content");
    expect(description).toContain("Generates text content");
    expect(params).toBeDefined();
    expect(typeof handler).toBe("function");
  });

  it("should handle standard content generation", async () => {
    // Register tool to get the request handler
    geminiGenerateContentConsolidatedTool(mockServer, mockService);
    const [, , , handler] = mockTool.mock.calls[0];

    // Mock successful response
    const mockResponse = "This is a test response";
    mockGenerateContent.mockResolvedValueOnce(mockResponse);

    // Prepare test request
    const testRequest = {
      modelName: "gemini-1.5-flash",
      prompt: "What is the capital of France?",
      stream: false,
    };

    // Call the handler
    const result = await handler(testRequest);

    // Verify the service method was called with correct parameters
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        modelName: "gemini-1.5-flash",
        prompt: "What is the capital of France?",
      })
    );

    // Verify the result
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "This is a test response",
        },
      ],
    });
  });

  it("should handle streaming content generation", async () => {
    // Register tool to get the request handler
    geminiGenerateContentConsolidatedTool(mockServer, mockService);
    const [, , , handler] = mockTool.mock.calls[0];

    // Create an async generator mock for streaming
    async function* mockStreamGenerator() {
      yield "This is ";
      yield "a streaming ";
      yield "response";
    }
    mockGenerateContentStream.mockReturnValueOnce(mockStreamGenerator());

    // Prepare test request with streaming enabled
    const testRequest = {
      modelName: "gemini-1.5-flash",
      prompt: "Tell me a story",
      stream: true,
    };

    // Call the handler
    const result = await handler(testRequest);

    // Verify the streaming service method was called
    expect(mockGenerateContentStream).toHaveBeenCalledWith(
      expect.objectContaining({
        modelName: "gemini-1.5-flash",
        prompt: "Tell me a story",
      })
    );

    // Verify the result contains the concatenated stream
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "This is a streaming response",
        },
      ],
    });
  });

  it("should handle function calling with function declarations", async () => {
    // Register tool to get the request handler
    geminiGenerateContentConsolidatedTool(mockServer, mockService);
    const [, , , handler] = mockTool.mock.calls[0];

    // Mock function call response
    const mockFunctionCallResponse = {
      functionCall: {
        name: "get_weather",
        args: { location: "Paris" },
      },
    };
    mockGenerateContent.mockResolvedValueOnce(mockFunctionCallResponse);

    // Prepare test request with function declarations
    const testRequest = {
      modelName: "gemini-1.5-flash",
      prompt: "What's the weather in Paris?",
      stream: false,
      functionDeclarations: [
        {
          name: "get_weather",
          description: "Get the weather for a location",
          parameters: {
            type: "OBJECT" as const,
            properties: {
              location: {
                type: "STRING" as const,
                description: "The location to get weather for",
              },
            },
            required: ["location"],
          },
        },
      ],
    };

    // Call the handler
    const result = await handler(testRequest);

    // Verify the service method was called with function declarations
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        modelName: "gemini-1.5-flash",
        prompt: "What's the weather in Paris?",
        functionDeclarations: expect.arrayContaining([
          expect.objectContaining({
            name: "get_weather",
          }),
        ]),
      })
    );

    // Verify the result contains the serialized function call
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            name: "get_weather",
            args: { location: "Paris" },
          }),
        },
      ],
    });
  });

  it("should handle optional parameters", async () => {
    // Register tool to get the request handler
    geminiGenerateContentConsolidatedTool(mockServer, mockService);
    const [, , , handler] = mockTool.mock.calls[0];

    // Mock successful response
    const mockResponse = "Generated with parameters";
    mockGenerateContent.mockResolvedValueOnce(mockResponse);

    // Prepare test request with all optional parameters
    const testRequest = {
      modelName: "gemini-1.5-pro",
      prompt: "Generate creative content",
      stream: false,
      generationConfig: {
        temperature: 0.8,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024,
        stopSequences: ["END"],
        thinkingConfig: {
          thinkingBudget: 8192,
          reasoningEffort: "medium",
        },
      },
      safetySettings: [
        {
          category: "HARM_CATEGORY_HATE_SPEECH",
          threshold: "BLOCK_MEDIUM_AND_ABOVE",
        },
      ],
      systemInstruction: "You are a helpful assistant",
      cachedContentName: "cachedContents/12345",
      urlContext: {
        urls: ["https://example.com"],
        fetchOptions: {
          maxContentKb: 100,
          timeoutMs: 10000,
        },
      },
      modelPreferences: {
        preferQuality: true,
        preferSpeed: false,
        taskType: "creative_writing",
      },
    };

    // Call the handler
    const result = await handler(testRequest);

    // Verify all parameters were passed to the service
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        modelName: "gemini-1.5-pro",
        prompt: "Generate creative content",
        generationConfig: expect.objectContaining({
          temperature: 0.8,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
        }),
        systemInstruction: "You are a helpful assistant",
        cachedContentName: "cachedContents/12345",
        urlContext: expect.objectContaining({
          urls: ["https://example.com"],
        }),
      })
    );

    // Verify the result
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "Generated with parameters",
        },
      ],
    });
  });

  it("should handle errors and map them to MCP errors", async () => {
    // Register tool to get the request handler
    geminiGenerateContentConsolidatedTool(mockServer, mockService);
    const [, , , handler] = mockTool.mock.calls[0];

    // Mock an API error
    const apiError = new GeminiApiError("API rate limit exceeded", {
      statusCode: 429,
      statusText: "Too Many Requests",
    });
    mockGenerateContent.mockRejectedValueOnce(apiError);

    // Prepare test request
    const testRequest = {
      modelName: "gemini-1.5-flash",
      prompt: "Test error handling",
      stream: false,
    };

    // Call the handler and expect it to throw
    await expect(handler(testRequest)).rejects.toThrow(McpError);
  });

  it("should handle URL context metrics calculation", async () => {
    // Register tool to get the request handler
    geminiGenerateContentConsolidatedTool(mockServer, mockService);
    const [, , , handler] = mockTool.mock.calls[0];

    // Mock successful response
    mockGenerateContent.mockResolvedValueOnce("Response with URL context");

    // Prepare test request with URL context
    const testRequest = {
      modelName: "gemini-1.5-flash",
      prompt: "Analyze these URLs",
      stream: false,
      urlContext: {
        urls: [
          "https://example1.com",
          "https://example2.com",
          "https://example3.com",
        ],
        fetchOptions: {
          maxContentKb: 200,
        },
      },
    };

    // Call the handler
    await handler(testRequest);

    // Verify URL metrics were calculated and passed
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        urlCount: 3,
        estimatedUrlContentSize: 3 * 200 * 1024, // 3 URLs * 200KB * 1024 bytes/KB
      })
    );
  });
  it("should handle function call response with text fallback", async () => {
    // Register tool to get the request handler
    geminiGenerateContentConsolidatedTool(mockServer, mockService);
    const [, , , handler] = mockTool.mock.calls[0];

    // Mock function call response with text fallback
    const mockFunctionCallResponse = {
      functionCall: {
        name: "get_weather",
        args: { location: "Paris" },
      },
      text: "I'll get the weather for Paris.",
    };
    mockGenerateContent.mockResolvedValueOnce(mockFunctionCallResponse);

    // Prepare test request with function declarations
    const testRequest = {
      modelName: "gemini-1.5-flash",
      prompt: "What's the weather in Paris?",
      stream: false,
      functionDeclarations: [
        {
          name: "get_weather",
          description: "Get the weather for a location",
          parameters: {
            type: "OBJECT" as const,
            properties: {
              location: {
                type: "STRING" as const,
                description: "The location to get weather for",
              },
            },
            required: ["location"],
          },
        },
      ],
    };

    // Call the handler
    const result = await handler(testRequest);

    // Verify the result contains the serialized function call (not the text)
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            name: "get_weather",
            args: { location: "Paris" },
          }),
        },
      ],
    });
  });

  it("should handle function call response with only text", async () => {
    // Register tool to get the request handler
    geminiGenerateContentConsolidatedTool(mockServer, mockService);
    const [, , , handler] = mockTool.mock.calls[0];

    // Mock response with only text (no function call)
    const mockTextResponse = {
      text: "The weather in Paris is sunny and 22°C.",
    };
    mockGenerateContent.mockResolvedValueOnce(mockTextResponse);

    // Prepare test request with function declarations
    const testRequest = {
      modelName: "gemini-1.5-flash",
      prompt: "What's the weather in Paris?",
      stream: false,
      functionDeclarations: [
        {
          name: "get_weather",
          description: "Get the weather for a location",
          parameters: {
            type: "OBJECT" as const,
            properties: {
              location: {
                type: "STRING" as const,
                description: "The location to get weather for",
              },
            },
            required: ["location"],
          },
        },
      ],
    };

    // Call the handler
    const result = await handler(testRequest);

    // Verify the result contains the text response
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "The weather in Paris is sunny and 22°C.",
        },
      ],
    });
  });

  it("should handle toolConfig parameter", async () => {
    // Register tool to get the request handler
    geminiGenerateContentConsolidatedTool(mockServer, mockService);
    const [, , , handler] = mockTool.mock.calls[0];

    // Mock successful response
    const mockResponse = "Response with tool config";
    mockGenerateContent.mockResolvedValueOnce(mockResponse);

    // Prepare test request with toolConfig
    const testRequest = {
      modelName: "gemini-1.5-flash",
      prompt: "Test with tool config",
      stream: false,
      functionDeclarations: [
        {
          name: "test_function",
          description: "A test function",
          parameters: {
            type: "OBJECT" as const,
            properties: {
              param: {
                type: "STRING" as const,
                description: "A test parameter",
              },
            },
            required: ["param"],
          },
        },
      ],
      toolConfig: {
        functionCallingConfig: {
          mode: "AUTO",
          allowedFunctionNames: ["test_function"],
        },
      },
    };

    // Call the handler
    await handler(testRequest);

    // Verify toolConfig was passed to the service
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        toolConfig: {
          functionCallingConfig: {
            mode: "AUTO",
            allowedFunctionNames: ["test_function"],
          },
        },
      })
    );
  });

  it("should handle thinking configuration parameters", async () => {
    // Register tool to get the request handler
    geminiGenerateContentConsolidatedTool(mockServer, mockService);
    const [, , , handler] = mockTool.mock.calls[0];

    // Mock successful response
    const mockResponse = "Response with thinking config";
    mockGenerateContent.mockResolvedValueOnce(mockResponse);

    // Prepare test request with thinking configuration
    const testRequest = {
      modelName: "gemini-1.5-flash",
      prompt: "Complex reasoning task",
      stream: false,
      generationConfig: {
        temperature: 0.7,
        thinkingConfig: {
          thinkingBudget: 16384,
          reasoningEffort: "high",
        },
      },
    };

    // Call the handler
    await handler(testRequest);

    // Verify thinking config was passed to the service
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        generationConfig: expect.objectContaining({
          thinkingConfig: {
            thinkingBudget: 16384,
            reasoningEffort: "high",
          },
        }),
      })
    );
  });

  it("should handle model preferences for task optimization", async () => {
    // Register tool to get the request handler
    geminiGenerateContentConsolidatedTool(mockServer, mockService);
    const [, , , handler] = mockTool.mock.calls[0];

    // Mock successful response
    const mockResponse = "Optimized response";
    mockGenerateContent.mockResolvedValueOnce(mockResponse);

    // Prepare test request with comprehensive model preferences
    const testRequest = {
      modelName: "gemini-1.5-flash",
      prompt: "Generate creative content",
      stream: false,
      modelPreferences: {
        preferQuality: true,
        preferSpeed: false,
        preferCost: false,
        complexityHint: "high",
        taskType: "creative_writing",
      },
    };

    // Call the handler
    await handler(testRequest);

    // Verify model preferences were passed to the service
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        preferQuality: true,
        preferSpeed: false,
        preferCost: false,
        complexityHint: "high",
        taskType: "creative_writing",
      })
    );
  });

  it("should handle comprehensive safety settings", async () => {
    // Register tool to get the request handler
    geminiGenerateContentConsolidatedTool(mockServer, mockService);
    const [, , , handler] = mockTool.mock.calls[0];

    // Mock successful response
    const mockResponse = "Safe response";
    mockGenerateContent.mockResolvedValueOnce(mockResponse);

    // Prepare test request with comprehensive safety settings
    const testRequest = {
      modelName: "gemini-1.5-flash",
      prompt: "Generate content with safety controls",
      stream: false,
      safetySettings: [
        {
          category: "HARM_CATEGORY_HATE_SPEECH",
          threshold: "BLOCK_MEDIUM_AND_ABOVE",
        },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: "BLOCK_LOW_AND_ABOVE",
        },
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_ONLY_HIGH",
        },
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_NONE",
        },
      ],
    };

    // Call the handler
    await handler(testRequest);

    // Verify safety settings were properly mapped and passed
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        safetySettings: [
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_MEDIUM_AND_ABOVE",
          },
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_LOW_AND_ABOVE",
          },
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_ONLY_HIGH",
          },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_NONE",
          },
        ],
      })
    );
  });

  it("should handle URL context with comprehensive fetch options", async () => {
    // Register tool to get the request handler
    geminiGenerateContentConsolidatedTool(mockServer, mockService);
    const [, , , handler] = mockTool.mock.calls[0];

    // Mock successful response
    mockGenerateContent.mockResolvedValueOnce("Response with URL context");

    // Prepare test request with comprehensive URL context options
    const testRequest = {
      modelName: "gemini-1.5-flash",
      prompt: "Analyze these web pages",
      stream: false,
      urlContext: {
        urls: ["https://example1.com/article", "https://example2.com/blog"],
        fetchOptions: {
          maxContentKb: 150,
          timeoutMs: 15000,
          includeMetadata: true,
          convertToMarkdown: true,
          allowedDomains: ["example1.com", "example2.com"],
          userAgent: "Custom-Agent/1.0",
        },
      },
    };

    // Call the handler
    await handler(testRequest);

    // Verify URL context was passed with all options
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        urlContext: {
          urls: ["https://example1.com/article", "https://example2.com/blog"],
          fetchOptions: {
            maxContentKb: 150,
            timeoutMs: 15000,
            includeMetadata: true,
            convertToMarkdown: true,
            allowedDomains: ["example1.com", "example2.com"],
            userAgent: "Custom-Agent/1.0",
          },
        },
        urlCount: 2,
        estimatedUrlContentSize: 2 * 150 * 1024, // 2 URLs * 150KB * 1024 bytes/KB
      })
    );
  });

  it("should handle URL context with default fetch options", async () => {
    // Register tool to get the request handler
    geminiGenerateContentConsolidatedTool(mockServer, mockService);
    const [, , , handler] = mockTool.mock.calls[0];

    // Mock successful response
    mockGenerateContent.mockResolvedValueOnce(
      "Response with default URL context"
    );

    // Prepare test request with minimal URL context (using defaults)
    const testRequest = {
      modelName: "gemini-1.5-flash",
      prompt: "Analyze this web page",
      stream: false,
      urlContext: {
        urls: ["https://example.com"],
      },
    };

    // Call the handler
    await handler(testRequest);

    // Verify URL context was passed with default maxContentKb
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        urlContext: {
          urls: ["https://example.com"],
        },
        urlCount: 1,
        estimatedUrlContentSize: 1 * 100 * 1024, // 1 URL * 100KB default * 1024 bytes/KB
      })
    );
  });

  it("should handle unexpected response structure from service", async () => {
    // Register tool to get the request handler
    geminiGenerateContentConsolidatedTool(mockServer, mockService);
    const [, , , handler] = mockTool.mock.calls[0];

    // Mock unexpected response structure
    const unexpectedResponse = { unexpected: "structure" };
    mockGenerateContent.mockResolvedValueOnce(unexpectedResponse);

    // Prepare test request
    const testRequest = {
      modelName: "gemini-1.5-flash",
      prompt: "Test unexpected response",
      stream: false,
    };

    // Call the handler and expect it to throw
    await expect(handler(testRequest)).rejects.toThrow(
      "Invalid response structure received from Gemini service."
    );
  });

  it("should handle streaming with empty chunks gracefully", async () => {
    // Register tool to get the request handler
    geminiGenerateContentConsolidatedTool(mockServer, mockService);
    const [, , , handler] = mockTool.mock.calls[0];

    // Create an async generator mock with empty chunks
    async function* mockStreamGenerator() {
      yield "Start ";
      yield ""; // Empty chunk
      yield "middle ";
      yield ""; // Another empty chunk
      yield "end";
    }
    mockGenerateContentStream.mockReturnValueOnce(mockStreamGenerator());

    // Prepare test request with streaming enabled
    const testRequest = {
      modelName: "gemini-1.5-flash",
      prompt: "Stream with empty chunks",
      stream: true,
    };

    // Call the handler
    const result = await handler(testRequest);

    // Verify the result contains the concatenated stream (empty chunks should be included)
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "Start middle end",
        },
      ],
    });
  });

  it("should handle complex generation config with all parameters", async () => {
    // Register tool to get the request handler
    geminiGenerateContentConsolidatedTool(mockServer, mockService);
    const [, , , handler] = mockTool.mock.calls[0];

    // Mock successful response
    const mockResponse = "Complex config response";
    mockGenerateContent.mockResolvedValueOnce(mockResponse);

    // Prepare test request with all generation config parameters
    const testRequest = {
      modelName: "gemini-1.5-pro",
      prompt: "Complex generation task",
      stream: false,
      generationConfig: {
        temperature: 0.9,
        topP: 0.8,
        topK: 50,
        maxOutputTokens: 2048,
        stopSequences: ["STOP", "END", "FINISH"],
        thinkingConfig: {
          thinkingBudget: 12288,
          reasoningEffort: "medium",
        },
      },
    };

    // Call the handler
    await handler(testRequest);

    // Verify all generation config parameters were passed
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        generationConfig: {
          temperature: 0.9,
          topP: 0.8,
          topK: 50,
          maxOutputTokens: 2048,
          stopSequences: ["STOP", "END", "FINISH"],
          thinkingConfig: {
            thinkingBudget: 12288,
            reasoningEffort: "medium",
          },
        },
      })
    );
  });

  it("should handle cached content parameter", async () => {
    // Register tool to get the request handler
    geminiGenerateContentConsolidatedTool(mockServer, mockService);
    const [, , , handler] = mockTool.mock.calls[0];

    // Mock successful response
    const mockResponse = "Response using cached content";
    mockGenerateContent.mockResolvedValueOnce(mockResponse);

    // Prepare test request with cached content
    const testRequest = {
      modelName: "gemini-1.5-flash",
      prompt: "Use cached context for this request",
      stream: false,
      cachedContentName: "cachedContents/abc123def456",
    };

    // Call the handler
    await handler(testRequest);

    // Verify cached content name was passed
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        cachedContentName: "cachedContents/abc123def456",
      })
    );
  });

  it("should handle system instruction parameter", async () => {
    // Register tool to get the request handler
    geminiGenerateContentConsolidatedTool(mockServer, mockService);
    const [, , , handler] = mockTool.mock.calls[0];

    // Mock successful response
    const mockResponse = "Response following system instruction";
    mockGenerateContent.mockResolvedValueOnce(mockResponse);

    // Prepare test request with system instruction
    const testRequest = {
      modelName: "gemini-1.5-flash",
      prompt: "Generate a response",
      stream: false,
      systemInstruction:
        "You are a helpful assistant that always responds in a friendly tone.",
    };

    // Call the handler
    await handler(testRequest);

    // Verify system instruction was passed
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        systemInstruction:
          "You are a helpful assistant that always responds in a friendly tone.",
      })
    );
  });

  it("should handle streaming errors gracefully", async () => {
    // Register tool to get the request handler
    geminiGenerateContentConsolidatedTool(mockServer, mockService);
    const [, , , handler] = mockTool.mock.calls[0];

    // Create an async generator that throws an error
    async function* mockStreamGeneratorWithError() {
      yield "Start ";
      throw new Error("Streaming error occurred");
    }
    mockGenerateContentStream.mockReturnValueOnce(
      mockStreamGeneratorWithError()
    );

    // Prepare test request with streaming enabled
    const testRequest = {
      modelName: "gemini-1.5-flash",
      prompt: "Stream that will error",
      stream: true,
    };

    // Call the handler and expect it to throw
    await expect(handler(testRequest)).rejects.toThrow();
  });

  it("should handle function declarations with complex parameter schemas", async () => {
    // Register tool to get the request handler
    geminiGenerateContentConsolidatedTool(mockServer, mockService);
    const [, , , handler] = mockTool.mock.calls[0];

    // Mock function call response
    const mockFunctionCallResponse = {
      functionCall: {
        name: "complex_function",
        args: {
          user: { name: "John", age: 30 },
          preferences: ["option1", "option2"],
          settings: { theme: "dark", notifications: true },
        },
      },
    };
    mockGenerateContent.mockResolvedValueOnce(mockFunctionCallResponse);

    // Prepare test request with complex function declarations
    const testRequest = {
      modelName: "gemini-1.5-flash",
      prompt: "Call a complex function",
      stream: false,
      functionDeclarations: [
        {
          name: "complex_function",
          description: "A function with complex nested parameters",
          parameters: {
            type: "OBJECT" as const,
            properties: {
              user: {
                type: "OBJECT" as const,
                properties: {
                  name: {
                    type: "STRING" as const,
                    description: "User's name",
                  },
                  age: {
                    type: "INTEGER" as const,
                    description: "User's age",
                  },
                },
                required: ["name", "age"],
              },
              preferences: {
                type: "ARRAY" as const,
                items: {
                  type: "STRING" as const,
                  description: "User preference",
                },
                description: "List of user preferences",
              },
              settings: {
                type: "OBJECT" as const,
                properties: {
                  theme: {
                    type: "STRING" as const,
                    enum: ["light", "dark"],
                    description: "UI theme preference",
                  },
                  notifications: {
                    type: "BOOLEAN" as const,
                    description: "Enable notifications",
                  },
                },
              },
            },
            required: ["user"],
          },
        },
      ],
    };

    // Call the handler
    const result = await handler(testRequest);

    // Verify the service was called with complex function declarations
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        functionDeclarations: expect.arrayContaining([
          expect.objectContaining({
            name: "complex_function",
            parameters: expect.objectContaining({
              type: "OBJECT",
              properties: expect.objectContaining({
                user: expect.objectContaining({
                  type: "OBJECT",
                  properties: expect.any(Object),
                }),
                preferences: expect.objectContaining({
                  type: "ARRAY",
                }),
                settings: expect.objectContaining({
                  type: "OBJECT",
                }),
              }),
            }),
          }),
        ]),
      })
    );

    // Verify the result contains the serialized function call
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            name: "complex_function",
            args: {
              user: { name: "John", age: 30 },
              preferences: ["option1", "option2"],
              settings: { theme: "dark", notifications: true },
            },
          }),
        },
      ],
    });
  });
});
