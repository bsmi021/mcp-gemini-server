// Using vitest globals - see vitest.config.ts globals: true
import { geminiAnalyzeMediaTool } from "../../../src/tools/geminiAnalyzeMediaTool.js";
import { GeminiService } from "../../../src/services/index.js";
import * as filePathSecurity from "../../../src/utils/filePathSecurity.js";
import fs from "fs";

// Mock dependencies
vi.mock("../../../src/services/index.js");
vi.mock("../../../src/utils/filePathSecurity.js");
vi.mock("fs");

interface MockGeminiService {
  detectObjects: ReturnType<typeof vi.fn>;
  analyzeContent: ReturnType<typeof vi.fn>;
  generateContent: ReturnType<typeof vi.fn>;
}

describe("geminiAnalyzeMediaTool", () => {
  let mockGeminiService: MockGeminiService;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock GeminiService
    mockGeminiService = {
      detectObjects: vi.fn(),
      analyzeContent: vi.fn(),
      generateContent: vi.fn(),
    };

    vi.mocked(GeminiService).mockImplementation(() => mockGeminiService);
  });

  describe("Tool Configuration", () => {
    it("should have correct name and description", () => {
      expect(geminiAnalyzeMediaTool.name).toBe("gemini_analyze_media");
      expect(geminiAnalyzeMediaTool.description).toContain(
        "Analyzes various media types"
      );
    });

    it("should have valid input schema", () => {
      expect(geminiAnalyzeMediaTool.inputSchema).toBeDefined();
      expect(geminiAnalyzeMediaTool.inputSchema._def.discriminator).toBe(
        "analysisType"
      );
    });
  });

  describe("Object Detection", () => {
    it("should handle object detection with base64 image", async () => {
      const mockResult = {
        objects: [
          {
            name: "car",
            confidence: 0.95,
            boundingBox: { x: 10, y: 20, width: 100, height: 50 },
          },
          {
            name: "person",
            confidence: 0.87,
            boundingBox: { x: 150, y: 30, width: 40, height: 80 },
          },
        ],
        rawText: "A car and a person detected in the image",
      };

      mockGeminiService.detectObjects.mockResolvedValue(mockResult);

      const args = {
        analysisType: "object_detection" as const,
        image: {
          base64: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
          mimeType: "image/jpeg" as const,
        },
        outputFormat: "json" as const,
      };

      const result = await geminiAnalyzeMediaTool.execute(args);

      expect(mockGeminiService.detectObjects).toHaveBeenCalledWith(
        expect.objectContaining({
          inlineData: {
            data: "/9j/4AAQSkZJRg==",
            mimeType: "image/jpeg",
          },
        }),
        undefined,
        undefined,
        undefined
      );

      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain('"objects"');
    });

    it("should reject URL images with error", async () => {
      const args = {
        analysisType: "object_detection" as const,
        image: {
          base64: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
          url: "https://example.com/image.jpg",
          mimeType: "image/jpeg" as const,
        },
        promptAddition: "focus on animals",
        outputFormat: "text" as const,
      };

      await expect(geminiAnalyzeMediaTool.execute(args)).rejects.toThrow(
        "URL-based images are not supported. Please provide base64-encoded image data instead."
      );
    });
  });

  describe("Content Understanding", () => {
    it("should handle content understanding with structured output", async () => {
      const mockResult = {
        analysis: {
          data: {
            description: "Beach scene",
            elements: ["ocean", "sand", "sunset"],
          },
        },
      };

      mockGeminiService.analyzeContent.mockResolvedValue(mockResult);

      const args = {
        analysisType: "content_understanding" as const,
        image: {
          base64: "data:image/png;base64,iVBORw0KGgo=",
          mimeType: "image/png" as const,
        },
        prompt: "Describe the scene",
        structuredOutput: true,
      };

      const result = await geminiAnalyzeMediaTool.execute(args);

      expect(mockGeminiService.analyzeContent).toHaveBeenCalledWith(
        expect.any(Object),
        "Describe the scene",
        true,
        undefined,
        undefined
      );

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult.description).toBe("Beach scene");
    });

    it("should handle content understanding with text output", async () => {
      const mockResult = {
        analysis: {
          text: "This is a beautiful mountain landscape with snow-capped peaks.",
        },
      };

      mockGeminiService.analyzeContent.mockResolvedValue(mockResult);

      const args = {
        analysisType: "content_understanding" as const,
        image: {
          base64: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
          mimeType: "image/jpeg" as const,
        },
        prompt: "Describe the landscape",
        structuredOutput: false,
      };

      const result = await geminiAnalyzeMediaTool.execute(args);

      expect(result.content[0].text).toBe(
        "This is a beautiful mountain landscape with snow-capped peaks."
      );
    });
  });

  describe("Audio Transcription", () => {
    it("should handle small audio file transcription", async () => {
      vi.mocked(filePathSecurity.validateAndResolvePath).mockReturnValue(
        "/safe/path/audio.mp3"
      );
      vi.mocked(fs.statSync).mockReturnValue({
        size: 5 * 1024 * 1024,
      } as fs.Stats); // 5MB
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("audio data"));

      mockGeminiService.generateContent.mockResolvedValue({
        generatedText: "This is the transcribed text from the audio file.",
      });

      const args = {
        analysisType: "audio_transcription" as const,
        filePath: "/path/to/audio.mp3",
        includeTimestamps: false,
      };

      const result = await geminiAnalyzeMediaTool.execute(args);

      expect(filePathSecurity.validateAndResolvePath).toHaveBeenCalledWith(
        "/path/to/audio.mp3",
        expect.objectContaining({ mustExist: true })
      );

      expect(mockGeminiService.generateContent).toHaveBeenCalledWith({
        prompt: "Transcribe this audio file accurately",
        modelName: undefined,
        fileReferenceOrInlineData: Buffer.from("audio data").toString("base64"),
        inlineDataMimeType: "audio/mp3",
      });

      expect(result.content[0].text).toBe(
        "This is the transcribed text from the audio file."
      );
    });

    it("should reject large audio files over 20MB", async () => {
      vi.mocked(filePathSecurity.validateAndResolvePath).mockReturnValue(
        "/safe/path/large-audio.wav"
      );
      vi.mocked(fs.statSync).mockReturnValue({
        size: 25 * 1024 * 1024,
      } as fs.Stats); // 25MB

      const args = {
        analysisType: "audio_transcription" as const,
        filePath: "/path/to/large-audio.wav",
        includeTimestamps: true,
        language: "en",
        prompt: "Focus on dialogue",
      };

      await expect(geminiAnalyzeMediaTool.execute(args)).rejects.toThrow(
        "Audio file size (25.00MB) exceeds the 20MB limit for inline data"
      );
    });
  });

  describe("Error Handling", () => {
    it("should handle errors in object detection", async () => {
      mockGeminiService.detectObjects.mockRejectedValue(
        new Error("Detection failed")
      );

      const args = {
        analysisType: "object_detection" as const,
        image: {
          base64: "invalid-base64",
          mimeType: "image/jpeg" as const,
        },
        outputFormat: "json" as const,
      };

      await expect(geminiAnalyzeMediaTool.execute(args)).rejects.toThrow();
    });

    it("should handle missing image data", async () => {
      const args = {
        analysisType: "object_detection" as const,
        image: {
          base64: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
          mimeType: "image/jpeg" as const,
        },
        outputFormat: "json" as const,
      };

      await expect(geminiAnalyzeMediaTool.execute(args)).rejects.toThrow();
    });

    it("should handle missing analysis result", async () => {
      mockGeminiService.analyzeContent.mockResolvedValue({ analysis: {} });

      const args = {
        analysisType: "content_understanding" as const,
        image: {
          base64: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
          mimeType: "image/jpeg" as const,
        },
        prompt: "Describe",
        structuredOutput: false,
      };

      await expect(geminiAnalyzeMediaTool.execute(args)).rejects.toThrow(
        "No content understanding result available"
      );
    });
    it("should handle unknown analysis type", async () => {
      const args = {
        analysisType: "unknown_type" as any,
        image: {
          base64: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
          mimeType: "image/jpeg" as const,
        },
        outputFormat: "json" as const,
      };

      await expect(geminiAnalyzeMediaTool.execute(args)).rejects.toThrow(
        "Unknown analysis type"
      );
    });
  });

  describe("Large Base64 Image Processing", () => {
    it("should handle large base64 images with streaming", async () => {
      // Create a large base64 string (>5MB)
      const largeBase64Data = "A".repeat(6 * 1024 * 1024); // 6MB of 'A' characters
      const largeBase64 = `data:image/jpeg;base64,${largeBase64Data}`;

      const mockResult = {
        objects: [{ name: "large_object", confidence: 0.9 }],
        rawText: "Large image processed",
      };

      mockGeminiService.detectObjects.mockResolvedValue(mockResult);

      const args = {
        analysisType: "object_detection" as const,
        image: {
          base64: largeBase64,
          mimeType: "image/jpeg" as const,
        },
        outputFormat: "json" as const,
      };

      const result = await geminiAnalyzeMediaTool.execute(args);

      expect(mockGeminiService.detectObjects).toHaveBeenCalledWith(
        expect.objectContaining({
          inlineData: {
            data: largeBase64Data,
            mimeType: "image/jpeg",
          },
        }),
        undefined,
        undefined,
        undefined
      );

      expect(result.content[0].text).toContain("large_object");
    });

    it("should handle invalid base64 format", async () => {
      const args = {
        analysisType: "object_detection" as const,
        image: {
          base64: "invalid-base64-format",
          mimeType: "image/jpeg" as const,
        },
        outputFormat: "json" as const,
      };

      await expect(geminiAnalyzeMediaTool.execute(args)).rejects.toThrow(
        "Invalid base64 data URL format"
      );
    });
  });

  describe("Safety Settings", () => {
    it("should pass safety settings to object detection", async () => {
      const mockResult = {
        objects: [{ name: "safe_object", confidence: 0.95 }],
        rawText: "Safe detection result",
      };

      mockGeminiService.detectObjects.mockResolvedValue(mockResult);

      const safetySettings = [
        {
          category: "HARM_CATEGORY_HARASSMENT" as const,
          threshold: "BLOCK_MEDIUM_AND_ABOVE" as const,
        },
      ];

      const args = {
        analysisType: "object_detection" as const,
        image: {
          base64: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
          mimeType: "image/jpeg" as const,
        },
        outputFormat: "json" as const,
        safetySettings,
      };

      await geminiAnalyzeMediaTool.execute(args);

      expect(mockGeminiService.detectObjects).toHaveBeenCalledWith(
        expect.any(Object),
        undefined,
        undefined,
        safetySettings
      );
    });

    it("should pass safety settings to content understanding", async () => {
      const mockResult = {
        analysis: {
          text: "Safe content analysis",
        },
      };

      mockGeminiService.analyzeContent.mockResolvedValue(mockResult);

      const safetySettings = [
        {
          category: "HARM_CATEGORY_HATE_SPEECH" as const,
          threshold: "BLOCK_LOW_AND_ABOVE" as const,
        },
      ];

      const args = {
        analysisType: "content_understanding" as const,
        image: {
          base64: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
          mimeType: "image/jpeg" as const,
        },
        prompt: "Analyze safely",
        structuredOutput: false,
        safetySettings,
      };

      await geminiAnalyzeMediaTool.execute(args);

      expect(mockGeminiService.analyzeContent).toHaveBeenCalledWith(
        expect.any(Object),
        "Analyze safely",
        false,
        undefined,
        safetySettings
      );
    });
  });

  describe("Model Selection", () => {
    it("should pass custom model name to object detection", async () => {
      const mockResult = {
        objects: [{ name: "detected_object", confidence: 0.88 }],
        rawText: "Custom model detection",
      };

      mockGeminiService.detectObjects.mockResolvedValue(mockResult);

      const args = {
        analysisType: "object_detection" as const,
        image: {
          base64: "data:image/png;base64,iVBORw0KGgo=",
          mimeType: "image/png" as const,
        },
        outputFormat: "json" as const,
        modelName: "gemini-1.5-pro",
      };

      await geminiAnalyzeMediaTool.execute(args);

      expect(mockGeminiService.detectObjects).toHaveBeenCalledWith(
        expect.any(Object),
        undefined,
        "gemini-1.5-pro",
        undefined
      );
    });

    it("should pass custom model name to content understanding", async () => {
      const mockResult = {
        analysis: {
          data: { custom_analysis: "result" },
        },
      };

      mockGeminiService.analyzeContent.mockResolvedValue(mockResult);

      const args = {
        analysisType: "content_understanding" as const,
        image: {
          base64: "data:image/webp;base64,UklGRg==",
          mimeType: "image/webp" as const,
        },
        prompt: "Custom analysis",
        structuredOutput: true,
        modelName: "gemini-1.5-pro",
      };

      await geminiAnalyzeMediaTool.execute(args);

      expect(mockGeminiService.analyzeContent).toHaveBeenCalledWith(
        expect.any(Object),
        "Custom analysis",
        true,
        "gemini-1.5-pro",
        undefined
      );
    });

    it("should pass custom model name to audio transcription", async () => {
      vi.mocked(filePathSecurity.validateAndResolvePath).mockReturnValue(
        "/safe/path/audio.wav"
      );
      vi.mocked(fs.statSync).mockReturnValue({
        size: 10 * 1024 * 1024,
      } as fs.Stats);
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("audio data"));

      mockGeminiService.generateContent.mockResolvedValue({
        generatedText: "Custom model transcription",
      });

      const args = {
        analysisType: "audio_transcription" as const,
        filePath: "/path/to/audio.wav",
        includeTimestamps: false,
        modelName: "gemini-1.5-pro",
      };

      await geminiAnalyzeMediaTool.execute(args);

      expect(mockGeminiService.generateContent).toHaveBeenCalledWith({
        prompt: "Transcribe this audio file accurately",
        modelName: "gemini-1.5-pro",
        fileReferenceOrInlineData: expect.any(String),
        inlineDataMimeType: "audio/wav",
      });
    });
  });

  describe("Audio Transcription Edge Cases", () => {
    it("should handle audio transcription with all optional parameters", async () => {
      vi.mocked(filePathSecurity.validateAndResolvePath).mockReturnValue(
        "/safe/path/audio.aac"
      );
      vi.mocked(fs.statSync).mockReturnValue({
        size: 15 * 1024 * 1024,
      } as fs.Stats);
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("audio data"));

      mockGeminiService.generateContent.mockResolvedValue({
        generatedText: "Detailed transcription with timestamps",
      });

      const args = {
        analysisType: "audio_transcription" as const,
        filePath: "/path/to/audio.aac",
        includeTimestamps: true,
        language: "es",
        prompt: "Focus on technical terms",
        mimeType: "audio/aac" as const,
      };

      await geminiAnalyzeMediaTool.execute(args);

      expect(mockGeminiService.generateContent).toHaveBeenCalledWith({
        prompt:
          "Transcribe this audio file accurately. include timestamps for each paragraph or speaker change. the language is es. Focus on technical terms",
        modelName: undefined,
        fileReferenceOrInlineData: Buffer.from("audio data").toString("base64"),
        inlineDataMimeType: "audio/aac",
      });
    });

    it("should auto-detect MIME type for audio files", async () => {
      vi.mocked(filePathSecurity.validateAndResolvePath).mockReturnValue(
        "/safe/path/audio.flac"
      );
      vi.mocked(fs.statSync).mockReturnValue({
        size: 8 * 1024 * 1024,
      } as fs.Stats);
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("audio data"));

      mockGeminiService.generateContent.mockResolvedValue({
        generatedText: "FLAC transcription",
      });

      const args = {
        analysisType: "audio_transcription" as const,
        filePath: "/path/to/audio.flac",
        includeTimestamps: false,
      };

      await geminiAnalyzeMediaTool.execute(args);

      expect(mockGeminiService.generateContent).toHaveBeenCalledWith({
        prompt: "Transcribe this audio file accurately",
        modelName: undefined,
        fileReferenceOrInlineData: Buffer.from("audio data").toString("base64"),
        inlineDataMimeType: "audio/flac",
      });
    });

    it("should handle file path validation errors", async () => {
      vi.mocked(filePathSecurity.validateAndResolvePath).mockImplementation(
        () => {
          throw new Error("Invalid file path");
        }
      );

      const args = {
        analysisType: "audio_transcription" as const,
        filePath: "/invalid/path/audio.mp3",
        includeTimestamps: false,
      };

      await expect(geminiAnalyzeMediaTool.execute(args)).rejects.toThrow(
        "Invalid file path"
      );
    });

    it("should handle file system errors", async () => {
      vi.mocked(filePathSecurity.validateAndResolvePath).mockReturnValue(
        "/safe/path/audio.mp3"
      );
      vi.mocked(fs.statSync).mockImplementation(() => {
        throw new Error("File not accessible");
      });

      const args = {
        analysisType: "audio_transcription" as const,
        filePath: "/path/to/audio.mp3",
        includeTimestamps: false,
      };

      await expect(geminiAnalyzeMediaTool.execute(args)).rejects.toThrow();
    });

    it("should handle large audio files with appropriate error", async () => {
      vi.mocked(filePathSecurity.validateAndResolvePath).mockReturnValue(
        "/safe/path/large-audio.wav"
      );
      vi.mocked(fs.statSync).mockReturnValue({
        size: 30 * 1024 * 1024,
      } as fs.Stats);

      const args = {
        analysisType: "audio_transcription" as const,
        filePath: "/path/to/large-audio.wav",
        includeTimestamps: false,
      };

      await expect(geminiAnalyzeMediaTool.execute(args)).rejects.toThrow(
        "Audio file size (30.00MB) exceeds the 20MB limit for inline data"
      );
    });

    it("should handle empty transcription result", async () => {
      vi.mocked(filePathSecurity.validateAndResolvePath).mockReturnValue(
        "/safe/path/audio.mp3"
      );
      vi.mocked(fs.statSync).mockReturnValue({
        size: 5 * 1024 * 1024,
      } as fs.Stats);
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("audio data"));

      mockGeminiService.generateContent.mockResolvedValue({
        generatedText: "",
      });

      const args = {
        analysisType: "audio_transcription" as const,
        filePath: "/path/to/audio.mp3",
        includeTimestamps: false,
      };

      const result = await geminiAnalyzeMediaTool.execute(args);

      expect(result.content[0].text).toBe("");
    });
  });

  describe("Image Input Validation", () => {
    it("should handle different image MIME types", async () => {
      const mimeTypes = [
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/heic",
        "image/heif",
      ] as const;

      for (const mimeType of mimeTypes) {
        const mockResult = {
          objects: [{ name: "test_object", confidence: 0.9 }],
          rawText: `Detection for ${mimeType}`,
        };

        mockGeminiService.detectObjects.mockResolvedValue(mockResult);

        const args = {
          analysisType: "object_detection" as const,
          image: {
            base64: "data:" + mimeType + ";base64,/9j/4AAQSkZJRg==",
            mimeType,
          },
          outputFormat: "json" as const,
        };

        const result = await geminiAnalyzeMediaTool.execute(args);
        expect(result.content[0].text).toContain("test_object");
      }
    });

    it("should reject URL images regardless of MIME type", async () => {
      const args = {
        analysisType: "object_detection" as const,
        image: {
          base64: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
          url: "https://example.com/image-without-extension",
          mimeType: "image/jpeg" as const,
        },
        outputFormat: "json" as const,
      };

      await expect(geminiAnalyzeMediaTool.execute(args)).rejects.toThrow(
        "URL-based images are not supported. Please provide base64-encoded image data instead."
      );
    });
  });

  describe("Content Understanding Edge Cases", () => {
    it("should handle content understanding with no result data", async () => {
      mockGeminiService.analyzeContent.mockResolvedValue({
        analysis: {},
      });

      const args = {
        analysisType: "content_understanding" as const,
        image: {
          base64: "data:image/png;base64,iVBORw0KGgo=",
          mimeType: "image/png" as const,
        },
        prompt: "Analyze this",
        structuredOutput: false,
      };

      await expect(geminiAnalyzeMediaTool.execute(args)).rejects.toThrow(
        "No content understanding result available"
      );
    });

    it("should handle structured output with both data and text", async () => {
      const mockResult = {
        analysis: {
          data: { scene: "beach", objects: ["ocean", "sand"] },
          text: "This is a beach scene with ocean and sand",
        },
      };

      mockGeminiService.analyzeContent.mockResolvedValue(mockResult);

      const args = {
        analysisType: "content_understanding" as const,
        image: {
          base64: "data:image/jpeg;base64,/9j/beach==",
          mimeType: "image/jpeg" as const,
        },
        prompt: "Describe the scene",
        structuredOutput: true,
      };

      const result = await geminiAnalyzeMediaTool.execute(args);

      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult.scene).toBe("beach");
      expect(parsedResult.objects).toContain("ocean");
    });
  });

  describe("Object Detection Output Formats", () => {
    it("should return JSON format by default", async () => {
      const mockResult = {
        objects: [
          {
            name: "car",
            confidence: 0.95,
            boundingBox: { x: 10, y: 20, width: 100, height: 50 },
          },
        ],
        rawText: "A car detected",
      };

      mockGeminiService.detectObjects.mockResolvedValue(mockResult);

      const args = {
        analysisType: "object_detection" as const,
        image: {
          base64: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
          mimeType: "image/jpeg" as const,
        },
        outputFormat: "json" as const, // Default value
      };

      const result = await geminiAnalyzeMediaTool.execute(args);

      expect(result.content[0].text).toContain('"objects"');
      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });

    it("should return text format when rawText is available", async () => {
      const mockResult = {
        objects: [{ name: "dog", confidence: 0.92 }],
        rawText: "A friendly dog sitting in the park",
      };

      mockGeminiService.detectObjects.mockResolvedValue(mockResult);

      const args = {
        analysisType: "object_detection" as const,
        image: {
          base64: "data:image/jpeg;base64,/9j/dogimage==",
          mimeType: "image/jpeg" as const,
        },
        outputFormat: "text" as const,
      };

      const result = await geminiAnalyzeMediaTool.execute(args);

      expect(result.content[0].text).toBe("A friendly dog sitting in the park");
    });

    it("should fallback to JSON when text format requested but no rawText", async () => {
      const mockResult = {
        objects: [{ name: "cat", confidence: 0.88 }],
        // rawText is undefined
      };

      mockGeminiService.detectObjects.mockResolvedValue(mockResult);

      const args = {
        analysisType: "object_detection" as const,
        image: {
          base64: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
          mimeType: "image/jpeg" as const,
        },
        outputFormat: "text" as const,
      };

      const result = await geminiAnalyzeMediaTool.execute(args);

      expect(result.content[0].text).toContain('"objects"');
      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });
  });
});
