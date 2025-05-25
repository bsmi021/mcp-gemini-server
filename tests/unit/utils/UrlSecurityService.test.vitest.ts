// Using vitest globals - see vitest.config.ts globals: true
import { UrlSecurityService } from "../../../src/utils/UrlSecurityService.js";
import { ConfigurationManager } from "../../../src/config/ConfigurationManager.js";
import { GeminiUrlValidationError } from "../../../src/utils/geminiErrors.js";

// Mock dependencies
vi.mock("../../../src/config/ConfigurationManager.js");
vi.mock("../../../src/utils/logger.js");

interface MockConfigManager {
  getUrlContextConfig: ReturnType<typeof vi.fn>;
}

describe("UrlSecurityService", () => {
  let service: UrlSecurityService;
  let mockConfig: MockConfigManager;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = {
      getUrlContextConfig: vi.fn().mockReturnValue({
        allowedDomains: ["*"],
        blocklistedDomains: [],
      }),
    };

    service = new UrlSecurityService(mockConfig as ConfigurationManager);
  });

  describe("URL format validation", () => {
    it("should accept valid HTTP URLs", async () => {
      await expect(
        service.validateUrl("http://example.com")
      ).resolves.not.toThrow();
    });

    it("should accept valid HTTPS URLs", async () => {
      await expect(
        service.validateUrl("https://example.com")
      ).resolves.not.toThrow();
    });

    it("should reject invalid URL formats", async () => {
      await expect(service.validateUrl("not-a-url")).rejects.toThrow(
        GeminiUrlValidationError
      );
      await expect(service.validateUrl("")).rejects.toThrow(
        GeminiUrlValidationError
      );
      await expect(service.validateUrl("   ")).rejects.toThrow(
        GeminiUrlValidationError
      );
    });

    it("should reject non-HTTP protocols", async () => {
      await expect(service.validateUrl("ftp://example.com")).rejects.toThrow(
        GeminiUrlValidationError
      );
      await expect(service.validateUrl("file:///etc/passwd")).rejects.toThrow(
        GeminiUrlValidationError
      );
      await expect(service.validateUrl("javascript:alert(1)")).rejects.toThrow(
        GeminiUrlValidationError
      );
      await expect(
        service.validateUrl("data:text/plain;base64,SGVsbG8=")
      ).rejects.toThrow(GeminiUrlValidationError);
    });
  });

  describe("Domain validation", () => {
    it("should allow domains in allowlist", async () => {
      mockConfig.getUrlContextConfig.mockReturnValue({
        allowedDomains: ["example.com", "test.org"],
        blocklistedDomains: [],
      });

      await expect(
        service.validateUrl("https://example.com")
      ).resolves.not.toThrow();
      await expect(
        service.validateUrl("https://test.org")
      ).resolves.not.toThrow();
    });

    it("should reject domains not in allowlist", async () => {
      mockConfig.getUrlContextConfig.mockReturnValue({
        allowedDomains: ["example.com"],
        blocklistedDomains: [],
      });

      await expect(
        service.validateUrl("https://malicious.com")
      ).rejects.toThrow(GeminiUrlValidationError);
    });

    it("should handle wildcard allowlist", async () => {
      mockConfig.getUrlContextConfig.mockReturnValue({
        allowedDomains: ["*"],
        blocklistedDomains: [],
      });

      await expect(
        service.validateUrl("https://any-domain.com")
      ).resolves.not.toThrow();
    });

    it("should handle subdomain patterns", async () => {
      mockConfig.getUrlContextConfig.mockReturnValue({
        allowedDomains: ["*.example.com"],
        blocklistedDomains: [],
      });

      await expect(
        service.validateUrl("https://sub.example.com")
      ).resolves.not.toThrow();
      await expect(
        service.validateUrl("https://deep.sub.example.com")
      ).resolves.not.toThrow();
      await expect(
        service.validateUrl("https://example.com")
      ).resolves.not.toThrow();
      await expect(service.validateUrl("https://other.com")).rejects.toThrow(
        GeminiUrlValidationError
      );
    });

    it("should block domains in blocklist", async () => {
      mockConfig.getUrlContextConfig.mockReturnValue({
        allowedDomains: ["*"],
        blocklistedDomains: ["malicious.com", "spam.net"],
      });

      await expect(
        service.validateUrl("https://malicious.com")
      ).rejects.toThrow(GeminiUrlValidationError);
      await expect(service.validateUrl("https://spam.net")).rejects.toThrow(
        GeminiUrlValidationError
      );
      await expect(
        service.validateUrl("https://safe.com")
      ).resolves.not.toThrow();
    });

    it("should block subdomains of blocklisted domains", async () => {
      mockConfig.getUrlContextConfig.mockReturnValue({
        allowedDomains: ["*"],
        blocklistedDomains: ["malicious.com"],
      });

      await expect(
        service.validateUrl("https://sub.malicious.com")
      ).rejects.toThrow(GeminiUrlValidationError);
    });
  });

  describe("Private network protection", () => {
    it("should block localhost addresses", async () => {
      await expect(service.validateUrl("http://localhost")).rejects.toThrow(
        GeminiUrlValidationError
      );
      await expect(service.validateUrl("http://127.0.0.1")).rejects.toThrow(
        GeminiUrlValidationError
      );
      await expect(service.validateUrl("http://0.0.0.0")).rejects.toThrow(
        GeminiUrlValidationError
      );
    });

    it("should block private IP ranges", async () => {
      await expect(service.validateUrl("http://192.168.1.1")).rejects.toThrow(
        GeminiUrlValidationError
      );
      await expect(service.validateUrl("http://10.0.0.1")).rejects.toThrow(
        GeminiUrlValidationError
      );
      await expect(service.validateUrl("http://172.16.0.1")).rejects.toThrow(
        GeminiUrlValidationError
      );
    });

    it("should block internal domain extensions", async () => {
      await expect(service.validateUrl("http://server.local")).rejects.toThrow(
        GeminiUrlValidationError
      );
      await expect(service.validateUrl("http://api.internal")).rejects.toThrow(
        GeminiUrlValidationError
      );
      await expect(service.validateUrl("http://db.corp")).rejects.toThrow(
        GeminiUrlValidationError
      );
    });

    it("should allow public IP addresses", async () => {
      await expect(
        service.validateUrl("http://8.8.8.8")
      ).resolves.not.toThrow();
      await expect(
        service.validateUrl("http://1.1.1.1")
      ).resolves.not.toThrow();
    });
  });

  describe("Suspicious pattern detection", () => {
    it("should detect path traversal attempts", async () => {
      await expect(
        service.validateUrl("http://example.com/../../../etc/passwd")
      ).rejects.toThrow(GeminiUrlValidationError);
      await expect(
        service.validateUrl("http://example.com/path/with/../dots")
      ).rejects.toThrow(GeminiUrlValidationError);
    });

    it("should detect dangerous characters", async () => {
      await expect(
        service.validateUrl("http://example.com/path<script>")
      ).rejects.toThrow(GeminiUrlValidationError);
      await expect(
        service.validateUrl("http://example.com/path{malicious}")
      ).rejects.toThrow(GeminiUrlValidationError);
    });

    it("should detect multiple @ symbols", async () => {
      await expect(
        service.validateUrl("http://user@pass@example.com")
      ).rejects.toThrow(GeminiUrlValidationError);
    });

    it("should allow normal URLs with safe characters", async () => {
      await expect(
        service.validateUrl(
          "https://example.com/path/to/resource?param=value&other=123"
        )
      ).resolves.not.toThrow();
      await expect(
        service.validateUrl("https://api.example.com/v1/users/123")
      ).resolves.not.toThrow();
    });
  });

  describe("URL shortener detection", () => {
    it("should detect known URL shorteners", async () => {
      const shorteners = [
        "https://bit.ly/abc123",
        "https://tinyurl.com/abc123",
        "https://t.co/abc123",
        "https://goo.gl/abc123",
      ];

      // Note: These should not throw errors, but should be logged as warnings
      for (const url of shorteners) {
        await expect(service.validateUrl(url)).resolves.not.toThrow();
      }
    });
  });

  describe("IDN homograph attack detection", () => {
    it("should detect potentially confusing Unicode domains", async () => {
      // Cyrillic characters that look like Latin
      await expect(service.validateUrl("https://gоogle.com")).rejects.toThrow(
        GeminiUrlValidationError
      ); // 'о' is Cyrillic
      await expect(service.validateUrl("https://аpple.com")).rejects.toThrow(
        GeminiUrlValidationError
      ); // 'а' is Cyrillic
    });

    it("should allow legitimate Unicode domains", async () => {
      await expect(
        service.validateUrl("https://example.com")
      ).resolves.not.toThrow();
      await expect(
        service.validateUrl("https://测试.example.com")
      ).resolves.not.toThrow();
    });
  });

  describe("Port validation", () => {
    it("should allow standard HTTP/HTTPS ports", async () => {
      await expect(
        service.validateUrl("http://example.com:80")
      ).resolves.not.toThrow();
      await expect(
        service.validateUrl("https://example.com:443")
      ).resolves.not.toThrow();
      await expect(
        service.validateUrl("http://example.com:8080")
      ).resolves.not.toThrow();
      await expect(
        service.validateUrl("https://example.com:8443")
      ).resolves.not.toThrow();
    });

    it("should reject non-standard ports", async () => {
      await expect(
        service.validateUrl("http://example.com:22")
      ).rejects.toThrow(GeminiUrlValidationError);
      await expect(
        service.validateUrl("http://example.com:3389")
      ).rejects.toThrow(GeminiUrlValidationError);
      await expect(
        service.validateUrl("http://example.com:1337")
      ).rejects.toThrow(GeminiUrlValidationError);
    });
  });

  describe("URL length validation", () => {
    it("should reject extremely long URLs", async () => {
      const longPath = "a".repeat(3000);
      const longUrl = `https://example.com/${longPath}`;

      await expect(service.validateUrl(longUrl)).rejects.toThrow(
        GeminiUrlValidationError
      );
    });

    it("should accept reasonable length URLs", async () => {
      const normalPath = "a".repeat(100);
      const normalUrl = `https://example.com/${normalPath}`;

      await expect(service.validateUrl(normalUrl)).resolves.not.toThrow();
    });
  });

  describe("Random domain detection", () => {
    it("should flag potentially randomly generated domains", async () => {
      // These should log warnings but not necessarily throw errors
      const suspiciousDomains = [
        "https://xkcd123456789.com",
        "https://aaaaaaaaaaaa.com",
        "https://1234567890abcd.com",
      ];

      for (const url of suspiciousDomains) {
        // Should not throw, but may log warnings
        await expect(service.validateUrl(url)).resolves.not.toThrow();
      }
    });
  });

  describe("Security metrics", () => {
    it("should track validation attempts and failures", async () => {
      const initialMetrics = service.getSecurityMetrics();
      expect(initialMetrics.validationAttempts).toBe(0);
      expect(initialMetrics.validationFailures).toBe(0);

      // Valid URL
      await service.validateUrl("https://example.com").catch(() => {});

      // Invalid URL
      await service.validateUrl("invalid-url").catch(() => {});

      const updatedMetrics = service.getSecurityMetrics();
      expect(updatedMetrics.validationAttempts).toBe(2);
      expect(updatedMetrics.validationFailures).toBe(1);
    });

    it("should track blocked domains", async () => {
      mockConfig.getUrlContextConfig.mockReturnValue({
        allowedDomains: ["*"],
        blocklistedDomains: ["malicious.com"],
      });

      await service.validateUrl("https://malicious.com").catch(() => {});

      const metrics = service.getSecurityMetrics();
      expect(metrics.blockedDomains.has("malicious.com")).toBe(true);
    });

    it("should allow resetting metrics", () => {
      service.resetSecurityMetrics();
      const metrics = service.getSecurityMetrics();

      expect(metrics.validationAttempts).toBe(0);
      expect(metrics.validationFailures).toBe(0);
      expect(metrics.blockedDomains.size).toBe(0);
      expect(metrics.suspiciousPatterns).toHaveLength(0);
    });
  });

  describe("Custom domain management", () => {
    it("should allow adding custom malicious domains", () => {
      service.addMaliciousDomain("custom-malicious.com");

      // This should not throw immediately since domain checking happens in validateUrl
      expect(() => service.addMaliciousDomain("another-bad.com")).not.toThrow();
    });
  });

  describe("URL accessibility checking", () => {
    it("should check URL accessibility", async () => {
      // Mock fetch for accessibility check
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });
      global.fetch = mockFetch;

      const isAccessible = await service.checkUrlAccessibility(
        "https://example.com"
      );
      expect(isAccessible).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com",
        expect.objectContaining({
          method: "HEAD",
        })
      );
    });

    it("should handle inaccessible URLs", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
      global.fetch = mockFetch;

      const isAccessible = await service.checkUrlAccessibility(
        "https://unreachable.com"
      );
      expect(isAccessible).toBe(false);
    });
  });
});
