import { GeminiService } from "../services/index.js";
import { logger } from "../utils/index.js";
import {
  TOOL_NAME_GENERATE_IMAGE,
  TOOL_DESCRIPTION_GENERATE_IMAGE,
  GEMINI_GENERATE_IMAGE_PARAMS,
  GeminiGenerateImageArgs,
} from "./geminiGenerateImageParams.js";
import { mapAnyErrorToMcpError } from "../utils/errors.js";
import type { NewGeminiServiceToolObject } from "./registration/ToolAdapter.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { HarmCategory, HarmBlockThreshold } from "@google/genai";

/**
 * Handles Gemini image generation operations.
 * Generates images from text prompts using Google's image generation models.
 */
export const geminiGenerateImageTool: NewGeminiServiceToolObject<
  GeminiGenerateImageArgs,
  CallToolResult
> = {
  name: TOOL_NAME_GENERATE_IMAGE,
  description: TOOL_DESCRIPTION_GENERATE_IMAGE,
  inputSchema: GEMINI_GENERATE_IMAGE_PARAMS,
  execute: async (args: GeminiGenerateImageArgs, service: GeminiService) => {
    logger.debug(`Received ${TOOL_NAME_GENERATE_IMAGE} request:`, {
      model: args.modelName,
      resolution: args.resolution,
      numberOfImages: args.numberOfImages,
    }); // Avoid logging full prompt for privacy/security

    try {
      // Extract arguments and call the service
      const {
        modelName,
        prompt,
        resolution,
        numberOfImages,
        safetySettings,
        negativePrompt,
        stylePreset,
        seed,
        styleStrength,
        modelPreferences,
      } = args;

      // Convert safety settings from schema to SDK types if provided
      const convertedSafetySettings = safetySettings?.map((setting) => ({
        category: setting.category as HarmCategory,
        threshold: setting.threshold as HarmBlockThreshold,
      }));

      const result = await service.generateImage(
        prompt,
        modelName,
        resolution,
        numberOfImages,
        convertedSafetySettings,
        negativePrompt,
        stylePreset,
        seed,
        styleStrength,
        modelPreferences?.preferQuality,
        modelPreferences?.preferSpeed
      );

      // Check if images were generated
      if (!result.images || result.images.length === 0) {
        throw new Error("No images were generated");
      }

      // Format success output for MCP - provide both JSON and direct image formats
      // This allows clients to choose the most appropriate format for their needs
      return {
        content: [
          // Include a text description of the generated images
          {
            type: "text" as const,
            text: `Generated ${result.images.length} ${resolution || "1024x1024"} image(s) from prompt.`,
          },
          // Include the generated images as image content types
          ...result.images.map((img) => ({
            type: "image" as const,
            mimeType: img.mimeType,
            data: img.base64Data,
          })),
        ],
      };
    } catch (error: unknown) {
      logger.error(`Error processing ${TOOL_NAME_GENERATE_IMAGE}:`, error);

      // Use the centralized error mapping utility to ensure consistent error handling
      throw mapAnyErrorToMcpError(error, TOOL_NAME_GENERATE_IMAGE);
    }
  },
};
