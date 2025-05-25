import { z } from "zod";
import {
  ModelNameSchema,
  ModelPreferencesSchema,
} from "./schemas/CommonSchemas.js";

// Tool Name
export const GEMINI_CHAT_TOOL_NAME = "gemini_chat";

// Tool Description
export const GEMINI_CHAT_TOOL_DESCRIPTION = `
Manages stateful chat sessions with Google Gemini models. This consolidated tool supports three operations:
- start: Initiates a new chat session with optional history and configuration
- send_message: Sends a text message to an existing chat session
- send_function_result: Sends function execution results back to a chat session
Each operation returns appropriate responses including session IDs, model responses, or function call requests.
`;

// Operation enum for chat actions
export const chatOperationSchema = z
  .enum(["start", "send_message", "send_function_result"])
  .describe("The chat operation to perform");

// Zod Schema for thinking configuration (reused from content generation)
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

// Generation config schema
export const generationConfigSchema = z
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
    thinkingConfig: thinkingConfigSchema,
  })
  .optional()
  .describe("Optional configuration for controlling the generation process.");

// Safety setting schemas
export const harmCategorySchema = z
  .enum([
    "HARM_CATEGORY_UNSPECIFIED",
    "HARM_CATEGORY_HATE_SPEECH",
    "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    "HARM_CATEGORY_HARASSMENT",
    "HARM_CATEGORY_DANGEROUS_CONTENT",
  ])
  .describe("Category of harmful content to apply safety settings for.");

export const harmBlockThresholdSchema = z
  .enum([
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
    category: harmCategorySchema,
    threshold: harmBlockThresholdSchema,
  })
  .describe(
    "Setting for controlling content safety for a specific harm category."
  );

// History schemas for chat initialization
const historyPartSchema = z
  .object({
    text: z.string().describe("Text content of the part."),
    // Note: Could add other part types like inlineData, functionCall, functionResponse later
  })
  .describe(
    "A part of a historical message, primarily text for initialization."
  );

const historyContentSchema = z
  .object({
    role: z
      .enum(["user", "model"])
      .describe(
        "The role of the entity that generated this content (user or model)."
      ),
    parts: z
      .array(historyPartSchema)
      .min(1)
      .describe("An array of Parts making up the message content."),
  })
  .describe("A single message turn in the conversation history.");

// Function declaration schemas (for tools)
const functionParameterTypeSchema = z
  .enum(["OBJECT", "STRING", "NUMBER", "BOOLEAN", "ARRAY", "INTEGER"])
  .describe("The data type of the function parameter.");

const baseFunctionParameterSchema = z.object({
  type: functionParameterTypeSchema,
  description: z
    .string()
    .optional()
    .describe("Description of the parameter's purpose."),
  enum: z
    .array(z.string())
    .optional()
    .describe("Allowed string values for an ENUM-like parameter."),
});

type FunctionParameterSchemaType = z.infer<
  typeof baseFunctionParameterSchema
> & {
  properties?: { [key: string]: FunctionParameterSchemaType };
  required?: string[];
  items?: FunctionParameterSchemaType;
};

const functionParameterSchema: z.ZodType<FunctionParameterSchemaType> =
  baseFunctionParameterSchema
    .extend({
      properties: z.lazy(() => z.record(functionParameterSchema).optional()),
      required: z.lazy(() =>
        z
          .array(z.string())
          .optional()
          .describe("List of required property names for OBJECT types.")
      ),
      items: z.lazy(() =>
        functionParameterSchema
          .optional()
          .describe(
            "Defines the schema for items if the parameter type is ARRAY."
          )
      ),
    })
    .describe(
      "Schema defining a single parameter for a function declaration, potentially recursive."
    );

const functionParameterPropertiesSchema = z
  .record(functionParameterSchema)
  .describe("Defines nested properties if the parameter type is OBJECT.");

export const functionDeclarationSchema = z
  .object({
    name: z.string().min(1).describe("The name of the function to be called."),
    description: z
      .string()
      .min(1)
      .describe("A description of what the function does."),
    parameters: z
      .object({
        type: z
          .literal("OBJECT")
          .describe("The top-level parameters structure must be an OBJECT."),
        properties: functionParameterPropertiesSchema.describe(
          "Defines the parameters the function accepts."
        ),
        required: z
          .array(z.string())
          .optional()
          .describe("List of required parameter names at the top level."),
      })
      .describe("Schema defining the parameters the function accepts."),
  })
  .describe(
    "Declaration of a single function that the Gemini model can request to call."
  );

// Tool schema for chat
const toolSchema = z
  .object({
    functionDeclarations: z
      .array(functionDeclarationSchema)
      .optional()
      .describe("List of function declarations for this tool."),
  })
  .describe("Represents a tool definition containing function declarations.");

// Tool config schema
const functionCallingConfigSchema = z
  .object({
    mode: z
      .enum(["AUTO", "ANY", "NONE"])
      .optional()
      .describe("The function calling mode."),
    allowedFunctionNames: z
      .array(z.string())
      .optional()
      .describe("Optional list of function names allowed."),
  })
  .optional();

const toolConfigSchema = z
  .object({
    functionCallingConfig: functionCallingConfigSchema,
  })
  .optional()
  .describe(
    "Optional. Per-request tool configuration, e.g., to force function calling mode."
  );

// Function response schema for send_function_result
const functionResponseInputSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .describe(
        "Required. The name of the function that was called by the model."
      ),
    response: z
      .record(z.unknown())
      .describe(
        "Required. The JSON object result returned by the function execution."
      ),
  })
  .describe(
    "Represents the result of a single function execution to be sent back to the model."
  );

// System instruction schema
const systemInstructionSchema = z
  .object({
    parts: z.array(
      z.object({
        text: z.string(),
      })
    ),
  })
  .optional()
  .describe(
    "Optional. A system instruction to guide the model's behavior for the entire session."
  );

// Main parameters schema with conditional fields based on operation
export const GEMINI_CHAT_PARAMS = {
  operation: chatOperationSchema,

  // Common fields used across operations
  sessionId: z
    .string()
    .uuid()
    .optional()
    .describe(
      "Required for 'send_message' and 'send_function_result'. The unique identifier of the chat session."
    ),

  // Fields for 'start' operation
  modelName: ModelNameSchema.optional().describe(
    "Optional for 'start'. The name of the Gemini model to use for this chat session. If omitted, uses server default."
  ),
  history: z
    .array(historyContentSchema)
    .optional()
    .describe(
      "Optional for 'start'. Initial conversation turns to seed the chat session. Must alternate between 'user' and 'model' roles."
    ),
  systemInstruction: systemInstructionSchema,

  // Fields for 'send_message' operation
  message: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Required for 'send_message'. The text message content to send to the model."
    ),

  // Fields for 'send_function_result' operation
  functionResponses: z
    .array(functionResponseInputSchema)
    .min(1)
    .optional()
    .describe(
      "Required for 'send_function_result'. Array containing the results of function calls executed by the client. Note: This array is JSON.stringify'd before being passed to the Gemini API."
    ),

  // Shared optional configuration fields
  tools: z
    .array(toolSchema)
    .optional()
    .describe(
      "Optional. Tools (function declarations) the model may use. For 'start', sets session-wide tools. For 'send_message', overrides session tools for this turn."
    ),
  toolConfig: toolConfigSchema,
  generationConfig: generationConfigSchema,
  safetySettings: z
    .array(safetySettingSchema)
    .optional()
    .describe(
      "Optional. Safety settings to apply. For 'start', sets session-wide settings. For other operations, overrides session settings for this turn."
    ),
  cachedContentName: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Optional. Identifier for cached content in format 'cachedContents/...' to use with this operation."
    ),
  modelPreferences: ModelPreferencesSchema.optional(),
};

// Type helper
export type GeminiChatArgs = z.infer<z.ZodObject<typeof GEMINI_CHAT_PARAMS>>;
