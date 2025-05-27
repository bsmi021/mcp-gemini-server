/**
 * Custom assertion helpers for testing the MCP Gemini Server
 *
 * This module provides specialized assertion functions to make tests more
 * readable and to provide better error messages for common test scenarios.
 */

import assert from "node:assert/strict";
import { isMcpError } from "./error-helpers.js";

/**
 * Assert that a response matches the expected structure for content generation
 *
 * @param response - The response object to check
 */
export function assertValidContentResponse(response: any): void {
  assert.ok(response, "Response should not be null or undefined");
  assert.ok(response.candidates, "Response should have candidates array");
  assert.ok(
    Array.isArray(response.candidates),
    "Candidates should be an array"
  );
  assert.ok(
    response.candidates.length > 0,
    "Candidates array should not be empty"
  );

  const candidate = response.candidates[0];
  assert.ok(candidate.content, "Candidate should have content");
  assert.ok(candidate.content.parts, "Content should have parts array");
  assert.ok(Array.isArray(candidate.content.parts), "Parts should be an array");

  // Check if there's at least one part with text
  const hasSomeText = candidate.content.parts.some(
    (part: any) => typeof part.text === "string" && part.text.length > 0
  );
  assert.ok(hasSomeText, "At least one part should have non-empty text");
}

/**
 * Assert that a response matches the expected structure for image generation
 *
 * @param response - The response object to check
 * @param expectedCount - Expected number of images (default: 1)
 */
export function assertValidImageResponse(
  response: any,
  expectedCount: number = 1
): void {
  assert.ok(response, "Response should not be null or undefined");
  assert.ok(response.images, "Response should have images array");
  assert.ok(Array.isArray(response.images), "Images should be an array");
  assert.strictEqual(
    response.images.length,
    expectedCount,
    `Images array should have ${expectedCount} element(s)`
  );

  for (let i = 0; i < response.images.length; i++) {
    const image = response.images[i];
    assert.ok(image.base64Data, `Image ${i} should have base64Data`);
    assert.ok(
      typeof image.base64Data === "string",
      `Image ${i} base64Data should be a string`
    );
    assert.ok(
      image.base64Data.length > 0,
      `Image ${i} base64Data should not be empty`
    );

    assert.ok(image.mimeType, `Image ${i} should have mimeType`);
    assert.ok(
      typeof image.mimeType === "string",
      `Image ${i} mimeType should be a string`
    );
    assert.ok(
      ["image/jpeg", "image/png", "image/webp"].includes(image.mimeType),
      `Image ${i} should have a valid mimeType`
    );

    assert.ok(image.width, `Image ${i} should have width`);
    assert.ok(
      typeof image.width === "number",
      `Image ${i} width should be a number`
    );
    assert.ok(image.width > 0, `Image ${i} width should be positive`);

    assert.ok(image.height, `Image ${i} should have height`);
    assert.ok(
      typeof image.height === "number",
      `Image ${i} height should be a number`
    );
    assert.ok(image.height > 0, `Image ${i} height should be positive`);
  }
}

/**
 * Assert that an error is an McpError with the expected code
 *
 * @param error - The error to check
 * @param expectedCode - The expected error code
 * @param messageIncludes - Optional substring to check for in the error message
 */
export function assertMcpError(
  error: any,
  expectedCode: string,
  messageIncludes?: string
): void {
  // Use our reliable helper to check if it's an McpError
  assert.ok(isMcpError(error), "Error should be an instance of McpError");

  // Now check the specific properties
  assert.strictEqual(
    error.code,
    expectedCode,
    `Error code should be ${expectedCode}`
  );

  if (messageIncludes) {
    assert.ok(
      error.message.includes(messageIncludes),
      `Error message should include "${messageIncludes}"`
    );
  }
}

/**
 * Assert that a response object has the correct bounding box structure
 *
 * @param objects - The objects array from detection response
 */
export function assertValidBoundingBoxes(objects: any[]): void {
  assert.ok(Array.isArray(objects), "Objects should be an array");
  assert.ok(objects.length > 0, "Objects array should not be empty");

  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i];
    assert.ok(obj.label, `Object ${i} should have a label`);
    assert.ok(
      typeof obj.label === "string",
      `Object ${i} label should be a string`
    );

    assert.ok(obj.boundingBox, `Object ${i} should have a boundingBox`);
    const box = obj.boundingBox;

    // Check that box coordinates are within normalized range (0-1000)
    assert.ok(typeof box.xMin === "number", `Box ${i} xMin should be a number`);
    assert.ok(
      box.xMin >= 0 && box.xMin <= 1000,
      `Box ${i} xMin should be between 0 and 1000`
    );

    assert.ok(typeof box.yMin === "number", `Box ${i} yMin should be a number`);
    assert.ok(
      box.yMin >= 0 && box.yMin <= 1000,
      `Box ${i} yMin should be between 0 and 1000`
    );

    assert.ok(typeof box.xMax === "number", `Box ${i} xMax should be a number`);
    assert.ok(
      box.xMax >= 0 && box.xMax <= 1000,
      `Box ${i} xMax should be between 0 and 1000`
    );

    assert.ok(typeof box.yMax === "number", `Box ${i} yMax should be a number`);
    assert.ok(
      box.yMax >= 0 && box.yMax <= 1000,
      `Box ${i} yMax should be between 0 and 1000`
    );

    // Check that max coordinates are greater than min coordinates
    assert.ok(box.xMax > box.xMin, `Box ${i} xMax should be greater than xMin`);
    assert.ok(box.yMax > box.yMin, `Box ${i} yMax should be greater than yMin`);
  }
}

/**
 * Assert that a session ID is valid
 *
 * @param sessionId - The session ID to check
 */
export function assertValidSessionId(sessionId: string): void {
  assert.ok(sessionId, "Session ID should not be null or undefined");
  assert.ok(typeof sessionId === "string", "Session ID should be a string");
  assert.ok(sessionId.length > 0, "Session ID should not be empty");

  // Session IDs are typically UUIDs or similar format
  const validIdPattern = /^[a-zA-Z0-9_-]+$/;
  assert.ok(
    validIdPattern.test(sessionId),
    "Session ID should have a valid format"
  );
}

/**
 * Assert that a file ID is valid
 *
 * @param fileId - The file ID to check
 */
export function assertValidFileId(fileId: string): void {
  assert.ok(fileId, "File ID should not be null or undefined");
  assert.ok(typeof fileId === "string", "File ID should be a string");
  assert.ok(fileId.length > 0, "File ID should not be empty");
  assert.ok(fileId.startsWith("files/"), 'File ID should start with "files/"');
}

/**
 * Assert that a cache ID is valid
 *
 * @param cacheId - The cache ID to check
 */
export function assertValidCacheId(cacheId: string): void {
  assert.ok(cacheId, "Cache ID should not be null or undefined");
  assert.ok(typeof cacheId === "string", "Cache ID should be a string");
  assert.ok(cacheId.length > 0, "Cache ID should not be empty");
  assert.ok(
    cacheId.startsWith("cachedContents/"),
    'Cache ID should start with "cachedContents/"'
  );
}
