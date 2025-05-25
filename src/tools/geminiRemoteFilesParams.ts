import { z } from "zod";

// Tool Name
export const GEMINI_REMOTE_FILES_TOOL_NAME = "gemini_remote_files";

// Tool Description
export const GEMINI_REMOTE_FILES_TOOL_DESCRIPTION = `
Provides guidance on using inline data with Gemini API instead of file operations.
File upload/download operations are no longer supported. This tool helps users understand
how to work with inline data for their content generation needs.
`;

// Operation enum for legacy compatibility
export const fileOperationSchema = z
  .enum(["upload", "list", "get", "delete"])
  .describe(
    "The operation type (for legacy compatibility - returns guidance on inline data usage)"
  );

// Simplified parameters schema - only operation is needed now
export const GEMINI_REMOTE_FILES_PARAMS = {
  operation: fileOperationSchema,

  // Legacy fields kept for backward compatibility but are now ignored
  filePath: z.string().optional().describe("Legacy field - no longer used"),
  displayName: z.string().optional().describe("Legacy field - no longer used"),
  mimeType: z.string().optional().describe("Legacy field - no longer used"),
  pageSize: z.number().optional().describe("Legacy field - no longer used"),
  pageToken: z.string().optional().describe("Legacy field - no longer used"),
  fileName: z.string().optional().describe("Legacy field - no longer used"),
};

// Type helper
export type GeminiRemoteFilesArgs = z.infer<
  z.ZodObject<typeof GEMINI_REMOTE_FILES_PARAMS>
>;
