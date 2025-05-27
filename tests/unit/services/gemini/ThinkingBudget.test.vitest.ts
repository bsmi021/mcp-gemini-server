// Using vitest globals - see vitest.config.ts globals: true
import { GeminiContentService } from "../../../../src/services/gemini/GeminiContentService.js";
import { GeminiChatService } from "../../../../src/services/gemini/GeminiChatService.js";
import { GenerateContentResponse } from "@google/genai";
import { FinishReason } from "../../../../src/types/googleGenAITypes.js";

// Create a partial type for mocking GenerateContentResponse
type PartialGenerateContentResponse = Partial<GenerateContentResponse>;

// Define extended generation config type for tests
interface ExtendedGenerationConfig {
  temperature?: number;
  thinkingConfig?: {
    thinkingBudget?: number;
    reasoningEffort?: "none" | "low" | "medium" | "high";
  };
}

describe("Thinking Budget Feature", () => {
  // Create a properly typed mock requestConfig for assertions
  interface MockRequestConfig {
    thinkingConfig?: {
      thinkingBudget?: number;
    };
  }

  // Mock GoogleGenAI
  const mockGenerateContentMethod = vi.fn((_config?: MockRequestConfig) => ({
    text: "Mock response from generateContent",
  }));

  const mockGenAI = {
    models: {
      generateContent: mockGenerateContentMethod,
      generateContentStream: vi.fn(async function* () {
        yield { text: "Mock response from generateContentStream" };
      }),
    },
  };

  // Reset mocks before each test
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GeminiContentService", () => {
    it("should apply thinking budget from generationConfig", async () => {
      // Arrange
      const service = new GeminiContentService(
        mockGenAI as any,
        "gemini-1.5-pro"
      );

      // Act
      await service.generateContent({
        prompt: "Test prompt",
        generationConfig: {
          temperature: 0.7,
          thinkingConfig: {
            thinkingBudget: 5000,
          },
        } as ExtendedGenerationConfig,
      });

      // Assert
      expect(mockGenerateContentMethod).toHaveBeenCalledTimes(1);
      // Get mock arguments safely with null checks
      const args = mockGenerateContentMethod.mock.calls[0];
      expect(args).toBeTruthy();

      const requestConfig = args[0];
      expect(requestConfig).toBeTruthy();
      expect(requestConfig?.thinkingConfig).toBeTruthy();
      expect(requestConfig?.thinkingConfig?.thinkingBudget).toBe(5000);
    });

    it("should map reasoningEffort to thinkingBudget values", async () => {
      // Arrange
      const service = new GeminiContentService(
        mockGenAI as any,
        "gemini-1.5-pro"
      );

      // Test different reasoning effort values
      const testCases = [
        { reasoningEffort: "none", expectedBudget: 0 },
        { reasoningEffort: "low", expectedBudget: 1024 },
        { reasoningEffort: "medium", expectedBudget: 8192 },
        { reasoningEffort: "high", expectedBudget: 24576 },
      ];

      for (const testCase of testCases) {
        vi.clearAllMocks();

        // Act
        await service.generateContent({
          prompt: "Test prompt",
          generationConfig: {
            thinkingConfig: {
              reasoningEffort: testCase.reasoningEffort as
                | "none"
                | "low"
                | "medium"
                | "high",
            },
          } as ExtendedGenerationConfig,
        });

        // Assert
        expect(mockGenerateContentMethod).toHaveBeenCalledTimes(1);
        // Get mock arguments safely with null checks
        const args = mockGenerateContentMethod.mock.calls[0];
        expect(args).toBeTruthy();

        const requestConfig = args[0];
        expect(requestConfig).toBeTruthy();
        expect(requestConfig?.thinkingConfig).toBeTruthy();
        expect(requestConfig?.thinkingConfig?.thinkingBudget).toBe(
          testCase.expectedBudget
        );
      }
    });

    it("should apply default thinking budget when provided", async () => {
      // Arrange
      const defaultThinkingBudget = 3000;
      const service = new GeminiContentService(
        mockGenAI as any,
        "gemini-1.5-pro",
        defaultThinkingBudget
      );

      // Act
      await service.generateContent({
        prompt: "Test prompt",
      });

      // Assert
      expect(mockGenerateContentMethod).toHaveBeenCalledTimes(1);
      // Get mock arguments safely with null checks
      const args = mockGenerateContentMethod.mock.calls[0];
      expect(args).toBeTruthy();

      const requestConfig = args[0];
      expect(requestConfig).toBeTruthy();
      expect(requestConfig?.thinkingConfig).toBeTruthy();
      expect(requestConfig?.thinkingConfig?.thinkingBudget).toBe(
        defaultThinkingBudget
      );
    });

    it("should prioritize generationConfig thinking budget over default", async () => {
      // Arrange
      const defaultThinkingBudget = 3000;
      const configThinkingBudget = 8000;
      const service = new GeminiContentService(
        mockGenAI as any,
        "gemini-1.5-pro",
        defaultThinkingBudget
      );

      // Act
      await service.generateContent({
        prompt: "Test prompt",
        generationConfig: {
          thinkingConfig: {
            thinkingBudget: configThinkingBudget,
          },
        } as ExtendedGenerationConfig,
      });

      // Assert
      expect(mockGenerateContentMethod).toHaveBeenCalledTimes(1);
      // Get mock arguments safely with null checks
      const args = mockGenerateContentMethod.mock.calls[0];
      expect(args).toBeTruthy();

      const requestConfig = args[0];
      expect(requestConfig).toBeTruthy();
      expect(requestConfig?.thinkingConfig).toBeTruthy();
      expect(requestConfig?.thinkingConfig?.thinkingBudget).toBe(
        configThinkingBudget
      );
    });
  });

  describe("GeminiChatService", () => {
    // Mock for chat service with proper typing
    const mockChatGenerateContentMethod = vi.fn(
      (
        _config?: MockRequestConfig
      ): Promise<PartialGenerateContentResponse> => {
        const response: PartialGenerateContentResponse = {
          candidates: [
            {
              content: {
                role: "model",
                parts: [{ text: "Mock chat response" }],
              },
              finishReason: FinishReason.STOP,
            },
          ],
          promptFeedback: {},
        };

        // Define the text property as a getter function
        Object.defineProperty(response, "text", {
          get: function () {
            return "Mock chat response";
          },
        });

        return Promise.resolve(response);
      }
    );

    const mockChatGenAI = {
      models: {
        generateContent: mockChatGenerateContentMethod,
      },
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should apply thinking budget to chat session", async () => {
      // Arrange
      const chatService = new GeminiChatService(
        mockChatGenAI as any,
        "gemini-1.5-pro"
      );

      // Act
      const sessionId = chatService.startChatSession({
        generationConfig: {
          temperature: 0.7,
          thinkingConfig: {
            thinkingBudget: 6000,
          },
        } as ExtendedGenerationConfig,
      });

      await chatService.sendMessageToSession({
        sessionId,
        message: "Hello",
      });

      // Assert
      expect(mockChatGenerateContentMethod).toHaveBeenCalledTimes(1);
      // Get mock arguments safely with null checks
      const args = mockChatGenerateContentMethod.mock.calls[0];
      expect(args).toBeTruthy();

      const requestConfig = args[0];
      expect(requestConfig).toBeTruthy();
      expect(requestConfig?.thinkingConfig).toBeTruthy();
      expect(requestConfig?.thinkingConfig?.thinkingBudget).toBe(6000);
    });

    it("should map reasoningEffort to thinkingBudget in chat session", async () => {
      // Arrange
      const chatService = new GeminiChatService(
        mockChatGenAI as any,
        "gemini-1.5-pro"
      );

      // Test different reasoning effort values
      const testCases = [
        { reasoningEffort: "none", expectedBudget: 0 },
        { reasoningEffort: "low", expectedBudget: 1024 },
        { reasoningEffort: "medium", expectedBudget: 8192 },
        { reasoningEffort: "high", expectedBudget: 24576 },
      ];

      for (const testCase of testCases) {
        vi.clearAllMocks();

        // Act
        const sessionId = chatService.startChatSession({
          generationConfig: {
            thinkingConfig: {
              reasoningEffort: testCase.reasoningEffort as
                | "none"
                | "low"
                | "medium"
                | "high",
            },
          } as ExtendedGenerationConfig,
        });

        await chatService.sendMessageToSession({
          sessionId,
          message: "Hello",
        });

        // Assert
        expect(mockChatGenerateContentMethod).toHaveBeenCalledTimes(1);
        // Get mock arguments safely with null checks
        const args = mockChatGenerateContentMethod.mock.calls[0];
        expect(args).toBeTruthy();

        const requestConfig = args[0];
        expect(requestConfig).toBeTruthy();
        expect(requestConfig?.thinkingConfig).toBeTruthy();
        expect(requestConfig?.thinkingConfig?.thinkingBudget).toBe(
          testCase.expectedBudget
        );
      }
    });

    it("should override session thinking budget with message thinking budget", async () => {
      // Arrange
      const chatService = new GeminiChatService(
        mockChatGenAI as any,
        "gemini-1.5-pro"
      );

      // Act
      const sessionId = chatService.startChatSession({
        generationConfig: {
          thinkingConfig: {
            thinkingBudget: 3000,
          },
        } as ExtendedGenerationConfig,
      });

      await chatService.sendMessageToSession({
        sessionId,
        message: "Hello",
        generationConfig: {
          thinkingConfig: {
            thinkingBudget: 8000,
          },
        } as ExtendedGenerationConfig,
      });

      // Assert
      expect(mockChatGenerateContentMethod).toHaveBeenCalledTimes(1);
      // Get mock arguments safely with null checks
      const args = mockChatGenerateContentMethod.mock.calls[0];
      expect(args).toBeTruthy();

      const requestConfig = args[0];
      expect(requestConfig).toBeTruthy();
      expect(requestConfig?.thinkingConfig).toBeTruthy();
      expect(requestConfig?.thinkingConfig?.thinkingBudget).toBe(8000);
    });
  });
});
