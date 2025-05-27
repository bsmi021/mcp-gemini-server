import { z } from "zod";

// Tool Name
export const GEMINI_CACHE_TOOL_NAME = "gemini_cache";

// Tool Description
export const GEMINI_CACHE_TOOL_DESCRIPTION = `
Manages cached content resources for use with the Gemini API. This consolidated tool supports five operations:
- create: Creates a new cached content resource for compatible models
- list: Lists cached content resources with pagination support
- get: Retrieves metadata for a specific cache
- update: Updates cache metadata (TTL and/or displayName)
- delete: Deletes a specific cache
NOTE: Caching is only supported for specific models (e.g., gemini-1.5-flash, gemini-1.5-pro).
`;

// Operation enum for cache actions
export const cacheOperationSchema = z
  .enum(["create", "list", "get", "update", "delete"])
  .describe("The cache operation to perform");

// Import necessary schemas from ToolSchemas and define inline schemas
const partSchema = z.object({
  text: z.string().optional(),
  inlineData: z
    .object({
      mimeType: z.string(),
      data: z.string(),
    })
    .optional(),
});

const contentSchema = z.object({
  role: z.enum(["user", "model", "system"]).optional(),
  parts: z.array(partSchema),
});

// Function declaration schema (simplified from geminiChatParams)
const functionParameterTypeSchema = z
  .enum(["OBJECT", "STRING", "NUMBER", "BOOLEAN", "ARRAY", "INTEGER"])
  .describe("The data type of the function parameter.");

const baseFunctionParameterSchema = z.object({
  type: functionParameterTypeSchema,
  description: z.string().optional(),
  enum: z.array(z.string()).optional(),
});

type FunctionParameterSchemaType = z.infer<
  typeof baseFunctionParameterSchema
> & {
  properties?: { [key: string]: FunctionParameterSchemaType };
  required?: string[];
  items?: FunctionParameterSchemaType;
};

const functionParameterSchema: z.ZodType<FunctionParameterSchemaType> =
  baseFunctionParameterSchema.extend({
    properties: z.lazy(() => z.record(functionParameterSchema).optional()),
    required: z.lazy(() => z.array(z.string()).optional()),
    items: z.lazy(() => functionParameterSchema.optional()),
  });

const functionDeclarationSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  parameters: z.object({
    type: z.literal("OBJECT"),
    properties: z.record(functionParameterSchema),
    required: z.array(z.string()).optional(),
  }),
});

const toolSchema = z.object({
  functionDeclarations: z.array(functionDeclarationSchema).optional(),
});

const toolConfigSchema = z
  .object({
    functionCallingConfig: z
      .object({
        mode: z.enum(["AUTO", "ANY", "NONE"]).optional(),
        allowedFunctionNames: z.array(z.string()).optional(),
      })
      .optional(),
  })
  .optional();

// Main parameters schema with conditional fields based on operation
export const GEMINI_CACHE_PARAMS = {
  operation: cacheOperationSchema,

  // Fields for 'create' operation
  model: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Optional for 'create'. The name/ID of the model compatible with caching (e.g., 'gemini-1.5-flash'). If omitted, uses server default."
    ),
  contents: z
    .array(contentSchema)
    .min(1)
    .optional()
    .describe(
      "Required for 'create'. The content to cache, matching the SDK's Content structure (an array of Parts)."
    ),
  displayName: z
    .string()
    .min(1)
    .max(100)
    .optional()
    .describe(
      "Optional for 'create' and 'update'. A human-readable name for the cache."
    ),
  systemInstruction: contentSchema
    .optional()
    .describe(
      "Optional for 'create'. System instructions to associate with the cache."
    ),
  ttl: z
    .string()
    .regex(
      /^\d+(\.\d+)?s$/,
      "TTL must be a duration string ending in 's' (e.g., '3600s', '7200.5s')"
    )
    .optional()
    .describe(
      "Optional for 'create' and 'update'. Time-to-live for the cache as a duration string (e.g., '3600s' for 1 hour). Max 48 hours."
    ),
  tools: z
    .array(toolSchema)
    .optional()
    .describe(
      "Optional for 'create'. A list of tools (e.g., function declarations) to associate with the cache."
    ),
  toolConfig: toolConfigSchema,

  // Fields for 'list' operation
  pageSize: z
    .number()
    .int()
    .positive()
    .max(1000)
    .optional()
    .describe(
      "Optional for 'list'. The maximum number of caches to return per page. Defaults to 100, max 1000."
    ),
  pageToken: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Optional for 'list'. A token received from a previous listCaches call to retrieve the next page."
    ),

  // Fields for 'get', 'update', and 'delete' operations
  cacheName: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Required for 'get', 'update', and 'delete'. The unique name/ID of the cache (e.g., 'cachedContents/abc123xyz')."
    ),
};

// Type helper
export type GeminiCacheArgs = z.infer<z.ZodObject<typeof GEMINI_CACHE_PARAMS>>;
