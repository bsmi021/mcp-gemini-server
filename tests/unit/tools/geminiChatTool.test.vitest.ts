// Using vitest globals - see vitest.config.ts globals: true
import { geminiChatTool } from "../../../src/tools/geminiChatTool.js";
import { GeminiApiError } from "../../../src/utils/errors.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GeminiService } from "../../../src/services/index.js";
import { BlockedReason, FinishReason } from "@google/genai";

describe("geminiChatTool", () => {
  // Mock server and service instances
  const mockTool = vi.fn();
  const mockServer = {
    tool: mockTool,
  } as unknown as McpServer;

  // Create mock functions for the service methods
  const mockStartChatSession = vi.fn();
  const mockSendMessageToSession = vi.fn();
  const mockSendFunctionResultToSession = vi.fn();

  // Create a minimal mock service with just the necessary methods for testing
  const mockService = {
    startChatSession: mockStartChatSession,
    sendMessageToSession: mockSendMessageToSession,
    sendFunctionResultToSession: mockSendFunctionResultToSession,
    // Add empty implementations for required GeminiService methods
    generateContent: () => Promise.resolve("mock"),
  } as unknown as GeminiService;

  // Reset mocks before each test
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should register the tool with the server", () => {
    // Call the tool registration function
    geminiChatTool(mockServer, mockService);

    // Verify tool was registered
    expect(mockTool).toHaveBeenCalledTimes(1);
    const [name, description, params, handler] = mockTool.mock.calls[0];

    // Check tool registration parameters
    expect(name).toBe("gemini_chat");
    expect(description).toContain("Manages stateful chat sessions");
    expect(params).toBeDefined();
    expect(typeof handler).toBe("function");
  });

  describe("start operation", () => {
    it("should start a new chat session", async () => {
      // Register tool to get the request handler
      geminiChatTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Mock successful response
      const mockSessionId = "test-session-123";
      mockStartChatSession.mockReturnValueOnce(mockSessionId);

      // Prepare test request
      const testRequest = {
        operation: "start",
        modelName: "gemini-1.5-flash",
        history: [
          {
            role: "user",
            parts: [{ text: "Hello" }],
          },
          {
            role: "model",
            parts: [{ text: "Hi there!" }],
          },
        ],
      };

      // Call the handler
      const result = await handler(testRequest);

      // Verify the service method was called with correct parameters
      expect(mockStartChatSession).toHaveBeenCalledWith(
        expect.objectContaining({
          modelName: "gemini-1.5-flash",
          history: testRequest.history,
        })
      );

      // Verify the result
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify({ sessionId: mockSessionId }),
          },
        ],
      });
    });

    it("should start chat session with optional parameters", async () => {
      // Register tool to get the request handler
      geminiChatTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Mock successful response
      const mockSessionId = "test-session-456";
      mockStartChatSession.mockReturnValueOnce(mockSessionId);

      // Prepare test request with optional parameters
      const testRequest = {
        operation: "start",
        modelName: "gemini-2.0-flash",
        systemInstruction: {
          parts: [{ text: "You are a helpful assistant" }],
        },
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1000,
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_MEDIUM_AND_ABOVE",
          },
        ],
        cachedContentName: "cachedContents/abc123",
      };

      // Call the handler
      const result = await handler(testRequest);

      // Verify all parameters were passed
      expect(mockStartChatSession).toHaveBeenCalledWith(
        expect.objectContaining({
          modelName: "gemini-2.0-flash",
          systemInstruction: testRequest.systemInstruction,
          generationConfig: testRequest.generationConfig,
          safetySettings: testRequest.safetySettings,
          cachedContentName: "cachedContents/abc123",
        })
      );

      // Verify the result
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify({ sessionId: mockSessionId }),
          },
        ],
      });
    });
  });

  describe("send_message operation", () => {
    it("should send a message to an existing session", async () => {
      // Register tool to get the request handler
      geminiChatTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Mock successful response
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: "The capital of France is Paris." }],
            },
            finishReason: FinishReason.STOP,
          },
        ],
      };
      mockSendMessageToSession.mockResolvedValueOnce(mockResponse);

      // Prepare test request
      const testRequest = {
        operation: "send_message",
        sessionId: "test-session-123",
        message: "What is the capital of France?",
      };

      // Call the handler
      const result = await handler(testRequest);

      // Verify the service method was called
      expect(mockSendMessageToSession).toHaveBeenCalledWith({
        sessionId: "test-session-123",
        message: "What is the capital of France?",
        generationConfig: undefined,
        safetySettings: undefined,
        tools: undefined,
        toolConfig: undefined,
        cachedContentName: undefined,
      });

      // Verify the result
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: "The capital of France is Paris.",
          },
        ],
      });
    });

    it("should handle function call responses", async () => {
      // Register tool to get the request handler
      geminiChatTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Mock function call response
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: "get_weather",
                    args: { location: "Paris" },
                  },
                },
              ],
            },
            finishReason: FinishReason.STOP,
          },
        ],
      };
      mockSendMessageToSession.mockResolvedValueOnce(mockResponse);

      // Prepare test request
      const testRequest = {
        operation: "send_message",
        sessionId: "test-session-123",
        message: "What's the weather in Paris?",
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
      };

      // Call the handler
      const result = await handler(testRequest);

      // Verify the result contains function call
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              functionCall: {
                name: "get_weather",
                args: { location: "Paris" },
              },
            }),
          },
        ],
      });
    });

    it("should handle safety blocked responses", async () => {
      // Register tool to get the request handler
      geminiChatTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Mock safety blocked response
      const mockResponse = {
        promptFeedback: {
          blockReason: BlockedReason.SAFETY,
        },
      };
      mockSendMessageToSession.mockResolvedValueOnce(mockResponse);

      // Prepare test request
      const testRequest = {
        operation: "send_message",
        sessionId: "test-session-123",
        message: "Test message",
      };

      // Call the handler
      const result = await handler(testRequest);

      // Verify error response
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: "Error: Prompt blocked due to safety settings . Reason: SAFETY",
          },
        ],
        isError: true,
      });
    });

    it("should throw error if sessionId is missing", async () => {
      // Register tool to get the request handler
      geminiChatTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Prepare test request without sessionId
      const testRequest = {
        operation: "send_message",
        message: "Test message",
      };

      // Call the handler and expect error
      await expect(handler(testRequest)).rejects.toThrow(
        "sessionId is required for operation 'send_message'"
      );
    });

    it("should throw error if message is missing", async () => {
      // Register tool to get the request handler
      geminiChatTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Prepare test request without message
      const testRequest = {
        operation: "send_message",
        sessionId: "test-session-123",
      };

      // Call the handler and expect error
      await expect(handler(testRequest)).rejects.toThrow(
        "message is required for operation 'send_message'"
      );
    });
  });

  describe("send_function_result operation", () => {
    it("should send function results to session", async () => {
      // Register tool to get the request handler
      geminiChatTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Mock successful response
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: "The weather in Paris is sunny and 22°C." }],
            },
            finishReason: FinishReason.STOP,
          },
        ],
      };
      mockSendFunctionResultToSession.mockResolvedValueOnce(mockResponse);

      // Prepare test request
      const testRequest = {
        operation: "send_function_result",
        sessionId: "test-session-123",
        functionResponses: [
          {
            name: "get_weather",
            response: {
              temperature: 22,
              condition: "sunny",
              location: "Paris",
            },
          },
        ],
      };

      // Call the handler
      const result = await handler(testRequest);

      // Verify the service method was called
      expect(mockSendFunctionResultToSession).toHaveBeenCalledWith({
        sessionId: "test-session-123",
        functionResponse: JSON.stringify(testRequest.functionResponses),
        functionCall: undefined,
      });

      // Verify the result
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: "The weather in Paris is sunny and 22°C.",
          },
        ],
      });
    });

    it("should handle empty candidates", async () => {
      // Register tool to get the request handler
      geminiChatTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Mock response with no candidates
      const mockResponse = {
        candidates: [],
      };
      mockSendFunctionResultToSession.mockResolvedValueOnce(mockResponse);

      // Prepare test request
      const testRequest = {
        operation: "send_function_result",
        sessionId: "test-session-123",
        functionResponses: [
          {
            name: "test_function",
            response: { result: "test" },
          },
        ],
      };

      // Call the handler
      const result = await handler(testRequest);

      // Verify error response
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: "Error: No response candidates returned by the model after function result.",
          },
        ],
        isError: true,
      });
    });

    it("should throw error if sessionId is missing", async () => {
      // Register tool to get the request handler
      geminiChatTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Prepare test request without sessionId
      const testRequest = {
        operation: "send_function_result",
        functionResponses: [
          {
            name: "test_function",
            response: { result: "test" },
          },
        ],
      };

      // Call the handler and expect error
      await expect(handler(testRequest)).rejects.toThrow(
        "sessionId is required for operation 'send_function_result'"
      );
    });

    it("should throw error if functionResponses is missing", async () => {
      // Register tool to get the request handler
      geminiChatTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Prepare test request without functionResponses
      const testRequest = {
        operation: "send_function_result",
        sessionId: "test-session-123",
      };

      // Call the handler and expect error
      await expect(handler(testRequest)).rejects.toThrow(
        "functionResponses is required for operation 'send_function_result'"
      );
    });
  });

  describe("error handling", () => {
    it("should map GeminiApiError to McpError", async () => {
      // Register tool to get the request handler
      geminiChatTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Mock service to throw GeminiApiError
      const geminiError = new GeminiApiError("API error occurred");
      mockStartChatSession.mockImplementationOnce(() => {
        throw geminiError;
      });

      // Prepare test request
      const testRequest = {
        operation: "start",
        modelName: "gemini-1.5-flash",
      };

      // Call the handler and expect McpError
      await expect(handler(testRequest)).rejects.toThrow();

      // Verify the error was caught and mapped
      try {
        await handler(testRequest);
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        expect((error as McpError).message).toContain("API error occurred");
      }
    });

    it("should handle invalid operation", async () => {
      // Register tool to get the request handler
      geminiChatTool(mockServer, mockService);
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

  describe("response processing edge cases", () => {
    it("should handle candidate with SAFETY finish reason", async () => {
      // Register tool to get the request handler
      geminiChatTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Mock response with SAFETY finish reason
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: "Partial response..." }],
            },
            finishReason: FinishReason.SAFETY,
          },
        ],
      };
      mockSendMessageToSession.mockResolvedValueOnce(mockResponse);

      // Prepare test request
      const testRequest = {
        operation: "send_message",
        sessionId: "test-session-123",
        message: "Test message",
      };

      // Call the handler
      const result = await handler(testRequest);

      // Verify error response for SAFETY finish reason
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: "Error: Response generation stopped due to safety settings . FinishReason: SAFETY",
          },
        ],
        isError: true,
      });
    });

    it("should handle candidate with MAX_TOKENS finish reason", async () => {
      // Register tool to get the request handler
      geminiChatTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Mock response with MAX_TOKENS finish reason
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: "Response cut off due to token limit..." }],
            },
            finishReason: FinishReason.MAX_TOKENS,
          },
        ],
      };
      mockSendMessageToSession.mockResolvedValueOnce(mockResponse);

      // Prepare test request
      const testRequest = {
        operation: "send_message",
        sessionId: "test-session-123",
        message: "Test message",
      };

      // Call the handler
      const result = await handler(testRequest);

      // Verify successful response even with MAX_TOKENS (this is acceptable)
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: "Response cut off due to token limit...",
          },
        ],
      });
    });

    it("should handle candidate with OTHER finish reason", async () => {
      // Register tool to get the request handler
      geminiChatTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Mock response with OTHER finish reason
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: "Some response..." }],
            },
            finishReason: FinishReason.OTHER,
          },
        ],
      };
      mockSendMessageToSession.mockResolvedValueOnce(mockResponse);

      // Prepare test request
      const testRequest = {
        operation: "send_message",
        sessionId: "test-session-123",
        message: "Test message",
      };

      // Call the handler
      const result = await handler(testRequest);

      // Verify response is still returned but with warning logged
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: "Some response...",
          },
        ],
      });
    });

    it("should handle empty content parts", async () => {
      // Register tool to get the request handler
      geminiChatTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Mock response with empty content parts
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [],
            },
            finishReason: FinishReason.STOP,
          },
        ],
      };
      mockSendMessageToSession.mockResolvedValueOnce(mockResponse);

      // Prepare test request
      const testRequest = {
        operation: "send_message",
        sessionId: "test-session-123",
        message: "Test message",
      };

      // Call the handler
      const result = await handler(testRequest);

      // Verify error response for empty content
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: "Error: Empty response from the model .",
          },
        ],
        isError: true,
      });
    });

    it("should handle missing content in candidate", async () => {
      // Register tool to get the request handler
      geminiChatTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Mock response with missing content
      const mockResponse = {
        candidates: [
          {
            finishReason: FinishReason.STOP,
          },
        ],
      };
      mockSendMessageToSession.mockResolvedValueOnce(mockResponse);

      // Prepare test request
      const testRequest = {
        operation: "send_message",
        sessionId: "test-session-123",
        message: "Test message",
      };

      // Call the handler
      const result = await handler(testRequest);

      // Verify error response for missing content
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: "Error: Empty response from the model .",
          },
        ],
        isError: true,
      });
    });

    it("should handle mixed content parts (text and function call)", async () => {
      // Register tool to get the request handler
      geminiChatTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Mock response with both text and function call
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                { text: "I'll help you with that. " },
                {
                  functionCall: {
                    name: "get_weather",
                    args: { location: "Paris" },
                  },
                },
                { text: " Let me check the weather for you." },
              ],
            },
            finishReason: FinishReason.STOP,
          },
        ],
      };
      mockSendMessageToSession.mockResolvedValueOnce(mockResponse);

      // Prepare test request
      const testRequest = {
        operation: "send_message",
        sessionId: "test-session-123",
        message: "What's the weather in Paris?",
      };

      // Call the handler
      const result = await handler(testRequest);

      // Verify function call is returned (function call takes precedence)
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              functionCall: {
                name: "get_weather",
                args: { location: "Paris" },
              },
            }),
          },
        ],
      });
    });

    it("should handle unexpected response structure", async () => {
      // Register tool to get the request handler
      geminiChatTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Mock response with unexpected structure (no text or function call)
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [{ someOtherField: "unexpected data" }],
            },
            finishReason: FinishReason.STOP,
          },
        ],
      };
      mockSendMessageToSession.mockResolvedValueOnce(mockResponse);

      // Prepare test request
      const testRequest = {
        operation: "send_message",
        sessionId: "test-session-123",
        message: "Test message",
      };

      // Call the handler
      const result = await handler(testRequest);

      // Verify error response for unexpected structure
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: "Error: Unexpected response structure from the model .",
          },
        ],
        isError: true,
      });
    });
  });

  describe("advanced parameter combinations", () => {
    it("should handle start operation with tools and toolConfig", async () => {
      // Register tool to get the request handler
      geminiChatTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Mock successful response
      const mockSessionId = "test-session-tools";
      mockStartChatSession.mockReturnValueOnce(mockSessionId);

      // Prepare test request with tools
      const testRequest = {
        operation: "start",
        modelName: "gemini-1.5-pro",
        tools: [
          {
            functionDeclarations: [
              {
                name: "calculate",
                description: "Perform calculations",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    expression: {
                      type: "STRING",
                      description: "Mathematical expression",
                    },
                  },
                  required: ["expression"],
                },
              },
            ],
          },
        ],
      };

      // Call the handler
      const result = await handler(testRequest);

      // Verify tools were passed
      expect(mockStartChatSession).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: testRequest.tools,
        })
      );

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify({ sessionId: mockSessionId }),
          },
        ],
      });
    });

    it("should handle send_message with all optional parameters", async () => {
      // Register tool to get the request handler
      geminiChatTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Mock successful response
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: "Response with all parameters" }],
            },
            finishReason: FinishReason.STOP,
          },
        ],
      };
      mockSendMessageToSession.mockResolvedValueOnce(mockResponse);

      // Prepare test request with all optional parameters
      const testRequest = {
        operation: "send_message",
        sessionId: "test-session-123",
        message: "Test message with all params",
        generationConfig: {
          temperature: 0.5,
          topP: 0.9,
          topK: 40,
          maxOutputTokens: 2048,
          stopSequences: ["END"],
          thinkingConfig: {
            thinkingBudget: 1024,
          },
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE",
          },
        ],
        tools: [
          {
            functionDeclarations: [
              {
                name: "test_function",
                description: "Test function",
                parameters: {
                  type: "OBJECT",
                  properties: {},
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
        cachedContentName: "cachedContents/test123",
      };

      // Call the handler
      const result = await handler(testRequest);

      // Verify all parameters were passed
      expect(mockSendMessageToSession).toHaveBeenCalledWith({
        sessionId: "test-session-123",
        message: "Test message with all params",
        generationConfig: testRequest.generationConfig,
        safetySettings: testRequest.safetySettings,
        tools: testRequest.tools,
        toolConfig: testRequest.toolConfig,
        cachedContentName: "cachedContents/test123",
      });

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: "Response with all parameters",
          },
        ],
      });
    });

    it("should handle start operation with string systemInstruction", async () => {
      // Register tool to get the request handler
      geminiChatTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Mock successful response
      const mockSessionId = "test-session-string-instruction";
      mockStartChatSession.mockReturnValueOnce(mockSessionId);

      // Prepare test request with string system instruction
      const testRequest = {
        operation: "start",
        systemInstruction:
          "You are a helpful assistant specialized in mathematics.",
      };

      // Call the handler
      const result = await handler(testRequest);

      // Verify string system instruction was passed
      expect(mockStartChatSession).toHaveBeenCalledWith(
        expect.objectContaining({
          systemInstruction:
            "You are a helpful assistant specialized in mathematics.",
        })
      );

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify({ sessionId: mockSessionId }),
          },
        ],
      });
    });

    it("should handle start operation with complex history", async () => {
      // Register tool to get the request handler
      geminiChatTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Mock successful response
      const mockSessionId = "test-session-complex-history";
      mockStartChatSession.mockReturnValueOnce(mockSessionId);

      // Prepare test request with complex history
      const testRequest = {
        operation: "start",
        history: [
          {
            role: "user",
            parts: [{ text: "Hello, I need help with math." }],
          },
          {
            role: "model",
            parts: [
              {
                text: "I'd be happy to help you with mathematics! What specific topic or problem would you like assistance with?",
              },
            ],
          },
          {
            role: "user",
            parts: [{ text: "Can you solve quadratic equations?" }],
          },
          {
            role: "model",
            parts: [
              {
                text: "Yes, I can help you solve quadratic equations. The general form is ax² + bx + c = 0.",
              },
            ],
          },
        ],
      };

      // Call the handler
      const result = await handler(testRequest);

      // Verify complex history was passed
      expect(mockStartChatSession).toHaveBeenCalledWith(
        expect.objectContaining({
          history: testRequest.history,
        })
      );

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify({ sessionId: mockSessionId }),
          },
        ],
      });
    });
  });

  describe("function result processing", () => {
    it("should handle function result with safety blocked response", async () => {
      // Register tool to get the request handler
      geminiChatTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Mock safety blocked response after function result
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: "Partial response..." }],
            },
            finishReason: FinishReason.SAFETY,
          },
        ],
      };
      mockSendFunctionResultToSession.mockResolvedValueOnce(mockResponse);

      // Prepare test request
      const testRequest = {
        operation: "send_function_result",
        sessionId: "test-session-123",
        functionResponses: [
          {
            name: "test_function",
            response: { result: "test result" },
          },
        ],
      };

      // Call the handler
      const result = await handler(testRequest);

      // Verify error response includes "after function result" context
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: "Error: Response generation stopped due to safety settings after function result. FinishReason: SAFETY",
          },
        ],
        isError: true,
      });
    });

    it("should handle multiple function responses", async () => {
      // Register tool to get the request handler
      geminiChatTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Mock successful response
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: "Based on the function results, here's the summary...",
                },
              ],
            },
            finishReason: FinishReason.STOP,
          },
        ],
      };
      mockSendFunctionResultToSession.mockResolvedValueOnce(mockResponse);

      // Prepare test request with multiple function responses
      const testRequest = {
        operation: "send_function_result",
        sessionId: "test-session-123",
        functionResponses: [
          {
            name: "get_weather",
            response: { temperature: 22, condition: "sunny" },
          },
          {
            name: "get_time",
            response: { time: "14:30", timezone: "UTC" },
          },
        ],
      };

      // Call the handler
      const result = await handler(testRequest);

      // Verify multiple function responses were serialized correctly
      expect(mockSendFunctionResultToSession).toHaveBeenCalledWith({
        sessionId: "test-session-123",
        functionResponse: JSON.stringify(testRequest.functionResponses),
        functionCall: undefined,
      });

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: "Based on the function results, here's the summary...",
          },
        ],
      });
    });
  });

  describe("service error handling", () => {
    it("should handle service errors during start operation", async () => {
      // Register tool to get the request handler
      geminiChatTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Mock service to throw error
      const serviceError = new Error("Service unavailable");
      mockStartChatSession.mockImplementationOnce(() => {
        throw serviceError;
      });

      // Prepare test request
      const testRequest = {
        operation: "start",
        modelName: "gemini-1.5-flash",
      };

      // Call the handler and expect error
      await expect(handler(testRequest)).rejects.toThrow();
    });

    it("should handle service errors during send_message operation", async () => {
      // Register tool to get the request handler
      geminiChatTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Mock service to throw error
      const serviceError = new Error("Network error");
      mockSendMessageToSession.mockRejectedValueOnce(serviceError);

      // Prepare test request
      const testRequest = {
        operation: "send_message",
        sessionId: "test-session-123",
        message: "Test message",
      };

      // Call the handler and expect error
      await expect(handler(testRequest)).rejects.toThrow();
    });

    it("should handle service errors during send_function_result operation", async () => {
      // Register tool to get the request handler
      geminiChatTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Mock service to throw error
      const serviceError = new Error("Function processing error");
      mockSendFunctionResultToSession.mockRejectedValueOnce(serviceError);

      // Prepare test request
      const testRequest = {
        operation: "send_function_result",
        sessionId: "test-session-123",
        functionResponses: [
          {
            name: "test_function",
            response: { result: "test" },
          },
        ],
      };

      // Call the handler and expect error
      await expect(handler(testRequest)).rejects.toThrow();
    });
  });

  describe("thinking configuration", () => {
    it("should handle thinkingConfig in generationConfig for start operation", async () => {
      // Register tool to get the request handler
      geminiChatTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Mock successful response
      const mockSessionId = "test-session-thinking";
      mockStartChatSession.mockReturnValueOnce(mockSessionId);

      // Prepare test request with thinking configuration
      const testRequest = {
        operation: "start",
        generationConfig: {
          temperature: 0.7,
          thinkingConfig: {
            thinkingBudget: 2048,
            reasoningEffort: "medium",
          },
        },
      };

      // Call the handler
      const result = await handler(testRequest);

      // Verify thinking config was passed
      expect(mockStartChatSession).toHaveBeenCalledWith(
        expect.objectContaining({
          generationConfig: testRequest.generationConfig,
        })
      );

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify({ sessionId: mockSessionId }),
          },
        ],
      });
    });

    it("should handle reasoningEffort in thinkingConfig", async () => {
      // Register tool to get the request handler
      geminiChatTool(mockServer, mockService);
      const [, , , handler] = mockTool.mock.calls[0];

      // Mock successful response
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: "Response with reasoning effort" }],
            },
            finishReason: FinishReason.STOP,
          },
        ],
      };
      mockSendMessageToSession.mockResolvedValueOnce(mockResponse);

      // Prepare test request with reasoning effort
      const testRequest = {
        operation: "send_message",
        sessionId: "test-session-123",
        message: "Complex reasoning task",
        generationConfig: {
          thinkingConfig: {
            reasoningEffort: "high",
          },
        },
      };

      // Call the handler
      const result = await handler(testRequest);

      // Verify reasoning effort was passed
      expect(mockSendMessageToSession).toHaveBeenCalledWith(
        expect.objectContaining({
          generationConfig: testRequest.generationConfig,
        })
      );

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: "Response with reasoning effort",
          },
        ],
      });
    });
  });
});
