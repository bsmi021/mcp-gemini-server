import type {
  GenerationConfig,
  SafetySetting,
  Content,
  Part,
  Tool,
  ToolConfig,
  FunctionCall,
} from "@google/genai";

// Import ThinkingConfig and ExtendedGenerationConfig from our types
import type { ThinkingConfig } from "../../types/googleGenAITypes.js";

// Re-export types from Google GenAI SDK and our custom types
// Note: We're re-exporting the ExtendedGenerationConfig as GenerationConfig
// to ensure consistent usage across the codebase
export type {
  GenerationConfig as BaseGenerationConfig,
  SafetySetting,
  Content,
  Part,
  Tool,
  ToolConfig,
  FunctionCall,
  ThinkingConfig,
};

// Re-export our extended GenerationConfig as the default GenerationConfig
export type { GenerationConfig } from "../../types/googleGenAITypes.js";

// Extend GenerationConfig to include thinkingBudget property
declare module "@google/genai" {
  interface GenerationConfig {
    thinkingBudget?: number;
  }
}

// Type-safe resource IDs
export type CacheId = `cachedContents/${string}`;

/**
 * Interface for image data input used across image-related operations
 */
export interface ImagePart {
  /** The type of image input (base64 or URL) */
  type: "base64" | "url";

  /** The image data - either a base64-encoded string or a valid URL */
  data: string;

  /** The MIME type of the image (must be one of: 'image/jpeg', 'image/png', 'image/webp') */
  mimeType: string;
}

// Export the ChatSession interface for use across services
export interface ChatSession {
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
