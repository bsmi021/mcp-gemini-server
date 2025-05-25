/**
 * Test fixtures and mock data for MCP Gemini Server tests
 *
 * This file provides commonly used test data, mock objects, and sample responses
 * to be reused across different test files.
 */

import path from "node:path";
import fs from "node:fs/promises";

// Common test data
export const TEST_DATA = {
  // Sample prompts for content generation tests
  PROMPTS: {
    SIMPLE: "Tell me about artificial intelligence",
    CODE: "Write a JavaScript function to reverse a string",
    UNSAFE: "Generate harmful content that violates policies",
  },

  // Sample model names
  MODELS: {
    PRO: "gemini-1.5-pro",
    FLASH: "gemini-1.5-flash",
    GEMINI_2: "gemini-2.5-pro-preview-05-06",
    UNSUPPORTED: "gemini-unsupported-model",
  },

  // Sample system instructions
  SYSTEM_INSTRUCTIONS: {
    DEFAULT: "You are a helpful AI assistant.",
    SPECIFIC:
      "You are an expert on climate science. Provide detailed, accurate information.",
  },

  // Sample chat messages
  CHAT_MESSAGES: [
    { role: "user", parts: [{ text: "Hello" }] },
    { role: "model", parts: [{ text: "Hi there! How can I help you today?" }] },
    { role: "user", parts: [{ text: "Tell me about TypeScript" }] },
  ],

  // Sample image prompts
  IMAGE_PROMPTS: {
    LANDSCAPE: "A beautiful mountain landscape with a lake at sunset",
    CITYSCAPE: "A futuristic cityscape with flying cars and neon lights",
    UNSAFE: "Graphic violence scene with weapons",
  },

  // Sample function declarations
  FUNCTION_DECLARATIONS: [
    {
      name: "get_weather",
      description: "Get the current weather in a given location",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "The city and state, e.g. San Francisco, CA",
          },
          unit: {
            type: "string",
            enum: ["celsius", "fahrenheit"],
            description: "The unit of temperature",
          },
        },
        required: ["location"],
      },
    },
  ],
};

/**
 * Gets the absolute path to a test resource file
 *
 * @param relativePath - Path relative to the test resources directory
 * @returns Absolute path to the resource file
 */
export function getTestResourcePath(relativePath: string): string {
  return path.resolve(process.cwd(), "tests", "resources", relativePath);
}

/**
 * Load a sample image file as a base64 string
 *
 * @param imageName - Name of the image file in the resources directory
 * @returns Promise resolving to base64-encoded image data
 */
export async function loadSampleImage(imageName: string): Promise<string> {
  const imagePath = getTestResourcePath(`images/${imageName}`);
  const fileData = await fs.readFile(imagePath);
  return fileData.toString("base64");
}

/**
 * Create a resources directory and ensure sample test files are available
 *
 * @returns Promise resolving when resources are ready
 */
export async function ensureTestResources(): Promise<void> {
  const resourcesDir = path.resolve(process.cwd(), "tests", "resources");
  const imagesDir = path.join(resourcesDir, "images");
  const audioDir = path.join(resourcesDir, "audio");

  // Create directories if they don't exist
  await fs.mkdir(resourcesDir, { recursive: true });
  await fs.mkdir(imagesDir, { recursive: true });
  await fs.mkdir(audioDir, { recursive: true });

  // TODO: Add sample test files when needed
  // This function can be extended to download or create sample files for testing
}

/**
 * Mock HTTP client for testing without making real API calls
 */
export const mockHttpClient = {
  // Mock successful content generation response
  successfulContentResponse: {
    data: {
      candidates: [
        {
          content: {
            parts: [{ text: "This is a mock response from the Gemini API." }],
            role: "model",
          },
          finishReason: "STOP",
          index: 0,
          safetyRatings: [],
        },
      ],
      promptFeedback: {
        safetyRatings: [],
      },
    },
    status: 200,
  },

  // Mock error response for safety blocks
  safetyBlockedResponse: {
    data: {
      error: {
        code: 400,
        message: "Content blocked due to safety settings",
        status: "INVALID_ARGUMENT",
      },
      promptFeedback: {
        blockReason: "SAFETY",
        safetyRatings: [
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            probability: "HIGH",
          },
        ],
      },
    },
    status: 400,
  },

  // Mock authentication error response
  authErrorResponse: {
    data: {
      error: {
        code: 401,
        message: "Invalid API key",
        status: "UNAUTHENTICATED",
      },
    },
    status: 401,
  },
};

/**
 * Sample image generation responses for testing
 */
export const mockImageResponses = {
  // Mock successful image generation response
  successfulImageGeneration: {
    data: {
      images: [
        {
          base64Data: "/9j/4AAQSkZJRgABAQAAAQABAAD...",
          mimeType: "image/jpeg",
          width: 1024,
          height: 1024,
        },
      ],
    },
    status: 200,
  },

  // Mock object detection response
  objectDetectionResponse: {
    objects: [
      {
        label: "dog",
        boundingBox: {
          xMin: 100,
          yMin: 200,
          xMax: 300,
          yMax: 400,
        },
        confidence: 0.98,
      },
      {
        label: "cat",
        boundingBox: {
          xMin: 500,
          yMin: 300,
          xMax: 700,
          yMax: 450,
        },
        confidence: 0.95,
      },
    ],
  },
};
