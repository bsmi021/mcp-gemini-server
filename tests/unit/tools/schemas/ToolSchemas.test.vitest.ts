// Using vitest globals - see vitest.config.ts globals: true
import {
  ToolSchema,
  ToolResponseSchema,
  FunctionParameterSchema,
  FunctionDeclarationSchema,
} from "../../../../src/tools/schemas/ToolSchemas.js";

import {
  HarmCategorySchema,
  SafetySettingSchema,
  ThinkingConfigSchema,
  GenerationConfigSchema,
  FilePathSchema,
  FileOverwriteSchema,
  EncodingSchema,
  ModelNameSchema,
  PromptSchema,
} from "../../../../src/tools/schemas/CommonSchemas.js";

describe("Tool Schemas Validation", () => {
  describe("ToolSchema", () => {
    it("should validate a valid tool definition with function declarations", () => {
      const validTool = {
        functionDeclarations: [
          {
            name: "testFunction",
            description: "A test function",
            parameters: {
              type: "OBJECT",
              properties: {
                name: {
                  type: "STRING",
                  description: "The name parameter",
                },
              },
              required: ["name"],
            },
          },
        ],
      };

      const result = ToolSchema.safeParse(validTool);
      expect(result.success).toBe(true);
    });

    it("should validate a tool with no function declarations", () => {
      const emptyTool = {};
      const result = ToolSchema.safeParse(emptyTool);
      expect(result.success).toBe(true);
    });

    it("should reject invalid function declarations", () => {
      const invalidTool = {
        functionDeclarations: [
          {
            // Missing required name field
            description: "A test function",
            parameters: {
              type: "OBJECT",
              properties: {},
            },
          },
        ],
      };

      const result = ToolSchema.safeParse(invalidTool);
      expect(result.success).toBe(false);
    });
  });

  describe("ToolResponseSchema", () => {
    it("should validate a valid tool response", () => {
      const validResponse = {
        name: "testTool",
        response: { result: "success" },
      };

      const result = ToolResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    it("should reject response with missing name", () => {
      const invalidResponse = {
        response: { result: "success" },
      };

      const result = ToolResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });
  });

  describe("FunctionParameterSchema", () => {
    it("should validate primitive parameter types", () => {
      const stringParam = {
        type: "STRING",
        description: "A string parameter",
      };

      const numberParam = {
        type: "NUMBER",
        description: "A number parameter",
      };

      const booleanParam = {
        type: "BOOLEAN",
      };

      expect(FunctionParameterSchema.safeParse(stringParam).success).toBe(true);
      expect(FunctionParameterSchema.safeParse(numberParam).success).toBe(true);
      expect(FunctionParameterSchema.safeParse(booleanParam).success).toBe(
        true
      );
    });

    it("should validate object parameter with nested properties", () => {
      const objectParam = {
        type: "OBJECT",
        description: "An object parameter",
        properties: {
          name: {
            type: "STRING",
          },
          age: {
            type: "INTEGER",
          },
          details: {
            type: "OBJECT",
            properties: {
              address: {
                type: "STRING",
              },
            },
          },
        },
        required: ["name"],
      };

      const result = FunctionParameterSchema.safeParse(objectParam);
      expect(result.success).toBe(true);
    });

    it("should validate array parameter with items", () => {
      const arrayParam = {
        type: "ARRAY",
        description: "An array parameter",
        items: {
          type: "STRING",
        },
      };

      const result = FunctionParameterSchema.safeParse(arrayParam);
      expect(result.success).toBe(true);
    });

    it("should reject parameter with invalid type", () => {
      const invalidParam = {
        type: "INVALID_TYPE", // Not a valid type
        description: "An invalid parameter",
      };

      const result = FunctionParameterSchema.safeParse(invalidParam);
      expect(result.success).toBe(false);
    });
  });

  describe("FunctionDeclarationSchema", () => {
    it("should validate a valid function declaration", () => {
      const validFunction = {
        name: "testFunction",
        description: "A test function",
        parameters: {
          type: "OBJECT",
          properties: {
            name: {
              type: "STRING",
              description: "The name parameter",
            },
            age: {
              type: "INTEGER",
            },
          },
          required: ["name"],
        },
      };

      const result = FunctionDeclarationSchema.safeParse(validFunction);
      expect(result.success).toBe(true);
    });

    it("should reject function declaration with missing required fields", () => {
      const invalidFunction = {
        // Missing name
        description: "A test function",
        parameters: {
          type: "OBJECT",
          properties: {},
        },
      };

      const result = FunctionDeclarationSchema.safeParse(invalidFunction);
      expect(result.success).toBe(false);
    });

    it("should reject function declaration with invalid parameters type", () => {
      const invalidFunction = {
        name: "testFunction",
        description: "A test function",
        parameters: {
          type: "STRING", // Should be "OBJECT"
          properties: {},
        },
      };

      const result = FunctionDeclarationSchema.safeParse(invalidFunction);
      expect(result.success).toBe(false);
    });
  });

  describe("CommonSchemas", () => {
    describe("HarmCategorySchema", () => {
      it("should validate valid harm categories", () => {
        const validCategories = [
          "HARM_CATEGORY_UNSPECIFIED",
          "HARM_CATEGORY_HATE_SPEECH",
          "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          "HARM_CATEGORY_HARASSMENT",
          "HARM_CATEGORY_DANGEROUS_CONTENT",
        ];

        validCategories.forEach((category) => {
          expect(HarmCategorySchema.safeParse(category).success).toBe(true);
        });
      });

      it("should reject invalid harm categories", () => {
        expect(HarmCategorySchema.safeParse("INVALID_CATEGORY").success).toBe(
          false
        );
      });
    });

    describe("SafetySettingSchema", () => {
      it("should validate a valid safety setting", () => {
        const validSetting = {
          category: "HARM_CATEGORY_HATE_SPEECH",
          threshold: "BLOCK_MEDIUM_AND_ABOVE",
        };

        const result = SafetySettingSchema.safeParse(validSetting);
        expect(result.success).toBe(true);
      });

      it("should validate all valid combinations of categories and thresholds", () => {
        const validCategories = [
          "HARM_CATEGORY_UNSPECIFIED",
          "HARM_CATEGORY_HATE_SPEECH",
          "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          "HARM_CATEGORY_HARASSMENT",
          "HARM_CATEGORY_DANGEROUS_CONTENT",
        ];

        const validThresholds = [
          "HARM_BLOCK_THRESHOLD_UNSPECIFIED",
          "BLOCK_LOW_AND_ABOVE",
          "BLOCK_MEDIUM_AND_ABOVE",
          "BLOCK_ONLY_HIGH",
          "BLOCK_NONE",
        ];

        // Test a sampling of combinations
        for (const category of validCategories) {
          for (const threshold of validThresholds) {
            const setting = { category, threshold };
            expect(SafetySettingSchema.safeParse(setting).success).toBe(true);
          }
        }
      });

      it("should reject setting with valid structure but invalid category", () => {
        const invalidSetting = {
          category: "INVALID_CATEGORY",
          threshold: "BLOCK_MEDIUM_AND_ABOVE",
        };

        const result = SafetySettingSchema.safeParse(invalidSetting);
        expect(result.success).toBe(false);
      });

      it("should reject setting with valid structure but invalid threshold", () => {
        const invalidSetting = {
          category: "HARM_CATEGORY_HATE_SPEECH",
          threshold: "INVALID_THRESHOLD",
        };

        const result = SafetySettingSchema.safeParse(invalidSetting);
        expect(result.success).toBe(false);
      });

      it("should reject setting with missing required fields", () => {
        const missingCategory = {
          threshold: "BLOCK_MEDIUM_AND_ABOVE",
        };

        const missingThreshold = {
          category: "HARM_CATEGORY_HATE_SPEECH",
        };

        expect(SafetySettingSchema.safeParse(missingCategory).success).toBe(
          false
        );
        expect(SafetySettingSchema.safeParse(missingThreshold).success).toBe(
          false
        );
      });
    });

    describe("GenerationConfigSchema", () => {
      it("should validate a valid generation config", () => {
        const validConfig = {
          temperature: 0.7,
          topP: 0.9,
          topK: 40,
          maxOutputTokens: 1024,
          stopSequences: ["STOP", "END"],
          thinkingConfig: {
            thinkingBudget: 1000,
            reasoningEffort: "medium",
          },
        };

        const result = GenerationConfigSchema.safeParse(validConfig);
        expect(result.success).toBe(true);
      });

      it("should validate minimal generation config", () => {
        const minimalConfig = {};
        const result = GenerationConfigSchema.safeParse(minimalConfig);
        expect(result.success).toBe(true);
      });

      describe("temperature parameter boundary values", () => {
        it("should validate minimum valid temperature (0)", () => {
          const config = { temperature: 0 };
          expect(GenerationConfigSchema.safeParse(config).success).toBe(true);
        });

        it("should validate maximum valid temperature (1)", () => {
          const config = { temperature: 1 };
          expect(GenerationConfigSchema.safeParse(config).success).toBe(true);
        });

        it("should reject temperature below minimum (-0.1)", () => {
          const config = { temperature: -0.1 };
          expect(GenerationConfigSchema.safeParse(config).success).toBe(false);
        });

        it("should reject temperature above maximum (1.01)", () => {
          const config = { temperature: 1.01 };
          expect(GenerationConfigSchema.safeParse(config).success).toBe(false);
        });
      });

      describe("topP parameter boundary values", () => {
        it("should validate minimum valid topP (0)", () => {
          const config = { topP: 0 };
          expect(GenerationConfigSchema.safeParse(config).success).toBe(true);
        });

        it("should validate maximum valid topP (1)", () => {
          const config = { topP: 1 };
          expect(GenerationConfigSchema.safeParse(config).success).toBe(true);
        });

        it("should reject topP below minimum (-0.1)", () => {
          const config = { topP: -0.1 };
          expect(GenerationConfigSchema.safeParse(config).success).toBe(false);
        });

        it("should reject topP above maximum (1.01)", () => {
          const config = { topP: 1.01 };
          expect(GenerationConfigSchema.safeParse(config).success).toBe(false);
        });
      });

      describe("topK parameter boundary values", () => {
        it("should validate minimum valid topK (1)", () => {
          const config = { topK: 1 };
          expect(GenerationConfigSchema.safeParse(config).success).toBe(true);
        });

        it("should reject topK below minimum (0)", () => {
          const config = { topK: 0 };
          expect(GenerationConfigSchema.safeParse(config).success).toBe(false);
        });

        it("should validate large topK values", () => {
          const config = { topK: 1000 };
          expect(GenerationConfigSchema.safeParse(config).success).toBe(true);
        });
      });

      describe("maxOutputTokens parameter boundary values", () => {
        it("should validate minimum valid maxOutputTokens (1)", () => {
          const config = { maxOutputTokens: 1 };
          expect(GenerationConfigSchema.safeParse(config).success).toBe(true);
        });

        it("should reject maxOutputTokens below minimum (0)", () => {
          const config = { maxOutputTokens: 0 };
          expect(GenerationConfigSchema.safeParse(config).success).toBe(false);
        });

        it("should validate large maxOutputTokens values", () => {
          const config = { maxOutputTokens: 10000 };
          expect(GenerationConfigSchema.safeParse(config).success).toBe(true);
        });
      });
    });

    describe("ThinkingConfigSchema", () => {
      it("should validate valid thinking configs", () => {
        const validConfigs = [
          { thinkingBudget: 1000 },
          { reasoningEffort: "medium" },
          { thinkingBudget: 5000, reasoningEffort: "high" },
          {}, // Empty config is valid
        ];

        validConfigs.forEach((config) => {
          expect(ThinkingConfigSchema.safeParse(config).success).toBe(true);
        });
      });

      describe("thinkingBudget parameter boundary values", () => {
        it("should validate minimum valid thinkingBudget (0)", () => {
          const config = { thinkingBudget: 0 };
          expect(ThinkingConfigSchema.safeParse(config).success).toBe(true);
        });

        it("should validate maximum valid thinkingBudget (24576)", () => {
          const config = { thinkingBudget: 24576 };
          expect(ThinkingConfigSchema.safeParse(config).success).toBe(true);
        });

        it("should reject thinkingBudget below minimum (-1)", () => {
          const config = { thinkingBudget: -1 };
          expect(ThinkingConfigSchema.safeParse(config).success).toBe(false);
        });

        it("should reject thinkingBudget above maximum (24577)", () => {
          const config = { thinkingBudget: 24577 };
          expect(ThinkingConfigSchema.safeParse(config).success).toBe(false);
        });

        it("should reject non-integer thinkingBudget (1000.5)", () => {
          const config = { thinkingBudget: 1000.5 };
          expect(ThinkingConfigSchema.safeParse(config).success).toBe(false);
        });
      });

      describe("reasoningEffort parameter values", () => {
        it("should validate all valid reasoningEffort options", () => {
          const validOptions = ["none", "low", "medium", "high"];

          validOptions.forEach((option) => {
            const config = { reasoningEffort: option };
            expect(ThinkingConfigSchema.safeParse(config).success).toBe(true);
          });
        });

        it("should reject invalid reasoningEffort options", () => {
          const invalidOptions = ["maximum", "minimal", "very-high", ""];

          invalidOptions.forEach((option) => {
            const config = { reasoningEffort: option };
            expect(ThinkingConfigSchema.safeParse(config).success).toBe(false);
          });
        });
      });
    });

    describe("File Operation Schemas", () => {
      it("should validate valid file paths", () => {
        const validPaths = [
          "/path/to/file.txt",
          "C:\\Windows\\System32\\file.exe",
        ];

        validPaths.forEach((path) => {
          expect(FilePathSchema.safeParse(path).success).toBe(true);
        });
      });

      it("should reject empty file paths", () => {
        expect(FilePathSchema.safeParse("").success).toBe(false);
      });

      it("should validate file overwrite options", () => {
        expect(FileOverwriteSchema.safeParse(true).success).toBe(true);
        expect(FileOverwriteSchema.safeParse(false).success).toBe(true);
        expect(FileOverwriteSchema.safeParse(undefined).success).toBe(true);
      });

      it("should validate encoding options", () => {
        expect(EncodingSchema.safeParse("utf8").success).toBe(true);
        expect(EncodingSchema.safeParse("base64").success).toBe(true);
        expect(EncodingSchema.safeParse(undefined).success).toBe(true);
        expect(EncodingSchema.safeParse("binary").success).toBe(false);
      });
    });

    describe("Other Common Schemas", () => {
      it("should validate model names", () => {
        expect(ModelNameSchema.safeParse("gemini-pro").success).toBe(true);
        expect(ModelNameSchema.safeParse("").success).toBe(false);
      });

      it("should validate prompts", () => {
        expect(PromptSchema.safeParse("Tell me a story").success).toBe(true);
        expect(PromptSchema.safeParse("").success).toBe(false);
      });
    });
  });
});
