// Using vitest globals - see vitest.config.ts globals: true
import { ModelSelectionService } from "../../../src/services/ModelSelectionService.js";
import {
  ModelConfiguration,
  ModelCapabilitiesMap,
} from "../../../src/types/index.js";

describe("ModelSelectionService", () => {
  let service: ModelSelectionService;
  let mockConfig: ModelConfiguration;

  beforeEach(() => {
    const capabilities: ModelCapabilitiesMap = {
      "gemini-2.5-pro-preview-05-06": {
        textGeneration: true,
        imageInput: true,
        videoInput: true,
        audioInput: true,
        imageGeneration: false,
        videoGeneration: false,
        codeExecution: "excellent",
        complexReasoning: "excellent",
        costTier: "high",
        speedTier: "medium",
        maxTokens: 65536,
        contextWindow: 1048576,
        supportsFunctionCalling: true,
        supportsSystemInstructions: true,
        supportsCaching: true,
      },
      "gemini-2.5-flash-preview-05-20": {
        textGeneration: true,
        imageInput: true,
        videoInput: true,
        audioInput: true,
        imageGeneration: false,
        videoGeneration: false,
        codeExecution: "excellent",
        complexReasoning: "excellent",
        costTier: "medium",
        speedTier: "fast",
        maxTokens: 65536,
        contextWindow: 1048576,
        supportsFunctionCalling: true,
        supportsSystemInstructions: true,
        supportsCaching: true,
      },
      "gemini-2.0-flash": {
        textGeneration: true,
        imageInput: true,
        videoInput: true,
        audioInput: true,
        imageGeneration: false,
        videoGeneration: false,
        codeExecution: "good",
        complexReasoning: "good",
        costTier: "medium",
        speedTier: "fast",
        maxTokens: 8192,
        contextWindow: 1048576,
        supportsFunctionCalling: true,
        supportsSystemInstructions: true,
        supportsCaching: true,
      },
      "gemini-1.5-flash": {
        textGeneration: true,
        imageInput: true,
        videoInput: true,
        audioInput: true,
        imageGeneration: false,
        videoGeneration: false,
        codeExecution: "basic",
        complexReasoning: "basic",
        costTier: "low",
        speedTier: "fast",
        maxTokens: 8192,
        contextWindow: 1000000,
        supportsFunctionCalling: true,
        supportsSystemInstructions: true,
        supportsCaching: true,
      },
      "imagen-3.0-generate-002": {
        textGeneration: false,
        imageInput: false,
        videoInput: false,
        audioInput: false,
        imageGeneration: true,
        videoGeneration: false,
        codeExecution: "none",
        complexReasoning: "none",
        costTier: "medium",
        speedTier: "medium",
        maxTokens: 0,
        contextWindow: 0,
        supportsFunctionCalling: false,
        supportsSystemInstructions: false,
        supportsCaching: false,
      },
      "gemini-2.0-flash-preview-image-generation": {
        textGeneration: true,
        imageInput: true,
        videoInput: false,
        audioInput: false,
        imageGeneration: true,
        videoGeneration: false,
        codeExecution: "basic",
        complexReasoning: "basic",
        costTier: "medium",
        speedTier: "medium",
        maxTokens: 8192,
        contextWindow: 32000,
        supportsFunctionCalling: false,
        supportsSystemInstructions: true,
        supportsCaching: false,
      },
    };

    mockConfig = {
      default: "gemini-2.5-flash-preview-05-20",
      textGeneration: [
        "gemini-2.5-pro-preview-05-06",
        "gemini-2.5-flash-preview-05-20",
        "gemini-2.0-flash",
        "gemini-1.5-flash",
      ],
      imageGeneration: [
        "imagen-3.0-generate-002",
        "gemini-2.0-flash-preview-image-generation",
      ],
      videoGeneration: [],
      codeReview: [
        "gemini-2.5-pro-preview-05-06",
        "gemini-2.5-flash-preview-05-20",
        "gemini-2.0-flash",
      ],
      complexReasoning: [
        "gemini-2.5-pro-preview-05-06",
        "gemini-2.5-flash-preview-05-20",
      ],
      capabilities,
      routing: {
        preferCostEffective: false,
        preferSpeed: false,
        preferQuality: true,
      },
    };

    service = new ModelSelectionService(mockConfig);
  });

  describe("selectOptimalModel", () => {
    it("should select a model for text generation", async () => {
      const model = await service.selectOptimalModel({
        taskType: "text-generation",
        complexityLevel: "simple",
      });

      expect(mockConfig.textGeneration).toContain(model);
    });

    it("should prefer cost-effective models when specified", async () => {
      const model = await service.selectOptimalModel({
        taskType: "text-generation",
        preferCost: true,
      });

      const capabilities = service.getModelCapabilities(model);
      expect(capabilities?.costTier).toBe("low");
    });

    it("should prefer fast models when speed is prioritized", async () => {
      const model = await service.selectOptimalModel({
        taskType: "text-generation",
        preferSpeed: true,
      });

      const capabilities = service.getModelCapabilities(model);
      expect(capabilities?.speedTier).toBe("fast");
    });

    it("should select high-quality models for complex tasks", async () => {
      const model = await service.selectOptimalModel({
        taskType: "reasoning",
        complexityLevel: "complex",
        preferQuality: true,
      });

      const capabilities = service.getModelCapabilities(model);
      expect(capabilities?.complexReasoning).toBe("excellent");
    });

    it("should return fallback model when no candidates match", async () => {
      const model = await service.selectOptimalModel({
        taskType: "text-generation",
        requiredCapabilities: ["imageGeneration"],
        fallbackModel: "gemini-1.5-flash",
      });

      expect(model).toBe("gemini-1.5-flash");
    });

    it("should select image generation models correctly", async () => {
      const model = await service.selectOptimalModel({
        taskType: "image-generation",
      });

      expect(mockConfig.imageGeneration).toContain(model);
      const capabilities = service.getModelCapabilities(model);
      expect(capabilities?.imageGeneration).toBe(true);
    });

    it("should filter models by required capabilities", async () => {
      const model = await service.selectOptimalModel({
        taskType: "text-generation",
        requiredCapabilities: ["supportsFunctionCalling", "supportsCaching"],
      });

      const capabilities = service.getModelCapabilities(model);
      expect(capabilities?.supportsFunctionCalling).toBe(true);
      expect(capabilities?.supportsCaching).toBe(true);
    });
  });

  describe("validateModelForTask", () => {
    it("should validate text generation models", () => {
      expect(
        service.validateModelForTask(
          "gemini-2.5-pro-preview-05-06",
          "text-generation"
        )
      ).toBe(true);
      expect(
        service.validateModelForTask(
          "imagen-3.0-generate-002",
          "text-generation"
        )
      ).toBe(false);
    });

    it("should validate image generation models", () => {
      expect(
        service.validateModelForTask(
          "imagen-3.0-generate-002",
          "image-generation"
        )
      ).toBe(true);
      expect(
        service.validateModelForTask(
          "gemini-2.5-pro-preview-05-06",
          "image-generation"
        )
      ).toBe(false);
    });

    it("should validate code review models", () => {
      expect(
        service.validateModelForTask(
          "gemini-2.5-pro-preview-05-06",
          "code-review"
        )
      ).toBe(true);
      expect(
        service.validateModelForTask("gemini-1.5-flash", "code-review")
      ).toBe(true);
      expect(
        service.validateModelForTask("imagen-3.0-generate-002", "code-review")
      ).toBe(false);
    });

    it("should validate multimodal models", () => {
      expect(
        service.validateModelForTask(
          "gemini-2.5-pro-preview-05-06",
          "multimodal"
        )
      ).toBe(true);
      expect(
        service.validateModelForTask("imagen-3.0-generate-002", "multimodal")
      ).toBe(false);
    });
  });

  describe("updatePerformanceMetrics", () => {
    it("should track performance metrics", () => {
      service.updatePerformanceMetrics(
        "gemini-2.5-pro-preview-05-06",
        1000,
        true
      );
      service.updatePerformanceMetrics(
        "gemini-2.5-pro-preview-05-06",
        1200,
        true
      );
      service.updatePerformanceMetrics(
        "gemini-2.5-pro-preview-05-06",
        800,
        false
      );

      const metrics = service.getPerformanceMetrics();
      const proMetrics = metrics.get("gemini-2.5-pro-preview-05-06");

      expect(proMetrics).toBeDefined();
      expect(proMetrics?.totalCalls).toBe(3);
      expect(proMetrics?.avgLatency).toBe(1000);
      expect(proMetrics?.successRate).toBeCloseTo(0.667, 2);
    });

    it("should influence model selection based on performance", async () => {
      service.updatePerformanceMetrics(
        "gemini-2.5-flash-preview-05-20",
        500,
        true
      );
      service.updatePerformanceMetrics(
        "gemini-2.5-flash-preview-05-20",
        600,
        true
      );
      service.updatePerformanceMetrics(
        "gemini-2.5-flash-preview-05-20",
        400,
        true
      );
      service.updatePerformanceMetrics(
        "gemini-2.5-flash-preview-05-20",
        550,
        true
      );
      service.updatePerformanceMetrics(
        "gemini-2.5-flash-preview-05-20",
        450,
        true
      );

      service.updatePerformanceMetrics(
        "gemini-2.5-pro-preview-05-06",
        2000,
        false
      );
      service.updatePerformanceMetrics(
        "gemini-2.5-pro-preview-05-06",
        1800,
        false
      );
      service.updatePerformanceMetrics(
        "gemini-2.5-pro-preview-05-06",
        2200,
        false
      );
      service.updatePerformanceMetrics(
        "gemini-2.5-pro-preview-05-06",
        1900,
        false
      );
      service.updatePerformanceMetrics(
        "gemini-2.5-pro-preview-05-06",
        2100,
        false
      );

      const model = await service.selectOptimalModel({
        taskType: "text-generation",
        complexityLevel: "medium",
      });

      expect(model).toBe("gemini-2.5-flash-preview-05-20");
    });
  });

  describe("getSelectionHistory", () => {
    it("should track selection history", async () => {
      await service.selectOptimalModel({ taskType: "text-generation" });
      await service.selectOptimalModel({ taskType: "image-generation" });

      const history = service.getSelectionHistory();
      expect(history).toHaveLength(2);
      expect(history[0].criteria.taskType).toBe("text-generation");
      expect(history[1].criteria.taskType).toBe("image-generation");
    });

    it("should limit history size", async () => {
      for (let i = 0; i < 1200; i++) {
        await service.selectOptimalModel({ taskType: "text-generation" });
      }

      const history = service.getSelectionHistory();
      expect(history.length).toBeLessThanOrEqual(500);
    });

    it("should return limited history when requested", async () => {
      for (let i = 0; i < 10; i++) {
        await service.selectOptimalModel({ taskType: "text-generation" });
      }

      const limitedHistory = service.getSelectionHistory(5);
      expect(limitedHistory).toHaveLength(5);
    });
  });

  describe("isModelAvailable", () => {
    it("should check model availability", () => {
      expect(service.isModelAvailable("gemini-2.5-pro-preview-05-06")).toBe(
        true
      );
      expect(service.isModelAvailable("non-existent-model")).toBe(false);
    });
  });

  describe("getAvailableModels", () => {
    it("should return all available models", () => {
      const models = service.getAvailableModels();
      expect(models).toContain("gemini-2.5-pro-preview-05-06");
      expect(models).toContain("gemini-2.5-flash-preview-05-20");
      expect(models).toContain("gemini-1.5-flash");
      expect(models).toContain("imagen-3.0-generate-002");
    });
  });

  describe("updateConfiguration", () => {
    it("should update configuration and reinitialize cache", () => {
      const newConfig = {
        ...mockConfig,
        textGeneration: ["gemini-2.5-pro-preview-05-06"],
      };

      service.updateConfiguration(newConfig);

      const models = service.getAvailableModels();
      expect(models).toContain("gemini-2.5-pro-preview-05-06");
    });
  });

  describe("error handling", () => {
    it("should handle errors gracefully and return fallback", async () => {
      const corruptedService = new ModelSelectionService({
        ...mockConfig,
        capabilities: {},
      });

      const model = await corruptedService.selectOptimalModel({
        taskType: "text-generation",
        fallbackModel: "fallback-model",
      });

      expect(model).toBe("fallback-model");
    });
  });
});
