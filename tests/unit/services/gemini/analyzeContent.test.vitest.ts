// Using vitest globals - see vitest.config.ts globals: true
import { GeminiService } from "../../../../src/services/GeminiService.js";
import { ImagePart } from "../../../../src/services/gemini/GeminiTypes.js";

// Mock the dependencies
vi.mock("../../../../src/config/ConfigurationManager.js", () => ({
  ConfigurationManager: {
    getInstance: vi.fn(() => ({
      getGeminiServiceConfig: vi.fn(() => ({
        apiKey: "test-api-key",
        defaultModel: "gemini-1.5-flash",
        defaultThinkingBudget: 5,
      })),
      getSecureFileBasePath: vi.fn(() => null),
      getGitHubApiToken: vi.fn(() => "test-github-token"),
      getModelConfiguration: vi.fn(() => ({
        default: "gemini-2.5-flash",
        textGeneration: ["gemini-2.5-flash"],
        imageGeneration: ["imagen-3.0-generate-002"],
        capabilities: {
          "gemini-2.5-flash": {
            textGeneration: true,
            costTier: "medium",
            speedTier: "fast",
          },
        },
        routing: {
          preferQuality: true,
          preferSpeed: false,
          preferCost: false,
        },
      })),
    })),
  },
}));

vi.mock("../../../../src/services/ModelSelectionService.js", () => ({
  ModelSelectionService: vi.fn().mockImplementation(() => ({
    selectOptimalModel: vi.fn(() => Promise.resolve("gemini-2.5-flash")),
    isModelAvailable: vi.fn(() => true),
    getAvailableModels: vi.fn(() => ["gemini-2.5-flash"]),
    validateModelForTask: vi.fn(() => true),
  })),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      getGenerativeModel: vi.fn(() => ({
        generateImages: vi.fn(),
      })),
      generateContent: vi.fn(),
    },
    getGenerativeModel: vi.fn(() => ({
      generateContent: vi.fn(),
    })),
  })),
  HarmCategory: {
    HARM_CATEGORY_HARASSMENT: "HARM_CATEGORY_HARASSMENT",
    HARM_CATEGORY_HATE_SPEECH: "HARM_CATEGORY_HATE_SPEECH",
    HARM_CATEGORY_SEXUALLY_EXPLICIT: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    HARM_CATEGORY_DANGEROUS_CONTENT: "HARM_CATEGORY_DANGEROUS_CONTENT",
  },
  HarmBlockThreshold: {
    BLOCK_NONE: "BLOCK_NONE",
    BLOCK_ONLY_HIGH: "BLOCK_ONLY_HIGH",
    BLOCK_MEDIUM_AND_ABOVE: "BLOCK_MEDIUM_AND_ABOVE",
    BLOCK_LOW_AND_ABOVE: "BLOCK_LOW_AND_ABOVE",
  },
}));

describe("GeminiService.analyzeContent", () => {
  let service: GeminiService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GeminiService();
  });

  it("should analyze content using generateContent internally", async () => {
    const testImage: ImagePart = {
      type: "base64",
      data: "base64encodeddata",
      mimeType: "image/png",
    };

    const mockResponse =
      "This image contains a chart showing quarterly revenue growth.";

    // Mock the generateContent method
    vi.spyOn(service, "generateContent").mockResolvedValue(mockResponse);

    const result = await service.analyzeContent(
      testImage,
      "Analyze this chart and describe what you see"
    );

    expect(service.generateContent).toHaveBeenCalledWith({
      prompt: "Analyze this chart and describe what you see",
      modelName: "gemini-1.5-flash",
      fileReferenceOrInlineData: testImage,
      safetySettings: undefined,
      generationConfig: undefined,
    });

    expect(result).toEqual({
      analysis: {
        text: mockResponse,
      },
    });
  });

  it("should handle structured output requests", async () => {
    const testImage: ImagePart = {
      type: "url",
      data: "https://example.com/image.png",
      mimeType: "image/png",
    };

    const mockResponse =
      '```json\n{"title": "Revenue Chart", "type": "bar", "dataPoints": 4}\n```';

    // Mock the generateContent method
    vi.spyOn(service, "generateContent").mockResolvedValue(mockResponse);

    const result = await service.analyzeContent(
      testImage,
      "Extract the chart data",
      true, // structuredOutput
      "gemini-1.5-pro"
    );

    expect(service.generateContent).toHaveBeenCalledWith({
      prompt:
        "Extract the chart data\n\nPlease provide your analysis in a structured JSON format.",
      modelName: "gemini-1.5-pro",
      fileReferenceOrInlineData: testImage,
      safetySettings: undefined,
      generationConfig: {
        temperature: 0.1,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048,
      },
    });

    expect(result).toEqual({
      analysis: {
        data: {
          title: "Revenue Chart",
          type: "bar",
          dataPoints: 4,
        },
        text: mockResponse,
      },
    });
  });

  it("should handle JSON parsing failures gracefully", async () => {
    const testImage: ImagePart = {
      type: "base64",
      data: "base64encodeddata",
      mimeType: "image/jpeg",
    };

    const mockResponse = "This is not valid JSON but describes the chart well.";

    // Mock the generateContent method
    vi.spyOn(service, "generateContent").mockResolvedValue(mockResponse);

    const result = await service.analyzeContent(
      testImage,
      "Extract structured data",
      true // structuredOutput
    );

    // Should fall back to text-only response when JSON parsing fails
    expect(result).toEqual({
      analysis: {
        text: mockResponse,
      },
    });
  });

  it("should propagate errors from generateContent", async () => {
    const testImage: ImagePart = {
      type: "base64",
      data: "base64encodeddata",
      mimeType: "image/png",
    };

    const mockError = new Error("API request failed");

    // Mock the generateContent method to throw an error
    vi.spyOn(service, "generateContent").mockRejectedValue(mockError);

    await expect(
      service.analyzeContent(testImage, "Analyze this image")
    ).rejects.toThrow("API request failed");
  });
});
