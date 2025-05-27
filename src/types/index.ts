// Export all types and interfaces from this barrel file
export * from "./exampleServiceTypes.js";
export * from "./geminiServiceTypes.js"; // Exports GeminiServiceConfig, CachedContentMetadata, PartSchema, ContentSchema
export * from "./serverTypes.js"; // Server state and service interface types

// Export type-safe schema types from tool schemas
export type {
  FunctionParameter,
  InferredFunctionParameter,
} from "../tools/schemas/CommonSchemas.js";

// Define common types used across services/tools if any
export interface CommonContext {
  sessionId?: string;
  userId?: string;
}

/**
 * Represents the input structure for a function response sent from the client to the server.
 * Used by the gemini_sendFunctionResult tool.
 */
export interface FunctionResponseInput {
  /** The name of the function that was called by the model. */
  name: string;
  /** The JSON object result returned by the function execution. */
  response: Record<string, unknown>;
}
