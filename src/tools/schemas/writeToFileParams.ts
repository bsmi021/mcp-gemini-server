import { z } from "zod";
import { createToolSchema } from "./BaseToolSchema.js";
import {
  FilePathSchema,
  FileOverwriteSchema,
  EncodingSchema,
} from "./CommonSchemas.js";

const TOOL_NAME = "write_to_file";

const TOOL_DESCRIPTION =
  "Writes the given content to a specified file path. The path must be within an allowed directory.";

const TOOL_PARAMS = {
  filePath: FilePathSchema.describe(
    "The path to the file where content will be written."
  ),
  content: z.string().describe("The content to write to the file."),
  encoding: EncodingSchema,
  overwriteFile: FileOverwriteSchema,
};

// Create standardized schema with helper function
const schema = createToolSchema(TOOL_NAME, TOOL_DESCRIPTION, TOOL_PARAMS);

// Export all schema components
export const {
  TOOL_NAME: exportedToolName,
  TOOL_DESCRIPTION: exportedToolDescription,
  TOOL_PARAMS: exportedToolParams,
  toolSchema: writeToFileSchema,
  ToolParams: WriteToFileParams,
} = schema;

// For backward compatibility
export {
  exportedToolName as TOOL_NAME,
  exportedToolDescription as TOOL_DESCRIPTION,
  exportedToolParams as TOOL_PARAMS,
};
