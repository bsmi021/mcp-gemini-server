/**
 * Tool Schemas Index
 *
 * This barrel file exports all standardized schema definitions
 * for tools, providing a central access point.
 */

// Base schema pattern
export * from "./BaseToolSchema.js";

// Common shared schema definitions
export * from "./CommonSchemas.js";

// Tool-specific schemas
export * from "./ToolSchemas.js";

// Note: Example tool params removed as per refactoring

// Re-export other schemas with namespacing to avoid export conflicts
import * as GeminiGenerateContentConsolidatedParamsModule from "../geminiGenerateContentConsolidatedParams.js";
export { GeminiGenerateContentConsolidatedParamsModule };

import * as GeminiChatParamsModule from "../geminiChatParams.js";
export { GeminiChatParamsModule };

import * as GeminiRemoteFilesParamsModule from "../geminiRemoteFilesParams.js";
export { GeminiRemoteFilesParamsModule };

import * as GeminiCacheParamsModule from "../geminiCacheParams.js";
export { GeminiCacheParamsModule };

import * as GeminiAnalyzeMediaParamsModule from "../geminiAnalyzeMediaParams.js";
export { GeminiAnalyzeMediaParamsModule };

import * as GeminiCodeReviewParamsModule from "../geminiCodeReviewParams.js";
export { GeminiCodeReviewParamsModule };

import * as McpClientParamsModule from "../mcpClientParams.js";
export { McpClientParamsModule };

import * as WriteToFileParamsModule from "./writeToFileParams.js";
export { WriteToFileParamsModule };

// Add exports for other tool parameter schemas as they are added
// export * from "./yourNewToolParams.js";
