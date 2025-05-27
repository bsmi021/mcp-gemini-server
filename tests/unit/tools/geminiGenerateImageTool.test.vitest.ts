/**
 * Test suite for geminiGenerateImageTool
 * Tests the tool integration with the fixed GeminiService.generateImage method
 */

// Using vitest globals - see vitest.config.ts globals: true
import type { GeminiService } from "../../../src/services/GeminiService.js";
import { geminiGenerateImageTool } from "../../../src/tools/geminiGenerateImageTool.js";
import type { ImageGenerationResult } from "../../../src/types/geminiServiceTypes.js";

describe("geminiGenerateImageTool", () => {
  let mockGeminiService: GeminiService;

  beforeEach(() => {
    mockGeminiService = {
      generateImage: vi.fn(),
    } as unknown as GeminiService;
  });

  describe("successful image generation", () => {
    it("should generate images with minimal parameters", async () => {
      const mockResult: ImageGenerationResult = {
        images: [
          {
            base64Data: "test-base64-data",
            mimeType: "image/png",
            width: 1024,
            height: 1024,
          },
        ],
      };

      (mockGeminiService.generateImage as any).mockResolvedValue(mockResult);

      const result = await geminiGenerateImageTool.execute(
        {
          prompt: "A beautiful landscape",
        },
        mockGeminiService
      );

      expect(mockGeminiService.generateImage).toHaveBeenCalledWith(
        "A beautiful landscape",
        undefined, // modelName
        undefined, // resolution
        undefined, // numberOfImages
        undefined, // safetySettings
        undefined, // negativePrompt
        undefined, // stylePreset
        undefined, // seed
        undefined, // styleStrength
        undefined, // preferQuality
        undefined // preferSpeed
      );

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: expect.stringContaining("Generated 1"),
          },
          {
            type: "image",
            mimeType: "image/png",
            data: "test-base64-data",
          },
        ],
      });
    });

    it("should generate images with all parameters", async () => {
      const mockResult: ImageGenerationResult = {
        images: [
          {
            base64Data: "test-base64-data-1",
            mimeType: "image/png",
            width: 512,
            height: 512,
          },
          {
            base64Data: "test-base64-data-2",
            mimeType: "image/png",
            width: 512,
            height: 512,
          },
        ],
      };

      (mockGeminiService.generateImage as any).mockResolvedValue(mockResult);

      const result = await geminiGenerateImageTool.execute(
        {
          prompt: "A cyberpunk city",
          modelName: "imagen-3.0-generate-002",
          resolution: "512x512",
          numberOfImages: 2,
          negativePrompt: "blurry, low quality",
          stylePreset: "photographic",
          seed: 12345,
          styleStrength: 0.8,
          modelPreferences: {
            preferQuality: true,
            preferSpeed: false,
          },
        },
        mockGeminiService
      );

      expect(mockGeminiService.generateImage).toHaveBeenCalledWith(
        "A cyberpunk city",
        "imagen-3.0-generate-002",
        "512x512",
        2,
        undefined, // safetySettings
        "blurry, low quality",
        "photorealistic",
        12345,
        0.8,
        true,
        false
      );

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: expect.stringContaining("Generated 2"),
          },
          {
            type: "image",
            mimeType: "image/png",
            data: "test-base64-data-1",
          },
          {
            type: "image",
            mimeType: "image/png",
            data: "test-base64-data-2",
          },
        ],
      });
    });

    it("should handle safety settings", async () => {
      const mockResult: ImageGenerationResult = {
        images: [
          {
            base64Data: "test-base64-data-safety",
            mimeType: "image/png",
            width: 1024,
            height: 1024,
          },
        ],
      };

      (mockGeminiService.generateImage as any).mockResolvedValue(mockResult);

      const safetySettings = [
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT" as const,
          threshold: "BLOCK_LOW_AND_ABOVE" as const,
        },
      ];

      const result = await geminiGenerateImageTool.execute(
        {
          prompt: "A safe image",
          safetySettings,
        },
        mockGeminiService
      );

      expect(mockGeminiService.generateImage).toHaveBeenCalledWith(
        "A safe image",
        undefined, // modelName
        undefined, // resolution
        undefined, // numberOfImages
        safetySettings,
        undefined, // negativePrompt
        undefined, // stylePreset
        undefined, // seed
        undefined, // styleStrength
        undefined, // preferQuality
        undefined // preferSpeed
      );

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: expect.stringContaining("Generated 1"),
          },
          {
            type: "image",
            mimeType: "image/png",
            data: "test-base64-data-safety",
          },
        ],
      });
    });
  });

  describe("error handling", () => {
    it("should handle content filter errors", async () => {
      const { GeminiContentFilterError } = await import(
        "../../../src/utils/geminiErrors.js"
      );

      (mockGeminiService.generateImage as any).mockRejectedValue(
        new GeminiContentFilterError("Content blocked by safety filters", [
          "HARM_CATEGORY_DANGEROUS_CONTENT",
        ])
      );

      const result = await geminiGenerateImageTool.execute(
        {
          prompt: "Inappropriate content",
        },
        mockGeminiService
      );

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: expect.stringContaining("Content blocked by safety filters"),
          },
        ],
        isError: true,
      });
    });

    it("should handle validation errors", async () => {
      const { GeminiValidationError } = await import(
        "../../../src/utils/geminiErrors.js"
      );

      (mockGeminiService.generateImage as any).mockRejectedValue(
        new GeminiValidationError("Invalid prompt", "prompt")
      );

      const result = await geminiGenerateImageTool.execute(
        {
          prompt: "",
        },
        mockGeminiService
      );

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: expect.stringContaining("Invalid prompt"),
          },
        ],
        isError: true,
      });
    });

    it("should handle model errors", async () => {
      const { GeminiModelError } = await import(
        "../../../src/utils/geminiErrors.js"
      );

      (mockGeminiService.generateImage as any).mockRejectedValue(
        new GeminiModelError("Model unavailable", "imagen-3.0-generate-002")
      );

      const result = await geminiGenerateImageTool.execute(
        {
          prompt: "A test image",
          modelName: "imagen-3.0-generate-002",
        },
        mockGeminiService
      );

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: expect.stringContaining("Model unavailable"),
          },
        ],
        isError: true,
      });
    });

    it("should handle generic errors", async () => {
      (mockGeminiService.generateImage as any).mockRejectedValue(
        new Error("Network error")
      );

      const result = await geminiGenerateImageTool.execute(
        {
          prompt: "A test image",
        },
        mockGeminiService
      );

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: expect.stringContaining("Network error"),
          },
        ],
        isError: true,
      });
    });
  });

  describe("parameter validation", () => {
    it("should validate prompt is required", async () => {
      const result = await geminiGenerateImageTool.execute(
        {} as any,
        mockGeminiService
      );

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: expect.stringContaining("prompt"),
          },
        ],
        isError: true,
      });
    });

    it("should validate numberOfImages range", async () => {
      const result = await geminiGenerateImageTool.execute(
        {
          prompt: "Test",
          numberOfImages: 10, // Exceeds maximum
        },
        mockGeminiService
      );

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: expect.stringContaining("numberOfImages"),
          },
        ],
        isError: true,
      });
    });

    it("should validate resolution format", async () => {
      const result = await geminiGenerateImageTool.execute(
        {
          prompt: "Test",
          resolution: "800x600" as any, // Invalid resolution
        },
        mockGeminiService
      );

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: expect.stringContaining("resolution"),
          },
        ],
        isError: true,
      });
    });
  });
});
