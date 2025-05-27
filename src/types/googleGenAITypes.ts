// Import types directly from the SDK
import type {
  GenerateContentResponse,
  GenerationConfig as GoogleGenerationConfig,
  SafetySetting,
  Content,
  Tool,
  ToolConfig,
} from "@google/genai";

// Define ThinkingConfig interface for controlling model reasoning
interface ThinkingConfig {
  thinkingBudget?: number;
  reasoningEffort?: "none" | "low" | "medium" | "high";
}

// Override the imported GenerationConfig with our extended version
interface GenerationConfig extends GoogleGenerationConfig {
  thinkingConfig?: ThinkingConfig;
  thinkingBudget?: number;
}

// Define ExtendedGenerationConfig (alias for our GenerationConfig)
type ExtendedGenerationConfig = GenerationConfig;

// Types for params that match the SDK v0.10.0 structure
interface ChatSessionParams {
  history?: Content[];
  generationConfig?: GenerationConfig;
  safetySettings?: SafetySetting[];
  tools?: Tool[];
  thinkingConfig?: ThinkingConfig;
  systemInstruction?: Content;
  cachedContent?: string;
}

interface CachedContentParams {
  contents: Content[];
  displayName?: string;
  systemInstruction?: Content;
  ttl?: string;
  tools?: Tool[];
  toolConfig?: ToolConfig;
}

// Metadata returned by cached content operations
interface CachedContentMetadata {
  name: string;
  displayName?: string;
  model?: string;
  createTime: string;
  updateTime: string;
  expirationTime?: string;
  state?: string;
  usageMetadata?: {
    totalTokenCount?: number;
  };
}

// Enums for response types - matching SDK v0.10.0
enum FinishReason {
  FINISH_REASON_UNSPECIFIED = "FINISH_REASON_UNSPECIFIED",
  STOP = "STOP",
  MAX_TOKENS = "MAX_TOKENS",
  SAFETY = "SAFETY",
  RECITATION = "RECITATION",
  OTHER = "OTHER",
}

enum BlockedReason {
  BLOCKED_REASON_UNSPECIFIED = "BLOCKED_REASON_UNSPECIFIED",
  SAFETY = "SAFETY",
  OTHER = "OTHER",
}

// Define our own LocalFunctionCall interface to avoid conflict with imported FunctionCall
interface LocalFunctionCall {
  name: string;
  args?: Record<string, unknown>;
}

// Response type interfaces
interface PromptFeedback {
  blockReason?: BlockedReason;
  safetyRatings?: Array<{
    category: string;
    probability: string;
    blocked: boolean;
  }>;
}

interface Candidate {
  content?: Content;
  finishReason?: FinishReason;
  safetyRatings?: Array<{
    category: string;
    probability: string;
    blocked: boolean;
  }>;
  index?: number;
}

// Interface for the chat session with our updated implementation
interface ChatSession {
  model: string;
  config: {
    history?: Content[];
    generationConfig?: GenerationConfig;
    safetySettings?: SafetySetting[];
    tools?: Tool[];
    systemInstruction?: Content;
    cachedContent?: string;
    thinkingConfig?: ThinkingConfig;
  };
  history: Content[];
}

// These are already defined above, so we don't need to redefine them
// Using the existing PromptFeedback and Candidate interfaces

interface GenerateContentResult {
  response: {
    text(): string;
    promptFeedback?: PromptFeedback;
    candidates?: Candidate[];
  };
}

interface GenerateContentResponseChunk {
  text(): string;
  candidates?: Candidate[];
}

// Re-export all types for use in other files
export type {
  ChatSessionParams,
  CachedContentParams,
  CachedContentMetadata,
  GenerateContentResult,
  GenerateContentResponseChunk,
  PromptFeedback,
  Candidate,
  LocalFunctionCall as FunctionCall,
  ChatSession,
  GenerateContentResponse,
  ThinkingConfig,
  GenerationConfig,
  ExtendedGenerationConfig,
  GoogleGenerationConfig,
};
export { FinishReason, BlockedReason };
