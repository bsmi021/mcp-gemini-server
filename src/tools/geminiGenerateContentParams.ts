import { z } from 'zod';

// Tool Name
export const GEMINI_GENERATE_CONTENT_TOOL_NAME = "gemini_generateContent";

// Tool Description
export const GEMINI_GENERATE_CONTENT_TOOL_DESCRIPTION = `
Generates non-streaming text content using a specified Google Gemini model.
This tool takes a text prompt and returns the complete generated response from the model.
It's suitable for single-turn generation tasks where the full response is needed at once.
Optional parameters allow control over generation (temperature, max tokens, etc.) and safety settings.
`;

// Zod Schema for Parameters
// Optional parameters based on Google's GenerationConfig and SafetySetting interfaces
export const generationConfigSchema = z.object({ // EXPORTED
    temperature: z.number().min(0).max(1).optional()
        .describe("Controls randomness. Lower values (~0.2) make output more deterministic, higher values (~0.8) make it more creative. Default varies by model."),
    topP: z.number().min(0).max(1).optional()
        .describe("Nucleus sampling parameter. The model considers only tokens with probability mass summing to this value. Default varies by model."),
    topK: z.number().int().min(1).optional()
        .describe("Top-k sampling parameter. The model considers the k most probable tokens. Default varies by model."),
    maxOutputTokens: z.number().int().min(1).optional()
        .describe("Maximum number of tokens to generate in the response."),
    stopSequences: z.array(z.string()).optional()
        .describe("Sequences where the API will stop generating further tokens.")
}).optional().describe("Optional configuration for controlling the generation process.");

// Based on HarmCategory and HarmBlockThreshold enums/types in @google/genai
// Using string literals as enums are discouraged by .clinerules
export const harmCategorySchema = z.enum([ // EXPORTED
    "HARM_CATEGORY_UNSPECIFIED",
    "HARM_CATEGORY_HATE_SPEECH",
    "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    "HARM_CATEGORY_HARASSMENT",
    "HARM_CATEGORY_DANGEROUS_CONTENT"
]).describe("Category of harmful content to apply safety settings for.");

export const harmBlockThresholdSchema = z.enum([ // EXPORTED
    "HARM_BLOCK_THRESHOLD_UNSPECIFIED",
    "BLOCK_LOW_AND_ABOVE",
    "BLOCK_MEDIUM_AND_ABOVE",
    "BLOCK_ONLY_HIGH",
    "BLOCK_NONE"
]).describe("Threshold for blocking harmful content. Higher thresholds block more content.");

export const safetySettingSchema = z.object({ // EXPORTED
    category: harmCategorySchema,
    threshold: harmBlockThresholdSchema
}).describe("Setting for controlling content safety for a specific harm category.");

export const GEMINI_GENERATE_CONTENT_PARAMS = {
    modelName: z.string().min(1).optional() // Make optional
        .describe("Optional. The name of the Gemini model to use (e.g., 'gemini-1.5-flash'). If omitted, the server's default model (from GOOGLE_GEMINI_MODEL env var) will be used."),
    prompt: z.string().min(1)
        .describe("Required. The text prompt to send to the Gemini model for content generation."),
    generationConfig: generationConfigSchema,
    safetySettings: z.array(safetySettingSchema).optional()
        .describe("Optional. A list of safety settings to apply, overriding default model safety settings. Each setting specifies a harm category and a blocking threshold.")
};

// Optional: Define a Zod schema for the entire input object if needed later
// export const geminiGenerateContentInputSchema = z.object(GEMINI_GENERATE_CONTENT_PARAMS);
