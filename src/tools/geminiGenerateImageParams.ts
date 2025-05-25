import { z } from "zod";
import {
  ModelNameSchema,
  ModelPreferencesSchema,
} from "./schemas/CommonSchemas.js";

export const TOOL_NAME_GENERATE_IMAGE = "gemini_generate_image";

// Tool Description
export const TOOL_DESCRIPTION_GENERATE_IMAGE = `
Generates images from text prompts using advanced AI models like Imagen 3.1 and Gemini.
This tool takes a text prompt and optional parameters to control the image generation process.
Returns one or more generated images as base64-encoded data with appropriate MIME types.
Supports configurable resolutions, image counts, content safety settings, and style options.
`;

// Zod Schema for image resolution
export const imageResolutionSchema = z
  .enum(["512x512", "1024x1024", "1536x1536"])
  .describe("The desired resolution of generated images.");

// Style presets available for image generation
export const stylePresetSchema = z
  .enum([
    "photographic",
    "digital-art",
    "cinematic",
    "anime",
    "3d-render",
    "oil-painting",
    "watercolor",
    "pixel-art",
    "sketch",
    "comic-book",
    "neon",
    "fantasy",
  ])
  .describe("Style preset to apply to the generated image.");

// Reuse existing safety settings schema from validation schemas
import { SafetySettingSchema } from "../services/gemini/GeminiValidationSchemas.js";

// Main parameters schema
export const GEMINI_GENERATE_IMAGE_PARAMS = z.object({
  modelName: ModelNameSchema,
  prompt: z
    .string()
    .min(1)
    .max(1000)
    .describe(
      "Required. The text prompt describing the desired image for the model to generate."
    ),
  resolution: imageResolutionSchema
    .optional()
    .describe(
      "Optional. The desired resolution of the generated image(s). Defaults to '1024x1024' if not specified."
    ),
  numberOfImages: z
    .number()
    .int()
    .min(1)
    .max(8)
    .optional()
    .describe(
      "Optional. Number of images to generate (1-8). Defaults to 1 if not specified."
    ),
  safetySettings: z
    .array(SafetySettingSchema)
    .optional()
    .describe(
      "Optional. A list of safety settings to apply, overriding default model safety settings. Each setting specifies a harm category and a blocking threshold."
    ),
  negativePrompt: z
    .string()
    .max(1000)
    .optional()
    .describe(
      "Optional. Text description of features to avoid in the generated image(s)."
    ),
  stylePreset: stylePresetSchema
    .optional()
    .describe(
      "Optional. Visual style to apply to the generated image (e.g., 'photographic', 'anime')."
    ),
  seed: z
    .number()
    .int()
    .optional()
    .describe(
      "Optional. Seed value for reproducible generation. Use the same seed to get similar results."
    ),
  styleStrength: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe(
      "Optional. The strength of the style preset (0.0-1.0). Higher values apply more style. Defaults to 0.5."
    ),
  modelPreferences: ModelPreferencesSchema,
});

// Type for parameter object using zod inference
export type GeminiGenerateImageArgs = z.infer<
  typeof GEMINI_GENERATE_IMAGE_PARAMS
>;
