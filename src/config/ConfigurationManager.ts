import * as path from "path";
import {
  ExampleServiceConfig,
  GeminiServiceConfig,
  ModelConfiguration,
  ModelCapabilitiesMap,
} from "../types/index.js";
import { FileSecurityService } from "../utils/FileSecurityService.js";
import { ModelMigrationService } from "../services/gemini/ModelMigrationService.js";
import { logger } from "../utils/logger.js";

// Define the structure for all configurations managed
interface ManagedConfigs {
  exampleService: Required<ExampleServiceConfig>;
  geminiService: GeminiServiceConfig;
  github: {
    apiToken: string;
  };
  allowedOutputPaths: string[];
  mcpConfig: {
    host: string;
    port: number;
    connectionToken: string;
    clientId: string;
    logLevel?: "debug" | "info" | "warn" | "error";
    transport?: "stdio" | "sse";
    enableStreaming?: boolean;
    sessionTimeoutSeconds?: number;
  };
  urlContext: {
    enabled: boolean;
    maxUrlsPerRequest: number;
    defaultMaxContentKb: number;
    defaultTimeoutMs: number;
    allowedDomains: string[];
    blocklistedDomains: string[];
    convertToMarkdown: boolean;
    includeMetadata: boolean;
    enableCaching: boolean;
    cacheExpiryMinutes: number;
    maxCacheSize: number;
    rateLimitPerDomainPerMinute: number;
    userAgent: string;
  };
  modelConfiguration: ModelConfiguration;
}

/**
 * Centralized configuration management for all services.
 * Implements singleton pattern to ensure consistent configuration.
 */
export class ConfigurationManager {
  private static instance: ConfigurationManager | null = null;
  private static instanceLock = false;

  private config: ManagedConfigs;

  private constructor() {
    // Initialize with default configurations
    this.config = {
      exampleService: {
        // Define defaults for ExampleService
        greeting: "Hello",
        enableDetailedLogs: false,
      },
      geminiService: {
        apiKey: "",
        defaultModel: undefined,
        defaultImageResolution: "1024x1024",
        maxImageSizeMB: 10,
        supportedImageFormats: ["image/jpeg", "image/png", "image/webp"],
        defaultThinkingBudget: undefined,
      },
      modelConfiguration: this.buildDefaultModelConfiguration(),
      github: {
        // Default GitHub API token is empty; will be loaded from environment variable
        apiToken: "",
      },
      allowedOutputPaths: [],
      mcpConfig: {
        // Initialize MCP config
        host: "localhost",
        port: 8080,
        connectionToken: "", // Must be set via env
        clientId: "gemini-sdk-client",
        logLevel: "info",
        transport: "stdio",
      },
      urlContext: {
        // Initialize URL context config with secure defaults
        enabled: false, // Disabled by default for security
        maxUrlsPerRequest: 20,
        defaultMaxContentKb: 100,
        defaultTimeoutMs: 10000,
        allowedDomains: ["*"], // Allow all by default (can be restricted)
        blocklistedDomains: [], // Empty by default
        convertToMarkdown: true,
        includeMetadata: true,
        enableCaching: true,
        cacheExpiryMinutes: 15,
        maxCacheSize: 1000,
        rateLimitPerDomainPerMinute: 10,
        userAgent:
          "MCP-Gemini-Server/1.0 (+https://github.com/bsmi021/mcp-gemini-server)",
      },

      // Initialize other service configs with defaults:
      // yourService: {
      //   someSetting: 'default value',
      //   retryCount: 3,
      // },
    };

    const migrationService = ModelMigrationService.getInstance();
    migrationService.migrateEnvironmentVariables();

    const validation = migrationService.validateConfiguration();
    if (!validation.isValid) {
      logger.error("[ConfigurationManager] Configuration validation failed", {
        errors: validation.errors,
      });
    }

    const deprecated = migrationService.getDeprecatedFeatures();
    if (deprecated.length > 0) {
      logger.warn("[ConfigurationManager] Deprecated features detected", {
        deprecated,
      });
    }

    this.validateRequiredEnvVars();
    this.loadEnvironmentOverrides();
    this.config.modelConfiguration = this.parseModelConfiguration();

    FileSecurityService.configureFromEnvironment();
  }

  private validateRequiredEnvVars(): void {
    // Skip validation in test environment
    if (process.env.NODE_ENV === "test") {
      logger.info(
        "Skipping environment variable validation in test environment"
      );
      return;
    }

    // Always require Gemini API key
    const requiredVars = ["GOOGLE_GEMINI_API_KEY"];

    // Check transport type to determine if MCP server variables are required
    const transportType =
      process.env.MCP_TRANSPORT || process.env.MCP_TRANSPORT_TYPE || "stdio";

    // Only require MCP server variables for HTTP/SSE transport modes
    if (
      transportType === "http" ||
      transportType === "sse" ||
      transportType === "streamable"
    ) {
      requiredVars.push(
        "MCP_SERVER_HOST",
        "MCP_SERVER_PORT",
        "MCP_CONNECTION_TOKEN"
      );
    }

    const missingVars = requiredVars.filter((varName) => !process.env[varName]);

    if (missingVars.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missingVars.join(", ")}`
      );
    }
  }

  /**
   * Get the singleton instance of ConfigurationManager.
   * Basic lock to prevent race conditions during initial creation.
   */
  public static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      if (!ConfigurationManager.instanceLock) {
        ConfigurationManager.instanceLock = true; // Lock
        try {
          ConfigurationManager.instance = new ConfigurationManager();
        } finally {
          ConfigurationManager.instanceLock = false; // Unlock
        }
      } else {
        // Basic busy wait if locked (consider a more robust async lock if high contention is expected)
        while (ConfigurationManager.instanceLock) {
          // Small delay to prevent tight loop
          const now = Date.now();
          while (Date.now() - now < 10) {
            // Intentional minimal delay
          }
        }
        // Re-check instance after wait
        if (!ConfigurationManager.instance) {
          // This path is less likely but handles edge cases if lock logic needs refinement
          return ConfigurationManager.getInstance();
        }
      }
    }
    return ConfigurationManager.instance;
  }

  // --- Getters for specific configurations ---

  public getExampleServiceConfig(): Required<ExampleServiceConfig> {
    // Return a copy to prevent accidental modification of the internal state
    return { ...this.config.exampleService };
  }

  public getGeminiServiceConfig(): GeminiServiceConfig {
    // Return a copy to prevent accidental modification
    return { ...this.config.geminiService };
  }

  // Getter for MCP Configuration
  public getMcpConfig(): Required<ManagedConfigs["mcpConfig"]> {
    // Return a copy to ensure type safety and prevent modification
    // Cast to Required because we validate essential fields are set from env vars.
    // Optional fields will have their defaults.
    return { ...this.config.mcpConfig } as Required<
      ManagedConfigs["mcpConfig"]
    >;
  }

  // Getter specifically for the default model name
  public getDefaultModelName(): string | undefined {
    return this.config.geminiService.defaultModel;
  }

  public getModelConfiguration(): ModelConfiguration {
    return { ...this.config.modelConfiguration };
  }

  /**
   * Returns the GitHub API token for GitHub API requests
   * @returns The configured GitHub API token or undefined if not set
   */
  public getGitHubApiToken(): string | undefined {
    return this.config.github.apiToken || undefined;
  }

  /**
   * Returns the list of allowed output paths for file writing
   * @returns A copy of the configured allowed output paths array
   */
  public getAllowedOutputPaths(): string[] {
    // Return a copy to prevent accidental modification
    return [...this.config.allowedOutputPaths];
  }

  /**
   * Returns the URL context configuration
   * @returns A copy of the URL context configuration
   */
  public getUrlContextConfig(): Required<ManagedConfigs["urlContext"]> {
    return { ...this.config.urlContext };
  }

  // Add getters for other service configs:
  // public getYourServiceConfig(): Required<YourServiceConfig> {
  //   return { ...this.config.yourService };
  // }

  // --- Updaters for specific configurations (if runtime updates are needed) ---

  public updateExampleServiceConfig(
    update: Partial<ExampleServiceConfig>
  ): void {
    this.config.exampleService = {
      ...this.config.exampleService,
      ...update,
    };
    // Optional: Notify relevant services about the config change
  }

  // Add updaters for other service configs:
  // public updateYourServiceConfig(update: Partial<YourServiceConfig>): void {
  //   this.config.yourService = {
  //     ...this.config.yourService,
  //     ...update,
  //   };
  // }

  /**
   * Example method to load configuration overrides from environment variables.
   * Call this in the constructor.
   */
  private loadEnvironmentOverrides(): void {
    // Example for ExampleService
    if (process.env.EXAMPLE_GREETING) {
      this.config.exampleService.greeting = process.env.EXAMPLE_GREETING;
    }
    if (process.env.EXAMPLE_ENABLE_LOGS) {
      this.config.exampleService.enableDetailedLogs =
        process.env.EXAMPLE_ENABLE_LOGS.toLowerCase() === "true";
    }

    // Load GitHub API token if provided
    if (process.env.GITHUB_API_TOKEN) {
      this.config.github.apiToken = process.env.GITHUB_API_TOKEN;
      logger.info("[ConfigurationManager] GitHub API token configured");
    } else {
      logger.warn(
        "[ConfigurationManager] GITHUB_API_TOKEN environment variable not set. GitHub code review features may not work properly."
      );
    }

    // Add logic for other services based on their environment variables
    // if (process.env.YOUR_SERVICE_RETRY_COUNT) {
    //   const retryCount = parseInt(process.env.YOUR_SERVICE_RETRY_COUNT, 10);
    //   if (!isNaN(retryCount)) {
    //     this.config.yourService.retryCount = retryCount;
    //   }
    // }

    // Load Gemini API Key (using the name from .env)
    if (process.env.GOOGLE_GEMINI_API_KEY) {
      this.config.geminiService.apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    } else {
      // Log a warning if the key is missing, the service constructor will throw
      logger.warn(
        "[ConfigurationManager] WARNING: GOOGLE_GEMINI_API_KEY environment variable not set."
      );
    }

    // Load Default Gemini Model Name
    if (process.env.GOOGLE_GEMINI_MODEL) {
      this.config.geminiService.defaultModel = process.env.GOOGLE_GEMINI_MODEL;
      logger.info(
        `[ConfigurationManager] Default Gemini model set to: ${this.config.geminiService.defaultModel}`
      );
    } else {
      logger.info(
        "[ConfigurationManager] GOOGLE_GEMINI_MODEL environment variable not set. No default model configured."
      );
    }

    // Load image-specific settings if provided
    if (process.env.GOOGLE_GEMINI_IMAGE_RESOLUTION) {
      const resolution = process.env.GOOGLE_GEMINI_IMAGE_RESOLUTION;
      if (["512x512", "1024x1024", "1536x1536"].includes(resolution)) {
        this.config.geminiService.defaultImageResolution = resolution as
          | "512x512"
          | "1024x1024"
          | "1536x1536";
        logger.info(
          `[ConfigurationManager] Default image resolution set to: ${resolution}`
        );
      } else {
        logger.warn(
          `[ConfigurationManager] Invalid image resolution '${resolution}' specified in GOOGLE_GEMINI_IMAGE_RESOLUTION. Using default.`
        );
      }
    }

    if (process.env.GOOGLE_GEMINI_MAX_IMAGE_SIZE_MB) {
      const sizeMB = parseInt(process.env.GOOGLE_GEMINI_MAX_IMAGE_SIZE_MB, 10);
      if (!isNaN(sizeMB) && sizeMB > 0) {
        this.config.geminiService.maxImageSizeMB = sizeMB;
        logger.info(
          `[ConfigurationManager] Maximum image size set to: ${sizeMB}MB`
        );
      } else {
        logger.warn(
          `[ConfigurationManager] Invalid max image size '${process.env.GOOGLE_GEMINI_MAX_IMAGE_SIZE_MB}' specified. Using default.`
        );
      }
    }

    if (process.env.GOOGLE_GEMINI_SUPPORTED_IMAGE_FORMATS) {
      try {
        const formats = JSON.parse(
          process.env.GOOGLE_GEMINI_SUPPORTED_IMAGE_FORMATS
        );
        if (
          Array.isArray(formats) &&
          formats.every((f) => typeof f === "string")
        ) {
          this.config.geminiService.supportedImageFormats = formats;
          logger.info(
            `[ConfigurationManager] Supported image formats set to: ${formats.join(", ")}`
          );
        } else {
          throw new Error("Invalid format array");
        }
      } catch (error) {
        logger.warn(
          `[ConfigurationManager] Invalid image formats specified in GOOGLE_GEMINI_SUPPORTED_IMAGE_FORMATS: '${process.env.GOOGLE_GEMINI_SUPPORTED_IMAGE_FORMATS}'. Using default.`
        );
      }
    }

    // Load default thinking budget if provided
    if (process.env.GOOGLE_GEMINI_DEFAULT_THINKING_BUDGET) {
      const budget = parseInt(
        process.env.GOOGLE_GEMINI_DEFAULT_THINKING_BUDGET,
        10
      );
      if (!isNaN(budget) && budget >= 0 && budget <= 24576) {
        this.config.geminiService.defaultThinkingBudget = budget;
        logger.info(
          `[ConfigurationManager] Default thinking budget set to: ${budget} tokens`
        );
      } else {
        logger.warn(
          `[ConfigurationManager] Invalid thinking budget '${process.env.GOOGLE_GEMINI_DEFAULT_THINKING_BUDGET}' specified. Must be between 0 and 24576. Not using default thinking budget.`
        );
      }
    }

    // Load MCP Configuration
    if (process.env.MCP_SERVER_HOST) {
      this.config.mcpConfig.host = process.env.MCP_SERVER_HOST;
    }
    if (process.env.MCP_SERVER_PORT) {
      const port = parseInt(process.env.MCP_SERVER_PORT, 10);
      if (!isNaN(port) && port > 0 && port < 65536) {
        this.config.mcpConfig.port = port;
      } else {
        logger.warn(
          `[ConfigurationManager] Invalid MCP_SERVER_PORT: '${process.env.MCP_SERVER_PORT}'. Using default ${this.config.mcpConfig.port}.`
        );
      }
    }
    if (process.env.MCP_CONNECTION_TOKEN) {
      this.config.mcpConfig.connectionToken = process.env.MCP_CONNECTION_TOKEN;
    }
    if (process.env.MCP_CLIENT_ID) {
      this.config.mcpConfig.clientId = process.env.MCP_CLIENT_ID;
    }
    if (process.env.MCP_LOG_LEVEL) {
      const logLevel = process.env.MCP_LOG_LEVEL.toLowerCase();
      if (["debug", "info", "warn", "error"].includes(logLevel)) {
        this.config.mcpConfig.logLevel = logLevel as
          | "debug"
          | "info"
          | "warn"
          | "error";
      } else {
        logger.warn(
          `[ConfigurationManager] Invalid MCP_LOG_LEVEL: '${process.env.MCP_LOG_LEVEL}'. Using default '${this.config.mcpConfig.logLevel}'.`
        );
      }
    }
    if (process.env.MCP_TRANSPORT) {
      const transport = process.env.MCP_TRANSPORT.toLowerCase();
      if (["stdio", "sse"].includes(transport)) {
        this.config.mcpConfig.transport = transport as "stdio" | "sse";
      } else {
        logger.warn(
          `[ConfigurationManager] Invalid MCP_TRANSPORT: '${process.env.MCP_TRANSPORT}'. Using default '${this.config.mcpConfig.transport}'.`
        );
      }
    }

    if (process.env.MCP_ENABLE_STREAMING) {
      this.config.mcpConfig.enableStreaming =
        process.env.MCP_ENABLE_STREAMING.toLowerCase() === "true";
      logger.info(
        `[ConfigurationManager] MCP streaming enabled: ${this.config.mcpConfig.enableStreaming}`
      );
    }

    if (process.env.MCP_SESSION_TIMEOUT) {
      const timeout = parseInt(process.env.MCP_SESSION_TIMEOUT, 10);
      if (!isNaN(timeout) && timeout > 0) {
        this.config.mcpConfig.sessionTimeoutSeconds = timeout;
        logger.info(
          `[ConfigurationManager] MCP session timeout set to: ${timeout} seconds`
        );
      } else {
        logger.warn(
          `[ConfigurationManager] Invalid MCP_SESSION_TIMEOUT: '${process.env.MCP_SESSION_TIMEOUT}'. Using default.`
        );
      }
    }

    logger.info("[ConfigurationManager] MCP configuration loaded.");

    // Load URL Context Configuration
    if (process.env.GOOGLE_GEMINI_ENABLE_URL_CONTEXT) {
      this.config.urlContext.enabled =
        process.env.GOOGLE_GEMINI_ENABLE_URL_CONTEXT.toLowerCase() === "true";
      logger.info(
        `[ConfigurationManager] URL context feature enabled: ${this.config.urlContext.enabled}`
      );
    }

    if (process.env.GOOGLE_GEMINI_URL_MAX_COUNT) {
      const maxCount = parseInt(process.env.GOOGLE_GEMINI_URL_MAX_COUNT, 10);
      if (!isNaN(maxCount) && maxCount > 0 && maxCount <= 20) {
        this.config.urlContext.maxUrlsPerRequest = maxCount;
        logger.info(`[ConfigurationManager] URL max count set to: ${maxCount}`);
      } else {
        logger.warn(
          `[ConfigurationManager] Invalid URL max count '${process.env.GOOGLE_GEMINI_URL_MAX_COUNT}'. Must be between 1 and 20.`
        );
      }
    }

    if (process.env.GOOGLE_GEMINI_URL_MAX_CONTENT_KB) {
      const maxKb = parseInt(process.env.GOOGLE_GEMINI_URL_MAX_CONTENT_KB, 10);
      if (!isNaN(maxKb) && maxKb > 0 && maxKb <= 1000) {
        this.config.urlContext.defaultMaxContentKb = maxKb;
        logger.info(
          `[ConfigurationManager] URL max content size set to: ${maxKb}KB`
        );
      } else {
        logger.warn(
          `[ConfigurationManager] Invalid URL max content size '${process.env.GOOGLE_GEMINI_URL_MAX_CONTENT_KB}'. Must be between 1 and 1000 KB.`
        );
      }
    }

    if (process.env.GOOGLE_GEMINI_URL_FETCH_TIMEOUT_MS) {
      const timeout = parseInt(
        process.env.GOOGLE_GEMINI_URL_FETCH_TIMEOUT_MS,
        10
      );
      if (!isNaN(timeout) && timeout >= 1000 && timeout <= 30000) {
        this.config.urlContext.defaultTimeoutMs = timeout;
        logger.info(
          `[ConfigurationManager] URL fetch timeout set to: ${timeout}ms`
        );
      } else {
        logger.warn(
          `[ConfigurationManager] Invalid URL fetch timeout '${process.env.GOOGLE_GEMINI_URL_FETCH_TIMEOUT_MS}'. Must be between 1000 and 30000 ms.`
        );
      }
    }

    if (process.env.GOOGLE_GEMINI_URL_ALLOWED_DOMAINS) {
      try {
        const domains = this.parseStringArray(
          process.env.GOOGLE_GEMINI_URL_ALLOWED_DOMAINS
        );
        this.config.urlContext.allowedDomains = domains;
        logger.info(
          `[ConfigurationManager] URL allowed domains set to: ${domains.join(", ")}`
        );
      } catch (error) {
        logger.warn(
          `[ConfigurationManager] Invalid URL allowed domains format: ${error}`
        );
      }
    }

    if (process.env.GOOGLE_GEMINI_URL_BLOCKLIST) {
      try {
        const domains = this.parseStringArray(
          process.env.GOOGLE_GEMINI_URL_BLOCKLIST
        );
        this.config.urlContext.blocklistedDomains = domains;
        logger.info(
          `[ConfigurationManager] URL blocklisted domains set to: ${domains.join(", ")}`
        );
      } catch (error) {
        logger.warn(
          `[ConfigurationManager] Invalid URL blocklist format: ${error}`
        );
      }
    }

    if (process.env.GOOGLE_GEMINI_URL_CONVERT_TO_MARKDOWN) {
      this.config.urlContext.convertToMarkdown =
        process.env.GOOGLE_GEMINI_URL_CONVERT_TO_MARKDOWN.toLowerCase() ===
        "true";
      logger.info(
        `[ConfigurationManager] URL markdown conversion enabled: ${this.config.urlContext.convertToMarkdown}`
      );
    }

    if (process.env.GOOGLE_GEMINI_URL_INCLUDE_METADATA) {
      this.config.urlContext.includeMetadata =
        process.env.GOOGLE_GEMINI_URL_INCLUDE_METADATA.toLowerCase() === "true";
      logger.info(
        `[ConfigurationManager] URL metadata inclusion enabled: ${this.config.urlContext.includeMetadata}`
      );
    }

    if (process.env.GOOGLE_GEMINI_URL_ENABLE_CACHING) {
      this.config.urlContext.enableCaching =
        process.env.GOOGLE_GEMINI_URL_ENABLE_CACHING.toLowerCase() === "true";
      logger.info(
        `[ConfigurationManager] URL caching enabled: ${this.config.urlContext.enableCaching}`
      );
    }

    if (process.env.GOOGLE_GEMINI_URL_USER_AGENT) {
      this.config.urlContext.userAgent =
        process.env.GOOGLE_GEMINI_URL_USER_AGENT;

      logger.info(
        `[ConfigurationManager] URL user agent set to: ${this.config.urlContext.userAgent}`
      );
    }

    logger.info("[ConfigurationManager] URL context configuration loaded.");

    this.config.allowedOutputPaths = [];
    const allowedOutputPathsEnv = process.env.ALLOWED_OUTPUT_PATHS;

    if (allowedOutputPathsEnv && allowedOutputPathsEnv.trim().length > 0) {
      const pathsArray = allowedOutputPathsEnv
        .split(",")
        .map((p) => p.trim()) // Trim whitespace from each path
        .filter((p) => p.length > 0); // Filter out any empty strings resulting from split

      if (pathsArray.length > 0) {
        this.config.allowedOutputPaths = pathsArray.map((p) => path.resolve(p)); // Resolve to absolute paths
        logger.info(
          `[ConfigurationManager] Allowed output paths configured: ${this.config.allowedOutputPaths.join(
            ", "
          )}`
        );
      } else {
        // This case handles if ALLOWED_OUTPUT_PATHS was something like ",," or " , "
        logger.warn(
          "[ConfigurationManager] ALLOWED_OUTPUT_PATHS environment variable was provided but contained no valid paths after trimming. File writing might be restricted."
        );
      }
    } else {
      logger.warn(
        "[ConfigurationManager] ALLOWED_OUTPUT_PATHS environment variable not set or is empty. File writing might be restricted or disabled."
      );
    }
  }

  private buildDefaultModelConfiguration(): ModelConfiguration {
    return {
      default: "gemini-2.5-flash-preview-05-20",
      textGeneration: [
        "gemini-2.5-pro-preview-05-06",
        "gemini-2.5-flash-preview-05-20",
        "gemini-2.0-flash",
        "gemini-1.5-pro",
        "gemini-1.5-flash",
      ],
      imageGeneration: [
        "imagen-3.0-generate-002",
        "gemini-2.0-flash-preview-image-generation",
      ],
      videoGeneration: ["veo-2.0-generate-001"],
      codeReview: [
        "gemini-2.5-pro-preview-05-06",
        "gemini-2.5-flash-preview-05-20",
        "gemini-2.0-flash",
      ],
      complexReasoning: [
        "gemini-2.5-pro-preview-05-06",
        "gemini-2.5-flash-preview-05-20",
      ],
      capabilities: this.buildCapabilitiesMap(),
      routing: {
        preferCostEffective: false,
        preferSpeed: false,
        preferQuality: true,
      },
    };
  }

  private buildCapabilitiesMap(): ModelCapabilitiesMap {
    return {
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
      "gemini-1.5-pro": {
        textGeneration: true,
        imageInput: true,
        videoInput: true,
        audioInput: true,
        imageGeneration: false,
        videoGeneration: false,
        codeExecution: "good",
        complexReasoning: "good",
        costTier: "high",
        speedTier: "medium",
        maxTokens: 8192,
        contextWindow: 2000000,
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
      "veo-2.0-generate-001": {
        textGeneration: false,
        imageInput: true,
        videoInput: false,
        audioInput: false,
        imageGeneration: false,
        videoGeneration: true,
        codeExecution: "none",
        complexReasoning: "none",
        costTier: "high",
        speedTier: "slow",
        maxTokens: 0,
        contextWindow: 0,
        supportsFunctionCalling: false,
        supportsSystemInstructions: true,
        supportsCaching: false,
      },
    };
  }

  private parseModelConfiguration(): ModelConfiguration {
    const textModels = this.parseModelArray("GOOGLE_GEMINI_MODELS") ||
      this.parseModelArray("GOOGLE_GEMINI_TEXT_MODELS") || [
        process.env.GOOGLE_GEMINI_MODEL || "gemini-2.5-flash-preview-05-20",
      ];

    const imageModels = this.parseModelArray("GOOGLE_GEMINI_IMAGE_MODELS") || [
      "imagen-3.0-generate-002",
      "gemini-2.0-flash-preview-image-generation",
    ];

    const videoModels = this.parseModelArray("GOOGLE_GEMINI_VIDEO_MODELS") || [
      "veo-2.0-generate-001",
    ];

    const codeModels = this.parseModelArray("GOOGLE_GEMINI_CODE_MODELS") || [
      "gemini-2.5-pro-preview-05-06",
      "gemini-2.5-flash-preview-05-20",
      "gemini-2.0-flash",
    ];

    return {
      default: process.env.GOOGLE_GEMINI_DEFAULT_MODEL || textModels[0],
      textGeneration: textModels,
      imageGeneration: imageModels,
      videoGeneration: videoModels,
      codeReview: codeModels,
      complexReasoning: textModels.filter((m) => this.isHighReasoningModel(m)),
      capabilities: this.buildCapabilitiesMap(),
      routing: this.parseRoutingPreferences(),
    };
  }

  private parseModelArray(envVarName: string): string[] | null {
    const envValue = process.env[envVarName];
    if (!envValue) return null;

    try {
      const parsed = JSON.parse(envValue);
      if (
        Array.isArray(parsed) &&
        parsed.every((item) => typeof item === "string")
      ) {
        return parsed;
      }
      logger.warn(
        `[ConfigurationManager] Invalid ${envVarName} format: expected JSON array of strings`
      );
      return null;
    } catch (error) {
      logger.warn(
        `[ConfigurationManager] Failed to parse ${envVarName}: ${error}`
      );
      return null;
    }
  }

  private isHighReasoningModel(modelName: string): boolean {
    const highReasoningModels = [
      "gemini-2.5-pro-preview-05-06",
      "gemini-2.5-flash-preview-05-20",
      "gemini-1.5-pro",
    ];
    return highReasoningModels.includes(modelName);
  }

  private parseRoutingPreferences(): ModelConfiguration["routing"] {
    return {
      preferCostEffective:
        process.env.GOOGLE_GEMINI_ROUTING_PREFER_COST?.toLowerCase() === "true",
      preferSpeed:
        process.env.GOOGLE_GEMINI_ROUTING_PREFER_SPEED?.toLowerCase() ===
        "true",
      preferQuality:
        process.env.GOOGLE_GEMINI_ROUTING_PREFER_QUALITY?.toLowerCase() ===
          "true" ||
        (!process.env.GOOGLE_GEMINI_ROUTING_PREFER_COST &&
          !process.env.GOOGLE_GEMINI_ROUTING_PREFER_SPEED),
    };
  }

  /**
   * Parse a comma-separated string or JSON array into a string array
   */
  private parseStringArray(value: string): string[] {
    if (!value || value.trim() === "") {
      return [];
    }

    // Try to parse as JSON first
    if (value.trim().startsWith("[")) {
      try {
        const parsed = JSON.parse(value);
        if (
          Array.isArray(parsed) &&
          parsed.every((item) => typeof item === "string")
        ) {
          return parsed;
        }
        throw new Error("Not a string array");
      } catch (error) {
        throw new Error(`Invalid JSON array format: ${error}`);
      }
    }

    // Parse as comma-separated string
    return value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
}
