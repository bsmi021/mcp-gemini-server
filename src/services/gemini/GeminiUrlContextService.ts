import { ConfigurationManager } from "../../config/ConfigurationManager.js";
import { logger } from "../../utils/logger.js";
import {
  GeminiUrlFetchError,
  GeminiUrlValidationError,
} from "../../utils/geminiErrors.js";
import { UrlSecurityService } from "../../utils/UrlSecurityService.js";
import { RetryService } from "../../utils/RetryService.js";
import type { Content } from "@google/genai";

export interface UrlFetchOptions {
  maxContentLength?: number; // Max bytes to fetch
  timeout?: number; // Fetch timeout in ms
  headers?: Record<string, string>;
  allowedDomains?: string[]; // Domain whitelist
  includeMetadata?: boolean; // Include URL metadata in response
  convertToMarkdown?: boolean; // Convert HTML to markdown
  followRedirects?: number; // Max redirects to follow
  userAgent?: string; // Custom user agent
}

export interface UrlContentMetadata {
  url: string;
  finalUrl?: string; // After redirects
  title?: string;
  description?: string;
  contentType: string;
  contentLength?: number;
  fetchedAt: Date;
  truncated: boolean;
  responseTime: number; // ms
  statusCode: number;
  encoding?: string;
  language?: string;
  canonicalUrl?: string;
  ogImage?: string;
  favicon?: string;
}

export interface UrlContentResult {
  content: string;
  metadata: UrlContentMetadata;
}

export interface UrlBatchResult {
  successful: UrlContentResult[];
  failed: Array<{
    url: string;
    error: Error;
    errorCode: string;
  }>;
  summary: {
    totalUrls: number;
    successCount: number;
    failureCount: number;
    totalContentSize: number;
    averageResponseTime: number;
  };
}

/**
 * Advanced URL Context Service for Gemini API integration
 * Handles URL fetching, content extraction, security validation, and metadata processing
 */
export class GeminiUrlContextService {
  private readonly securityService: UrlSecurityService;
  private readonly retryService: RetryService;
  private readonly urlCache = new Map<
    string,
    { result: UrlContentResult; expiry: number }
  >();
  private readonly rateLimiter = new Map<
    string,
    { count: number; resetTime: number }
  >();

  constructor(private readonly config: ConfigurationManager) {
    this.securityService = new UrlSecurityService(config);
    this.retryService = new RetryService({
      maxAttempts: 3,
      initialDelayMs: 1000,
      maxDelayMs: 5000,
      backoffFactor: 2,
    });
  }

  /**
   * Fetch content from a single URL with comprehensive error handling and metadata extraction
   */
  async fetchUrlContent(
    url: string,
    options: UrlFetchOptions = {}
  ): Promise<UrlContentResult> {
    const startTime = Date.now();

    try {
      // Validate URL security and format
      await this.securityService.validateUrl(url, options.allowedDomains);

      // Check rate limiting
      this.checkRateLimit(url);

      // Check cache first
      const cached = this.getCachedResult(url);
      if (cached) {
        logger.debug("Returning cached URL content", { url });
        return cached;
      }

      // Fetch with retry logic
      const result = await this.retryService.execute(() =>
        this.performUrlFetch(url, options, startTime)
      );

      // Cache successful result
      this.cacheResult(url, result);

      // Update rate limiter
      this.updateRateLimit(url);

      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      logger.error("Failed to fetch URL content", {
        url,
        error: error instanceof Error ? error.message : String(error),
        responseTime,
      });

      if (
        error instanceof GeminiUrlFetchError ||
        error instanceof GeminiUrlValidationError
      ) {
        throw error;
      }

      throw new GeminiUrlFetchError(
        `Failed to fetch URL: ${error instanceof Error ? error.message : String(error)}`,
        url,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Process multiple URLs in parallel with intelligent batching and error handling
   */
  async processUrlsForContext(
    urls: string[],
    options: UrlFetchOptions = {}
  ): Promise<{ contents: Content[]; batchResult: UrlBatchResult }> {
    if (urls.length === 0) {
      throw new Error("No URLs provided for processing");
    }

    const urlConfig = this.config.getUrlContextConfig();
    if (urls.length > urlConfig.maxUrlsPerRequest) {
      throw new Error(
        `Too many URLs: ${urls.length}. Maximum allowed: ${urlConfig.maxUrlsPerRequest}`
      );
    }

    const startTime = Date.now();
    const successful: UrlContentResult[] = [];
    const failed: Array<{ url: string; error: Error; errorCode: string }> = [];

    // Process URLs in controlled batches to prevent overwhelming target servers
    const batchSize = Math.min(5, urls.length);
    const batches = this.createBatches(urls, batchSize);

    for (const batch of batches) {
      const batchPromises = batch.map(async (url) => {
        try {
          const result = await this.fetchUrlContent(url, options);
          successful.push(result);
          return { success: true, url, result };
        } catch (error) {
          const errorInfo = {
            url,
            error: error instanceof Error ? error : new Error(String(error)),
            errorCode: this.getErrorCode(error),
          };
          failed.push(errorInfo);
          return { success: false, url, error: errorInfo };
        }
      });

      // Wait for current batch before processing next
      await Promise.allSettled(batchPromises);

      // Small delay between batches to be respectful to servers
      if (batches.indexOf(batch) < batches.length - 1) {
        await this.delay(200);
      }
    }

    const totalTime = Date.now() - startTime;
    const totalContentSize = successful.reduce(
      (sum, result) => sum + result.content.length,
      0
    );
    const averageResponseTime =
      successful.length > 0
        ? successful.reduce(
            (sum, result) => sum + result.metadata.responseTime,
            0
          ) / successful.length
        : 0;

    const batchResult: UrlBatchResult = {
      successful,
      failed,
      summary: {
        totalUrls: urls.length,
        successCount: successful.length,
        failureCount: failed.length,
        totalContentSize,
        averageResponseTime,
      },
    };

    // Convert successful results to Gemini Content format
    const contents = this.convertToGeminiContent(successful, options);

    logger.info("URL batch processing completed", {
      totalUrls: urls.length,
      successful: successful.length,
      failed: failed.length,
      totalTime,
      totalContentSize,
    });

    return { contents, batchResult };
  }

  /**
   * Perform the actual URL fetch with comprehensive metadata extraction
   */
  private async performUrlFetch(
    url: string,
    options: UrlFetchOptions,
    startTime: number
  ): Promise<UrlContentResult> {
    const urlConfig = this.config.getUrlContextConfig();
    const fetchOptions = {
      method: "GET",
      timeout: options.timeout || urlConfig.defaultTimeoutMs,
      headers: {
        "User-Agent":
          options.userAgent ||
          "MCP-Gemini-Server/1.0 (+hhttps://github.com/bsmi021/mcp-gemini-server)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        ...options.headers,
      },
      redirect: "follow" as RequestRedirect,
      follow: options.followRedirects || 3,
      size: options.maxContentLength || urlConfig.defaultMaxContentKb * 1024,
    };

    const response = await fetch(url, fetchOptions);
    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      throw new GeminiUrlFetchError(
        `HTTP ${response.status}: ${response.statusText}`,
        url,
        response.status
      );
    }

    const contentType = response.headers.get("content-type") || "text/html";
    const encoding = this.extractEncodingFromContentType(contentType);

    // Check content type - only process text-based content
    if (!this.isTextBasedContent(contentType)) {
      throw new GeminiUrlFetchError(
        `Unsupported content type: ${contentType}`,
        url,
        response.status
      );
    }

    let rawContent = await response.text();
    const actualSize = Buffer.byteLength(rawContent, "utf8");
    const maxSize =
      options.maxContentLength || urlConfig.defaultMaxContentKb * 1024;
    let truncated = false;

    // Truncate if content is too large
    if (actualSize > maxSize) {
      rawContent = rawContent.substring(0, maxSize);
      truncated = true;
    }

    // Extract metadata from HTML
    const metadata = await this.extractMetadata(
      rawContent,
      url,
      response,
      responseTime,
      truncated,
      encoding
    );

    // Process content based on type and options
    let processedContent = rawContent;
    if (
      contentType.includes("text/html") &&
      (options.convertToMarkdown ?? urlConfig.convertToMarkdown)
    ) {
      processedContent = this.convertHtmlToMarkdown(rawContent);
    }

    // Clean and optimize content
    processedContent = this.cleanContent(processedContent);

    return {
      content: processedContent,
      metadata,
    };
  }

  /**
   * Extract comprehensive metadata from HTML content and HTTP response
   */
  private async extractMetadata(
    content: string,
    originalUrl: string,
    response: Response,
    responseTime: number,
    truncated: boolean,
    encoding?: string
  ): Promise<UrlContentMetadata> {
    const contentType = response.headers.get("content-type") || "";
    const contentLength = parseInt(
      response.headers.get("content-length") || "0"
    );

    const metadata: UrlContentMetadata = {
      url: originalUrl,
      finalUrl: response.url !== originalUrl ? response.url : undefined,
      contentType,
      contentLength: contentLength || content.length,
      fetchedAt: new Date(),
      truncated,
      responseTime,
      statusCode: response.status,
      encoding,
    };

    // Extract HTML metadata if content is HTML
    if (contentType.includes("text/html")) {
      const htmlMetadata = this.extractHtmlMetadata(content);
      Object.assign(metadata, htmlMetadata);
    }

    return metadata;
  }

  /**
   * Extract structured metadata from HTML content
   */
  private extractHtmlMetadata(html: string): Partial<UrlContentMetadata> {
    const metadata: Partial<UrlContentMetadata> = {};

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      metadata.title = this.cleanText(titleMatch[1]);
    }

    // Extract meta description
    const descMatch = html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
    );
    if (descMatch) {
      metadata.description = this.cleanText(descMatch[1]);
    }

    // Extract language
    const langMatch =
      html.match(/<html[^>]+lang=["']([^"']+)["']/i) ||
      html.match(
        /<meta[^>]+http-equiv=["']content-language["'][^>]+content=["']([^"']+)["']/i
      );
    if (langMatch) {
      metadata.language = langMatch[1];
    }

    // Extract canonical URL
    const canonicalMatch = html.match(
      /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i
    );
    if (canonicalMatch) {
      metadata.canonicalUrl = canonicalMatch[1];
    }

    // Extract Open Graph image
    const ogImageMatch = html.match(
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
    );
    if (ogImageMatch) {
      metadata.ogImage = ogImageMatch[1];
    }

    // Extract favicon
    const faviconMatch = html.match(
      /<link[^>]+rel=["'](?:icon|shortcut icon)["'][^>]+href=["']([^"']+)["']/i
    );
    if (faviconMatch) {
      metadata.favicon = faviconMatch[1];
    }

    return metadata;
  }

  /**
   * Convert HTML content to clean markdown
   */
  private convertHtmlToMarkdown(html: string): string {
    // Remove script and style tags entirely
    html = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "");

    // Remove comments
    html = html.replace(/<!--[\s\S]*?-->/g, "");

    // Convert headings
    html = html.replace(
      /<h([1-6])[^>]*>(.*?)<\/h\1>/gi,
      (_, level, content) => {
        const hashes = "#".repeat(parseInt(level));
        return `\n\n${hashes} ${this.cleanText(content)}\n\n`;
      }
    );

    // Convert paragraphs
    html = html.replace(/<p[^>]*>(.*?)<\/p>/gi, "\n\n$1\n\n");

    // Convert line breaks
    html = html.replace(/<br\s*\/?>/gi, "\n");

    // Convert lists
    html = html.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, content) => {
      return content.replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n");
    });

    html = html.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, content) => {
      let counter = 1;
      return content.replace(
        /<li[^>]*>(.*?)<\/li>/gi,
        (_: string, itemContent: string) => `${counter++}. ${itemContent}\n`
      );
    });

    // Convert links
    html = html.replace(
      /<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi,
      "[$2]($1)"
    );

    // Convert emphasis
    html = html.replace(/<(strong|b)[^>]*>(.*?)<\/\1>/gi, "**$2**");
    html = html.replace(/<(em|i)[^>]*>(.*?)<\/\1>/gi, "*$2*");

    // Convert code
    html = html.replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`");
    html = html.replace(/<pre[^>]*>(.*?)<\/pre>/gi, "\n```\n$1\n```\n");

    // Convert blockquotes
    html = html.replace(
      /<blockquote[^>]*>(.*?)<\/blockquote>/gi,
      (_, content) => {
        return content
          .split("\n")
          .map((line: string) => `> ${line}`)
          .join("\n");
      }
    );

    // Remove remaining HTML tags
    html = html.replace(/<[^>]+>/g, "");

    // Clean up the text
    return this.cleanContent(html);
  }

  /**
   * Clean and normalize text content
   */
  private cleanContent(content: string): string {
    // Decode HTML entities
    content = content
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&mdash;/g, "—")
      .replace(/&ndash;/g, "–")
      .replace(/&hellip;/g, "…");

    // Normalize whitespace
    content = content
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\t/g, "  ")
      .replace(/[ ]+/g, " ")
      .replace(/\n[ ]+/g, "\n")
      .replace(/[ ]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n");

    // Trim and return
    return content.trim();
  }

  /**
   * Clean text by removing extra whitespace and HTML entities
   */
  private cleanText(text: string): string {
    return text
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Convert URL content results to Gemini Content format
   */
  private convertToGeminiContent(
    results: UrlContentResult[],
    options: UrlFetchOptions
  ): Content[] {
    const includeMetadata = options.includeMetadata ?? true;
    const contents: Content[] = [];

    for (const result of results) {
      // Create content with URL context header
      let contentText = `## Content from ${result.metadata.url}\n\n`;

      if (includeMetadata && result.metadata.title) {
        contentText += `**Title:** ${result.metadata.title}\n\n`;
      }

      if (includeMetadata && result.metadata.description) {
        contentText += `**Description:** ${result.metadata.description}\n\n`;
      }

      contentText += result.content;

      contents.push({
        role: "user",
        parts: [
          {
            text: contentText,
          },
        ],
      });
    }

    return contents;
  }

  /**
   * Utility methods for caching, rate limiting, and validation
   */
  private getCachedResult(url: string): UrlContentResult | null {
    const cached = this.urlCache.get(url);
    if (cached && Date.now() < cached.expiry) {
      return cached.result;
    }
    this.urlCache.delete(url);
    return null;
  }

  private cacheResult(url: string, result: UrlContentResult): void {
    const cacheExpiry = Date.now() + 15 * 60 * 1000; // 15 minutes
    this.urlCache.set(url, { result, expiry: cacheExpiry });

    // Clean up expired cache entries
    if (this.urlCache.size > 1000) {
      const now = Date.now();
      for (const [key, value] of this.urlCache.entries()) {
        if (now >= value.expiry) {
          this.urlCache.delete(key);
        }
      }
    }
  }

  private checkRateLimit(url: string): void {
    const domain = new URL(url).hostname;
    const now = Date.now();
    const limit = this.rateLimiter.get(domain);

    if (limit) {
      if (now < limit.resetTime) {
        if (limit.count >= 10) {
          // Max 10 requests per minute per domain
          throw new GeminiUrlFetchError(
            `Rate limit exceeded for domain: ${domain}`,
            url
          );
        }
      } else {
        // Reset counter
        this.rateLimiter.set(domain, { count: 0, resetTime: now + 60000 });
      }
    } else {
      this.rateLimiter.set(domain, { count: 0, resetTime: now + 60000 });
    }
  }

  private updateRateLimit(url: string): void {
    const domain = new URL(url).hostname;
    const limit = this.rateLimiter.get(domain);
    if (limit) {
      limit.count++;
    }
  }

  private shouldRetryFetch(error: unknown): boolean {
    if (error instanceof GeminiUrlValidationError) {
      return false; // Don't retry validation errors
    }

    if (error instanceof GeminiUrlFetchError) {
      const status = error.statusCode;
      // Retry on server errors and certain client errors
      return !status || status >= 500 || status === 429 || status === 408;
    }

    return true; // Retry network errors
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private extractEncodingFromContentType(
    contentType: string
  ): string | undefined {
    const match = contentType.match(/charset=([^;]+)/i);
    return match ? match[1].toLowerCase() : undefined;
  }

  private isTextBasedContent(contentType: string): boolean {
    const textTypes = [
      "text/html",
      "text/plain",
      "text/xml",
      "text/markdown",
      "application/xml",
      "application/xhtml+xml",
      "application/json",
      "application/ld+json",
    ];

    return textTypes.some((type) => contentType.toLowerCase().includes(type));
  }

  private getErrorCode(error: unknown): string {
    if (error instanceof GeminiUrlValidationError) {
      return "VALIDATION_ERROR";
    }
    if (error instanceof GeminiUrlFetchError) {
      return error.statusCode ? `HTTP_${error.statusCode}` : "FETCH_ERROR";
    }
    return "UNKNOWN_ERROR";
  }
}
