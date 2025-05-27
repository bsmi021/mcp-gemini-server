// Using vitest globals - see vitest.config.ts globals: true
import { ConfigurationManager } from "../../../src/config/ConfigurationManager.js";

describe("ConfigurationManager - Multi-Model Support", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    ConfigurationManager["instance"] = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    ConfigurationManager["instance"] = null;
  });

  describe("Model Array Configuration", () => {
    it("should parse GOOGLE_GEMINI_MODELS array", () => {
      process.env.NODE_ENV = "test";
      process.env.GOOGLE_GEMINI_API_KEY = "test-key";
      process.env.GOOGLE_GEMINI_MODELS =
        '["gemini-1.5-flash", "gemini-1.5-pro"]';

      const manager = ConfigurationManager.getInstance();
      const config = manager.getModelConfiguration();

      expect(config.textGeneration).toEqual([
        "gemini-1.5-flash",
        "gemini-1.5-pro",
      ]);
    });

    it("should parse GOOGLE_GEMINI_IMAGE_MODELS array", () => {
      process.env.NODE_ENV = "test";
      process.env.GOOGLE_GEMINI_API_KEY = "test-key";
      process.env.GOOGLE_GEMINI_IMAGE_MODELS = '["imagen-3.0-generate-002"]';

      const manager = ConfigurationManager.getInstance();
      const config = manager.getModelConfiguration();

      expect(config.imageGeneration).toEqual(["imagen-3.0-generate-002"]);
    });

    it("should parse GOOGLE_GEMINI_CODE_MODELS array", () => {
      process.env.NODE_ENV = "test";
      process.env.GOOGLE_GEMINI_API_KEY = "test-key";
      process.env.GOOGLE_GEMINI_CODE_MODELS =
        '["gemini-2.5-pro-preview-05-06", "gemini-2.0-flash"]';

      const manager = ConfigurationManager.getInstance();
      const config = manager.getModelConfiguration();

      expect(config.codeReview).toEqual([
        "gemini-2.5-pro-preview-05-06",
        "gemini-2.0-flash",
      ]);
    });

    it("should handle invalid JSON gracefully", () => {
      process.env.NODE_ENV = "test";
      process.env.GOOGLE_GEMINI_API_KEY = "test-key";
      process.env.GOOGLE_GEMINI_MODELS = "invalid-json";

      const manager = ConfigurationManager.getInstance();
      const config = manager.getModelConfiguration();

      expect(config.textGeneration).toEqual(["gemini-2.5-flash-preview-05-20"]);
    });

    it("should handle non-array JSON gracefully", () => {
      process.env.NODE_ENV = "test";
      process.env.GOOGLE_GEMINI_API_KEY = "test-key";
      process.env.GOOGLE_GEMINI_MODELS = '{"not": "array"}';

      const manager = ConfigurationManager.getInstance();
      const config = manager.getModelConfiguration();

      expect(config.textGeneration).toEqual(["gemini-2.5-flash-preview-05-20"]);
    });
  });

  describe("Routing Preferences", () => {
    it("should parse routing preferences correctly", () => {
      process.env.NODE_ENV = "test";
      process.env.GOOGLE_GEMINI_API_KEY = "test-key";
      process.env.GOOGLE_GEMINI_ROUTING_PREFER_COST = "true";
      process.env.GOOGLE_GEMINI_ROUTING_PREFER_SPEED = "false";
      process.env.GOOGLE_GEMINI_ROUTING_PREFER_QUALITY = "true";

      const manager = ConfigurationManager.getInstance();
      const config = manager.getModelConfiguration();

      expect(config.routing.preferCostEffective).toBe(true);
      expect(config.routing.preferSpeed).toBe(false);
      expect(config.routing.preferQuality).toBe(true);
    });

    it("should default to quality preference when none specified", () => {
      process.env.NODE_ENV = "test";
      process.env.GOOGLE_GEMINI_API_KEY = "test-key";

      const manager = ConfigurationManager.getInstance();
      const config = manager.getModelConfiguration();

      expect(config.routing.preferCostEffective).toBe(false);
      expect(config.routing.preferSpeed).toBe(false);
      expect(config.routing.preferQuality).toBe(true);
    });
  });

  describe("Model Capabilities", () => {
    it("should provide correct capabilities for gemini-2.5-pro", () => {
      process.env.NODE_ENV = "test";
      process.env.GOOGLE_GEMINI_API_KEY = "test-key";

      const manager = ConfigurationManager.getInstance();
      const config = manager.getModelConfiguration();
      const capabilities = config.capabilities["gemini-2.5-pro-preview-05-06"];

      expect(capabilities).toBeDefined();
      expect(capabilities.textGeneration).toBe(true);
      expect(capabilities.imageInput).toBe(true);
      expect(capabilities.codeExecution).toBe("excellent");
      expect(capabilities.complexReasoning).toBe("excellent");
      expect(capabilities.costTier).toBe("high");
      expect(capabilities.contextWindow).toBe(1048576);
    });

    it("should provide correct capabilities for imagen model", () => {
      process.env.NODE_ENV = "test";
      process.env.GOOGLE_GEMINI_API_KEY = "test-key";

      const manager = ConfigurationManager.getInstance();
      const config = manager.getModelConfiguration();
      const capabilities = config.capabilities["imagen-3.0-generate-002"];

      expect(capabilities).toBeDefined();
      expect(capabilities.textGeneration).toBe(false);
      expect(capabilities.imageGeneration).toBe(true);
      expect(capabilities.codeExecution).toBe("none");
      expect(capabilities.complexReasoning).toBe("none");
    });
  });

  describe("Default Model Selection", () => {
    it("should use GOOGLE_GEMINI_DEFAULT_MODEL when provided", () => {
      process.env.NODE_ENV = "test";
      process.env.GOOGLE_GEMINI_API_KEY = "test-key";
      process.env.GOOGLE_GEMINI_DEFAULT_MODEL = "gemini-2.5-pro-preview-05-06";

      const manager = ConfigurationManager.getInstance();
      const config = manager.getModelConfiguration();

      expect(config.default).toBe("gemini-2.5-pro-preview-05-06");
    });

    it("should fallback to first text generation model when default not specified", () => {
      process.env.NODE_ENV = "test";
      process.env.GOOGLE_GEMINI_API_KEY = "test-key";
      process.env.GOOGLE_GEMINI_MODELS =
        '["gemini-1.5-pro", "gemini-1.5-flash"]';

      const manager = ConfigurationManager.getInstance();
      const config = manager.getModelConfiguration();

      expect(config.default).toBe("gemini-1.5-pro");
    });
  });

  describe("Complex Reasoning Models", () => {
    it("should filter high reasoning models correctly", () => {
      process.env.NODE_ENV = "test";
      process.env.GOOGLE_GEMINI_API_KEY = "test-key";
      process.env.GOOGLE_GEMINI_MODELS =
        '["gemini-2.5-pro-preview-05-06", "gemini-1.5-flash", "gemini-1.5-pro"]';

      const manager = ConfigurationManager.getInstance();
      const config = manager.getModelConfiguration();

      expect(config.complexReasoning).toContain("gemini-2.5-pro-preview-05-06");
      expect(config.complexReasoning).toContain("gemini-1.5-pro");
      expect(config.complexReasoning).not.toContain("gemini-1.5-flash");
    });
  });

  describe("Backward Compatibility", () => {
    it("should migrate single model to array format", () => {
      process.env.NODE_ENV = "test";
      process.env.GOOGLE_GEMINI_API_KEY = "test-key";
      process.env.GOOGLE_GEMINI_MODEL = "gemini-1.5-pro";

      const manager = ConfigurationManager.getInstance();
      const config = manager.getModelConfiguration();

      expect(config.textGeneration).toContain("gemini-1.5-pro");
    });

    it("should use old GOOGLE_GEMINI_MODEL as fallback", () => {
      process.env.NODE_ENV = "test";
      process.env.GOOGLE_GEMINI_API_KEY = "test-key";
      process.env.GOOGLE_GEMINI_MODEL = "gemini-1.5-pro";
      delete process.env.GOOGLE_GEMINI_MODELS;

      const manager = ConfigurationManager.getInstance();
      const config = manager.getModelConfiguration();

      expect(config.textGeneration).toEqual(["gemini-1.5-pro"]);
    });
  });

  describe("Environment Variable Validation", () => {
    it("should handle missing environment variables gracefully", () => {
      process.env.NODE_ENV = "test";
      process.env.GOOGLE_GEMINI_API_KEY = "test-key";

      const manager = ConfigurationManager.getInstance();
      const config = manager.getModelConfiguration();

      expect(config.default).toBeDefined();
      expect(config.textGeneration).toBeDefined();
      expect(config.imageGeneration).toBeDefined();
      expect(config.codeReview).toBeDefined();
    });

    it("should provide sensible defaults for image models", () => {
      process.env.NODE_ENV = "test";
      process.env.GOOGLE_GEMINI_API_KEY = "test-key";

      const manager = ConfigurationManager.getInstance();
      const config = manager.getModelConfiguration();

      expect(config.imageGeneration).toContain("imagen-3.0-generate-002");
    });

    it("should provide sensible defaults for code models", () => {
      process.env.NODE_ENV = "test";
      process.env.GOOGLE_GEMINI_API_KEY = "test-key";

      const manager = ConfigurationManager.getInstance();
      const config = manager.getModelConfiguration();

      expect(config.codeReview).toContain("gemini-2.5-pro-preview-05-06");
    });
  });
});
