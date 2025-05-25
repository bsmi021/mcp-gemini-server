import { z } from "zod";

/**
 * Type definitions specific to the GeminiService.
 */

export interface ModelCapabilities {
  textGeneration: boolean;
  imageInput: boolean;
  videoInput: boolean;
  audioInput: boolean;
  imageGeneration: boolean;
  videoGeneration: boolean;
  codeExecution: "none" | "basic" | "good" | "excellent";
  complexReasoning: "none" | "basic" | "good" | "excellent";
  costTier: "low" | "medium" | "high";
  speedTier: "fast" | "medium" | "slow";
  maxTokens: number;
  contextWindow: number;
  supportsFunctionCalling: boolean;
  supportsSystemInstructions: boolean;
  supportsCaching: boolean;
}

export type ModelCapabilitiesMap = Record<string, ModelCapabilities>;

export interface ModelConfiguration {
  default: string;
  textGeneration: string[];
  imageGeneration: string[];
  videoGeneration: string[];
  codeReview: string[];
  complexReasoning: string[];
  capabilities: ModelCapabilitiesMap;
  routing: {
    preferCostEffective: boolean;
    preferSpeed: boolean;
    preferQuality: boolean;
  };
}

export interface ModelSelectionCriteria {
  taskType:
    | "text-generation"
    | "image-generation"
    | "video-generation"
    | "code-review"
    | "multimodal"
    | "reasoning";
  complexityLevel?: "simple" | "medium" | "complex";
  preferCost?: boolean;
  preferSpeed?: boolean;
  preferQuality?: boolean;
  requiredCapabilities?: (keyof ModelCapabilities)[];
  fallbackModel?: string;
  urlCount?: number;
  estimatedUrlContentSize?: number;
}

export interface ModelScore {
  model: string;
  score: number;
  capabilities: ModelCapabilities;
}

export interface ModelSelectionHistory {
  timestamp: Date;
  criteria: ModelSelectionCriteria;
  selectedModel: string;
  candidateModels: string[];
  scores: ModelScore[];
  selectionTime: number;
}

export interface ModelPerformanceMetrics {
  totalCalls: number;
  avgLatency: number;
  successRate: number;
  lastUpdated: Date;
}

/**
 * Configuration interface for the GeminiService.
 * Contains API key, model settings, and image processing configurations.
 */
export interface GeminiServiceConfig {
  apiKey: string;
  defaultModel?: string;
  defaultImageResolution?: "512x512" | "1024x1024" | "1536x1536";
  maxImageSizeMB: number;
  supportedImageFormats: string[];
  defaultThinkingBudget?: number;
  modelConfiguration?: ModelConfiguration;
}

/**
 * Represents the metadata of cached content managed by the Gemini API.
 * Based on the structure returned by the @google/genai SDK's Caching API.
 */
export interface CachedContentMetadata {
  name: string; // e.g., "cachedContents/abc123xyz"
  displayName?: string;
  model?: string; // Model name this cache is tied to
  createTime: string; // ISO 8601 format string
  updateTime: string; // ISO 8601 format string
  expirationTime?: string; // ISO 8601 format string (renamed from expireTime)
  state?: string; // State of the cached content (e.g., "ACTIVE")
  usageMetadata?: {
    totalTokenCount?: number;
  };
}

const BlobSchema = z
  .object({
    mimeType: z.string(),
    data: z.string(),
  })
  .strict();

const FunctionCallSchema = z
  .object({
    name: z.string(),
    args: z.record(z.unknown()),
    id: z.string().optional(),
  })
  .strict();

const FunctionResponseSchema = z
  .object({
    name: z.string(),
    response: z.record(z.unknown()),
    id: z.string().optional(),
  })
  .strict();

// Define the main Part schema using discriminated union if possible, or optional fields
// Using optional fields as discriminated union with zod can be tricky with multiple optional fields
export const PartSchema = z
  .object({
    text: z.string().optional(),
    inlineData: BlobSchema.optional(),
    functionCall: FunctionCallSchema.optional(),
    functionResponse: FunctionResponseSchema.optional(),
    // Add other part types like executableCode, codeExecutionResult, videoMetadata if needed later
  })
  .strict()
  .refine(
    // Ensure exactly one field is set (or none, though SDK might require one)
    // This validation might be complex depending on exact SDK requirements
    (part) => {
      const setFields = Object.values(part).filter(
        (v) => v !== undefined
      ).length;
      return setFields === 1; // Adjust if zero fields are allowed or more complex validation needed
    },
    {
      message:
        "Exactly one field must be set in a Part object (text, inlineData, functionCall, or functionResponse).",
    }
  );

// Define the Content schema
export const ContentSchema = z
  .object({
    parts: z.array(PartSchema).min(1), // Must have at least one part
    role: z.enum(["user", "model", "function", "tool"]).optional(), // Role is optional for some contexts
  })
  .strict();

/**
 * Interface for results returned by image generation.
 * Includes the generated images in base64 format with metadata.
 */
export interface ImageGenerationResult {
  images: Array<{
    base64Data: string;
    mimeType: string;
    width: number;
    height: number;
  }>;
  promptSafetyMetadata?: {
    blocked: boolean;
    reasons?: string[];
    safetyRatings?: Array<{
      category: string;
      severity:
        | "SEVERITY_UNSPECIFIED"
        | "HARM_CATEGORY_DEROGATORY"
        | "HARM_CATEGORY_TOXICITY"
        | "HARM_CATEGORY_VIOLENCE"
        | "HARM_CATEGORY_SEXUAL"
        | "HARM_CATEGORY_MEDICAL"
        | "HARM_CATEGORY_DANGEROUS"
        | "HARM_CATEGORY_HARASSMENT"
        | "HARM_CATEGORY_HATE_SPEECH"
        | "HARM_CATEGORY_SEXUALLY_EXPLICIT"
        | "HARM_CATEGORY_DANGEROUS_CONTENT";
      probability:
        | "PROBABILITY_UNSPECIFIED"
        | "NEGLIGIBLE"
        | "LOW"
        | "MEDIUM"
        | "HIGH"
        | "VERY_HIGH";
    }>;
  };
  /**
   * Additional metadata specific to the image generation process,
   * such as model-specific parameters or generation statistics.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Interface for results returned by object detection.
 * Includes detected objects with normalized bounding box coordinates and confidence scores.
 */
export interface ObjectDetectionResult {
  objects: Array<{
    label: string;
    boundingBox: {
      yMin: number;
      xMin: number;
      yMax: number;
      xMax: number;
    };
    confidence?: number;
  }>;
  promptSafetyMetadata?: {
    blocked: boolean;
    reasons?: string[];
  };
  rawText?: string;
}

/**
 * Interface for results returned by content understanding.
 * Includes extracted information from charts, diagrams, and other visual content.
 */
export interface ContentUnderstandingResult {
  analysis: {
    text?: string;
    data?: {
      [key: string]: string | number | boolean | object | null;
    };
  };
  promptSafetyMetadata?: {
    blocked: boolean;
    reasons?: string[];
  };
  rawText?: string;
}
