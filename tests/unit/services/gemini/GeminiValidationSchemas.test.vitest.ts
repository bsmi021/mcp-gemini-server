// Using vitest globals - see vitest.config.ts globals: true
import { ZodError } from "zod";
import {
  validateImageGenerationParams,
  validateGenerateContentParams,
  validateRouteMessageParams,
  ImageGenerationParamsSchema,
  GenerateContentParamsSchema,
  RouteMessageParamsSchema,
  ThinkingConfigSchema,
  GenerationConfigSchema,
} from "../../../../src/services/gemini/GeminiValidationSchemas.js";

describe("GeminiValidationSchemas", () => {
  describe("Image Generation Validation", () => {
    it("should validate valid image generation parameters", () => {
      const validParams = {
        prompt: "A beautiful sunset over the ocean",
        modelName: "imagen-3.1-generate-003",
        resolution: "1024x1024",
        numberOfImages: 2,
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE",
          },
        ],
        negativePrompt: "clouds, rain",
        stylePreset: "photographic",
        seed: 12345,
        styleStrength: 0.75,
      };

      // Should not throw
      const result = ImageGenerationParamsSchema.parse(validParams);
      expect(result.prompt).toBe(validParams.prompt);
      expect(result.modelName).toBe(validParams.modelName);
      expect(result.resolution).toBe(validParams.resolution);
    });

    it("should validate using the validateImageGenerationParams helper", () => {
      const result = validateImageGenerationParams(
        "A beautiful sunset",
        "imagen-3.1-generate-003",
        "1024x1024",
        2
      );

      expect(result.prompt).toBe("A beautiful sunset");
      expect(result.modelName).toBe("imagen-3.1-generate-003");
      expect(result.resolution).toBe("1024x1024");
      expect(result.numberOfImages).toBe(2);
    });

    it("should throw on invalid prompt", () => {
      expect(() => ImageGenerationParamsSchema.parse({ prompt: "" })).toThrow(
        ZodError
      );

      try {
        ImageGenerationParamsSchema.parse({ prompt: "" });
      } catch (err) {
        expect(err).toBeInstanceOf(ZodError);
        const zodError = err as ZodError;
        expect(zodError.errors[0].path[0]).toBe("prompt");
      }
    });

    it("should throw on invalid resolution", () => {
      expect(() =>
        ImageGenerationParamsSchema.parse({
          prompt: "valid prompt",
          resolution: "invalid-resolution",
        })
      ).toThrow(ZodError);

      try {
        ImageGenerationParamsSchema.parse({
          prompt: "valid prompt",
          resolution: "invalid-resolution",
        });
      } catch (err) {
        expect(err).toBeInstanceOf(ZodError);
        const zodError = err as ZodError;
        expect(zodError.errors[0].path[0]).toBe("resolution");
      }
    });

    it("should throw on invalid numberOfImages", () => {
      expect(() =>
        ImageGenerationParamsSchema.parse({
          prompt: "valid prompt",
          numberOfImages: 20, // Max is 8
        })
      ).toThrow(ZodError);

      try {
        ImageGenerationParamsSchema.parse({
          prompt: "valid prompt",
          numberOfImages: 20, // Max is 8
        });
      } catch (err) {
        expect(err).toBeInstanceOf(ZodError);
        const zodError = err as ZodError;
        expect(zodError.errors[0].path[0]).toBe("numberOfImages");
      }
    });

    it("should throw on invalid styleStrength", () => {
      expect(() =>
        ImageGenerationParamsSchema.parse({
          prompt: "valid prompt",
          styleStrength: 2.5, // Max is 1.0
        })
      ).toThrow(ZodError);

      try {
        ImageGenerationParamsSchema.parse({
          prompt: "valid prompt",
          styleStrength: 2.5, // Max is 1.0
        });
      } catch (err) {
        expect(err).toBeInstanceOf(ZodError);
        const zodError = err as ZodError;
        expect(zodError.errors[0].path[0]).toBe("styleStrength");
      }
    });
  });

  describe("Thinking Budget Validation", () => {
    it("should validate valid thinking budget", () => {
      const validThinkingConfig = {
        thinkingBudget: 5000,
      };

      // Should not throw
      const result = ThinkingConfigSchema.parse(validThinkingConfig);
      expect(result?.thinkingBudget).toBe(5000);
    });

    it("should validate empty thinking budget object", () => {
      const emptyThinkingConfig = {};

      // Should not throw
      const result = ThinkingConfigSchema.parse(emptyThinkingConfig);
      expect(result?.thinkingBudget).toBeUndefined();
    });

    it("should validate valid reasoningEffort values", () => {
      const validValues = ["none", "low", "medium", "high"];

      for (const value of validValues) {
        // Should not throw
        const result = ThinkingConfigSchema.parse({ reasoningEffort: value });
        expect(result?.reasoningEffort).toBe(value);
      }
    });

    it("should throw on invalid reasoningEffort values", () => {
      expect(() =>
        ThinkingConfigSchema.parse({ reasoningEffort: "invalid" })
      ).toThrow(ZodError);

      try {
        ThinkingConfigSchema.parse({ reasoningEffort: "invalid" });
      } catch (err) {
        expect(err).toBeInstanceOf(ZodError);
        const zodError = err as ZodError;
        expect(zodError.errors[0].path[0]).toBe("reasoningEffort");
      }
    });

    it("should validate both thinkingBudget and reasoningEffort in same object", () => {
      const config = {
        thinkingBudget: 5000,
        reasoningEffort: "medium",
      };

      // Should not throw
      const result = ThinkingConfigSchema.parse(config);
      expect(result?.thinkingBudget).toBe(5000);
      expect(result?.reasoningEffort).toBe("medium");
    });

    it("should validate thinking budget at boundaries", () => {
      // Min value (0)
      expect(() =>
        ThinkingConfigSchema.parse({ thinkingBudget: 0 })
      ).not.toThrow();

      // Max value (24576)
      expect(() =>
        ThinkingConfigSchema.parse({ thinkingBudget: 24576 })
      ).not.toThrow();
    });

    it("should throw on invalid thinking budget values", () => {
      // Below min value
      expect(() => ThinkingConfigSchema.parse({ thinkingBudget: -1 })).toThrow(
        ZodError
      );

      try {
        ThinkingConfigSchema.parse({ thinkingBudget: -1 });
      } catch (err) {
        expect(err).toBeInstanceOf(ZodError);
        const zodError = err as ZodError;
        expect(zodError.errors[0].path[0]).toBe("thinkingBudget");
      }

      // Above max value
      expect(() =>
        ThinkingConfigSchema.parse({ thinkingBudget: 30000 })
      ).toThrow(ZodError);

      try {
        ThinkingConfigSchema.parse({ thinkingBudget: 30000 });
      } catch (err) {
        expect(err).toBeInstanceOf(ZodError);
        const zodError = err as ZodError;
        expect(zodError.errors[0].path[0]).toBe("thinkingBudget");
      }

      // Non-integer value
      expect(() =>
        ThinkingConfigSchema.parse({ thinkingBudget: 100.5 })
      ).toThrow(ZodError);

      try {
        ThinkingConfigSchema.parse({ thinkingBudget: 100.5 });
      } catch (err) {
        expect(err).toBeInstanceOf(ZodError);
        const zodError = err as ZodError;
        expect(zodError.errors[0].path[0]).toBe("thinkingBudget");
      }
    });

    it("should validate thinking config within generation config", () => {
      const validGenerationConfig = {
        temperature: 0.7,
        thinkingConfig: {
          thinkingBudget: 5000,
        },
      };

      // Should not throw
      const result = GenerationConfigSchema.parse(validGenerationConfig);
      expect(result?.temperature).toBe(0.7);
      expect(result?.thinkingConfig?.thinkingBudget).toBe(5000);
    });

    it("should validate reasoningEffort within generation config", () => {
      const validGenerationConfig = {
        temperature: 0.7,
        thinkingConfig: {
          reasoningEffort: "high",
        },
      };

      // Should not throw
      const result = GenerationConfigSchema.parse(validGenerationConfig);
      expect(result?.temperature).toBe(0.7);
      expect(result?.thinkingConfig?.reasoningEffort).toBe("high");
    });

    it("should throw on invalid thinking budget in generation config", () => {
      expect(() =>
        GenerationConfigSchema.parse({
          temperature: 0.7,
          thinkingConfig: {
            thinkingBudget: 30000, // Above max
          },
        })
      ).toThrow(ZodError);

      try {
        GenerationConfigSchema.parse({
          temperature: 0.7,
          thinkingConfig: {
            thinkingBudget: 30000, // Above max
          },
        });
      } catch (err) {
        expect(err).toBeInstanceOf(ZodError);
        const zodError = err as ZodError;
        expect(zodError.errors[0].path[0]).toBe("thinkingConfig");
        expect(zodError.errors[0].path[1]).toBe("thinkingBudget");
      }
    });
  });

  describe("Content Generation Validation", () => {
    it("should validate valid content generation parameters", () => {
      const validParams = {
        prompt: "Tell me about AI",
        modelName: "gemini-1.5-flash",
        generationConfig: {
          temperature: 0.7,
          topP: 0.9,
          maxOutputTokens: 1000,
          thinkingConfig: {
            thinkingBudget: 4096,
          },
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE",
          },
        ],
        systemInstruction: "You are a helpful assistant",
      };

      // Should not throw
      const result = GenerateContentParamsSchema.parse(validParams);
      expect(result.prompt).toBe(validParams.prompt);
      expect(result.modelName).toBe(validParams.modelName);
      expect(result.generationConfig).toEqual(validParams.generationConfig);
    });

    it("should validate using the validateGenerateContentParams helper", () => {
      const result = validateGenerateContentParams({
        prompt: "Tell me about AI",
        modelName: "gemini-1.5-flash",
      });

      expect(result.prompt).toBe("Tell me about AI");
      expect(result.modelName).toBe("gemini-1.5-flash");
    });

    it("should throw on invalid prompt", () => {
      expect(() => GenerateContentParamsSchema.parse({ prompt: "" })).toThrow(
        ZodError
      );

      try {
        GenerateContentParamsSchema.parse({ prompt: "" });
      } catch (err) {
        expect(err).toBeInstanceOf(ZodError);
        const zodError = err as ZodError;
        expect(zodError.errors[0].path[0]).toBe("prompt");
      }
    });

    it("should throw on invalid temperature", () => {
      expect(() =>
        GenerateContentParamsSchema.parse({
          prompt: "valid prompt",
          generationConfig: {
            temperature: 2.5, // Max is 1.0
          },
        })
      ).toThrow(ZodError);

      try {
        GenerateContentParamsSchema.parse({
          prompt: "valid prompt",
          generationConfig: {
            temperature: 2.5, // Max is 1.0
          },
        });
      } catch (err) {
        expect(err).toBeInstanceOf(ZodError);
        const zodError = err as ZodError;
        expect(zodError.errors[0].path[0]).toBe("generationConfig");
        expect(zodError.errors[0].path[1]).toBe("temperature");
      }
    });

    it("should accept string or ContentSchema for systemInstruction", () => {
      // String form
      expect(() =>
        GenerateContentParamsSchema.parse({
          prompt: "valid prompt",
          systemInstruction: "You are a helpful assistant",
        })
      ).not.toThrow();

      // Object form
      expect(() =>
        GenerateContentParamsSchema.parse({
          prompt: "valid prompt",
          systemInstruction: {
            role: "system",
            parts: [{ text: "You are a helpful assistant" }],
          },
        })
      ).not.toThrow();
    });
  });

  describe("Router Validation", () => {
    it("should validate valid router parameters", () => {
      const validParams = {
        message: "What is the capital of France?",
        models: ["gemini-1.5-pro", "gemini-1.5-flash"],
        routingPrompt: "Choose the best model for this question",
        defaultModel: "gemini-1.5-pro",
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1000,
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE",
          },
        ],
        systemInstruction: "You are a helpful assistant",
      };

      // Should not throw
      const result = RouteMessageParamsSchema.parse(validParams);
      expect(result.message).toBe(validParams.message);
      expect(result.models).toEqual(validParams.models);
      expect(result.routingPrompt).toBe(validParams.routingPrompt);
    });

    it("should validate using the validateRouteMessageParams helper", () => {
      const result = validateRouteMessageParams({
        message: "What is the capital of France?",
        models: ["gemini-1.5-pro", "gemini-1.5-flash"],
      });

      expect(result.message).toBe("What is the capital of France?");
      expect(result.models).toEqual(["gemini-1.5-pro", "gemini-1.5-flash"]);
    });

    it("should throw on empty message", () => {
      expect(() =>
        RouteMessageParamsSchema.parse({
          message: "",
          models: ["gemini-1.5-pro"],
        })
      ).toThrow(ZodError);

      try {
        RouteMessageParamsSchema.parse({
          message: "",
          models: ["gemini-1.5-pro"],
        });
      } catch (err) {
        expect(err).toBeInstanceOf(ZodError);
        const zodError = err as ZodError;
        expect(zodError.errors[0].path[0]).toBe("message");
      }
    });

    it("should throw on empty models array", () => {
      expect(() =>
        RouteMessageParamsSchema.parse({
          message: "valid message",
          models: [],
        })
      ).toThrow(ZodError);

      try {
        RouteMessageParamsSchema.parse({
          message: "valid message",
          models: [],
        });
      } catch (err) {
        expect(err).toBeInstanceOf(ZodError);
        const zodError = err as ZodError;
        expect(zodError.errors[0].path[0]).toBe("models");
      }
    });

    it("should throw on missing required fields", () => {
      expect(() =>
        RouteMessageParamsSchema.parse({
          // Missing required message field
          models: ["gemini-1.5-pro"],
        })
      ).toThrow(ZodError);

      try {
        RouteMessageParamsSchema.parse({
          // Missing required message field
          models: ["gemini-1.5-pro"],
        });
      } catch (err) {
        expect(err).toBeInstanceOf(ZodError);
        const zodError = err as ZodError;
        expect(zodError.errors[0].path[0]).toBe("message");
      }

      expect(() =>
        RouteMessageParamsSchema.parse({
          message: "valid message",
          // Missing required models field
        })
      ).toThrow(ZodError);

      try {
        RouteMessageParamsSchema.parse({
          message: "valid message",
          // Missing required models field
        });
      } catch (err) {
        expect(err).toBeInstanceOf(ZodError);
        const zodError = err as ZodError;
        expect(zodError.errors[0].path[0]).toBe("models");
      }
    });

    it("should validate optional fields when provided", () => {
      // Testing with just the required fields
      expect(() =>
        RouteMessageParamsSchema.parse({
          message: "valid message",
          models: ["gemini-1.5-pro"],
        })
      ).not.toThrow();

      // Testing with optional fields
      expect(() =>
        RouteMessageParamsSchema.parse({
          message: "valid message",
          models: ["gemini-1.5-pro"],
          routingPrompt: "custom prompt",
          defaultModel: "gemini-1.5-flash",
        })
      ).not.toThrow();

      // Testing with invalid optional field
      expect(() =>
        RouteMessageParamsSchema.parse({
          message: "valid message",
          models: ["gemini-1.5-pro"],
          defaultModel: "", // Empty string
        })
      ).toThrow(ZodError);

      try {
        RouteMessageParamsSchema.parse({
          message: "valid message",
          models: ["gemini-1.5-pro"],
          defaultModel: "", // Empty string
        });
      } catch (err) {
        expect(err).toBeInstanceOf(ZodError);
        const zodError = err as ZodError;
        expect(zodError.errors[0].path[0]).toBe("defaultModel");
      }
    });

    it("should accept string or ContentSchema for systemInstruction", () => {
      // String form
      expect(() =>
        RouteMessageParamsSchema.parse({
          message: "valid message",
          models: ["gemini-1.5-pro"],
          systemInstruction: "You are a helpful assistant",
        })
      ).not.toThrow();

      // Object form
      expect(() =>
        RouteMessageParamsSchema.parse({
          message: "valid message",
          models: ["gemini-1.5-pro"],
          systemInstruction: {
            parts: [{ text: "You are a helpful assistant" }],
          },
        })
      ).not.toThrow();
    });
  });
});
