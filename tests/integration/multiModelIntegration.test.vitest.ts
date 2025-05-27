/// <reference types="../../vitest-globals.d.ts" />
// Using vitest globals - see vitest.config.ts globals: true
import { ConfigurationManager } from "../../src/config/ConfigurationManager.js";
import { ModelSelectionService } from "../../src/services/ModelSelectionService.js";

describe("Multi-Model Integration Tests", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    ConfigurationManager["instance"] = null;

    process.env.NODE_ENV = "test";
    process.env.GOOGLE_GEMINI_API_KEY = "test-api-key";
    process.env.MCP_SERVER_HOST = "localhost";
    process.env.MCP_SERVER_PORT = "8080";
    process.env.MCP_CONNECTION_TOKEN = "test-token";
    process.env.MCP_CLIENT_ID = "test-client";

    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    ConfigurationManager["instance"] = null;
  });

  describe("End-to-End Configuration Flow", () => {
    it("should properly configure and use multi-model setup", () => {
      process.env.GOOGLE_GEMINI_MODELS =
        '["gemini-2.5-pro-preview-05-06", "gemini-1.5-flash"]';
      process.env.GOOGLE_GEMINI_IMAGE_MODELS = '["imagen-3.0-generate-002"]';
      process.env.GOOGLE_GEMINI_CODE_MODELS =
        '["gemini-2.5-pro-preview-05-06"]';
      process.env.GOOGLE_GEMINI_DEFAULT_MODEL = "gemini-1.5-flash";
      process.env.GOOGLE_GEMINI_ROUTING_PREFER_QUALITY = "true";

      const configManager = ConfigurationManager.getInstance();
      const modelConfig = configManager.getModelConfiguration();
      const selectionService = new ModelSelectionService(modelConfig);

      expect(modelConfig.textGeneration).toEqual([
        "gemini-2.5-pro-preview-05-06",
        "gemini-1.5-flash",
      ]);
      expect(modelConfig.imageGeneration).toEqual(["imagen-3.0-generate-002"]);
      expect(modelConfig.codeReview).toEqual(["gemini-2.5-pro-preview-05-06"]);
      expect(modelConfig.default).toBe("gemini-1.5-flash");
      expect(modelConfig.routing.preferQuality).toBe(true);

      expect(
        selectionService.isModelAvailable("gemini-2.5-pro-preview-05-06")
      ).toBe(true);
      expect(selectionService.isModelAvailable("imagen-3.0-generate-002")).toBe(
        true
      );
    });

    it("should handle model selection for different task types", async () => {
      process.env.GOOGLE_GEMINI_MODELS =
        '["gemini-2.5-pro-preview-05-06", "gemini-1.5-flash"]';
      process.env.GOOGLE_GEMINI_IMAGE_MODELS = '["imagen-3.0-generate-002"]';

      const configManager = ConfigurationManager.getInstance();
      const modelConfig = configManager.getModelConfiguration();
      const selectionService = new ModelSelectionService(modelConfig);

      const textModel = await selectionService.selectOptimalModel({
        taskType: "text-generation",
        complexityLevel: "simple",
      });

      const imageModel = await selectionService.selectOptimalModel({
        taskType: "image-generation",
      });

      const codeModel = await selectionService.selectOptimalModel({
        taskType: "code-review",
        complexityLevel: "complex",
      });

      expect(["gemini-2.5-pro-preview-05-06", "gemini-1.5-flash"]).toContain(
        textModel
      );
      expect(imageModel).toBe("imagen-3.0-generate-002");
      expect(codeModel).toBe("gemini-2.5-pro-preview-05-06");
    });
  });

  describe("Backward Compatibility Integration", () => {
    it("should seamlessly migrate from single model configuration", () => {
      process.env.GOOGLE_GEMINI_MODEL = "gemini-1.5-pro";

      const configManager = ConfigurationManager.getInstance();
      const modelConfig = configManager.getModelConfiguration();

      expect(modelConfig.textGeneration).toContain("gemini-1.5-pro");
      expect(modelConfig.default).toBe("gemini-1.5-pro");
    });

    it("should provide defaults when no models are specified", () => {
      const configManager = ConfigurationManager.getInstance();
      const modelConfig = configManager.getModelConfiguration();

      expect(modelConfig.textGeneration.length).toBeGreaterThan(0);
      expect(modelConfig.imageGeneration.length).toBeGreaterThan(0);
      expect(modelConfig.codeReview.length).toBeGreaterThan(0);
      expect(modelConfig.default).toBeDefined();
    });
  });

  describe("Performance and Reliability", () => {
    it("should handle model selection performance metrics", async () => {
      process.env.GOOGLE_GEMINI_MODELS =
        '["gemini-2.5-pro-preview-05-06", "gemini-1.5-flash"]';

      const configManager = ConfigurationManager.getInstance();
      const modelConfig = configManager.getModelConfiguration();
      const selectionService = new ModelSelectionService(modelConfig);

      selectionService.updatePerformanceMetrics("gemini-1.5-flash", 500, true);
      selectionService.updatePerformanceMetrics("gemini-1.5-flash", 450, true);
      selectionService.updatePerformanceMetrics("gemini-1.5-flash", 550, true);
      selectionService.updatePerformanceMetrics("gemini-1.5-flash", 480, true);
      selectionService.updatePerformanceMetrics("gemini-1.5-flash", 520, true);

      selectionService.updatePerformanceMetrics(
        "gemini-2.5-pro-preview-05-06",
        2000,
        false
      );
      selectionService.updatePerformanceMetrics(
        "gemini-2.5-pro-preview-05-06",
        1800,
        false
      );
      selectionService.updatePerformanceMetrics(
        "gemini-2.5-pro-preview-05-06",
        2200,
        false
      );
      selectionService.updatePerformanceMetrics(
        "gemini-2.5-pro-preview-05-06",
        1900,
        false
      );
      selectionService.updatePerformanceMetrics(
        "gemini-2.5-pro-preview-05-06",
        2100,
        false
      );

      const selectedModel = await selectionService.selectOptimalModel({
        taskType: "text-generation",
        preferSpeed: true,
      });

      expect(selectedModel).toBe("gemini-1.5-flash");

      const performanceMetrics = selectionService.getPerformanceMetrics();
      expect(performanceMetrics.has("gemini-1.5-flash")).toBe(true);
      expect(performanceMetrics.has("gemini-2.5-pro-preview-05-06")).toBe(true);
    });

    it("should maintain selection history", async () => {
      const configManager = ConfigurationManager.getInstance();
      const modelConfig = configManager.getModelConfiguration();
      const selectionService = new ModelSelectionService(modelConfig);

      await selectionService.selectOptimalModel({
        taskType: "text-generation",
      });
      await selectionService.selectOptimalModel({ taskType: "code-review" });
      await selectionService.selectOptimalModel({ taskType: "reasoning" });

      const history = selectionService.getSelectionHistory();
      expect(history.length).toBe(3);
      expect(history[0].criteria.taskType).toBe("text-generation");
      expect(history[1].criteria.taskType).toBe("code-review");
      expect(history[2].criteria.taskType).toBe("reasoning");
    });
  });

  describe("Error Handling and Edge Cases", () => {
    it("should handle invalid model configurations gracefully", () => {
      process.env.GOOGLE_GEMINI_MODELS = "invalid-json";
      process.env.GOOGLE_GEMINI_IMAGE_MODELS = '{"not": "array"}';

      expect(() => {
        const configManager = ConfigurationManager.getInstance();
        const modelConfig = configManager.getModelConfiguration();
        new ModelSelectionService(modelConfig);
      }).not.toThrow();
    });

    it("should fallback gracefully when no models match criteria", async () => {
      process.env.GOOGLE_GEMINI_MODELS = '["gemini-1.5-flash"]';

      const configManager = ConfigurationManager.getInstance();
      const modelConfig = configManager.getModelConfiguration();
      const selectionService = new ModelSelectionService(modelConfig);

      const model = await selectionService.selectOptimalModel({
        taskType: "image-generation",
        fallbackModel: "fallback-model",
      });

      expect(model).toBe("fallback-model");
    });

    it("should handle empty model arrays", () => {
      process.env.GOOGLE_GEMINI_MODELS = "[]";

      const configManager = ConfigurationManager.getInstance();
      const modelConfig = configManager.getModelConfiguration();

      expect(modelConfig.textGeneration).toEqual(["gemini-1.5-flash"]);
    });
  });

  describe("Configuration Validation", () => {
    it("should validate model capabilities consistency", () => {
      const configManager = ConfigurationManager.getInstance();
      const modelConfig = configManager.getModelConfiguration();

      Object.entries(modelConfig.capabilities).forEach(
        ([_modelName, capabilities]) => {
          expect(typeof capabilities.textGeneration).toBe("boolean");
          expect(typeof capabilities.imageInput).toBe("boolean");
          expect(typeof capabilities.supportsFunctionCalling).toBe("boolean");
          expect(["none", "basic", "good", "excellent"]).toContain(
            capabilities.codeExecution
          );
          expect(["none", "basic", "good", "excellent"]).toContain(
            capabilities.complexReasoning
          );
          expect(["low", "medium", "high"]).toContain(capabilities.costTier);
          expect(["fast", "medium", "slow"]).toContain(capabilities.speedTier);
          expect(typeof capabilities.maxTokens).toBe("number");
          expect(typeof capabilities.contextWindow).toBe("number");
        }
      );
    });

    it("should ensure all configured models have capabilities defined", () => {
      const configManager = ConfigurationManager.getInstance();
      const modelConfig = configManager.getModelConfiguration();

      const allConfiguredModels = [
        ...modelConfig.textGeneration,
        ...modelConfig.imageGeneration,
        ...modelConfig.codeReview,
        ...modelConfig.complexReasoning,
      ];

      allConfiguredModels.forEach((modelName) => {
        expect(modelConfig.capabilities[modelName]).toBeDefined();
      });
    });
  });
});
