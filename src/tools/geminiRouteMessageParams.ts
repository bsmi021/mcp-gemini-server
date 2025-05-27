import { z } from "zod";

// --- Reusable Schemas ---

// Based on src/tools/geminiGenerateContentParams.ts
const SafetySettingSchema = z
  .object({
    category: z
      .enum([
        "HARM_CATEGORY_UNSPECIFIED",
        "HARM_CATEGORY_HATE_SPEECH",
        "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        "HARM_CATEGORY_HARASSMENT",
        "HARM_CATEGORY_DANGEROUS_CONTENT",
      ])
      .describe("Category of harmful content to apply safety settings for."),
    threshold: z
      .enum([
        "HARM_BLOCK_THRESHOLD_UNSPECIFIED",
        "BLOCK_LOW_AND_ABOVE",
        "BLOCK_MEDIUM_AND_ABOVE",
        "BLOCK_ONLY_HIGH",
        "BLOCK_NONE",
      ])
      .describe(
        "Threshold for blocking harmful content. Higher thresholds block more content."
      ),
  })
  .describe(
    "Setting for controlling content safety for a specific harm category."
  );

// Schema for thinking configuration
const ThinkingConfigSchema = z
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

// Based on src/tools/geminiGenerateContentParams.ts
const GenerationConfigSchema = z
  .object({
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
    thinkingConfig: ThinkingConfigSchema,
  })
  .describe("Optional configuration for controlling the generation process.");

// System instruction schema for Content object
const SystemInstructionSchema = z
  .object({
    parts: z.array(
      z.object({
        text: z.string(),
      })
    ),
  })
  .optional()
  .describe("Optional. A system instruction to guide the model's behavior.");

// --- Tool Definition ---

export const GEMINI_ROUTE_MESSAGE_TOOL_NAME = "gemini_route_message";

export const GEMINI_ROUTE_MESSAGE_TOOL_DESCRIPTION = `Routes a message to the most appropriate model from a provided list based on message content. Returns the model's response along with which model was selected.`;

export const GEMINI_ROUTE_MESSAGE_PARAMS = {
  message: z
    .string()
    .min(1)
    .describe(
      "Required. The text message to be routed to the most appropriate model."
    ),
  models: z
    .array(z.string().min(1))
    .min(1)
    .describe(
      "Required. Array of model names to consider for routing (e.g., ['gemini-1.5-flash', 'gemini-1.5-pro']). The first model in the list will be used for routing decisions."
    ),
  routingPrompt: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Optional. Custom prompt to use for routing decisions. If not provided, a default routing prompt will be used."
    ),
  defaultModel: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Optional. Model to fall back to if routing fails. If not provided and routing fails, an error will be thrown."
    ),
  generationConfig: GenerationConfigSchema.optional().describe(
    "Optional. Generation configuration settings to apply to the selected model's response."
  ),
  safetySettings: z
    .array(SafetySettingSchema)
    .optional()
    .describe(
      "Optional. Safety settings to apply to both routing and final response."
    ),
  systemInstruction: z
    .union([z.string(), SystemInstructionSchema])
    .optional()
    .describe(
      "Optional. A system instruction to guide the model's behavior after routing."
    ),
};

// Type helper for arguments
export type GeminiRouteMessageArgs = z.infer<
  z.ZodObject<typeof GEMINI_ROUTE_MESSAGE_PARAMS>
>;
