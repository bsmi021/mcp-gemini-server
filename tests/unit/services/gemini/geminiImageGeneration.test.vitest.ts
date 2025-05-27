/**
 * Test suite for Gemini image generation functionality
 * Covers the refactored generateImage method using the correct generateImages API
 */

// Using vitest globals - see vitest.config.ts globals: true
import { GeminiService } from "../../../../src/services/GeminiService.js";
import {
  GeminiContentFilterError,
  GeminiModelError,
  GeminiValidationError,
} from "../../../../src/utils/geminiErrors.js";

// Mock the GoogleGenAI class before importing
vi.mock("@google/genai", async (importOriginal: any) => {
  const actual = await importOriginal();
  return {
    ...actual,
    GoogleGenAI: vi.fn(),
  };
});

// Mock ConfigurationManager singleton
vi.mock("../../../../src/config/ConfigurationManager.js", () => ({
  ConfigurationManager: {
    getInstance: vi.fn(() => ({
      getGeminiServiceConfig: vi.fn(() => ({
        apiKey: "test-api-key",
        defaultModel: "gemini-2.0-flash-preview",
      })),
      getModelConfiguration: vi.fn(() => ({
        default: "gemini-2.0-flash-preview",
        imageGeneration: "imagen-3.0-generate-002",
      })),
      getGitHubApiToken: vi.fn(() => "test-github-token"),
    })),
  },
}));

// Mock ModelSelectionService constructor
vi.mock("../../../../src/services/ModelSelectionService.js", () => ({
  ModelSelectionService: vi.fn(() => ({
    selectOptimalModel: vi.fn(() => Promise.resolve("imagen-3.0-generate-002")),
  })),
}));

// Mock GitHubApiService constructor
vi.mock("../../../../src/services/gemini/GitHubApiService.js", () => ({
  GitHubApiService: vi.fn(() => ({})),
}));

// Mock the Google GenAI SDK
const mockGenerateImages = vi.fn();
const mockGetGenerativeModel = vi.fn(() => ({
  generateImages: mockGenerateImages,
}));

const mockGenAI = {
  getGenerativeModel: mockGetGenerativeModel,
};

describe("GeminiService - Image Generation", () => {
  let service: GeminiService;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create service instance (now uses mocked singletons)
    service = new GeminiService();

    // Replace the genAI instance with our mock
    (service as any).genAI = mockGenAI;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("generateImage", () => {
    const mockImageResponse = {
      images: [
        {
          data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==".repeat(
            5
          ), // Make it long enough
          mimeType: "image/png",
        },
      ],
      promptSafetyMetadata: {
        blocked: false,
      },
    };

    it("should generate images successfully with default parameters", async () => {
      mockGenerateImages.mockResolvedValue(mockImageResponse);

      const result = await service.generateImage("A beautiful sunset");

      expect(mockGenerateImages).toHaveBeenCalledWith({
        prompt: "A beautiful sunset",
        safetySettings: expect.any(Array),
        numberOfImages: 1,
      });

      expect(result).toEqual({
        images: [
          {
            base64Data:
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==".repeat(
                5
              ),
            mimeType: "image/png",
            width: 1024,
            height: 1024,
          },
        ],
      });
    });

    it("should generate images with custom parameters", async () => {
      mockGenerateImages.mockResolvedValue({
        images: [
          {
            data: "test-base64-data-1".repeat(10), // Make it long enough
            mimeType: "image/png",
          },
          {
            data: "test-base64-data-2".repeat(10), // Make it long enough
            mimeType: "image/png",
          },
        ],
        promptSafetyMetadata: { blocked: false },
      });

      const result = await service.generateImage(
        "A cyberpunk cityscape",
        "imagen-3.0-generate-002",
        "512x512",
        2,
        undefined,
        "avoid dark colors",
        "photorealistic",
        12345,
        0.8,
        true,
        false
      );

      expect(mockGenerateImages).toHaveBeenCalledWith({
        prompt: "A cyberpunk cityscape",
        safetySettings: expect.any(Array),
        numberOfImages: 2,
        width: 512,
        height: 512,
        negativePrompt: "avoid dark colors",
        stylePreset: "photorealistic",
        seed: 12345,
        styleStrength: 0.8,
      });

      expect(result).toEqual({
        images: [
          {
            base64Data: "test-base64-data-1".repeat(10),
            mimeType: "image/png",
            width: 512,
            height: 512,
          },
          {
            base64Data: "test-base64-data-2".repeat(10),
            mimeType: "image/png",
            width: 512,
            height: 512,
          },
        ],
      });
    });

    it("should handle safety filtering", async () => {
      mockGenerateImages.mockResolvedValue({
        images: [],
        promptSafetyMetadata: {
          blocked: true,
          safetyRatings: [
            {
              category: "HARM_CATEGORY_DANGEROUS_CONTENT",
              probability: "HIGH",
            },
          ],
        },
      });

      await expect(
        service.generateImage("How to make explosives")
      ).rejects.toThrow(GeminiContentFilterError);

      expect(mockGenerateImages).toHaveBeenCalled();
    });

    it("should handle empty images response", async () => {
      mockGenerateImages.mockResolvedValue({
        images: [],
        promptSafetyMetadata: { blocked: false },
      });

      await expect(service.generateImage("A simple drawing")).rejects.toThrow(
        GeminiModelError
      );
      await expect(service.generateImage("A simple drawing")).rejects.toThrow(
        "No images were generated by the model"
      );
    });

    it("should handle missing images in response", async () => {
      mockGenerateImages.mockResolvedValue({
        promptSafetyMetadata: { blocked: false },
      });

      await expect(service.generateImage("A simple drawing")).rejects.toThrow(
        GeminiModelError
      );
    });

    it("should validate generated images", async () => {
      mockGenerateImages.mockResolvedValue({
        images: [
          {
            data: "short", // Too short base64 data
            mimeType: "image/png",
          },
        ],
        promptSafetyMetadata: { blocked: false },
      });

      await expect(service.generateImage("A simple drawing")).rejects.toThrow(
        GeminiValidationError
      );
    });

    it("should handle invalid MIME types", async () => {
      mockGenerateImages.mockResolvedValue({
        images: [
          {
            data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
            mimeType: "image/gif", // Unsupported MIME type
          },
        ],
        promptSafetyMetadata: { blocked: false },
      });

      await expect(service.generateImage("A simple drawing")).rejects.toThrow(
        GeminiValidationError
      );
    });

    it("should use model selection when no specific model provided", async () => {
      mockGenerateImages.mockResolvedValue(mockImageResponse);

      // Access the service's model selector and spy on it
      const modelSelector = (service as any).modelSelector;
      const selectOptimalModelSpy = vi
        .spyOn(modelSelector, "selectOptimalModel")
        .mockResolvedValue("imagen-3.0-generate-002");

      await service.generateImage("Test prompt");

      expect(selectOptimalModelSpy).toHaveBeenCalledWith({
        taskType: "image-generation",
        preferQuality: undefined,
        preferSpeed: undefined,
        fallbackModel: "imagen-3.0-generate-002",
      });
    });

    it("should handle API errors", async () => {
      const apiError = new Error("API quota exceeded");
      mockGenerateImages.mockRejectedValue(apiError);

      await expect(service.generateImage("Test prompt")).rejects.toThrow();
    });

    it("should handle different resolutions", async () => {
      const largeImageResponse = {
        images: [
          {
            data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==".repeat(
              5
            ),
            mimeType: "image/png",
          },
        ],
        promptSafetyMetadata: {
          blocked: false,
        },
      };

      mockGenerateImages.mockResolvedValue(largeImageResponse);

      // Test 1536x1536 resolution
      await service.generateImage("Test", undefined, "1536x1536");

      expect(mockGenerateImages).toHaveBeenCalledWith({
        prompt: "Test",
        safetySettings: expect.any(Array),
        numberOfImages: 1,
        width: 1536,
        height: 1536,
      });
    });
  });
});
