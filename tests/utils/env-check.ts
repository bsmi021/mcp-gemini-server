/**
 * Environment variable verification for tests
 *
 * This module is used at the beginning of test runs to verify that
 * required environment variables are available and to load them from
 * .env.test if needed.
 */

import {
  loadTestEnv,
  verifyEnvVars,
  REQUIRED_ENV_VARS,
  createEnvExample,
} from "./environment.js";

/**
 * Setup function to be called at the beginning of test runs
 * to ensure environment variables are properly loaded
 *
 * @returns Promise resolving to a boolean indicating if environment is valid
 */
export async function setupTestEnvironment(): Promise<boolean> {
  // Try to load variables from .env.test file
  await loadTestEnv();

  // Check if required variables are available
  const basicCheck = verifyEnvVars(REQUIRED_ENV_VARS.BASIC);

  if (!basicCheck.success) {
    console.error("❌ Missing required environment variables for tests:");
    console.error(`   ${basicCheck.missing.join(", ")}`);
    console.error("\nTests requiring API access will be skipped.");
    console.error("To fix this:");
    console.error("1. Create a .env.test file in the project root");
    console.error("2. Add the missing variables with their values");

    // Create an example file to help users
    await createEnvExample();

    console.error("\n.env.test.example file created for reference\n");

    return false;
  }

  // Check which test categories can run
  const fileCheck = verifyEnvVars(REQUIRED_ENV_VARS.FILE_TESTS);
  const imageCheck = verifyEnvVars(REQUIRED_ENV_VARS.IMAGE_TESTS);

  console.log("✅ Basic API environment variables available");

  if (!fileCheck.success) {
    console.warn("⚠️  Missing some file API environment variables:");
    console.warn(`   ${fileCheck.missing.join(", ")}`);
    console.warn("   File API tests may be skipped");
  } else {
    console.log("✅ File API environment variables available");
  }

  if (!imageCheck.success) {
    console.warn("⚠️  Missing some image API environment variables:");
    console.warn(`   ${imageCheck.missing.join(", ")}`);
    console.warn("   Default values will be used for missing variables");
  } else {
    console.log("✅ Image API environment variables available");
  }

  return true;
}

/**
 * Add a pre-check function to specific test files to skip tests
 * if required environment variables are missing
 *
 * Usage (at the beginning of a test file):
 *
 *   import { describe, it, before } from 'node:test';
 *   import { preCheckEnv, skipIfEnvMissing } from '../utils/env-check.js';
 *
 *   // Check environment at the start of the file
 *   const envOk = preCheckEnv(REQUIRED_ENV_VARS.IMAGE_TESTS);
 *
 *   describe('Image generation tests', () => {
 *     // Skip all tests if environment is not set up
 *     if (!envOk) return;
 *
 *     // Or check in each test:
 *     it('should generate an image', (t) => {
 *       if (skipIfEnvMissing(t, REQUIRED_ENV_VARS.IMAGE_TESTS)) return;
 *       // ... test code ...
 *     });
 *   });
 *
 * @param requiredVars - Array of required environment variable names
 * @returns Boolean indicating if environment is valid for these tests
 */
export function preCheckEnv(
  requiredVars: string[] = REQUIRED_ENV_VARS.BASIC
): boolean {
  const check = verifyEnvVars(requiredVars);

  if (!check.success) {
    console.warn(
      `⚠️  Skipping tests - missing required environment variables: ${check.missing.join(", ")}`
    );
    return false;
  }

  return true;
}

/**
 * Skip a test if required environment variables are missing
 *
 * @param t - Test context from node:test
 * @param requiredVars - Array of required environment variable names
 * @returns Boolean indicating if the test should be skipped
 */
export function skipIfEnvMissing(
  t: { skip: (reason: string) => void },
  requiredVars: string[] = REQUIRED_ENV_VARS.BASIC
): boolean {
  const check = verifyEnvVars(requiredVars);

  if (!check.success) {
    t.skip(`Test requires environment variables: ${check.missing.join(", ")}`);
    return true;
  }

  return false;
}
