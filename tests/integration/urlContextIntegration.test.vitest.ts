// Using vitest globals - see vitest.config.ts globals: true
import { GeminiService } from "../../src/services/GeminiService.js";
import { ConfigurationManager } from "../../src/config/ConfigurationManager.js";

// Mock external dependencies
vi.mock("../../src/config/ConfigurationManager.js");
vi.mock("@google/genai");

// Mock fetch globally for URL fetching tests
const mockFetch = vi.fn();
global.fetch = mockFetch;

interface MockConfigInstance {
  getGeminiServiceConfig: ReturnType<typeof vi.fn>;
  getUrlContextConfig: ReturnType<typeof vi.fn>;
}

interface MockConfig {
  getInstance: ReturnType<typeof vi.fn<[], MockConfigInstance>>;
}

describe("URL Context Integration Tests", () => {
  let geminiService: GeminiService;
  let mockConfig: MockConfig;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock configuration with URL context enabled
    mockConfig = {
      getInstance: vi.fn().mockReturnValue({
        getGeminiServiceConfig: vi.fn().mockReturnValue({
          apiKey: "test-api-key",
          defaultModel: "gemini-2.5-flash-preview-05-20",
        }),
        getUrlContextConfig: vi.fn().mockReturnValue({
          enabled: true,
          maxUrlsPerRequest: 20,
          defaultMaxContentKb: 100,
          defaultTimeoutMs: 10000,
          allowedDomains: ["*"],
          blocklistedDomains: [],
          convertToMarkdown: true,
          includeMetadata: true,
          enableCaching: true,
          cacheExpiryMinutes: 15,
          maxCacheSize: 1000,
          rateLimitPerDomainPerMinute: 10,
          userAgent: "MCP-Gemini-Server/1.0",
        }),
      }),
    };

    ConfigurationManager.getInstance = mockConfig.getInstance;

    // Mock Gemini API
    const mockGenAI = {
      models: {
        generateContent: vi.fn().mockResolvedValue({
          text: "Generated response based on URL content",
        }),
        generateContentStream: vi.fn().mockImplementation(async function* () {
          yield "Generated ";
          yield "response ";
          yield "based on ";
          yield "URL content";
        }),
      },
    };

    const { GoogleGenAI } = await import("@google/genai");
    vi.mocked(GoogleGenAI).mockImplementation(() => mockGenAI);

    geminiService = new GeminiService();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("URL Context with Content Generation", () => {
    it("should successfully generate content with single URL context", async () => {
      const mockHtmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Test Article</title>
            <meta name="description" content="A comprehensive guide to testing">
          </head>
          <body>
            <h1>Introduction to Testing</h1>
            <p>Testing is essential for software quality assurance.</p>
            <h2>Types of Testing</h2>
            <ul>
              <li>Unit Testing</li>
              <li>Integration Testing</li>
              <li>End-to-End Testing</li>
            </ul>
          </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        url: "https://example.com/testing-guide",
        headers: new Map([
          ["content-type", "text/html; charset=utf-8"],
          ["content-length", mockHtmlContent.length.toString()],
        ]),
        text: () => Promise.resolve(mockHtmlContent),
      });

      const result = await geminiService.generateContent({
        prompt: "Summarize the main points from the provided article",
        urlContext: {
          urls: ["https://example.com/testing-guide"],
          fetchOptions: {
            maxContentKb: 50,
            includeMetadata: true,
          },
        },
      });

      expect(result).toBeDefined();
      expect(result).toBe("Generated response based on URL content");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should handle multiple URLs in context", async () => {
      const mockContent1 = `
        <html>
          <head><title>Article 1</title></head>
          <body><p>Content from first article about React development.</p></body>
        </html>
      `;

      const mockContent2 = `
        <html>
          <head><title>Article 2</title></head>
          <body><p>Content from second article about Vue.js development.</p></body>
        </html>
      `;

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          url: "https://example1.com/react",
          headers: new Map([["content-type", "text/html"]]),
          text: () => Promise.resolve(mockContent1),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          url: "https://example2.com/vue",
          headers: new Map([["content-type", "text/html"]]),
          text: () => Promise.resolve(mockContent2),
        });

      const result = await geminiService.generateContent({
        prompt:
          "Compare the development approaches mentioned in these articles",
        urlContext: {
          urls: ["https://example1.com/react", "https://example2.com/vue"],
        },
      });

      expect(result).toBeDefined();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should work with streaming content generation", async () => {
      const mockJsonContent = JSON.stringify({
        title: "API Documentation",
        endpoints: [
          { path: "/users", method: "GET" },
          { path: "/users", method: "POST" },
        ],
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        url: "https://api.example.com/docs",
        headers: new Map([["content-type", "application/json"]]),
        text: () => Promise.resolve(mockJsonContent),
      });

      const chunks: string[] = [];
      for await (const chunk of geminiService.generateContentStream({
        prompt: "Explain the API endpoints described in the documentation",
        urlContext: {
          urls: ["https://api.example.com/docs"],
          fetchOptions: {
            convertToMarkdown: false, // Keep JSON as-is
          },
        },
      })) {
        chunks.push(chunk);
      }

      const fullResponse = chunks.join("");
      expect(fullResponse).toBe("Generated response based on URL content");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("URL Context Error Handling", () => {
    it("should handle URL fetch failures gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(
        geminiService.generateContent({
          prompt: "Analyze the content from this URL",
          urlContext: {
            urls: ["https://unreachable.com"],
          },
        })
      ).rejects.toThrow();
    });

    it("should handle mixed success/failure scenarios", async () => {
      const mockSuccessContent =
        "<html><body><p>Successful content</p></body></html>";

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          url: "https://success.com",
          headers: new Map([["content-type", "text/html"]]),
          text: () => Promise.resolve(mockSuccessContent),
        })
        .mockRejectedValueOnce(new Error("Failed to fetch"))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          url: "https://success2.com",
          headers: new Map([["content-type", "text/html"]]),
          text: () => Promise.resolve(mockSuccessContent),
        });

      // This should continue processing successful URLs despite some failures
      const result = await geminiService.generateContent({
        prompt: "Summarize the available content",
        urlContext: {
          urls: [
            "https://success.com",
            "https://failed.com",
            "https://success2.com",
          ],
        },
      });

      expect(result).toBeDefined();
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("should respect URL context disabled configuration", async () => {
      mockConfig.getInstance().getUrlContextConfig.mockReturnValue({
        enabled: false,
        maxUrlsPerRequest: 20,
        defaultMaxContentKb: 100,
        defaultTimeoutMs: 10000,
        allowedDomains: ["*"],
        blocklistedDomains: [],
      });

      await expect(
        geminiService.generateContent({
          prompt: "Analyze this content",
          urlContext: {
            urls: ["https://example.com"],
          },
        })
      ).rejects.toThrow("URL context feature is not enabled");

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("URL Security Integration", () => {
    it("should block access to private networks", async () => {
      await expect(
        geminiService.generateContent({
          prompt: "Analyze the content",
          urlContext: {
            urls: ["http://192.168.1.1/admin"],
          },
        })
      ).rejects.toThrow();

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should respect domain restrictions", async () => {
      mockConfig.getInstance().getUrlContextConfig.mockReturnValue({
        enabled: true,
        maxUrlsPerRequest: 20,
        defaultMaxContentKb: 100,
        defaultTimeoutMs: 10000,
        allowedDomains: ["example.com"],
        blocklistedDomains: [],
      });

      // Allowed domain should work
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        url: "https://example.com",
        headers: new Map([["content-type", "text/html"]]),
        text: () => Promise.resolve("<html><body>Content</body></html>"),
      });

      await geminiService.generateContent({
        prompt: "Analyze this content",
        urlContext: {
          urls: ["https://example.com"],
        },
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Disallowed domain should fail
      await expect(
        geminiService.generateContent({
          prompt: "Analyze this content",
          urlContext: {
            urls: ["https://other.com"],
          },
        })
      ).rejects.toThrow();
    });

    it("should enforce URL count limits", async () => {
      const manyUrls = Array.from(
        { length: 25 },
        (_, i) => `https://example${i}.com`
      );

      await expect(
        geminiService.generateContent({
          prompt: "Analyze all these URLs",
          urlContext: {
            urls: manyUrls,
          },
        })
      ).rejects.toThrow("Too many URLs");

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("Content Processing Integration", () => {
    it("should correctly convert HTML to Markdown", async () => {
      const complexHtml = `
        <html>
          <head><title>Complex Document</title></head>
          <body>
            <h1>Main Title</h1>
            <p>Paragraph with <strong>bold</strong> and <em>italic</em> text.</p>
            <ul>
              <li>List item 1</li>
              <li>List item 2 with <a href="https://example.com">link</a></li>
            </ul>
            <blockquote>This is a quote</blockquote>
            <code>inline code</code>
            <pre>code block</pre>
          </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        url: "https://example.com/complex",
        headers: new Map([["content-type", "text/html"]]),
        text: () => Promise.resolve(complexHtml),
      });

      await geminiService.generateContent({
        prompt: "Process this complex document",
        urlContext: {
          urls: ["https://example.com/complex"],
          fetchOptions: {
            convertToMarkdown: true,
            includeMetadata: true,
          },
        },
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      // The actual content processing is tested in unit tests
    });

    it("should handle large content with truncation", async () => {
      const largeContent = "x".repeat(500 * 1024); // 500KB content

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        url: "https://example.com/large",
        headers: new Map([
          ["content-type", "text/html"],
          ["content-length", largeContent.length.toString()],
        ]),
        text: () => Promise.resolve(largeContent),
      });

      await geminiService.generateContent({
        prompt: "Summarize this large document",
        urlContext: {
          urls: ["https://example.com/large"],
          fetchOptions: {
            maxContentKb: 100, // Limit to 100KB
          },
        },
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("Model Selection Integration", () => {
    it("should prefer models with larger context windows for URL-heavy requests", async () => {
      const urls = Array.from(
        { length: 15 },
        (_, i) => `https://example${i}.com`
      );

      // Mock multiple successful fetches
      for (let i = 0; i < 15; i++) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          url: urls[i],
          headers: new Map([["content-type", "text/html"]]),
          text: () => Promise.resolve(`<html><body>Content ${i}</body></html>`),
        });
      }

      const result = await geminiService.generateContent({
        prompt: "Analyze and compare all these sources",
        urlContext: {
          urls,
        },
        // Don't specify a model - let the service choose based on URL count
        taskType: "reasoning",
        complexityHint: "complex",
      });

      expect(result).toBeDefined();
      expect(mockFetch).toHaveBeenCalledTimes(15);
    });
  });

  describe("Caching Integration", () => {
    it("should cache URL content between requests", async () => {
      const mockContent = "<html><body><p>Cached content</p></body></html>";

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        url: "https://example.com/cached",
        headers: new Map([["content-type", "text/html"]]),
        text: () => Promise.resolve(mockContent),
      });

      // First request
      await geminiService.generateContent({
        prompt: "Analyze this content",
        urlContext: {
          urls: ["https://example.com/cached"],
        },
      });

      // Second request with same URL - should use cache
      await geminiService.generateContent({
        prompt: "Different analysis of the same content",
        urlContext: {
          urls: ["https://example.com/cached"],
        },
      });

      // Should only fetch once due to caching
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("Rate Limiting Integration", () => {
    it("should enforce rate limits per domain", async () => {
      const baseUrl = "https://example.com/page";

      // Mock successful responses for rate limit testing
      for (let i = 0; i < 12; i++) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          url: `${baseUrl}${i}`,
          headers: new Map([["content-type", "text/html"]]),
          text: () => Promise.resolve("<html><body>Content</body></html>"),
        });
      }

      // First 10 requests should succeed
      for (let i = 0; i < 10; i++) {
        await geminiService.generateContent({
          prompt: `Analyze page ${i}`,
          urlContext: {
            urls: [`${baseUrl}${i}`],
          },
        });
      }

      // 11th request should fail due to rate limiting
      await expect(
        geminiService.generateContent({
          prompt: "Analyze page 11",
          urlContext: {
            urls: [`${baseUrl}11`],
          },
        })
      ).rejects.toThrow();
    });
  });
});
