import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { ConfigurationManager } from "../config/ConfigurationManager.js";
import { ModelSelectionService } from "./ModelSelectionService.js";
import { logger } from "../utils/logger.js";
import {
  CachedContentMetadata,
  ModelSelectionCriteria,
  ImageGenerationResult,
} from "../types/index.js";
import {
  GeminiGitDiffService,
  GitDiffReviewParams,
} from "./gemini/GeminiGitDiffService.js";
import { GitHubApiService } from "./gemini/GitHubApiService.js";

// Import specialized services
import { GeminiChatService } from "./gemini/GeminiChatService.js";
import { GeminiContentService } from "./gemini/GeminiContentService.js";
import { GeminiCacheService } from "./gemini/GeminiCacheService.js";
import {
  Content,
  Tool,
  ToolConfig,
  GenerationConfig,
  SafetySetting,
  CacheId,
  FunctionCall,
} from "./gemini/GeminiTypes.js";

/**
 * Service for interacting with the Google Gemini API.
 * This is a facade that delegates to specialized services for different functionality.
 */
export class GeminiService {
  private genAI: GoogleGenAI;
  private defaultModelName?: string;
  private modelSelector: ModelSelectionService;
  private configManager: ConfigurationManager;

  private chatService: GeminiChatService;
  private contentService: GeminiContentService;
  private cacheService: GeminiCacheService;
  private gitDiffService: GeminiGitDiffService;
  private gitHubApiService: GitHubApiService;

  constructor() {
    this.configManager = ConfigurationManager.getInstance();
    const config = this.configManager.getGeminiServiceConfig();

    this.modelSelector = new ModelSelectionService(
      this.configManager.getModelConfiguration()
    );

    if (!config.apiKey) {
      throw new Error("Gemini API key is required");
    }

    // Initialize with the apiKey property in an object as required in v0.10.0
    this.genAI = new GoogleGenAI({ apiKey: config.apiKey });
    this.defaultModelName = config.defaultModel;

    // File security service is no longer needed since file operations were removed

    // Initialize specialized services
    this.contentService = new GeminiContentService(
      this.genAI,
      this.defaultModelName,
      config.defaultThinkingBudget
    );
    this.chatService = new GeminiChatService(this.genAI, this.defaultModelName);
    this.cacheService = new GeminiCacheService(this.genAI);
    this.gitDiffService = new GeminiGitDiffService(
      this.genAI,
      this.defaultModelName,
      1024 * 1024, // 1MB default
      [
        "package-lock.json",
        "yarn.lock",
        "*.min.js",
        "*.min.css",
        "node_modules/**",
        "dist/**",
        "build/**",
        "*.lock",
        "**/*.map",
      ],
      config.defaultThinkingBudget
    );

    const githubApiToken = this.configManager.getGitHubApiToken();
    this.gitHubApiService = new GitHubApiService(githubApiToken);
  }

  public async *generateContentStream(
    params: GenerateContentParams & {
      preferQuality?: boolean;
      preferSpeed?: boolean;
      preferCost?: boolean;
      complexityHint?: "simple" | "medium" | "complex";
      taskType?: ModelSelectionCriteria["taskType"];
    }
  ): AsyncGenerator<string> {
    const selectedModel = await this.selectModelForGeneration(params);
    yield* this.contentService.generateContentStream({
      ...params,
      modelName: selectedModel,
    });
  }

  public async generateContent(
    params: GenerateContentParams & {
      preferQuality?: boolean;
      preferSpeed?: boolean;
      preferCost?: boolean;
      complexityHint?: "simple" | "medium" | "complex";
      taskType?: ModelSelectionCriteria["taskType"];
    }
  ): Promise<string> {
    const selectedModel = await this.selectModelForGeneration(params);
    const result = await this.contentService.generateContent({
      ...params,
      modelName: selectedModel,
    });

    return result;
  }

  /**
   * Starts a new stateful chat session with the Gemini model.
   *
   * @param params Parameters for starting a chat session
   * @returns A unique session ID to identify this chat session
   */
  public startChatSession(params: StartChatParams = {}): string {
    return this.chatService.startChatSession(params);
  }

  /**
   * Sends a message to an existing chat session.
   * Uses the generated content API directly since we're managing chat state ourselves.
   *
   * @param params Parameters for sending a message
   * @returns Promise resolving to the chat response
   */
  public async sendMessageToSession(
    params: SendMessageParams
  ): Promise<GenerateContentResponse> {
    return this.chatService.sendMessageToSession(params);
  }

  /**
   * Sends the result of a function call back to the chat session.
   *
   * @param params Parameters for sending a function result
   * @returns Promise resolving to the chat response
   */
  public async sendFunctionResultToSession(
    params: SendFunctionResultParams
  ): Promise<GenerateContentResponse> {
    return this.chatService.sendFunctionResultToSession(params);
  }

  /**
   * Creates a cached content entry in the Gemini API.
   *
   * @param modelName The model to use for this cached content
   * @param contents The conversation contents to cache
   * @param options Additional options for the cache (displayName, systemInstruction, ttl, tools, toolConfig)
   * @returns Promise resolving to the cached content metadata
   */
  public async createCache(
    modelName: string,
    contents: Content[],
    options?: {
      displayName?: string;
      systemInstruction?: Content | string;
      ttl?: string;
      tools?: Tool[];
      toolConfig?: ToolConfig;
    }
  ): Promise<CachedContentMetadata> {
    return this.cacheService.createCache(modelName, contents, options);
  }

  /**
   * Lists cached content entries in the Gemini API.
   *
   * @param pageSize Optional maximum number of entries to return
   * @param pageToken Optional token for pagination
   * @returns Promise resolving to an object with caches array and optional nextPageToken
   */
  public async listCaches(
    pageSize?: number,
    pageToken?: string
  ): Promise<{ caches: CachedContentMetadata[]; nextPageToken?: string }> {
    return this.cacheService.listCaches(pageSize, pageToken);
  }

  /**
   * Gets a specific cached content entry's metadata from the Gemini API.
   *
   * @param cacheId The ID of the cached content to retrieve (format: "cachedContents/{id}")
   * @returns Promise resolving to the cached content metadata
   */
  public async getCache(cacheId: CacheId): Promise<CachedContentMetadata> {
    return this.cacheService.getCache(cacheId);
  }

  /**
   * Updates a cached content entry in the Gemini API.
   *
   * @param cacheId The ID of the cached content to update (format: "cachedContents/{id}")
   * @param updates The updates to apply to the cached content (ttl, displayName)
   * @returns Promise resolving to the updated cached content metadata
   */
  public async updateCache(
    cacheId: CacheId,
    updates: { ttl?: string; displayName?: string }
  ): Promise<CachedContentMetadata> {
    return this.cacheService.updateCache(cacheId, updates);
  }

  /**
   * Deletes a cached content entry from the Gemini API.
   *
   * @param cacheId The ID of the cached content to delete (format: "cachedContents/{id}")
   * @returns Promise resolving to an object with success flag
   */
  public async deleteCache(cacheId: CacheId): Promise<{ success: boolean }> {
    return this.cacheService.deleteCache(cacheId);
  }

  /**
   * Routes a message to the most appropriate model based on a routing prompt.
   * This is useful when you have multiple specialized models and want to automatically
   * select the best one for the specific query type.
   *
   * @param params Parameters for routing a message across models
   * @returns Promise resolving to an object with the chat response and the chosen model
   * @throws {GeminiApiError} If routing fails or all models are unavailable
   */
  public async routeMessage(
    params: RouteMessageParams
  ): Promise<{ response: GenerateContentResponse; chosenModel: string }> {
    return this.chatService.routeMessage(params);
  }

  /**
   * Reviews a git diff and generates analysis using Gemini models
   *
   * @param params Parameters for the git diff review
   * @returns Promise resolving to the review text
   */
  public async reviewGitDiff(params: GitDiffReviewParams): Promise<string> {
    return this.gitDiffService.reviewDiff(params);
  }

  /**
   * Streams a git diff review content using Gemini models
   *
   * @param params Parameters for the git diff review
   * @returns AsyncGenerator yielding review content chunks as they become available
   */
  public async *reviewGitDiffStream(
    params: GitDiffReviewParams
  ): AsyncGenerator<string> {
    yield* this.gitDiffService.reviewDiffStream(params);
  }

  /**
   * Reviews a GitHub repository and generates analysis using Gemini models.
   *
   * IMPORTANT: This method uses a special approach to analyze repository contents by
   * creating a diff against an empty tree. While effective for getting an overview of
   * the repository, be aware of these limitations:
   *
   * 1. Token Usage: This approach consumes a significant number of tokens, especially
   *    for large repositories, as it treats the entire repository as one large diff.
   *
   * 2. Performance Impact: For very large repositories, this may result in slow
   *    response times and potential timeout errors.
   *
   * 3. Cost Considerations: The token consumption directly impacts API costs.
   *    Consider using the maxFilesToInclude and excludePatterns options to limit scope.
   *
   * 4. Scale Issues: Repositories with many files or large files may exceed context
   *    limits of the model, resulting in incomplete analysis.
   *
   * For large repositories, consider reviewing specific directories or files instead,
   * or focusing on a particular branch or PR.
   *
   * @param params Parameters for the GitHub repository review
   * @returns Promise resolving to the review text
   */
  public async reviewGitHubRepository(params: {
    owner: string;
    repo: string;
    branch?: string;
    modelName?: string;
    reasoningEffort?: "none" | "low" | "medium" | "high";
    reviewFocus?:
      | "security"
      | "performance"
      | "architecture"
      | "bugs"
      | "general";
    maxFilesToInclude?: number;
    excludePatterns?: string[];
    prioritizeFiles?: string[];
    customPrompt?: string;
  }): Promise<string> {
    try {
      const {
        owner,
        repo,
        branch,
        modelName,
        reasoningEffort = "medium",
        reviewFocus = "general",
        maxFilesToInclude = 50,
        excludePatterns = [],
        prioritizeFiles,
        customPrompt,
      } = params;

      // Get repository overview using GitHub API
      const repoOverview = await this.gitHubApiService.getRepositoryOverview(
        owner,
        repo
      );

      // Get default branch if not specified
      const targetBranch = branch || repoOverview.defaultBranch;

      // Create repository context for Gemini prompt
      const repositoryContext = `Repository: ${owner}/${repo}
Primary Language: ${repoOverview.language}
Languages: ${repoOverview.languages.map((l) => `${l.name} (${l.percentage}%)`).join(", ")}
Description: ${repoOverview.description || "No description"}
Default Branch: ${repoOverview.defaultBranch}
Target Branch: ${targetBranch}
Stars: ${repoOverview.stars}
Forks: ${repoOverview.forks}`;

      // Get content from repository files that match our criteria
      // For now, we'll use a git diff approach by getting a comparison diff
      // between the empty state and the target branch
      const diff = await this.gitHubApiService.getComparisonDiff(
        owner,
        repo,
        // Use a known empty reference as the base
        "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
        targetBranch
      );

      // Use the git diff service to analyze the repository content
      return this.gitDiffService.reviewDiff({
        diffContent: diff,
        modelName,
        reviewFocus,
        repositoryContext,
        diffOptions: {
          maxFilesToInclude,
          excludePatterns,
          prioritizeFiles,
        },
        reasoningEffort,
        customPrompt,
      });
    } catch (error: unknown) {
      logger.error("Error reviewing GitHub repository:", error);
      throw error;
    }
  }

  /**
   * Reviews a GitHub Pull Request and generates analysis using Gemini models
   *
   * @param params Parameters for the GitHub PR review
   * @returns Promise resolving to the review text
   */
  public async reviewGitHubPullRequest(params: {
    owner: string;
    repo: string;
    prNumber: number;
    modelName?: string;
    reasoningEffort?: "none" | "low" | "medium" | "high";
    reviewFocus?:
      | "security"
      | "performance"
      | "architecture"
      | "bugs"
      | "general";
    excludePatterns?: string[];
    customPrompt?: string;
  }): Promise<string> {
    try {
      const {
        owner,
        repo,
        prNumber,
        modelName,
        reasoningEffort = "medium",
        reviewFocus = "general",
        excludePatterns = [],
        customPrompt,
      } = params;

      // Get PR details using GitHub API
      const pullRequest = await this.gitHubApiService.getPullRequest(
        owner,
        repo,
        prNumber
      );

      // Create repository context for Gemini prompt
      const repositoryContext = `Repository: ${owner}/${repo}
Pull Request: #${prNumber} - ${pullRequest.title}
Author: ${pullRequest.user.login}
Base Branch: ${pullRequest.base.ref}
Head Branch: ${pullRequest.head.ref}
Files Changed: ${pullRequest.changed_files}
Additions: ${pullRequest.additions}
Deletions: ${pullRequest.deletions}
Description: ${pullRequest.body || "No description"}`;

      // Get PR diff using GitHub API
      const diff = await this.gitHubApiService.getPullRequestDiff(
        owner,
        repo,
        prNumber
      );

      // Use the git diff service to analyze the PR
      return this.gitDiffService.reviewDiff({
        diffContent: diff,
        modelName,
        reviewFocus,
        repositoryContext,
        diffOptions: {
          excludePatterns,
        },
        reasoningEffort,
        customPrompt,
      });
    } catch (error: unknown) {
      logger.error("Error reviewing GitHub Pull Request:", error);
      throw error;
    }
  }

  /**
   * Generates images from text prompts using Google's image generation models
   * Supports both Gemini and Imagen models for image generation
   *
   * @param prompt - The text prompt describing the desired image
   * @param modelName - Optional model name (defaults to optimal model selection)
   * @param resolution - Optional image resolution (512x512, 1024x1024, 1536x1536)
   * @param numberOfImages - Optional number of images to generate (1-8)
   * @param safetySettings - Optional safety settings for content filtering
   * @param negativePrompt - Optional text describing what to avoid in the image
   * @param stylePreset - Optional visual style to apply
   * @param seed - Optional seed for reproducible generation
   * @param styleStrength - Optional strength of style preset (0.0-1.0)
   * @param preferQuality - Optional preference for quality over speed
   * @param preferSpeed - Optional preference for speed over quality
   * @returns Promise resolving to image generation result with base64 data
   * @throws {GeminiValidationError} If parameters are invalid
   * @throws {GeminiContentFilterError} If content is blocked by safety filters
   * @throws {GeminiQuotaError} If API quota is exceeded
   * @throws {GeminiModelError} If the model encounters issues generating the image
   * @throws {GeminiNetworkError} If a network error occurs
   * @throws {GeminiApiError} For any other errors
   */
  public async generateImage(
    prompt: string,
    modelName?: string,
    resolution?: "512x512" | "1024x1024" | "1536x1536",
    numberOfImages?: number,
    safetySettings?: SafetySetting[],
    negativePrompt?: string,
    stylePreset?: string,
    seed?: number,
    styleStrength?: number,
    preferQuality?: boolean,
    preferSpeed?: boolean
  ): Promise<ImageGenerationResult> {
    // Log with truncated prompt for privacy/security
    logger.debug(`Generating image with prompt: ${prompt.substring(0, 30)}...`);

    try {
      // Import validation schemas and error handling
      const { validateImageGenerationParams, DEFAULT_SAFETY_SETTINGS } =
        await import("./gemini/GeminiValidationSchemas.js");
      const {
        GeminiContentFilterError,
        GeminiModelError,
        GeminiErrorMessages,
      } = await import("../utils/geminiErrors.js");

      // Validate parameters using Zod schemas
      const validatedParams = validateImageGenerationParams(
        prompt,
        modelName,
        resolution,
        numberOfImages,
        safetySettings,
        negativePrompt,
        stylePreset,
        seed,
        styleStrength
      );

      const effectiveModel =
        validatedParams.modelName ||
        (await this.modelSelector.selectOptimalModel({
          taskType: "image-generation",
          preferQuality,
          preferSpeed,
          fallbackModel: "imagen-3.0-generate-002",
        }));

      // Get the model from the SDK
      const model = this.genAI.getGenerativeModel({
        model: effectiveModel,
      });

      // Build generation config based on validated parameters
      const generationConfig: {
        numberOfImages: number;
        width?: number;
        height?: number;
        negativePrompt?: string;
        stylePreset?: string;
        seed?: number;
        styleStrength?: number;
      } = {
        numberOfImages: validatedParams.numberOfImages,
      };

      if (validatedParams.resolution) {
        const [width, height] = validatedParams.resolution
          .split("x")
          .map((dim) => parseInt(dim, 10));
        generationConfig.width = width;
        generationConfig.height = height;
      }

      if (validatedParams.negativePrompt) {
        generationConfig.negativePrompt = validatedParams.negativePrompt;
      }

      if (validatedParams.stylePreset) {
        generationConfig.stylePreset = validatedParams.stylePreset;
      }

      if (validatedParams.seed !== undefined) {
        generationConfig.seed = validatedParams.seed;
      }

      if (validatedParams.styleStrength !== undefined) {
        generationConfig.styleStrength = validatedParams.styleStrength;
      }

      // Apply default safety settings if none provided
      const effectiveSafetySettings =
        validatedParams.safetySettings ||
        (DEFAULT_SAFETY_SETTINGS as SafetySetting[]);

      // Generate the images using the correct generateImages API
      const result = await model.generateImages({
        prompt: validatedParams.prompt,
        safetySettings: effectiveSafetySettings as SafetySetting[],
        ...generationConfig,
      });

      // Check for safety blocks first (higher priority than empty results)
      if (result.promptSafetyMetadata?.blocked) {
        const safetyRatings = result.promptSafetyMetadata.safetyRatings || [];
        throw new GeminiContentFilterError(
          GeminiErrorMessages.CONTENT_FILTERED,
          safetyRatings.map((rating) => rating.category)
        );
      }

      // Check if images were generated successfully
      if (!result.images || result.images.length === 0) {
        throw new GeminiModelError(
          "No images were generated by the model",
          "image_generation"
        );
      }

      // Parse resolution for width/height
      const [width, height] = (validatedParams.resolution || "1024x1024")
        .split("x")
        .map((dim) => parseInt(dim, 10));

      // Format the images according to our expected structure
      const formattedImages = result.images.map((image) => ({
        base64Data: image.data || "",
        mimeType: image.mimeType || "image/png",
        width,
        height,
      }));

      const formattedResult: ImageGenerationResult = {
        images: formattedImages,
      };

      // Validate the generated images
      await this.validateGeneratedImages(formattedResult);

      return formattedResult;
    } catch (error: unknown) {
      const { mapGeminiError } = await import("../utils/geminiErrors.js");
      // Map to appropriate error type
      throw mapGeminiError(error, "generateImage");
    }
  }

  /**
   * Validates generated images to ensure they meet quality and safety standards
   * @param result - The image generation result to validate
   * @throws {GeminiValidationError} If validation fails
   */
  private async validateGeneratedImages(
    result: ImageGenerationResult
  ): Promise<void> {
    // Import validation error from utils
    const { GeminiValidationError } = await import("../utils/geminiErrors.js");

    // Check that each image has proper data
    for (const [index, image] of result.images.entries()) {
      // Verify base64 data is present and valid
      if (!image.base64Data || image.base64Data.length < 100) {
        throw new GeminiValidationError(
          `Image ${index} has invalid or missing data`,
          "base64Data"
        );
      }

      // Verify MIME type is supported
      const supportedMimeTypes = ["image/png", "image/jpeg", "image/webp"];
      if (!supportedMimeTypes.includes(image.mimeType)) {
        throw new GeminiValidationError(
          `Image ${index} has unsupported MIME type: ${image.mimeType}`,
          "mimeType"
        );
      }

      // Verify dimensions are positive numbers
      if (image.width <= 0 || image.height <= 0) {
        throw new GeminiValidationError(
          `Image ${index} has invalid dimensions: ${image.width}x${image.height}`,
          "dimensions"
        );
      }
    }
  }

  private async selectModelForGeneration(params: {
    modelName?: string;
    preferQuality?: boolean;
    preferSpeed?: boolean;
    preferCost?: boolean;
    complexityHint?: "simple" | "medium" | "complex";
    taskType?: ModelSelectionCriteria["taskType"];
    prompt?: string;
  }): Promise<string> {
    if (params.modelName) {
      return params.modelName;
    }

    const complexity =
      params.complexityHint ||
      this.analyzePromptComplexity(params.prompt || "");

    return this.modelSelector.selectOptimalModel({
      taskType: params.taskType || "text-generation",
      complexityLevel: complexity,
      preferQuality: params.preferQuality,
      preferSpeed: params.preferSpeed,
      preferCost: params.preferCost,
      fallbackModel:
        this.defaultModelName ||
        this.configManager.getModelConfiguration().default,
    });
  }

  private analyzePromptComplexity(
    prompt: string
  ): "simple" | "medium" | "complex" {
    const complexKeywords = [
      "analyze",
      "compare",
      "evaluate",
      "synthesize",
      "reasoning",
      "complex",
      "detailed analysis",
      "comprehensive",
      "explain why",
      "what are the implications",
      "trade-offs",
      "pros and cons",
      "algorithm",
      "architecture",
      "design pattern",
    ];

    const codeKeywords = [
      "function",
      "class",
      "import",
      "export",
      "const",
      "let",
      "var",
      "if",
      "else",
      "for",
      "while",
      "return",
      "async",
      "await",
    ];

    const wordCount = prompt.split(/\s+/).length;
    const hasComplexKeywords = complexKeywords.some((keyword) =>
      prompt.toLowerCase().includes(keyword.toLowerCase())
    );
    const hasCodeKeywords = codeKeywords.some((keyword) =>
      prompt.toLowerCase().includes(keyword.toLowerCase())
    );

    if (hasComplexKeywords || hasCodeKeywords || wordCount > 100) {
      return "complex";
    } else if (wordCount > 20) {
      return "medium";
    } else {
      return "simple";
    }
  }

  public getModelSelector(): ModelSelectionService {
    return this.modelSelector;
  }

  public async getOptimalModelForTask(
    criteria: ModelSelectionCriteria
  ): Promise<string> {
    return this.modelSelector.selectOptimalModel(criteria);
  }

  public isModelAvailable(modelName: string): boolean {
    return this.modelSelector.isModelAvailable(modelName);
  }

  public getAvailableModels(): string[] {
    return this.modelSelector.getAvailableModels();
  }

  public validateModelForTask(
    modelName: string,
    taskType: ModelSelectionCriteria["taskType"]
  ): boolean {
    return this.modelSelector.validateModelForTask(modelName, taskType);
  }

  // Model selection history and performance metrics methods removed
  // These were not implemented in ModelSelectionService
}

// Define interfaces directly to avoid circular dependencies
export interface GenerateContentParams {
  prompt: string;
  modelName?: string;
  generationConfig?: GenerationConfig;
  safetySettings?: SafetySetting[];
  systemInstruction?: Content | string;
  cachedContentName?: string;
  urlContext?: {
    urls: string[];
    fetchOptions?: {
      maxContentKb?: number;
      timeoutMs?: number;
      includeMetadata?: boolean;
      convertToMarkdown?: boolean;
      allowedDomains?: string[];
      userAgent?: string;
    };
  };
  preferQuality?: boolean;
  preferSpeed?: boolean;
  preferCost?: boolean;
  complexityHint?: "simple" | "medium" | "complex";
  taskType?: ModelSelectionCriteria["taskType"];
  urlCount?: number;
  estimatedUrlContentSize?: number;
}

export interface StartChatParams {
  modelName?: string;
  history?: Content[];
  generationConfig?: GenerationConfig;
  safetySettings?: SafetySetting[];
  tools?: Tool[];
  systemInstruction?: Content | string;
  cachedContentName?: string;
}

export interface SendMessageParams {
  sessionId: string;
  message: string;
  generationConfig?: GenerationConfig;
  safetySettings?: SafetySetting[];
  tools?: Tool[];
  toolConfig?: ToolConfig;
  cachedContentName?: string;
}

export interface SendFunctionResultParams {
  sessionId: string;
  functionResponse: string;
  functionCall?: FunctionCall;
}

/**
 * Interface for the routing parameters when sending messages to multiple models
 */
export interface RouteMessageParams {
  message: string;
  models: string[];
  routingPrompt?: string;
  defaultModel?: string;
  generationConfig?: GenerationConfig;
  safetySettings?: SafetySetting[];
  systemInstruction?: Content | string;
}

// Re-export other types for backwards compatibility
export type {
  Content,
  Tool,
  ToolConfig,
  GenerationConfig,
  SafetySetting,
  Part,
  FunctionCall,
  CacheId,
} from "./gemini/GeminiTypes.js";
