import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  GEMINI_REMOTE_FILES_TOOL_NAME,
  GEMINI_REMOTE_FILES_TOOL_DESCRIPTION,
  GEMINI_REMOTE_FILES_PARAMS,
} from "./geminiRemoteFilesParams.js";
import { GeminiService } from "../services/index.js";
import { logger } from "../utils/index.js";
import { mapAnyErrorToMcpError } from "../utils/errors.js";

// Define the type for the arguments object based on the Zod schema
type GeminiRemoteFilesArgs = z.infer<
  z.ZodObject<typeof GEMINI_REMOTE_FILES_PARAMS>
>;

/**
 * Registers the gemini_remote_files tool with the MCP server.
 * This tool now provides information about using inline data instead of file uploads.
 *
 * @param server - The McpServer instance.
 * @param serviceInstance - An instance of the GeminiService.
 */
export const geminiRemoteFilesTool = (
  server: McpServer,
  _serviceInstance: GeminiService
): void => {
  /**
   * Processes the request for the gemini_remote_files tool.
   * @param args - The arguments object matching GEMINI_REMOTE_FILES_PARAMS.
   * @returns The result content for MCP.
   */
  const processRequest = async (args: unknown): Promise<CallToolResult> => {
    const typedArgs = args as GeminiRemoteFilesArgs;
    logger.debug(`Received ${GEMINI_REMOTE_FILES_TOOL_NAME} request:`, {
      operation: typedArgs.operation,
    });

    try {
      // Since file operations are no longer supported, provide guidance on using inline data
      const inlineDataGuidance = {
        message:
          "File operations are no longer supported. Please use inline data instead.",
        alternatives: {
          upload:
            "Use the gemini_generate_content_consolidated tool with base64-encoded data in the 'inlineData' parameter.",
          list: "File listing is not available. Keep track of your data in your application.",
          get: "File retrieval is not available. Use inline data directly in your requests.",
          delete: "File deletion is not needed when using inline data.",
        },
        examples: {
          imageContent: {
            description:
              "To include an image in your request, encode it as base64:",
            tool: "gemini_generate_content_consolidated",
            parameters: {
              prompt: "Analyze this image",
              inlineData: "base64_encoded_image_data_here",
              inlineDataMimeType: "image/jpeg",
            },
          },
          textContent: {
            description:
              "For text content, you can include it directly in the prompt:",
            tool: "gemini_generate_content_consolidated",
            parameters: {
              prompt: "Analyze this document: [your text content here]",
            },
          },
        },
        limitations: [
          "Large files (>20MB) may exceed API limits when sent as inline data",
          "Consider chunking large content or using URL references for remote content",
          "Use the gemini_url_analysis tool for analyzing content from URLs",
        ],
      };

      logger.info(
        `Provided inline data guidance for operation: ${typedArgs.operation}`
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(inlineDataGuidance, null, 2),
          },
        ],
      };
    } catch (error: unknown) {
      logger.error(`Error processing ${GEMINI_REMOTE_FILES_TOOL_NAME}:`, error);
      throw mapAnyErrorToMcpError(error, GEMINI_REMOTE_FILES_TOOL_NAME);
    }
  };

  // Register the tool with the server
  server.tool(
    GEMINI_REMOTE_FILES_TOOL_NAME,
    GEMINI_REMOTE_FILES_TOOL_DESCRIPTION,
    GEMINI_REMOTE_FILES_PARAMS,
    processRequest
  );

  logger.info(`Tool registered: ${GEMINI_REMOTE_FILES_TOOL_NAME}`);
};
