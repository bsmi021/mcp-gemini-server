import { ConfigurationManager } from "../config/ConfigurationManager.js";
import { GeminiUrlValidationError } from "./geminiErrors.js";
import { logger } from "./logger.js";

export interface UrlValidationResult {
  valid: boolean;
  reason?: string;
  warnings?: string[];
}

export interface SecurityMetrics {
  validationAttempts: number;
  validationFailures: number;
  blockedDomains: Set<string>;
  suspiciousPatterns: string[];
  rateLimitViolations: number;
}

/**
 * Comprehensive URL Security Service for validating and securing URL access
 * Prevents access to malicious, private, or restricted URLs
 */
export class UrlSecurityService {
  private readonly logger: typeof logger;
  private readonly securityMetrics: SecurityMetrics;

  // Known dangerous TLDs and patterns
  private readonly dangerousTlds = new Set([
    "tk",
    "ml",
    "ga",
    "cf", // Free domains often used for malicious purposes
    "bit",
    "link",
    "click", // URL shorteners that can hide destinations
    "download",
    "zip",
    "exe", // File-like TLDs
  ]);

  // Suspicious URL patterns
  private readonly suspiciousPatterns = [
    /\.\./, // Path traversal
    /@.*@/, // Multiple @ symbols
    /javascript:/i, // JavaScript protocol
    /data:/i, // Data URLs
    /file:/i, // File protocol
    /ftp:/i, // FTP protocol
    /localhost|127\.0\.0\.1|0\.0\.0\.0/i, // Localhost
    /\.(local|internal|private|corp|lan)$/i, // Internal domains
    /%[0-9a-f]{2}/i, // URL encoding (suspicious in domain names)
    /[<>{}\\^`|"]/i, // Dangerous characters
  ];

  // Known malicious domains and patterns (expandable list)
  private readonly knownMaliciousDomains = new Set([
    "malware.com",
    "phishing.com",
    "spam.com",
    "virus.com",
    "trojan.com",
  ]);

  // Private/internal network ranges
  private readonly privateNetworkRanges = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[01])\./,
    /^192\.168\./,
    /^169\.254\./, // Link-local
    /^224\./, // Multicast
    /^fc00:/, // IPv6 unique local
    /^fe80:/, // IPv6 link-local
    /^ff00:/, // IPv6 multicast
  ];

  constructor(private readonly config: ConfigurationManager) {
    this.logger = logger;
    this.securityMetrics = {
      validationAttempts: 0,
      validationFailures: 0,
      blockedDomains: new Set(),
      suspiciousPatterns: [],
      rateLimitViolations: 0,
    };
  }

  /**
   * Comprehensive URL validation with security checks
   */
  async validateUrl(url: string, allowedDomains?: string[]): Promise<void> {
    this.securityMetrics.validationAttempts++;

    try {
      // Basic URL format validation
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch (error) {
        this.logSecurityEvent("Invalid URL format", { url, error });
        throw new GeminiUrlValidationError(
          `Invalid URL format: ${url}`,
          url,
          "invalid_format"
        );
      }

      // Protocol validation
      if (!this.isAllowedProtocol(parsedUrl.protocol)) {
        this.logSecurityEvent("Blocked protocol", {
          url,
          protocol: parsedUrl.protocol,
        });
        throw new GeminiUrlValidationError(
          `Protocol not allowed: ${parsedUrl.protocol}`,
          url,
          "blocked_domain"
        );
      }

      // Check for suspicious patterns
      const suspiciousCheck = this.checkSuspiciousPatterns(url, parsedUrl);
      if (!suspiciousCheck.valid) {
        this.logSecurityEvent("Suspicious pattern detected", {
          url,
          reason: suspiciousCheck.reason,
        });
        throw new GeminiUrlValidationError(
          suspiciousCheck.reason || "Suspicious URL pattern detected",
          url,
          "suspicious_pattern"
        );
      }

      // Domain validation
      await this.validateDomain(parsedUrl, allowedDomains);

      // Check for known malicious domains
      if (this.isKnownMaliciousDomain(parsedUrl.hostname)) {
        this.logSecurityEvent("Known malicious domain", {
          url,
          domain: parsedUrl.hostname,
        });
        this.securityMetrics.blockedDomains.add(parsedUrl.hostname);
        throw new GeminiUrlValidationError(
          `Access to known malicious domain blocked: ${parsedUrl.hostname}`,
          url,
          "blocked_domain"
        );
      }

      // Check URL configuration limits
      this.validateUrlConfiguration(parsedUrl);

      // Additional security checks
      await this.performAdvancedSecurityChecks(parsedUrl);

      this.logger.debug("URL validation passed", {
        url,
        domain: parsedUrl.hostname,
      });
    } catch (error) {
      this.securityMetrics.validationFailures++;
      if (error instanceof GeminiUrlValidationError) {
        throw error;
      }
      throw new GeminiUrlValidationError(
        `URL validation failed: ${error instanceof Error ? error.message : String(error)}`,
        url,
        "invalid_format"
      );
    }
  }

  /**
   * Check if URL is accessible without actually fetching it
   */
  async checkUrlAccessibility(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, {
        method: "HEAD",
        headers: {
          "User-Agent": "MCP-Gemini-Server-HealthCheck/1.0",
        },
      });
      return response.ok;
    } catch (error) {
      this.logger.debug("URL accessibility check failed", { url, error });
      return false;
    }
  }

  /**
   * Get security metrics for monitoring
   */
  getSecurityMetrics(): SecurityMetrics {
    return {
      ...this.securityMetrics,
      blockedDomains: new Set(this.securityMetrics.blockedDomains),
      suspiciousPatterns: [...this.securityMetrics.suspiciousPatterns],
    };
  }

  /**
   * Reset security metrics (useful for testing)
   */
  resetSecurityMetrics(): void {
    this.securityMetrics.validationAttempts = 0;
    this.securityMetrics.validationFailures = 0;
    this.securityMetrics.blockedDomains.clear();
    this.securityMetrics.suspiciousPatterns.length = 0;
    this.securityMetrics.rateLimitViolations = 0;
  }

  /**
   * Add custom malicious domain to blocklist
   */
  addMaliciousDomain(domain: string): void {
    this.knownMaliciousDomains.add(domain.toLowerCase());
    this.logger.info("Added domain to malicious blocklist", { domain });
  }

  /**
   * Check if protocol is allowed
   */
  private isAllowedProtocol(protocol: string): boolean {
    const allowedProtocols = ["http:", "https:"];
    return allowedProtocols.includes(protocol.toLowerCase());
  }

  /**
   * Check for suspicious URL patterns
   */
  private checkSuspiciousPatterns(
    url: string,
    parsedUrl: URL
  ): UrlValidationResult {
    const warnings: string[] = [];

    // Check for control characters
    if (this.hasControlCharacters(url)) {
      const reason = "Control characters detected in URL";
      this.securityMetrics.suspiciousPatterns.push(reason);
      return { valid: false, reason };
    }

    // Check each suspicious pattern
    for (const pattern of this.suspiciousPatterns) {
      if (pattern.test(url)) {
        const reason = `Suspicious pattern detected: ${pattern.source}`;
        this.securityMetrics.suspiciousPatterns.push(reason);
        return { valid: false, reason };
      }
    }

    // Check for dangerous TLDs
    const tld = parsedUrl.hostname.split(".").pop()?.toLowerCase();
    if (tld && this.dangerousTlds.has(tld)) {
      warnings.push(`Potentially dangerous TLD: .${tld}`);
    }

    // Check for IDN homograph attacks
    if (this.detectIdnHomograph(parsedUrl.hostname)) {
      this.logger.warn("IDN homograph attack detected", {
        hostname: parsedUrl.hostname,
      });
      return {
        valid: false,
        reason: "Potential IDN homograph attack detected in domain name",
      };
    }

    // Check for URL shorteners (could hide destination)
    if (this.isUrlShortener(parsedUrl.hostname)) {
      warnings.push("URL shortener detected - destination cannot be verified");
    }

    return { valid: true, warnings };
  }

  /**
   * Validate domain against whitelist/blacklist
   */
  private async validateDomain(
    parsedUrl: URL,
    allowedDomains?: string[]
  ): Promise<void> {
    const hostname = parsedUrl.hostname.toLowerCase();
    const urlConfig = this.config.getUrlContextConfig();

    // Check blocklist first
    if (urlConfig.blocklistedDomains.length > 0) {
      for (const blockedPattern of urlConfig.blocklistedDomains) {
        if (this.matchesDomainPattern(hostname, blockedPattern)) {
          this.securityMetrics.blockedDomains.add(hostname);
          throw new GeminiUrlValidationError(
            `Domain is blocked: ${hostname}`,
            parsedUrl.href,
            "blocked_domain"
          );
        }
      }
    }

    // Check allowlist if specified
    const domainsToCheck = allowedDomains || urlConfig.allowedDomains;
    if (domainsToCheck.length > 0 && !domainsToCheck.includes("*")) {
      let allowed = false;
      for (const allowedPattern of domainsToCheck) {
        if (this.matchesDomainPattern(hostname, allowedPattern)) {
          allowed = true;
          break;
        }
      }

      if (!allowed) {
        throw new GeminiUrlValidationError(
          `Domain not in allowlist: ${hostname}`,
          parsedUrl.href,
          "blocked_domain"
        );
      }
    }

    // Check for private/internal networks
    if (this.isPrivateOrInternalAddress(hostname)) {
      throw new GeminiUrlValidationError(
        `Access to private/internal addresses blocked: ${hostname}`,
        parsedUrl.href,
        "blocked_domain"
      );
    }
  }

  /**
   * Check if domain matches a pattern (supports wildcards)
   */
  private matchesDomainPattern(domain: string, pattern: string): boolean {
    if (pattern === "*") {
      return true;
    }

    if (pattern.startsWith("*.")) {
      const suffix = pattern.slice(2);
      return domain === suffix || domain.endsWith("." + suffix);
    }

    // For blocklist, also block subdomains
    // e.g., "malicious.com" should block "sub.malicious.com"
    if (domain === pattern || domain.endsWith("." + pattern)) {
      return true;
    }

    return false;
  }

  /**
   * Check if address is private/internal
   */
  private isPrivateOrInternalAddress(hostname: string): boolean {
    // Check if it's an IP address
    const ipv4Regex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
    const ipv6Regex = /^([0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i;

    if (ipv4Regex.test(hostname) || ipv6Regex.test(hostname)) {
      return this.privateNetworkRanges.some((range) => range.test(hostname));
    }

    // Check for internal domain patterns
    return (
      /\.(local|internal|private|corp|lan|test|dev|localhost)$/i.test(
        hostname
      ) || hostname === "localhost"
    );
  }

  /**
   * Check if domain is a known URL shortener
   */
  private isUrlShortener(hostname: string): boolean {
    const shorteners = [
      "bit.ly",
      "tinyurl.com",
      "short.link",
      "ow.ly",
      "t.co",
      "goo.gl",
      "tiny.cc",
      "is.gd",
      "buff.ly",
      "bitly.com",
    ];
    return shorteners.includes(hostname);
  }

  /**
   * Detect potential IDN homograph attacks
   */
  private detectIdnHomograph(hostname: string): boolean {
    // Check if hostname contains Punycode (IDN encoded) parts
    const parts = hostname.split(".");
    const punycodePattern = /^xn--/;

    for (const part of parts) {
      if (punycodePattern.test(part)) {
        // This is a Punycode domain
        // Check for suspicious patterns that indicate homograph attacks

        // Common homograph attacks target well-known domains
        // They usually have short encoded names that look like popular sites
        const encodedPart = part.substring(4); // Remove "xn--" prefix

        // Check for patterns that look like common targets
        // e.g., "gogle", "mircosoft", "amaz0n" etc.
        // These tend to encode to relatively short Punycode strings
        if (encodedPart.length <= 10 && parts.length === 2) {
          // Short encoded domain + TLD (like google.com) - suspicious
          const tld = parts[parts.length - 1];
          if (["com", "org", "net", "io", "co"].includes(tld)) {
            this.logger.warn("Suspicious Punycode domain detected", {
              hostname,
              part,
            });
            return true;
          }
        }

        // Also flag if it's a subdomain of a legitimate domain
        // e.g., xn--pple-43d.com (apple with Cyrillic 'a')
        if (
          parts.length === 2 &&
          encodedPart.match(/^[a-z0-9]{3,8}-[a-z0-9]{2,4}$/)
        ) {
          // Pattern matches common homograph encoding patterns
          return true;
        }
      }
    }

    // Check for mixed scripts that could be confusing
    const hasLatin = /[a-zA-Z]/.test(hostname);
    const hasCyrillic = /[\u0400-\u04FF]/.test(hostname);
    const hasGreek = /[\u0370-\u03FF]/.test(hostname);

    // Mixed scripts could indicate homograph attack
    const scriptCount = [hasLatin, hasCyrillic, hasGreek].filter(
      Boolean
    ).length;
    if (scriptCount > 1) {
      return true;
    }

    // Check for any Cyrillic characters that could be confused with Latin
    // This includes common lookalike characters
    if (hasCyrillic && hostname.match(/[a-zA-Z]/)) {
      // Has both Cyrillic and Latin - likely homograph attack
      return true;
    }

    return false;
  }

  /**
   * Check if domain is known to be malicious
   */
  private isKnownMaliciousDomain(hostname: string): boolean {
    const lowerHostname = hostname.toLowerCase();

    // Check exact matches
    if (this.knownMaliciousDomains.has(lowerHostname)) {
      return true;
    }

    // Check subdomains of known malicious domains
    for (const maliciousDomain of this.knownMaliciousDomains) {
      if (lowerHostname.endsWith("." + maliciousDomain)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Validate URL against configuration limits
   */
  private validateUrlConfiguration(parsedUrl: URL): void {
    // Check URL length
    if (parsedUrl.href.length > 2048) {
      throw new GeminiUrlValidationError(
        "URL too long (max 2048 characters)",
        parsedUrl.href,
        "invalid_format"
      );
    }

    // Check for suspicious ports
    const port = parsedUrl.port;
    if (port) {
      const portNum = parseInt(port);
      const allowedPorts = [80, 443, 8080, 8443];
      if (!allowedPorts.includes(portNum)) {
        throw new GeminiUrlValidationError(
          `Port not allowed: ${port}`,
          parsedUrl.href,
          "blocked_domain"
        );
      }
    }
  }

  /**
   * Perform advanced security checks
   */
  private async performAdvancedSecurityChecks(parsedUrl: URL): Promise<void> {
    // Check for recently registered domains (simplified check)
    const hostname = parsedUrl.hostname;
    const parts = hostname.split(".");

    // Private IP check is already done in validateDomain method

    // Very new domains might be suspicious
    if (parts.length === 2 && parts[0].length < 3) {
      this.logger.warn("Potentially suspicious short domain", { hostname });
    }

    // Check for excessive subdomains (possible DGA)
    if (parts.length > 5) {
      this.logger.warn("Excessive subdomain levels detected", {
        hostname,
        levels: parts.length,
      });
    }

    // Check for random-looking domains
    if (this.looksRandomlyGenerated(hostname)) {
      this.logger.warn("Potentially randomly generated domain", { hostname });
    }
  }

  /**
   * Check if domain name looks randomly generated
   */
  private looksRandomlyGenerated(hostname: string): boolean {
    const mainDomain = hostname.split(".")[0];

    // Check for patterns indicating random generation
    const hasRepeatingChars = /(.)\1{3,}/.test(mainDomain);
    const hasAlternatingPattern = /([a-z])([0-9])\1\2/.test(mainDomain);
    const hasExcessiveNumbers =
      (mainDomain.match(/[0-9]/g) || []).length > mainDomain.length * 0.5;
    const hasNoVowels = !/[aeiou]/i.test(mainDomain);
    const isVeryShort = mainDomain.length < 4;
    const isVeryLong = mainDomain.length > 20;

    return (
      hasRepeatingChars ||
      hasAlternatingPattern ||
      hasExcessiveNumbers ||
      (hasNoVowels && !isVeryShort) ||
      isVeryLong
    );
  }

  /**
   * Log security events for monitoring
   */
  private logSecurityEvent(
    event: string,
    details: Record<string, unknown>
  ): void {
    this.logger.warn(`Security event: ${event}`, details);
  }

  // Helper method to check for control characters
  private hasControlCharacters(text: string): boolean {
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      if (
        (charCode >= 0 && charCode <= 31) ||
        (charCode >= 127 && charCode <= 159)
      ) {
        return true;
      }
    }
    return false;
  }
}
