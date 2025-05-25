// Using vitest globals - see vitest.config.ts globals: true
import { geminiRouteMessageTool } from "../../../src/tools/geminiRouteMessageTool.js";
import {
  GeminiApiError,
  ValidationError as GeminiValidationError,
} from "../../../src/utils/errors.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GeminiService } from "../../../src/services/index.js";
import type { GenerateContentResponse } from "@google/genai";
import { BlockedReason, FinishReason } from "@google/genai";

// Create a partial type for testing purposes
type PartialGenerateContentResponse = Partial<GenerateContentResponse>;

describe("geminiRouteMessageTool", () => {
  // Mock server and service instances
  const mockTool = vi.fn();
  const mockServer = {
    tool: mockTool,
  } as unknown as McpServer;

  // Define a type for route message params
  interface RouteMessageParams {
    message: string;
    models: string[];
    routingPrompt?: string;
    defaultModel?: string;
    generationConfig?: Record<string, unknown>;
    safetySettings?: unknown[];
    systemInstruction?: unknown;
  }

  // Create a strongly typed mock function that returns a Promise
  const mockRouteMessage = vi.fn<
    (params: RouteMessageParams) => Promise<{
      response: PartialGenerateContentResponse;
      chosenModel: string;
    }>
  >();

  // Create a minimal mock service with just the necessary methods for testing
  const mockService = {
    routeMessage: mockRouteMessage,
    // Add empty implementations for required GeminiService methods
    // Add other required methods as empty implementations
  } as unknown as GeminiService;

  // Reset mocks before each test
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should register the tool with the server", () => {
    // Call the tool registration function
    geminiRouteMessageTool(mockServer, mockService);

    // Verify tool was registered
    expect(mockTool).toHaveBeenCalledTimes(1);
    const [name, description, params, handler] = mockTool.mock.calls[0];

    // Check tool registration parameters
    expect(name).toBe("gemini_route_message");
    expect(description).toContain("Routes a message");
    expect(params).toBeDefined();
    expect(typeof handler).toBe("function");
  });

  it("should call the service's routeMessage method with correct parameters", async () => {
    // Register tool to get the request handler
    geminiRouteMessageTool(mockServer, mockService);
    const [, , , handler] = mockTool.mock.calls[0];

    // Mock successful response with proper typing
    const mockSuccessResponse = {
      response: {
        candidates: [
          {
            content: {
              parts: [{ text: "This is a test response" }],
            },
          },
        ],
      } as PartialGenerateContentResponse,
      chosenModel: "gemini-1.5-flash",
    };
    mockRouteMessage.mockResolvedValueOnce(mockSuccessResponse);

    // Prepare test request
    const testRequest = {
      message: "What is the capital of France?",
      models: ["gemini-1.5-pro", "gemini-1.5-flash"],
      routingPrompt: "Choose the best model",
      defaultModel: "gemini-1.5-pro",
    };

    // Call the handler
    const result = await handler(testRequest);

    // Verify service method was called
    expect(mockRouteMessage).toHaveBeenCalledTimes(1);

    // Get the parameters passed to the routeMessage function
    const passedParams = mockRouteMessage.mock
      .calls[0][0] as RouteMessageParams;

    // Check parameters passed to service
    expect(passedParams.message).toBe(testRequest.message);
    expect(passedParams.models).toEqual(testRequest.models);
    expect(passedParams.routingPrompt).toBe(testRequest.routingPrompt);
    expect(passedParams.defaultModel).toBe(testRequest.defaultModel);

    // Verify result structure
    expect(result.content).toBeDefined();
    expect(result.content.length).toBe(1);
    expect(result.content[0].type).toBe("text");

    // Parse the JSON response
    const parsedResponse = JSON.parse(result.content[0].text);
    expect(parsedResponse.text).toBe("This is a test response");
    expect(parsedResponse.chosenModel).toBe("gemini-1.5-flash");
  });

  it("should handle safety blocks from the prompt", async () => {
    // Register tool to get the request handler
    geminiRouteMessageTool(mockServer, mockService);
    const [, , , handler] = mockTool.mock.calls[0];

    // Mock safety block response with proper typing
    const mockSafetyResponse = {
      response: {
        promptFeedback: {
          blockReason: BlockedReason.SAFETY,
        },
      } as PartialGenerateContentResponse,
      chosenModel: "gemini-1.5-flash",
    };
    mockRouteMessage.mockResolvedValueOnce(mockSafetyResponse);

    // Call the handler
    const result = await handler({
      message: "Harmful content here",
      models: ["gemini-1.5-pro", "gemini-1.5-flash"],
    });

    // Verify error response
    expect(result.isError).toBeTruthy();
    expect(result.content[0].text).toContain("safety settings");
  });

  it("should handle empty response from model", async () => {
    // Register tool to get the request handler
    geminiRouteMessageTool(mockServer, mockService);
    const [, , , handler] = mockTool.mock.calls[0];

    // Mock empty response with proper typing
    const mockEmptyResponse = {
      response: {
        candidates: [
          {
            content: { parts: [] },
            finishReason: FinishReason.MAX_TOKENS,
          },
        ],
      } as PartialGenerateContentResponse,
      chosenModel: "gemini-1.5-flash",
    };
    mockRouteMessage.mockResolvedValueOnce(mockEmptyResponse);

    // Call the handler
    const result = await handler({
      message: "Test message",
      models: ["gemini-1.5-pro", "gemini-1.5-flash"],
    });

    // Verify empty response handling
    expect(result.content).toBeDefined();
    const parsedResponse = JSON.parse(result.content[0].text);
    expect(parsedResponse.text).toBe("");
    expect(parsedResponse.chosenModel).toBe("gemini-1.5-flash");
  });

  it("should map errors properly", async () => {
    // Register tool to get the request handler
    geminiRouteMessageTool(mockServer, mockService);
    const [, , , handler] = mockTool.mock.calls[0];

    // Mock service error
    const serviceError = new GeminiApiError("Service failed");
    mockRouteMessage.mockRejectedValueOnce(serviceError);

    // Call the handler and expect an error
    await expect(
      handler({
        message: "Test message",
        models: ["gemini-1.5-pro", "gemini-1.5-flash"],
      })
    ).rejects.toThrow(McpError);

    // Reset the mock for the next test
    mockRouteMessage.mockReset();
    mockRouteMessage.mockRejectedValueOnce(serviceError);

    // Use a separate test with a new rejection
    await expect(
      handler({
        message: "Test message",
        models: ["gemini-1.5-pro", "gemini-1.5-flash"],
      })
    ).rejects.toThrow();
  });

  it("should handle validation errors", async () => {
    // Register tool to get the request handler
    geminiRouteMessageTool(mockServer, mockService);
    const [, , , handler] = mockTool.mock.calls[0];

    // Mock validation error
    const validationError = new GeminiValidationError("Invalid parameters");
    mockRouteMessage.mockRejectedValueOnce(validationError);

    // Call the handler and expect an error
    await expect(
      handler({
        message: "Test message",
        models: ["gemini-1.5-pro", "gemini-1.5-flash"],
      })
    ).rejects.toThrow(McpError);

    // Reset the mock for the next test
    mockRouteMessage.mockReset();
    mockRouteMessage.mockRejectedValueOnce(validationError);

    // Use a separate test with a new rejection
    await expect(
      handler({
        message: "Test message",
        models: ["gemini-1.5-pro", "gemini-1.5-flash"],
      })
    ).rejects.toThrow();
  });
});
