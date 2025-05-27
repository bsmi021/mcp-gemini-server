/**
 * Common Schemas
 *
 * This file contains shared schema definitions used across multiple tools.
 * Centralize all reusable schema components here to avoid duplication.
 */
import { z } from "zod";

// --- Safety Settings ---

/**
 * Categories of harmful content
 */
export const HarmCategorySchema = z
  .enum([
    "HARM_CATEGORY_UNSPECIFIED",
    "HARM_CATEGORY_HATE_SPEECH",
    "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    "HARM_CATEGORY_HARASSMENT",
    "HARM_CATEGORY_DANGEROUS_CONTENT",
  ])
  .describe("Category of harmful content to apply safety settings for.");

/**
 * Thresholds for blocking harmful content
 */
export const HarmBlockThresholdSchema = z
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

/**
 * Safety setting for controlling content safety
 */
export const SafetySettingSchema = z
  .object({
    category: HarmCategorySchema,
    threshold: HarmBlockThresholdSchema,
  })
  .describe(
    "Setting for controlling content safety for a specific harm category."
  );

// --- Generation Configuration ---

/**
 * Configuration for controlling model reasoning
 */
export const ThinkingConfigSchema = z
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

/**
 * Base generation configuration object (without optional wrapper)
 */
const BaseGenerationConfigSchema = z.object({
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
});

/**
 * Configuration for controlling text generation
 */
export const GenerationConfigSchema =
  BaseGenerationConfigSchema.optional().describe(
    "Optional configuration for controlling the generation process."
  );

// --- Function Calling Schemas ---

/**
 * Supported parameter types for function declarations
 */
export const FunctionParameterTypeSchema = z
  .enum(["OBJECT", "STRING", "NUMBER", "BOOLEAN", "ARRAY", "INTEGER"])
  .describe("The data type of the function parameter.");

/**
 * Base function parameter schema without recursive elements
 */
// const BaseFunctionParameterSchema = z.object({
//   type: FunctionParameterTypeSchema,
//   description: z
//     .string()
//     .optional()
//     .describe("Description of the parameter's purpose."),
//   enum: z
//     .array(z.string())
//     .optional()
//     .describe("Allowed string values for an ENUM-like parameter."),
// });

/**
 * Inferred type for function parameter structure
 */
export type FunctionParameter = {
  type: "OBJECT" | "STRING" | "NUMBER" | "BOOLEAN" | "ARRAY" | "INTEGER";
  description?: string;
  enum?: string[];
  properties?: Record<string, FunctionParameter>;
  required?: string[];
  items?: FunctionParameter;
};

/**
 * Function parameter schema (supports recursive definitions)
 * Uses z.lazy() for proper recursive handling while maintaining type safety
 */
export const FunctionParameterSchema: z.ZodSchema<FunctionParameter> = z
  .lazy(() =>
    z.object({
      type: FunctionParameterTypeSchema,
      description: z
        .string()
        .optional()
        .describe("Description of the parameter's purpose."),
      enum: z
        .array(z.string())
        .optional()
        .describe("Allowed string values for an ENUM-like parameter."),
      properties: z.record(FunctionParameterSchema).optional(),
      required: z
        .array(z.string())
        .optional()
        .describe("List of required property names for OBJECT types."),
      items: FunctionParameterSchema.optional().describe(
        "Defines the schema for items if the parameter type is ARRAY."
      ),
    })
  )
  .describe(
    "Schema defining a single parameter for a function declaration, potentially recursive."
  ) as z.ZodSchema<FunctionParameter>;

/**
 * Type assertion to ensure schema produces correct types
 */
export type InferredFunctionParameter = z.infer<typeof FunctionParameterSchema>;

/**
 * Schema for parameter properties in function declarations
 */
export const FunctionParameterPropertiesSchema = z
  .record(FunctionParameterSchema)
  .describe("Defines nested properties if the parameter type is OBJECT.");

/**
 * Schema for a complete function declaration
 */
export const FunctionDeclarationSchema = z
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
        properties: FunctionParameterPropertiesSchema.describe(
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

/**
 * Schema for tool configuration in function calling
 */
export const ToolConfigSchema = z
  .object({
    functionCallingConfig: z
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
      .optional(),
  })
  .describe("Configuration for how tools should be used.");

// --- File Operation Schemas ---

/**
 * Common schema for file paths
 */
export const FilePathSchema = z
  .string()
  .min(1, "File path cannot be empty.")
  .describe("The path to the file. Must be within allowed directories.");

/**
 * Schema for file overwrite parameter
 */
export const FileOverwriteSchema = z
  .boolean()
  .optional()
  .default(false)
  .describe(
    "Optional. If true, will overwrite the file if it already exists. Defaults to false."
  );

/**
 * Common encoding options
 */
export const EncodingSchema = z
  .enum(["utf8", "base64"])
  .optional()
  .default("utf8")
  .describe("Encoding of the content. Defaults to utf8.");

// --- Other Common Schemas ---

export const ModelNameSchema = z
  .string()
  .min(1)
  .optional()
  .describe(
    "Optional. The name of the Gemini model to use. If omitted, the server will intelligently select the optimal model."
  );

export const ModelPreferencesSchema = z
  .object({
    preferQuality: z
      .boolean()
      .optional()
      .describe("Prefer high-quality models for better results"),
    preferSpeed: z
      .boolean()
      .optional()
      .describe("Prefer fast models for quicker responses"),
    preferCost: z
      .boolean()
      .optional()
      .describe("Prefer cost-effective models to minimize usage costs"),
    complexityHint: z
      .enum(["simple", "medium", "complex"])
      .optional()
      .describe(
        "Hint about the complexity of the task to help with model selection"
      ),
    taskType: z
      .enum([
        "text-generation",
        "image-generation",
        "code-review",
        "multimodal",
        "reasoning",
      ])
      .optional()
      .describe("Type of task to optimize model selection for"),
  })
  .optional()
  .describe("Optional preferences for intelligent model selection");

export const PromptSchema = z
  .string()
  .min(1)
  .describe("Required. The text prompt to send to the Gemini model.");

export const EnhancedGenerationConfigSchema = BaseGenerationConfigSchema.extend(
  {
    modelPreferences: ModelPreferencesSchema,
  }
)
  .optional()
  .describe(
    "Extended generation configuration with model selection preferences"
  );

export const ModelValidationSchema = z
  .object({
    modelName: ModelNameSchema,
    taskType: z
      .enum([
        "text-generation",
        "image-generation",
        "code-review",
        "multimodal",
        "reasoning",
      ])
      .optional(),
  })
  .describe("Validation schema for model and task compatibility");
