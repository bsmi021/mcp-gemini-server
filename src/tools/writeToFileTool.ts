import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
// We don't need to import z here, it's imported via the params file
import {
  TOOL_NAME,
  TOOL_DESCRIPTION,
  TOOL_PARAMS,
  writeToFileSchema,
} from "./schemas/writeToFileParams.js";
import { z } from "zod";
import { validateAndResolvePath } from "../utils/filePathSecurity.js";
import * as fs from "fs/promises";
import { logger } from "../utils/logger.js";
import { ValidationError } from "../utils/errors.js";

// Define the type for the write tool parameters
type WriteToFileParams = z.infer<z.ZodObject<typeof TOOL_PARAMS>>;

/**
 * Registers the writeToFile tool with the MCP server.
 * @param server - The McpServer instance.
 */
export const writeToFileTool = (server: McpServer): void => {
  /**
   * Process a write to file request.
   * @param args - The parameters for the file write operation.
   * @returns A response object containing a success message.
   * @throws McpError if the operation fails.
   */
  const processWriteRequest = async (args: unknown) => {
    // Validate and parse the arguments
    const validatedArgs = writeToFileSchema.parse(args);
    logger.debug(
      `Received write file request with args: ${JSON.stringify(validatedArgs)}`
    );

    try {
      // Handle base64 encoding if specified
      let contentToWrite = validatedArgs.content;
      if (validatedArgs.encoding === "base64") {
        try {
          contentToWrite = Buffer.from(
            validatedArgs.content,
            "base64"
          ).toString("utf8");
        } catch (e) {
          throw new McpError(
            ErrorCode.InvalidParams,
            "Invalid base64 content."
          );
        }
      }

      // Validate and resolve the file path
      const safePath = validateAndResolvePath(validatedArgs.filePath, {
        mustExist: false,
      });

      // Check if file exists and handle overwrite
      try {
        await fs.access(safePath);
        if (!validatedArgs.overwriteFile) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `File already exists: ${validatedArgs.filePath}. Set overwriteFile to true to overwrite.`
          );
        }
      } catch (error: unknown) {
        // File doesn't exist, which is fine for writing
        if (error instanceof McpError) {
          throw error;
        }
      }

      // Write the file
      await fs.writeFile(safePath, contentToWrite, {
        encoding:
          validatedArgs.encoding === "base64"
            ? "utf8"
            : ((validatedArgs.encoding || "utf8") as BufferEncoding),
      });

      // Return success response
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                message: "Content written to file successfully.",
                filePath: validatedArgs.filePath,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      logger.error(`Error writing file: ${error}`);

      // Handle specific errors
      if (error instanceof McpError) {
        throw error; // Re-throw if it's already an McpError
      }

      // Handle ValidationError from file security
      if (error instanceof ValidationError) {
        throw new McpError(ErrorCode.InvalidParams, error.message);
      }

      // Catch-all for unexpected errors
      throw new McpError(
        ErrorCode.InternalError,
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while writing to file."
      );
    }
  };

  // Register the tool with the server
  server.tool(TOOL_NAME, TOOL_DESCRIPTION, TOOL_PARAMS, processWriteRequest);

  logger.info(`Tool registered: ${TOOL_NAME}`);
};

// Also export an execute method for direct use in other tools
export const writeToFile = {
  name: TOOL_NAME,
  description: TOOL_DESCRIPTION,
  inputSchema: writeToFileSchema,
  execute: async (args: unknown) => {
    const typedArgs = args as WriteToFileParams;
    logger.debug(
      `Executing write file with args: ${JSON.stringify(typedArgs)}`
    );

    try {
      // Convert boolean to overwrite option
      const contentToWrite = typedArgs.content;

      // Validate and resolve the file path
      const safePath = validateAndResolvePath(typedArgs.filePath, {
        mustExist: false,
      });

      // Check if file exists and handle overwrite
      try {
        await fs.access(safePath);
        if (!typedArgs.overwriteFile) {
          throw new ValidationError(
            `File already exists: ${typedArgs.filePath}. Set overwriteFile to true to overwrite.`
          );
        }
      } catch (error: unknown) {
        // File doesn't exist, which is fine for writing
        if (error instanceof ValidationError) {
          throw error;
        }
      }

      // Write the file
      await fs.writeFile(safePath, contentToWrite, {
        encoding: typedArgs.encoding || "utf8",
      });

      // Return success response
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                message: "Content written to file successfully.",
                filePath: typedArgs.filePath,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      logger.error(`Error writing file: ${error}`);

      // Handle specific errors
      if (error instanceof McpError) {
        throw error; // Re-throw if it's already an McpError
      }

      // Handle ValidationError from FileSecurityService
      if (error instanceof ValidationError) {
        if (error.message.includes("File already exists")) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `File already exists: ${error.message}`
          );
        }

        if (
          error.message.includes("Access denied") ||
          error.message.includes("Security error")
        ) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Security error: ${error.message}`
          );
        }

        throw new McpError(ErrorCode.InvalidParams, error.message);
      }

      // Catch-all for unexpected errors
      throw new McpError(
        ErrorCode.InternalError,
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while writing to file."
      );
    }
  },
};
