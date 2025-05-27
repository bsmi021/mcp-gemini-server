// Using vitest globals - see vitest.config.ts globals: true
import { GeminiGitDiffService } from "../../../../src/services/gemini/GeminiGitDiffService.js";

// Mock diff content
const mockDiffContent = `diff --git a/src/utils/logger.ts b/src/utils/logger.ts
index 1234567..abcdef0 100644
--- a/src/utils/logger.ts
+++ b/src/utils/logger.ts
@@ -1,5 +1,6 @@
 const logger = {
-  log: (message: string) => console.log(message),
+  log: (message: string, ...args: any[]) => console.log(message, ...args),
+  debug: (message: string, ...args: any[]) => console.debug(message, ...args),
   error: (message: string, error?: Error) => console.error(message, error)
 };
 
`;

// Mock gitdiff-parser - declare parsed diff inside the mock
vi.mock("gitdiff-parser", () => {
  return {
    default: {
      parse: vi.fn().mockReturnValue([
        {
          oldPath: "src/utils/logger.ts",
          newPath: "src/utils/logger.ts",
          hunks: [
            {
              oldStart: 1,
              oldLines: 5,
              newStart: 1,
              newLines: 6,
              changes: [
                { type: "normal", content: "const logger = {" },
                {
                  type: "delete",
                  content: "  log: (message: string) => console.log(message),",
                },
                {
                  type: "insert",
                  content:
                    "  log: (message: string, ...args: any[]) => console.log(message, ...args),",
                },
                {
                  type: "insert",
                  content:
                    "  debug: (message: string, ...args: any[]) => console.debug(message, ...args),",
                },
                {
                  type: "normal",
                  content:
                    "  error: (message: string, error?: Error) => console.error(message, error)",
                },
                { type: "normal", content: "};" },
                { type: "normal", content: "" },
              ],
            },
          ],
        },
      ]),
    },
  };
});

interface MockGenerateContentResponse {
  response: {
    text: () => string;
  };
}

interface MockModel {
  generateContent: ReturnType<typeof vi.fn>;
  generateContentStream: ReturnType<typeof vi.fn>;
}

interface MockGenAI {
  getGenerativeModel: ReturnType<typeof vi.fn<unknown[], MockModel>>;
}

describe("GeminiGitDiffService", () => {
  let mockGenAI: MockGenAI;
  let mockModel: MockModel;
  let mockResponse: MockGenerateContentResponse;
  let service: GeminiGitDiffService;

  // Setup test fixture
  beforeAll(() => {
    // Create mock response
    mockResponse = {
      response: {
        text: () => "This is a mock review response",
      },
    };

    // Create mock model
    mockModel = {
      generateContent: vi.fn(() => Promise.resolve(mockResponse)),
      generateContentStream: vi.fn(() => ({
        stream: {
          async *[Symbol.asyncIterator]() {
            yield { text: () => "Streamed chunk 1" };
            yield { text: () => "Streamed chunk 2" };
          },
        },
      })),
    };

    // Create mock GoogleGenAI
    mockGenAI = {
      getGenerativeModel: vi.fn(() => mockModel),
    } as any;

    // Create service with flash model as default
    service = new GeminiGitDiffService(
      mockGenAI as any,
      "gemini-flash-2.0", // Use Gemini Flash 2.0 as default model
      1024 * 1024,
      ["package-lock.json", "*.min.js"]
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("reviewDiff", () => {
    it("should use Gemini Flash 2.0 model when no model is specified", async () => {
      // Call the service
      await service.reviewDiff({
        diffContent: mockDiffContent,
        reviewFocus: "general",
      });

      // Verify model called with correct parameters
      expect(mockGenAI.getGenerativeModel).toHaveBeenCalledTimes(1);
      expect(mockGenAI.getGenerativeModel).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gemini-flash-2.0",
          generationConfig: expect.objectContaining({
            thinkingBudget: 4096,
          }),
        })
      );
    });

    it("should allow overriding the model", async () => {
      // Call the service with a different model
      await service.reviewDiff({
        diffContent: mockDiffContent,
        modelName: "gemini-pro", // Override the default model
        reviewFocus: "security",
      });

      // Verify model called with correct parameters
      expect(mockGenAI.getGenerativeModel).toHaveBeenCalledTimes(1);
      expect(mockGenAI.getGenerativeModel).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gemini-pro",
        })
      );
    });

    it("should set reasoning effort correctly", async () => {
      // Call with low reasoning effort
      await service.reviewDiff({
        diffContent: mockDiffContent,
        reasoningEffort: "low",
      });

      // Verify thinking budget set accordingly
      expect(mockGenAI.getGenerativeModel).toHaveBeenCalledTimes(1);
      expect(mockGenAI.getGenerativeModel).toHaveBeenCalledWith(
        expect.objectContaining({
          generationConfig: expect.objectContaining({
            thinkingBudget: 2048,
          }),
        })
      );
    });
  });

  describe("reviewDiffStream", () => {
    it("should stream content chunks", async () => {
      const chunks: string[] = [];

      // Use for-await to consume the stream
      for await (const chunk of service.reviewDiffStream({
        diffContent: mockDiffContent,
        modelName: "gemini-flash-2.0",
      })) {
        chunks.push(chunk);
      }

      // Verify we got both chunks
      expect(chunks.length).toBe(2);
      expect(chunks[0]).toBe("Streamed chunk 1");
      expect(chunks[1]).toBe("Streamed chunk 2");
    });
  });
});
