import { z } from "zod";
import { ModelNameSchema } from "./schemas/CommonSchemas.js";
import { safetySettingSchema } from "./geminiGenerateContentConsolidatedParams.js";

export const TOOL_NAME_ANALYZE_MEDIA = "gemini_analyze_media";

// Tool Description
export const TOOL_DESCRIPTION_ANALYZE_MEDIA = `
Analyzes various media types using Gemini models. Supports object detection in images,
content understanding from images with custom prompts, and audio transcription.
The analysis type determines which operation to perform and which parameters are required.
Note: Images must be provided as base64-encoded data. Audio files larger than 20MB are not supported.
`;

// Analysis type enum
export const analysisTypeSchema = z
  .enum(["object_detection", "content_understanding", "audio_transcription"])
  .describe("The type of media analysis to perform");

// Image input schema (shared by object detection and content understanding)
export const ImageInputSchema = z
  .object({
    base64: z
      .string()
      .refine((val) => val.length <= 25 * 1024 * 1024, {
        message: "Base64 encoded image must not exceed 25MB",
      })
      .describe("Base64-encoded image data (required)."),
    url: z
      .string()
      .optional()
      .describe(
        "Deprecated: URL support has been removed. Use base64-encoded data instead."
      ),
    mimeType: z
      .enum([
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/heic",
        "image/heif",
      ])
      .describe("MIME type of the image (required)."),
  })
  .refine(
    (data) => {
      // Check if url is provided (deprecated)
      if (data.url) {
        throw new Error(
          "URL support has been deprecated. Please provide image data as base64-encoded string in the 'base64' field."
        );
      }
      // Check required fields
      if (!data.base64) {
        return false;
      }
      if (!data.mimeType) {
        return false;
      }
      return true;
    },
    {
      message: "Both 'base64' and 'mimeType' are required for image input.",
    }
  )
  .describe("Image input data. Must be provided as base64 encoded data.");

// Audio mime types
export const audioMimeTypeSchema = z
  .enum([
    "audio/wav",
    "audio/mp3",
    "audio/aiff",
    "audio/aac",
    "audio/ogg",
    "audio/flac",
  ])
  .describe("MIME type of the audio file.");

// Base parameters (common to all analysis types)
const baseParams = {
  analysisType: analysisTypeSchema,
  modelName: ModelNameSchema.optional().describe(
    "Optional. The Gemini model to use. Defaults based on analysis type."
  ),
};

// Object detection specific parameters
const objectDetectionParams = z.object({
  ...baseParams,
  analysisType: z.literal("object_detection"),
  image: ImageInputSchema,
  promptAddition: z
    .string()
    .optional()
    .describe(
      "Optional. Additional prompt text to add context for object detection (e.g., 'focus on vehicles')."
    ),
  outputFormat: z
    .enum(["json", "text"])
    .default("json")
    .describe(
      "Output format for object detection results. 'json' returns structured data, 'text' returns narrative description."
    ),
  safetySettings: z
    .array(safetySettingSchema)
    .optional()
    .describe("Optional. Safety settings to apply, overriding defaults."),
});

// Content understanding specific parameters
const contentUnderstandingParams = z.object({
  ...baseParams,
  analysisType: z.literal("content_understanding"),
  image: ImageInputSchema,
  prompt: z
    .string()
    .min(1)
    .describe(
      "Required. The prompt describing what to analyze or understand about the image."
    ),
  structuredOutput: z
    .boolean()
    .default(false)
    .describe(
      "Whether to return structured JSON output. If false, returns narrative text."
    ),
  safetySettings: z
    .array(safetySettingSchema)
    .optional()
    .describe("Optional. Safety settings to apply, overriding defaults."),
});

// Audio transcription specific parameters
const audioTranscriptionParams = z.object({
  ...baseParams,
  analysisType: z.literal("audio_transcription"),
  filePath: z
    .string()
    .describe(
      "Required. Path to the audio file to transcribe. Files must be smaller than 20MB."
    ),
  includeTimestamps: z
    .boolean()
    .default(false)
    .describe("Whether to include timestamps in the transcription output."),
  language: z
    .string()
    .optional()
    .describe(
      "Optional. The language of the audio content (e.g., 'en', 'es', 'fr'). Helps improve accuracy."
    ),
  prompt: z
    .string()
    .optional()
    .describe(
      "Optional. Additional context or instructions for the transcription."
    ),
  mimeType: audioMimeTypeSchema
    .optional()
    .describe(
      "Optional. MIME type of the audio file. Will be auto-detected if not provided."
    ),
});

// Combined schema using discriminated union
export const GEMINI_ANALYZE_MEDIA_PARAMS = z.discriminatedUnion(
  "analysisType",
  [objectDetectionParams, contentUnderstandingParams, audioTranscriptionParams]
);

// Type for parameter object using zod inference
export type GeminiAnalyzeMediaArgs = z.infer<
  typeof GEMINI_ANALYZE_MEDIA_PARAMS
>;

// Export for use in other modules
export const GeminiAnalyzeMediaParamsModule = {
  TOOL_NAME_ANALYZE_MEDIA,
  TOOL_DESCRIPTION_ANALYZE_MEDIA,
  GEMINI_ANALYZE_MEDIA_PARAMS,
};
