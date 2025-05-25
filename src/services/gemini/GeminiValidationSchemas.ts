import { z } from "zod";
import { SafetySetting } from "./GeminiTypes.js";
import { HarmCategory, HarmBlockThreshold } from "@google/genai";
import type { RouteMessageParams } from "../GeminiService.js";

/**
 * Validation schemas for Gemini API parameters
 * These schemas ensure type safety and provide runtime validation
 */

/**
 * Shared schemas used across multiple services
 */

/**
 * Harm categories for safety settings
 */
export const HarmCategorySchema = z.enum([
  "HARM_CATEGORY_HARASSMENT",
  "HARM_CATEGORY_HATE_SPEECH",
  "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  "HARM_CATEGORY_DANGEROUS_CONTENT",
]);

/**
 * Blocking thresholds for safety settings
 */
export const BlockThresholdSchema = z.enum([
  "BLOCK_NONE",
  "BLOCK_LOW_AND_ABOVE",
  "BLOCK_MEDIUM_AND_ABOVE",
  "BLOCK_HIGH_AND_ABOVE",
]);

/**
 * Safety setting schema for content filtering
 */
export const SafetySettingSchema = z.object({
  category: HarmCategorySchema,
  threshold: BlockThresholdSchema,
});

/**
 * Default safety settings to apply if none are provided
 */
export const DEFAULT_SAFETY_SETTINGS = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
] as SafetySetting[];

/**
 * Schema for thinking configuration to control model reasoning
 */
export const ThinkingConfigSchema = z
  .object({
    thinkingBudget: z.number().int().min(0).max(24576).optional(),
    reasoningEffort: z.enum(["none", "low", "medium", "high"]).optional(),
  })
  .optional();

/**
 * Generation configuration schema for text generation
 */
export const GenerationConfigSchema = z
  .object({
    temperature: z.number().min(0).max(1).optional(),
    topP: z.number().min(0).max(1).optional(),
    topK: z.number().int().min(1).optional(),
    maxOutputTokens: z.number().int().min(1).optional(),
    stopSequences: z.array(z.string()).optional(),
    thinkingConfig: ThinkingConfigSchema,
  })
  .optional();

/**
 * Image generation schemas
 */

/**
 * Valid image resolutions supported by Gemini image generation
 */
export const ImageResolutionSchema = z
  .enum(["512x512", "1024x1024", "1536x1536"])
  .default("1024x1024");

/**
 * Image generation parameters schema
 */
export const ImageGenerationParamsSchema = z.object({
  prompt: z.string().min(1).max(1000),
  modelName: z.string().min(1).optional(),
  resolution: ImageResolutionSchema.optional(),
  numberOfImages: z.number().int().min(1).max(8).default(1),
  safetySettings: z.array(SafetySettingSchema).optional(),
  negativePrompt: z.string().max(1000).optional(),
  stylePreset: z.string().optional(),
  seed: z.number().int().optional(),
  styleStrength: z.number().min(0).max(1).optional(),
});

/**
 * Type representing validated image generation parameters
 */
export type ValidatedImageGenerationParams = z.infer<
  typeof ImageGenerationParamsSchema
>;

/**
 * Style presets available for image generation
 */
export const STYLE_PRESETS = [
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
] as const;

/**
 * Content generation schemas
 */

/**
 * Schema for inline data used in content generation
 */
export const InlineDataSchema = z.object({
  data: z.string().min(1),
  mimeType: z.string().min(1),
});

/**
 * Schema for content parts
 */
export const PartSchema = z.object({
  text: z.string().optional(),
  inlineData: InlineDataSchema.optional(),
});

/**
 * Schema for content object used in requests
 */
export const ContentSchema = z.object({
  role: z.enum(["user", "model", "system"]).optional(),
  parts: z.array(PartSchema),
});

/**
 * Schema for validating GenerateContentParams
 */
export const GenerateContentParamsSchema = z.object({
  prompt: z.string().min(1),
  modelName: z.string().min(1).optional(),
  generationConfig: GenerationConfigSchema,
  safetySettings: z.array(SafetySettingSchema).optional(),
  systemInstruction: z.union([z.string(), ContentSchema]).optional(),
  cachedContentName: z.string().min(1).optional(),
  inlineData: z.string().optional(),
  inlineDataMimeType: z.string().optional(),
});

/**
 * Type representing validated content generation parameters
 */
export type ValidatedGenerateContentParams = z.infer<
  typeof GenerateContentParamsSchema
>;

/**
 * Schema for validating RouteMessageParams
 */
export const RouteMessageParamsSchema = z.object({
  message: z.string().min(1),
  models: z.array(z.string().min(1)).min(1),
  routingPrompt: z.string().min(1).optional(),
  defaultModel: z.string().min(1).optional(),
  generationConfig: GenerationConfigSchema.optional(),
  safetySettings: z.array(SafetySettingSchema).optional(),
  systemInstruction: z.union([z.string(), ContentSchema]).optional(),
});

/**
 * Type representing validated router parameters
 */
export type ValidatedRouteMessageParams = z.infer<
  typeof RouteMessageParamsSchema
>;

/**
 * Validation methods
 */

/**
 * Validates image generation parameters
 * @param params Raw parameters provided by the caller
 * @returns Validated parameters with defaults applied
 * @throws ZodError if validation fails
 */
export function validateImageGenerationParams(
  prompt: string,
  modelName?: string,
  resolution?: "512x512" | "1024x1024" | "1536x1536",
  numberOfImages?: number,
  safetySettings?: SafetySetting[],
  negativePrompt?: string,
  stylePreset?: string,
  seed?: number,
  styleStrength?: number
): ValidatedImageGenerationParams {
  return ImageGenerationParamsSchema.parse({
    prompt,
    modelName,
    resolution,
    numberOfImages,
    safetySettings,
    negativePrompt,
    stylePreset,
    seed,
    styleStrength,
  });
}

/**
 * Validates content generation parameters
 * @param params Raw parameters provided by the caller
 * @returns Validated parameters with defaults applied
 * @throws ZodError if validation fails
 */
export function validateGenerateContentParams(
  params: Record<string, unknown>
): ValidatedGenerateContentParams {
  return GenerateContentParamsSchema.parse(params);
}

/**
 * Validates router message parameters
 * @param params Raw parameters provided by the caller
 * @returns Validated parameters with defaults applied
 * @throws ZodError if validation fails
 */
export function validateRouteMessageParams(
  params: RouteMessageParams
): ValidatedRouteMessageParams {
  return RouteMessageParamsSchema.parse(params);
}
