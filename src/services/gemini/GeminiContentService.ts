import { GoogleGenAI } from "@google/genai";
import {
  GeminiApiError,
  GeminiValidationError,
  mapGeminiError,
} from "../../utils/geminiErrors.js";
import { logger } from "../../utils/logger.js";
import {
  Content,
  GenerationConfig,
  SafetySetting,
  Part,
  ThinkingConfig,
  ImagePart,
} from "./GeminiTypes.js";
import { ZodError } from "zod";
import { validateGenerateContentParams } from "./GeminiValidationSchemas.js";
import { RetryService } from "../../utils/RetryService.js";
import { GeminiUrlContextService } from "./GeminiUrlContextService.js";
import { ConfigurationManager } from "../../config/ConfigurationManager.js";

// Request configuration type definition for reuse
interface RequestConfig {
  model: string;
  contents: Content[];
  generationConfig?: GenerationConfig;
  safetySettings?: SafetySetting[];
  systemInstruction?: Content;
  cachedContent?: string;
  thinkingConfig?: ThinkingConfig;
}

/**
 * Interface for URL context parameters
 */
interface UrlContextParams {
  urls: string[];
  fetchOptions?: {
    maxContentKb?: number;
    timeoutMs?: number;
    includeMetadata?: boolean;
    convertToMarkdown?: boolean;
    allowedDomains?: string[];
    userAgent?: string;
  };
}

/**
 * Interface for the parameters of the generateContent method
 * This interface is used internally, while the parent GeminiService exports a compatible version
 */
interface GenerateContentParams {
  prompt: string;
  modelName?: string;
  generationConfig?: GenerationConfig;
  safetySettings?: SafetySetting[];
  systemInstruction?: Content | string;
  cachedContentName?: string;
  fileReferenceOrInlineData?: ImagePart | string;
  inlineDataMimeType?: string;
  urlContext?: UrlContextParams;
}

/**
 * Default retry options for Gemini API calls
 */
const DEFAULT_RETRY_OPTIONS = {
  maxAttempts: 3,
  initialDelayMs: 500,
  maxDelayMs: 10000,
  backoffFactor: 2,
  jitter: true,
  onRetry: (error: unknown, attempt: number, delayMs: number) => {
    logger.warn(
      `Retrying Gemini API call after error (attempt ${attempt}, delay: ${delayMs}ms): ${error instanceof Error ? error.message : String(error)}`
    );
  },
};

/**
 * Service for handling content generation related operations for the Gemini service.
 * Manages content generation in both streaming and non-streaming modes.
 */
export class GeminiContentService {
  private genAI: GoogleGenAI;
  private defaultModelName?: string;
  private defaultThinkingBudget?: number;
  private retryService: RetryService;
  private configManager: ConfigurationManager;
  private urlContextService: GeminiUrlContextService;

  /**
   * Creates a new instance of the GeminiContentService.
   * @param genAI The GoogleGenAI instance to use for API calls
   * @param defaultModelName Optional default model name to use if not specified in method calls
   * @param defaultThinkingBudget Optional default budget for reasoning (thinking) tokens
   */
  constructor(
    genAI: GoogleGenAI,
    defaultModelName?: string,
    defaultThinkingBudget?: number
  ) {
    this.genAI = genAI;
    this.defaultModelName = defaultModelName;
    this.defaultThinkingBudget = defaultThinkingBudget;
    this.retryService = new RetryService(DEFAULT_RETRY_OPTIONS);
    this.configManager = ConfigurationManager.getInstance();
    this.urlContextService = new GeminiUrlContextService(this.configManager);
  }

  /**
   * Streams content generation using the Gemini model.
   * Returns an async generator that yields text chunks as they are generated.
   *
   * @param params An object containing all necessary parameters for content generation
   * @returns An async generator yielding text chunks as they become available
   */
  public async *generateContentStream(
    params: GenerateContentParams
  ): AsyncGenerator<string> {
    // Log with truncated prompt for privacy/security
    logger.debug(
      `generateContentStream called with prompt: ${params.prompt.substring(0, 30)}...`
    );

    try {
      // Validate parameters using Zod schema
      try {
        // Create a proper object for validation
        const validationParams: Record<string, unknown> = {
          prompt: params.prompt,
          modelName: params.modelName,
          generationConfig: params.generationConfig,
          safetySettings: params.safetySettings,
          systemInstruction: params.systemInstruction,
          cachedContentName: params.cachedContentName,
          inlineData: params.fileReferenceOrInlineData,
          inlineDataMimeType: params.inlineDataMimeType,
        };
        validateGenerateContentParams(validationParams);
      } catch (validationError: unknown) {
        if (validationError instanceof ZodError) {
          const fieldErrors = validationError.errors
            .map((err) => `${err.path.join(".")}: ${err.message}`)
            .join(", ");
          throw new GeminiValidationError(
            `Invalid parameters for content generation: ${fieldErrors}`,
            validationError.errors[0]?.path.join(".")
          );
        }
        throw validationError;
      }

      // Create the request configuration using the helper method
      const requestConfig = await this.createRequestConfig(params);

      // Call generateContentStream with retry
      // Note: We can't use the retry service directly here because we need to handle streaming
      // Instead, we'll add retry logic to the initial API call, but not the streaming part
      let streamResult;
      try {
        streamResult = await this.retryService.execute(async () => {
          return this.genAI.models.generateContentStream(requestConfig);
        });
      } catch (error: unknown) {
        throw mapGeminiError(error, "generateContentStream");
      }

      // Stream the results (no retry for individual chunks)
      try {
        for await (const chunk of streamResult) {
          // Extract text from the chunk if available - text is a getter, not a method
          const chunkText = chunk.text;
          if (chunkText) {
            yield chunkText;
          }
        }
      } catch (error: unknown) {
        throw mapGeminiError(error, "generateContentStream");
      }
    } catch (error: unknown) {
      // Map to appropriate error type for any other errors
      throw mapGeminiError(error, "generateContentStream");
    }
  }

  /**
   * Creates the request configuration object for both content generation methods.
   * This helper method reduces code duplication between generateContent and generateContentStream.
   *
   * @param params The content generation parameters
   * @returns A properly formatted request configuration object
   * @throws GeminiApiError if parameters are invalid or model name is missing
   */
  private async createRequestConfig(
    params: GenerateContentParams
  ): Promise<RequestConfig> {
    const {
      prompt,
      modelName,
      generationConfig,
      safetySettings,
      systemInstruction,
      cachedContentName,
      fileReferenceOrInlineData,
      inlineDataMimeType,
      urlContext,
    } = params;

    const effectiveModelName = modelName ?? this.defaultModelName;
    if (!effectiveModelName) {
      throw new GeminiValidationError(
        "Model name must be provided either as a parameter or via the GOOGLE_GEMINI_MODEL environment variable.",
        "modelName"
      );
    }
    logger.debug(`Creating request config for model: ${effectiveModelName}`);

    // Construct base content parts array
    const contentParts: Part[] = [];

    // Process URL context first if provided
    if (urlContext?.urls && urlContext.urls.length > 0) {
      const urlConfig = this.configManager.getUrlContextConfig();

      if (!urlConfig.enabled) {
        throw new GeminiValidationError(
          "URL context feature is not enabled. Set GOOGLE_GEMINI_ENABLE_URL_CONTEXT=true to enable.",
          "urlContext"
        );
      }

      try {
        logger.debug(`Processing ${urlContext.urls.length} URLs for context`);

        const urlFetchOptions = {
          maxContentLength:
            (urlContext.fetchOptions?.maxContentKb ||
              urlConfig.defaultMaxContentKb) * 1024,
          timeout:
            urlContext.fetchOptions?.timeoutMs || urlConfig.defaultTimeoutMs,
          includeMetadata:
            urlContext.fetchOptions?.includeMetadata ??
            urlConfig.includeMetadata,
          convertToMarkdown:
            urlContext.fetchOptions?.convertToMarkdown ??
            urlConfig.convertToMarkdown,
          allowedDomains:
            urlContext.fetchOptions?.allowedDomains || urlConfig.allowedDomains,
          userAgent: urlContext.fetchOptions?.userAgent || urlConfig.userAgent,
        };

        const { contents: urlContents, batchResult } =
          await this.urlContextService.processUrlsForContext(
            urlContext.urls,
            urlFetchOptions
          );

        // Log the batch result for monitoring
        logger.info("URL context processing completed", {
          totalUrls: batchResult.summary.totalUrls,
          successful: batchResult.summary.successCount,
          failed: batchResult.summary.failureCount,
          totalContentSize: batchResult.summary.totalContentSize,
          avgResponseTime: batchResult.summary.averageResponseTime,
        });

        // Add URL content parts to the beginning (before the user's prompt)
        for (const urlContent of urlContents) {
          if (urlContent.parts) {
            contentParts.push(...urlContent.parts);
          }
        }

        // Log any failed URLs as warnings
        if (batchResult.failed.length > 0) {
          for (const failure of batchResult.failed) {
            logger.warn("Failed to fetch URL for context", {
              url: failure.url,
              error: failure.error.message,
              errorCode: failure.errorCode,
            });
          }
        }
      } catch (error) {
        logger.error("URL context processing failed", { error });
        // Depending on configuration, we could either fail the request or continue without URL context
        // For now, we'll throw the error to fail fast
        throw mapGeminiError(error, "URL context processing");
      }
    }

    // Add the user's prompt after URL context
    contentParts.push({ text: prompt });

    // Add inline data if provided
    if (fileReferenceOrInlineData) {
      if (typeof fileReferenceOrInlineData === "string") {
        if (inlineDataMimeType) {
          // Handle inline base64 data
          contentParts.push({
            inlineData: {
              data: fileReferenceOrInlineData,
              mimeType: inlineDataMimeType,
            },
          });
        } else {
          throw new GeminiValidationError(
            "For inline data, inlineDataMimeType is required",
            "fileReferenceOrInlineData"
          );
        }
      } else if (
        typeof fileReferenceOrInlineData === "object" &&
        "type" in fileReferenceOrInlineData &&
        "data" in fileReferenceOrInlineData &&
        "mimeType" in fileReferenceOrInlineData
      ) {
        // Handle ImagePart type
        const imagePart = fileReferenceOrInlineData as ImagePart;
        if (imagePart.type === "base64") {
          contentParts.push({
            inlineData: {
              data: imagePart.data,
              mimeType: imagePart.mimeType,
            },
          });
        } else {
          throw new GeminiValidationError(
            "URL-based images are not supported. Please provide base64-encoded image data instead.",
            "fileReferenceOrInlineData"
          );
        }
      } else {
        throw new GeminiValidationError(
          "Invalid inline data provided. Expected base64 string with mimeType or ImagePart object",
          "fileReferenceOrInlineData"
        );
      }
    }

    // Process systemInstruction if it's a string
    let formattedSystemInstruction: Content | undefined;
    if (systemInstruction) {
      if (typeof systemInstruction === "string") {
        formattedSystemInstruction = {
          parts: [{ text: systemInstruction }],
        };
      } else {
        formattedSystemInstruction = systemInstruction;
      }
    }

    // Create the request configuration for v0.10.0
    const requestConfig: RequestConfig = {
      model: effectiveModelName,
      contents: [{ role: "user", parts: contentParts }],
    };

    // Add optional parameters if provided
    if (generationConfig) {
      requestConfig.generationConfig = generationConfig;

      // Extract thinking config if it exists within generation config
      if (generationConfig.thinkingConfig) {
        requestConfig.thinkingConfig = generationConfig.thinkingConfig;
      }
    }

    // Map reasoningEffort to thinkingBudget if provided
    if (requestConfig.thinkingConfig?.reasoningEffort) {
      const effortMap: Record<string, number> = {
        none: 0,
        low: 1024, // 1K tokens
        medium: 8192, // 8K tokens
        high: 24576, // 24K tokens
      };

      requestConfig.thinkingConfig.thinkingBudget =
        effortMap[requestConfig.thinkingConfig.reasoningEffort];
      logger.debug(
        `Mapped reasoning effort '${requestConfig.thinkingConfig.reasoningEffort}' to thinking budget: ${requestConfig.thinkingConfig.thinkingBudget} tokens`
      );
    }

    // Apply default thinking budget if available and not specified in request
    if (
      this.defaultThinkingBudget !== undefined &&
      !requestConfig.thinkingConfig
    ) {
      requestConfig.thinkingConfig = {
        thinkingBudget: this.defaultThinkingBudget,
      };
      logger.debug(
        `Applied default thinking budget: ${this.defaultThinkingBudget} tokens`
      );
    }
    if (safetySettings) {
      requestConfig.safetySettings = safetySettings;
    }
    if (formattedSystemInstruction) {
      requestConfig.systemInstruction = formattedSystemInstruction;
    }
    if (cachedContentName) {
      requestConfig.cachedContent = cachedContentName;
    }

    return requestConfig;
  }

  /**
   * Generates content using the Gemini model with automatic retries for transient errors.
   * Uses exponential backoff to avoid overwhelming the API during temporary issues.
   *
   * @param params An object containing all necessary parameters for content generation
   * @returns A promise resolving to the generated text content
   */
  public async generateContent(params: GenerateContentParams): Promise<string> {
    // Log with truncated prompt for privacy/security
    logger.debug(
      `generateContent called with prompt: ${params.prompt.substring(0, 30)}...`
    );

    try {
      // Validate parameters using Zod schema
      try {
        // Create a proper object for validation
        const validationParams: Record<string, unknown> = {
          prompt: params.prompt,
          modelName: params.modelName,
          generationConfig: params.generationConfig,
          safetySettings: params.safetySettings,
          systemInstruction: params.systemInstruction,
          cachedContentName: params.cachedContentName,
          inlineData: params.fileReferenceOrInlineData,
          inlineDataMimeType: params.inlineDataMimeType,
        };
        validateGenerateContentParams(validationParams);
      } catch (validationError: unknown) {
        if (validationError instanceof ZodError) {
          const fieldErrors = validationError.errors
            .map((err) => `${err.path.join(".")}: ${err.message}`)
            .join(", ");
          throw new GeminiValidationError(
            `Invalid parameters for content generation: ${fieldErrors}`,
            validationError.errors[0]?.path.join(".")
          );
        }
        throw validationError;
      }

      // Create the request configuration using the helper method
      const requestConfig = await this.createRequestConfig(params);

      // Call generateContent with retry logic
      return await this.retryService.execute(async () => {
        const result = await this.genAI.models.generateContent(requestConfig);

        // Handle potentially undefined text property
        if (!result.text) {
          throw new GeminiApiError("No text was generated in the response");
        }

        return result.text;
      });
    } catch (error: unknown) {
      // Map to appropriate error type
      throw mapGeminiError(error, "generateContent");
    }
  }
}
