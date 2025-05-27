import { z } from "zod";
import {
  ModelNameSchema,
  ModelPreferencesSchema,
  FunctionDeclarationSchema,
} from "./schemas/CommonSchemas.js";

// Tool Name
export const GEMINI_GENERATE_CONTENT_TOOL_NAME = "gemini_generate_content";

// Tool Description
export const GEMINI_GENERATE_CONTENT_TOOL_DESCRIPTION = `
Generates text content using a specified Google Gemini model with support for both streaming and non-streaming modes.
This tool can handle standard text generation, streaming generation, and function calling.
When stream is true, content is generated using the streaming API (though due to SDK limitations, 
the full response is still returned at once). When functionDeclarations are provided, 
the model can request execution of predefined functions.
Optional parameters allow control over generation (temperature, max tokens, etc.), safety settings,
system instructions, cached content, and URL context.
`;

// Zod Schema for thinking configuration
export const thinkingConfigSchema = z
  .object({
    thinkingBudget: z
      .number()
      .int()
      .min(0)
      .max(24576)
      .optional()
      .describe(
        "Controls the amount of reasoning the model performs. Range: 0-24576. Lower values provide faster responses, higher values improve complex reasoning."
      ),
    reasoningEffort: z
      .enum(["none", "low", "medium", "high"])
      .optional()
      .describe(
        "Simplified control over model reasoning. Options: none (0 tokens), low (1K tokens), medium (8K tokens), high (24K tokens)."
      ),
  })
  .optional()
  .describe("Optional configuration for controlling model reasoning.");

// Zod Schema for Parameters
// Optional parameters based on Google's GenerationConfig and SafetySetting interfaces
export const generationConfigSchema = z
  .object({
    // EXPORTED
    temperature: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe(
        "Controls randomness. Lower values (~0.2) make output more deterministic, higher values (~0.8) make it more creative. Default varies by model."
      ),
    topP: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe(
        "Nucleus sampling parameter. The model considers only tokens with probability mass summing to this value. Default varies by model."
      ),
    topK: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        "Top-k sampling parameter. The model considers the k most probable tokens. Default varies by model."
      ),
    maxOutputTokens: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Maximum number of tokens to generate in the response."),
    stopSequences: z
      .array(z.string())
      .optional()
      .describe("Sequences where the API will stop generating further tokens."),
    thinkingConfig: thinkingConfigSchema,
  })
  .optional()
  .describe("Optional configuration for controlling the generation process.");

// Based on HarmCategory and HarmBlockThreshold enums/types in @google/genai
// Using string literals as enums are discouraged by .clinerules
export const harmCategorySchema = z
  .enum([
    // EXPORTED
    "HARM_CATEGORY_UNSPECIFIED",
    "HARM_CATEGORY_HATE_SPEECH",
    "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    "HARM_CATEGORY_HARASSMENT",
    "HARM_CATEGORY_DANGEROUS_CONTENT",
  ])
  .describe("Category of harmful content to apply safety settings for.");

export const harmBlockThresholdSchema = z
  .enum([
    // EXPORTED
    "HARM_BLOCK_THRESHOLD_UNSPECIFIED",
    "BLOCK_LOW_AND_ABOVE",
    "BLOCK_MEDIUM_AND_ABOVE",
    "BLOCK_ONLY_HIGH",
    "BLOCK_NONE",
  ])
  .describe(
    "Threshold for blocking harmful content. Higher thresholds block more content."
  );

export const safetySettingSchema = z
  .object({
    // EXPORTED
    category: harmCategorySchema,
    threshold: harmBlockThresholdSchema,
  })
  .describe(
    "Setting for controlling content safety for a specific harm category."
  );

// URL Context Schema for fetching and including web content in prompts
export const urlContextSchema = z
  .object({
    urls: z
      .array(z.string().url())
      .min(1)
      .max(20)
      .describe("URLs to fetch and include as context (max 20)"),
    fetchOptions: z
      .object({
        maxContentKb: z
          .number()
          .min(1)
          .max(1000)
          .default(100)
          .optional()
          .describe("Maximum content size per URL in KB"),
        timeoutMs: z
          .number()
          .min(1000)
          .max(30000)
          .default(10000)
          .optional()
          .describe("Fetch timeout per URL in milliseconds"),
        includeMetadata: z
          .boolean()
          .default(true)
          .optional()
          .describe("Include URL metadata in context"),
        convertToMarkdown: z
          .boolean()
          .default(true)
          .optional()
          .describe("Convert HTML content to markdown"),
        allowedDomains: z
          .array(z.string())
          .optional()
          .describe("Specific domains to allow for this request"),
        userAgent: z
          .string()
          .optional()
          .describe("Custom User-Agent header for URL requests"),
      })
      .optional()
      .describe("Configuration options for URL fetching"),
  })
  .optional()
  .describe(
    "Optional URL context to fetch and include web content in the prompt"
  );

// Use centralized function declaration schema from CommonSchemas

// Zod Schema for Tool Configuration (mirroring SDK ToolConfig)
// Using string literals for FunctionCallingConfigMode as enums are discouraged
const functionCallingConfigModeSchema = z
  .enum(["AUTO", "ANY", "NONE"])
  .describe(
    "Controls the function calling mode. AUTO (default): Model decides. ANY: Forces a function call. NONE: Disables function calling."
  );

const functionCallingConfigSchema = z
  .object({
    mode: functionCallingConfigModeSchema
      .optional()
      .describe("The function calling mode."),
    allowedFunctionNames: z
      .array(z.string())
      .optional()
      .describe(
        "Optional list of function names allowed to be called. If specified, the model will only call functions from this list."
      ),
  })
  .optional()
  .describe("Configuration specific to function calling.");

const toolConfigSchema = z
  .object({
    functionCallingConfig: functionCallingConfigSchema,
  })
  .optional()
  .describe("Optional configuration for tools, specifically function calling.");

export const GEMINI_GENERATE_CONTENT_PARAMS = {
  modelName: ModelNameSchema,
  prompt: z
    .string()
    .min(1)
    .describe(
      "Required. The text prompt to send to the Gemini model for content generation."
    ),
  stream: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Optional. Whether to use streaming generation. Note: Due to SDK limitations, the full response is still returned at once."
    ),
  functionDeclarations: z
    .array(FunctionDeclarationSchema)
    .optional()
    .describe(
      "Optional. An array of function declarations (schemas) that the model can choose to call based on the prompt."
    ),
  toolConfig: toolConfigSchema,
  generationConfig: generationConfigSchema,
  safetySettings: z
    .array(safetySettingSchema)
    .optional()
    .describe(
      "Optional. A list of safety settings to apply, overriding default model safety settings. Each setting specifies a harm category and a blocking threshold."
    ),
  systemInstruction: z
    .string()
    .optional()
    .describe(
      "Optional. A system instruction to guide the model's behavior. Acts as context for how the model should respond."
    ),
  cachedContentName: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Optional. Identifier for cached content in format 'cachedContents/...' to use with this request."
    ),
  urlContext: urlContextSchema,
  modelPreferences: ModelPreferencesSchema,
};

// Define the complete schema for validation
export const geminiGenerateContentSchema = z.object(
  GEMINI_GENERATE_CONTENT_PARAMS
);
