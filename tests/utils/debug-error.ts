// Simple helper to debug errors
import { GeminiApiError, mapToMcpError } from "../../src/utils/errors.js";

// Create a test error with details
const errorWithDetails = new GeminiApiError("API error with details", {
  key: "value",
});
const mappedError = mapToMcpError(errorWithDetails, "DEBUG_TOOL");

// Log the result for inspection
console.log("Original Error:", {
  message: errorWithDetails.message,
  details: errorWithDetails.details,
  hasDetailsProperty: "details" in errorWithDetails,
});

console.log("Mapped Error:", {
  code: mappedError.code,
  message: mappedError.message,
  details: mappedError.details,
  hasDetailsProperty: "details" in mappedError,
});
