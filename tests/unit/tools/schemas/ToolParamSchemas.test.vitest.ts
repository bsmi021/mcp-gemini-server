// Using vitest globals - see vitest.config.ts globals: true
import { exampleToolSchema } from "../../../../src/tools/exampleToolParams.js";
import { geminiGenerateContentSchema } from "../../../../src/tools/geminiGenerateContentConsolidatedParams.js";
import { writeToFileSchema } from "../../../../src/tools/schemas/writeToFileParams.js";

/**
 * This test file focuses on the specific tool parameter schemas
 * used throughout the application. Each tool schema is tested
 * for proper validation of both valid and invalid inputs.
 */

describe("Tool Parameter Schemas", () => {
  describe("exampleToolSchema", () => {
    it("should validate valid parameters", () => {
      const validParams = {
        name: "Test User",
      };

      const result = exampleToolSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it("should validate with optional language parameter", () => {
      const validParams = {
        name: "Test User",
        language: "es",
      };

      const result = exampleToolSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    describe("name parameter boundary values", () => {
      it("should validate minimum valid name length (1 character)", () => {
        const params = { name: "A" };
        expect(exampleToolSchema.safeParse(params).success).toBe(true);
      });

      it("should validate maximum valid name length (50 characters)", () => {
        const params = { name: "A".repeat(50) };
        expect(exampleToolSchema.safeParse(params).success).toBe(true);
      });

      it("should reject empty name parameter (0 characters)", () => {
        const params = { name: "" };
        expect(exampleToolSchema.safeParse(params).success).toBe(false);
      });

      it("should reject name that exceeds max length (51 characters)", () => {
        const params = { name: "A".repeat(51) };
        expect(exampleToolSchema.safeParse(params).success).toBe(false);
      });
    });

    describe("language parameter values", () => {
      it("should validate all valid language options", () => {
        const validOptions = ["en", "es", "fr"];

        validOptions.forEach((lang) => {
          const params = { name: "Test User", language: lang };
          expect(exampleToolSchema.safeParse(params).success).toBe(true);
        });
      });

      it("should reject invalid language options", () => {
        const invalidOptions = ["de", "jp", "it", ""];

        invalidOptions.forEach((lang) => {
          const params = { name: "Test User", language: lang };
          expect(exampleToolSchema.safeParse(params).success).toBe(false);
        });
      });
    });
  });

  describe("geminiGenerateContentSchema", () => {
    it("should validate minimal required parameters", () => {
      const validParams = {
        prompt: "Tell me a story",
      };

      const result = geminiGenerateContentSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it("should validate with all optional parameters", () => {
      const validParams = {
        prompt: "Tell me a story",
        modelName: "gemini-pro",
        generationConfig: {
          temperature: 0.7,
          topP: 0.8,
          topK: 40,
          maxOutputTokens: 2048,
          stopSequences: ["THE END"],
          thinkingConfig: {
            thinkingBudget: 1000,
            reasoningEffort: "medium",
          },
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_MEDIUM_AND_ABOVE",
          },
        ],
        systemInstruction: "Respond in a friendly tone",
        cachedContentName: "cachedContents/example123",
      };

      const result = geminiGenerateContentSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it("should reject empty prompt", () => {
      const invalidParams = {
        prompt: "",
        modelName: "gemini-pro",
      };

      const result = geminiGenerateContentSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    it("should reject invalid generation config parameters", () => {
      const invalidParams = {
        prompt: "Tell me a story",
        generationConfig: {
          temperature: 2.0, // Should be between 0 and 1
        },
      };

      const result = geminiGenerateContentSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    it("should reject invalid safety settings", () => {
      const invalidParams = {
        prompt: "Tell me a story",
        safetySettings: [
          {
            category: "INVALID_CATEGORY", // Not a valid harm category
            threshold: "BLOCK_MEDIUM_AND_ABOVE",
          },
        ],
      };

      const result = geminiGenerateContentSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });
  });

  describe("writeToFileSchema", () => {
    it("should validate minimal required parameters", () => {
      const validParams = {
        filePath: "/path/to/file.txt",
        content: "File content",
      };

      const result = writeToFileSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it("should validate with all optional parameters", () => {
      const validParams = {
        filePath: "/path/to/file.txt",
        content: "File content",
        encoding: "base64",
        overwriteFile: true,
      };

      const result = writeToFileSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it("should validate with different encoding options", () => {
      const utf8Params = {
        filePath: "/path/to/file.txt",
        content: "File content",
        encoding: "utf8",
      };

      const base64Params = {
        filePath: "/path/to/file.txt",
        content: "File content",
        encoding: "base64",
      };

      expect(writeToFileSchema.safeParse(utf8Params).success).toBe(true);
      expect(writeToFileSchema.safeParse(base64Params).success).toBe(true);
    });

    it("should reject empty file path", () => {
      const invalidParams = {
        filePath: "",
        content: "File content",
      };

      const result = writeToFileSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    it("should reject invalid encoding options", () => {
      const invalidParams = {
        filePath: "/path/to/file.txt",
        content: "File content",
        encoding: "binary", // Not in ['utf8', 'base64']
      };

      const result = writeToFileSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });
  });
});
