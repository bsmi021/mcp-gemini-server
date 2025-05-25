/**
 * Environment variable handling utilities for testing
 *
 * This module provides utilities for securely loading and managing environment
 * variables for testing, particularly API keys and other sensitive configuration.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "dotenv";
import "dotenv/config";

/**
 * Environment variables required for different types of tests
 */
export const REQUIRED_ENV_VARS = {
  // Basic API tests only need the API key
  BASIC: ["GOOGLE_GEMINI_API_KEY"],

  // File tests need the API key and a secure base directory
  FILE_TESTS: ["GOOGLE_GEMINI_API_KEY", "GEMINI_SAFE_FILE_BASE_DIR"],

  // Chat tests need the API key
  CHAT_TESTS: ["GOOGLE_GEMINI_API_KEY"],

  // Image tests need the API key and optionally image configs
  IMAGE_TESTS: ["GOOGLE_GEMINI_API_KEY"],

  // Router tests need the API key and at least two models to test routing between
  ROUTER_TESTS: ["GOOGLE_GEMINI_API_KEY", "GOOGLE_GEMINI_MODEL"],

  // All test types in a single array for convenience
  ALL: [
    "GOOGLE_GEMINI_API_KEY",
    "GOOGLE_GEMINI_MODEL",
    "GEMINI_SAFE_FILE_BASE_DIR",
    "GOOGLE_GEMINI_IMAGE_RESOLUTION",
    "GOOGLE_GEMINI_MAX_IMAGE_SIZE_MB",
    "GOOGLE_GEMINI_SUPPORTED_IMAGE_FORMATS",
  ],
};

/**
 * Load environment variables from a .env.test file if available
 *
 * @returns Promise that resolves when environment is loaded
 */
export async function loadTestEnv(): Promise<void> {
  // Check for .env.test file in project root
  const envPath = resolve(process.cwd(), ".env.test");

  if (existsSync(envPath)) {
    try {
      // Read and parse the .env.test file
      const envContents = await readFile(envPath, "utf8");
      const envConfig = parse(envContents);

      // Apply the variables to the current environment, but don't overwrite
      // existing variables (which allows for command-line overrides)
      for (const [key, value] of Object.entries(envConfig)) {
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }

      console.log(`Loaded test environment variables from ${envPath}`);
    } catch (error) {
      console.warn(
        `Failed to load .env.test file: ${(error as Error).message}`
      );
    }
  } else {
    console.warn(
      ".env.test file not found, using existing environment variables"
    );
  }
}

/**
 * Create a .env.test.example file with placeholders for required variables
 *
 * @returns Promise that resolves when the file is created
 */
export async function createEnvExample(): Promise<void> {
  // Define the example content
  const exampleContent = `# Test environment configuration
# Copy this file to .env.test and fill in your API keys and other settings

# Required: Google Gemini API key from Google AI Studio
GOOGLE_GEMINI_API_KEY=your_api_key_here

# Optional: Default model to use for tests (defaults to gemini-1.5-flash)
GOOGLE_GEMINI_MODEL=gemini-1.5-flash

# Optional: Base directory for file tests (defaults to current directory)
GEMINI_SAFE_FILE_BASE_DIR=${process.cwd()}

# Optional: Image generation settings
GOOGLE_GEMINI_IMAGE_RESOLUTION=1024x1024
GOOGLE_GEMINI_MAX_IMAGE_SIZE_MB=10
GOOGLE_GEMINI_SUPPORTED_IMAGE_FORMATS=["image/jpeg","image/png","image/webp"]
`;

  try {
    // Write the example file
    const examplePath = resolve(process.cwd(), ".env.test.example");
    const fs = await import("node:fs/promises");
    await fs.writeFile(examplePath, exampleContent, "utf8");
    console.log(`Created environment example file at ${examplePath}`);
  } catch (error) {
    console.error(
      `Failed to create .env.test.example file: ${(error as Error).message}`
    );
  }
}

/**
 * Verifies that all required environment variables are present
 *
 * @param requiredVars - Array of environment variable names that are required
 * @returns Object containing boolean success flag and array of missing variables
 */
export function verifyEnvVars(
  requiredVars: string[] = REQUIRED_ENV_VARS.BASIC
): {
  success: boolean;
  missing: string[];
} {
  const missing = requiredVars.filter((name) => !process.env[name]);

  return {
    success: missing.length === 0,
    missing,
  };
}

/**
 * Creates a safe fallback value for a missing environment variable
 *
 * @param varName - Name of the environment variable
 * @returns A safe fallback value appropriate for the variable type
 */
export function getFallbackValue(varName: string): string {
  // Define fallback values for common variables
  const fallbacks: Record<string, string> = {
    GOOGLE_GEMINI_MODEL: "gemini-1.5-flash",
    GOOGLE_GEMINI_IMAGE_RESOLUTION: "512x512",
    GOOGLE_GEMINI_MAX_IMAGE_SIZE_MB: "5",
    GOOGLE_GEMINI_SUPPORTED_IMAGE_FORMATS: '["image/jpeg","image/png"]',
    GEMINI_SAFE_FILE_BASE_DIR: process.cwd(),
  };

  return fallbacks[varName] || "";
}

/**
 * Safely gets an environment variable with fallback
 *
 * @param varName - Name of the environment variable
 * @param defaultValue - Default value if not found
 * @returns The environment variable value or default/fallback
 */
export function getEnvVar(varName: string, defaultValue: string = ""): string {
  return process.env[varName] || defaultValue || getFallbackValue(varName);
}
