// Using vitest globals - see vitest.config.ts globals: true
import { GeminiUrlContextService } from "../../../../src/services/gemini/GeminiUrlContextService.js";
import { ConfigurationManager } from "../../../../src/config/ConfigurationManager.js";
import { GeminiUrlFetchError } from "../../../../src/utils/geminiErrors.js";

// Mock dependencies
vi.mock("../../../../src/config/ConfigurationManager.js");
vi.mock("../../../../src/utils/logger.js");
vi.mock("../../../../src/utils/UrlSecurityService.js");

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

interface MockConfigManager {
  getUrlContextConfig: ReturnType<typeof vi.fn>;
}

describe("GeminiUrlContextService", () => {
  let service: GeminiUrlContextService;
  let mockConfig: MockConfigManager;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock configuration
    mockConfig = {
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
    };

    // Create service instance
    service = new GeminiUrlContextService(
      mockConfig as unknown as ConfigurationManager
    );
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("fetchUrlContent", () => {
    it("should successfully fetch and process HTML content", async () => {
      const mockHtmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Test Page</title>
            <meta name="description" content="A test page">
          </head>
          <body>
            <h1>Main Heading</h1>
            <p>This is a test paragraph with <strong>bold text</strong>.</p>
            <ul>
              <li>Item 1</li>
              <li>Item 2</li>
            </ul>
          </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        url: "https://example.com/test",
        headers: new Map([
          ["content-type", "text/html; charset=utf-8"],
          ["content-length", mockHtmlContent.length.toString()],
        ]),
        text: () => Promise.resolve(mockHtmlContent),
      });

      const result = await service.fetchUrlContent("https://example.com/test");

      expect(result).toBeDefined();
      expect(result.metadata.url).toBe("https://example.com/test");
      expect(result.metadata.statusCode).toBe(200);
      expect(result.metadata.title).toBe("Test Page");
      expect(result.metadata.description).toBe("A test page");
      expect(result.content).toContain("# Main Heading");
      expect(result.content).toContain("**bold text**");
      expect(result.content).toContain("- Item 1");
    });

    it("should handle fetch errors gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(
        service.fetchUrlContent("https://example.com/error")
      ).rejects.toThrow(GeminiUrlFetchError);
    });

    it("should handle HTTP error responses", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        url: "https://example.com/notfound",
        headers: new Map(),
        text: () => Promise.resolve("Page not found"),
      });

      await expect(
        service.fetchUrlContent("https://example.com/notfound")
      ).rejects.toThrow(GeminiUrlFetchError);
    });

    it("should respect content size limits", async () => {
      const largeContent = "x".repeat(200 * 1024); // 200KB content

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        url: "https://example.com/large",
        headers: new Map([
          ["content-type", "text/html"],
          ["content-length", largeContent.length.toString()],
        ]),
        text: () => Promise.resolve(largeContent),
      });

      const result = await service.fetchUrlContent(
        "https://example.com/large",
        {
          maxContentLength: 100 * 1024, // 100KB limit
        }
      );

      expect(result.metadata.truncated).toBe(true);
      expect(result.content.length).toBeLessThanOrEqual(100 * 1024);
    });

    it("should handle JSON content without conversion", async () => {
      const jsonContent = JSON.stringify({
        message: "Hello World",
        data: [1, 2, 3],
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        url: "https://api.example.com/data",
        headers: new Map([
          ["content-type", "application/json"],
          ["content-length", jsonContent.length.toString()],
        ]),
        text: () => Promise.resolve(jsonContent),
      });

      const result = await service.fetchUrlContent(
        "https://api.example.com/data",
        {
          convertToMarkdown: false,
        }
      );

      expect(result.content).toBe(jsonContent);
      expect(result.metadata.contentType).toBe("application/json");
    });
  });

  describe("processUrlsForContext", () => {
    it("should process multiple URLs successfully", async () => {
      const urls = ["https://example1.com", "https://example2.com"];

      const mockContent1 =
        "<html><head><title>Page 1</title></head><body><p>Content 1</p></body></html>";
      const mockContent2 =
        "<html><head><title>Page 2</title></head><body><p>Content 2</p></body></html>";

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          url: urls[0],
          headers: new Map([["content-type", "text/html"]]),
          text: () => Promise.resolve(mockContent1),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          url: urls[1],
          headers: new Map([["content-type", "text/html"]]),
          text: () => Promise.resolve(mockContent2),
        });

      const result = await service.processUrlsForContext(urls);

      expect(result.contents).toHaveLength(2);
      expect(result.batchResult.summary.totalUrls).toBe(2);
      expect(result.batchResult.summary.successCount).toBe(2);
      expect(result.batchResult.summary.failureCount).toBe(0);
      expect(result.contents[0]).toBeDefined();
      expect(result.contents[0]!.parts).toBeDefined();
      expect(result.contents[0]!.parts![0]).toBeDefined();
      expect(result.contents[0]!.parts![0]!.text).toContain(
        "Content from https://example1.com"
      );

      expect(result.contents[1]).toBeDefined();
      expect(result.contents[1]!.parts).toBeDefined();
      expect(result.contents[1]!.parts![0]).toBeDefined();
      expect(result.contents[1]!.parts![0]!.text).toContain(
        "Content from https://example2.com"
      );
    });

    it("should handle mixed success and failure scenarios", async () => {
      const urls = [
        "https://example1.com",
        "https://failed.com",
        "https://example3.com",
      ];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          url: urls[0],
          headers: new Map([["content-type", "text/html"]]),
          text: () => Promise.resolve("<html><body>Content 1</body></html>"),
        })
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          url: urls[2],
          headers: new Map([["content-type", "text/html"]]),
          text: () => Promise.resolve("<html><body>Content 3</body></html>"),
        });

      const result = await service.processUrlsForContext(urls);

      expect(result.batchResult.summary.totalUrls).toBe(3);
      expect(result.batchResult.summary.successCount).toBe(2);
      expect(result.batchResult.summary.failureCount).toBe(1);
      expect(result.batchResult.failed).toHaveLength(1);
      expect(result.batchResult.failed[0].url).toBe("https://failed.com");
    });

    it("should reject if too many URLs provided", async () => {
      const urls = Array.from(
        { length: 25 },
        (_, i) => `https://example${i}.com`
      );

      await expect(service.processUrlsForContext(urls)).rejects.toThrow(
        "Too many URLs: 25. Maximum allowed: 20"
      );
    });

    it("should reject if no URLs provided", async () => {
      await expect(service.processUrlsForContext([])).rejects.toThrow(
        "No URLs provided for processing"
      );
    });
  });

  describe("HTML to Markdown conversion", () => {
    it("should convert headings correctly", async () => {
      const htmlContent = `
        <html>
          <body>
            <h1>Heading 1</h1>
            <h2>Heading 2</h2>
            <h3>Heading 3</h3>
          </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        url: "https://example.com",
        headers: new Map([["content-type", "text/html"]]),
        text: () => Promise.resolve(htmlContent),
      });

      const result = await service.fetchUrlContent("https://example.com");

      expect(result.content).toContain("# Heading 1");
      expect(result.content).toContain("## Heading 2");
      expect(result.content).toContain("### Heading 3");
    });

    it("should convert lists correctly", async () => {
      const htmlContent = `
        <html>
          <body>
            <ul>
              <li>Unordered item 1</li>
              <li>Unordered item 2</li>
            </ul>
            <ol>
              <li>Ordered item 1</li>
              <li>Ordered item 2</li>
            </ol>
          </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        url: "https://example.com",
        headers: new Map([["content-type", "text/html"]]),
        text: () => Promise.resolve(htmlContent),
      });

      const result = await service.fetchUrlContent("https://example.com");

      expect(result.content).toContain("- Unordered item 1");
      expect(result.content).toContain("- Unordered item 2");
      expect(result.content).toContain("1. Ordered item 1");
      expect(result.content).toContain("2. Ordered item 2");
    });

    it("should convert links correctly", async () => {
      const htmlContent = `
        <html>
          <body>
            <a href="https://example.com">Example Link</a>
            <a href="/relative/path">Relative Link</a>
          </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        url: "https://example.com",
        headers: new Map([["content-type", "text/html"]]),
        text: () => Promise.resolve(htmlContent),
      });

      const result = await service.fetchUrlContent("https://example.com");

      expect(result.content).toContain("[Example Link](https://example.com)");
      expect(result.content).toContain("[Relative Link](/relative/path)");
    });

    it("should remove script and style tags", async () => {
      const htmlContent = `
        <html>
          <head>
            <style>body { color: red; }</style>
          </head>
          <body>
            <p>Visible content</p>
            <script>console.log('hidden');</script>
            <p>More visible content</p>
          </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        url: "https://example.com",
        headers: new Map([["content-type", "text/html"]]),
        text: () => Promise.resolve(htmlContent),
      });

      const result = await service.fetchUrlContent("https://example.com");

      expect(result.content).toContain("Visible content");
      expect(result.content).toContain("More visible content");
      expect(result.content).not.toContain("color: red");
      expect(result.content).not.toContain("console.log");
    });
  });

  describe("Content metadata extraction", () => {
    it("should extract title and description from meta tags", async () => {
      const htmlContent = `
        <html>
          <head>
            <title>Test Page Title</title>
            <meta name="description" content="Test page description">
            <meta property="og:image" content="https://example.com/image.jpg">
            <link rel="canonical" href="https://example.com/canonical">
          </head>
          <body>
            <p>Content</p>
          </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        url: "https://example.com",
        headers: new Map([["content-type", "text/html"]]),
        text: () => Promise.resolve(htmlContent),
      });

      const result = await service.fetchUrlContent("https://example.com");

      expect(result.metadata.title).toBe("Test Page Title");
      expect(result.metadata.description).toBe("Test page description");
      expect(result.metadata.ogImage).toBe("https://example.com/image.jpg");
      expect(result.metadata.canonicalUrl).toBe(
        "https://example.com/canonical"
      );
    });

    it("should handle HTML entities in metadata", async () => {
      const htmlContent = `
        <html>
          <head>
            <title>Title with &amp; ampersand &lt;tags&gt;</title>
            <meta name="description" content="Description with &quot;quotes&quot; and &nbsp; spaces">
          </head>
          <body>
            <p>Content</p>
          </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        url: "https://example.com",
        headers: new Map([["content-type", "text/html"]]),
        text: () => Promise.resolve(htmlContent),
      });

      const result = await service.fetchUrlContent("https://example.com");

      expect(result.metadata.title).toBe("Title with & ampersand <tags>");
      expect(result.metadata.description).toBe(
        'Description with "quotes" and spaces'
      );
    });
  });

  describe("Caching functionality", () => {
    it("should cache successful results", async () => {
      const htmlContent = "<html><body><p>Cached content</p></body></html>";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        url: "https://example.com",
        headers: new Map([["content-type", "text/html"]]),
        text: () => Promise.resolve(htmlContent),
      });

      // First call - should fetch from network
      const result1 = await service.fetchUrlContent("https://example.com");
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call - should return from cache
      const result2 = await service.fetchUrlContent("https://example.com");
      expect(mockFetch).toHaveBeenCalledTimes(1); // No additional fetch

      expect(result1.content).toBe(result2.content);
      expect(result1.metadata.url).toBe(result2.metadata.url);
    });
  });

  describe("Rate limiting", () => {
    it("should enforce rate limits per domain", async () => {
      const url = "https://example.com/page";

      // Mock multiple successful responses
      for (let i = 0; i < 15; i++) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          url,
          headers: new Map([["content-type", "text/html"]]),
          text: () => Promise.resolve("<html><body>Content</body></html>"),
        });
      }

      // First 10 requests should succeed
      for (let i = 0; i < 10; i++) {
        await service.fetchUrlContent(`${url}?page=${i}`);
      }

      // 11th request should fail due to rate limiting
      await expect(service.fetchUrlContent(`${url}?page=11`)).rejects.toThrow(
        GeminiUrlFetchError
      );
    });
  });

  describe("Error handling", () => {
    it("should handle timeout errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Request timeout"));

      await expect(
        service.fetchUrlContent("https://example.com/timeout")
      ).rejects.toThrow(GeminiUrlFetchError);
    });

    it("should handle unsupported content types", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        url: "https://example.com/binary",
        headers: new Map([["content-type", "application/octet-stream"]]),
        text: () => Promise.resolve("binary data"),
      });

      await expect(
        service.fetchUrlContent("https://example.com/binary")
      ).rejects.toThrow(GeminiUrlFetchError);
    });
  });
});
