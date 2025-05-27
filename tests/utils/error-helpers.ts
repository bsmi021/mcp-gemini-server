/**
 * Error testing utilities for MCP Gemini Server tests
 *
 * This module provides helpers for testing error handling and ensuring
 * proper instanceof checks work consistently.
 */

import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

/**
 * Helper function to reliably determine if an object is an McpError
 *
 * This works around possible ESM/TypeScript instanceof issues by checking
 * both constructor name and presence of expected properties.
 *
 * @param obj - Object to check
 * @returns True if the object appears to be an McpError
 */
export function isMcpError(obj: unknown): boolean {
  if (obj === null || typeof obj !== "object") {
    return false;
  }

  // First try the direct instanceof check
  const isInstanceOf = obj instanceof McpError;

  // If that works, great! Otherwise fall back to checking properties
  if (isInstanceOf) {
    return true;
  }

  // Manual property checks as fallback
  const errorLike = obj as { code?: unknown; message?: unknown };
  return (
    obj !== null &&
    typeof obj === "object" &&
    "code" in obj &&
    "message" in obj &&
    typeof errorLike.code === "string" &&
    typeof errorLike.message === "string" &&
    Object.values(ErrorCode).includes(errorLike.code as ErrorCode)
  );
}

/**
 * Ensures that an object is treated as an McpError instance
 *
 * If the object is not originally recognized as an McpError,
 * this function attempts to reconstruct it properly.
 *
 * @param obj - Object to convert
 * @returns Same object or a reconstructed McpError
 */
export function ensureMcpError(obj: unknown): McpError {
  if (obj instanceof McpError) {
    return obj;
  }

  if (obj && typeof obj === "object" && "code" in obj && "message" in obj) {
    const errObj = obj as {
      code: unknown;
      message: unknown;
      details?: unknown;
    };
    return new McpError(
      errObj.code as ErrorCode,
      errObj.message as string,
      errObj.details
    );
  }

  // If all else fails, create a generic error
  return new McpError(
    ErrorCode.InternalError,
    typeof obj === "string" ? obj : "Unknown error"
  );
}
