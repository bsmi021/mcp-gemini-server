import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  GEMINI_CACHE_TOOL_NAME,
  GEMINI_CACHE_TOOL_DESCRIPTION,
  GEMINI_CACHE_PARAMS,
} from "./geminiCacheParams.js";
import { GeminiService } from "../services/index.js";
import { logger } from "../utils/index.js";
import { mapAnyErrorToMcpError } from "../utils/errors.js";
import { CachedContentMetadata } from "../types/index.js";
import { Content, Tool, ToolConfig } from "../services/gemini/GeminiTypes.js";

// Define the type for the arguments object based on the Zod schema
type GeminiCacheArgs = z.infer<z.ZodObject<typeof GEMINI_CACHE_PARAMS>>;

/**
 * Registers the gemini_cache tool with the MCP server.
 * This consolidated tool handles cache create, list, get, update, and delete operations.
 *
 * @param server - The McpServer instance.
 * @param serviceInstance - An instance of the GeminiService.
 */
export const geminiCacheTool = (
  server: McpServer,
  serviceInstance: GeminiService
): void => {
  /**
   * Processes the request for the gemini_cache tool.
   * @param args - The arguments object matching GEMINI_CACHE_PARAMS.
   * @returns The result content for MCP.
   */
  const processRequest = async (args: unknown): Promise<CallToolResult> => {
    // Type cast the args to our expected type
    const typedArgs = args as GeminiCacheArgs;

    logger.debug(`Received ${GEMINI_CACHE_TOOL_NAME} request:`, {
      operation: typedArgs.operation,
      cacheName: typedArgs.cacheName,
      model: typedArgs.model,
    });

    try {
      // Validate required fields based on operation
      if (typedArgs.operation === "create" && !typedArgs.contents) {
        throw new Error("contents is required for operation 'create'");
      }

      if (
        (typedArgs.operation === "get" ||
          typedArgs.operation === "update" ||
          typedArgs.operation === "delete") &&
        !typedArgs.cacheName
      ) {
        throw new Error(
          `cacheName is required for operation '${typedArgs.operation}'`
        );
      }

      // Validate cacheName format for get/update/delete operations
      if (
        typedArgs.cacheName &&
        !typedArgs.cacheName.match(/^cachedContents\/.+$/)
      ) {
        throw new Error("cacheName must start with 'cachedContents/'");
      }

      // For update operation, ensure at least one field is being updated
      if (
        typedArgs.operation === "update" &&
        !typedArgs.ttl &&
        !typedArgs.displayName
      ) {
        throw new Error(
          "At least one of 'ttl' or 'displayName' must be provided for update operation"
        );
      }

      // Handle different operations
      switch (typedArgs.operation) {
        case "create": {
          // Construct options object for the service call
          const cacheOptions: {
            displayName?: string;
            systemInstruction?: Content;
            ttl?: string;
            tools?: Tool[];
            toolConfig?: ToolConfig;
          } = {};

          if (typedArgs.displayName)
            cacheOptions.displayName = typedArgs.displayName;
          if (typedArgs.ttl) cacheOptions.ttl = typedArgs.ttl;
          if (typedArgs.systemInstruction) {
            cacheOptions.systemInstruction =
              typedArgs.systemInstruction as Content;
          }
          if (typedArgs.tools) cacheOptions.tools = typedArgs.tools as Tool[];
          if (typedArgs.toolConfig)
            cacheOptions.toolConfig = typedArgs.toolConfig as ToolConfig;

          // Call the GeminiService method
          const cacheMetadata: CachedContentMetadata =
            await serviceInstance.createCache(
              typedArgs.model ?? "", // model first, provide empty string as fallback
              typedArgs.contents as Content[], // contents second
              Object.keys(cacheOptions).length > 0 ? cacheOptions : undefined // options third
            );

          logger.info(
            `Cache created successfully. Name: ${cacheMetadata.name}`
          );

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(cacheMetadata, null, 2),
              },
            ],
          };
        }

        case "list": {
          // Call the GeminiService method to list caches
          const listResult = await serviceInstance.listCaches(
            typedArgs.pageSize,
            typedArgs.pageToken
          );

          logger.info(`Listed ${listResult.caches.length} caches`);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(listResult, null, 2),
              },
            ],
          };
        }

        case "get": {
          // Call the GeminiService method to get cache metadata
          const cacheMetadata = await serviceInstance.getCache(
            typedArgs.cacheName! as `cachedContents/${string}`
          );

          logger.info(`Retrieved metadata for cache: ${typedArgs.cacheName}`);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(cacheMetadata, null, 2),
              },
            ],
          };
        }

        case "update": {
          // Construct update data object
          const updateData: { ttl?: string; displayName?: string } = {};
          if (typedArgs.ttl) updateData.ttl = typedArgs.ttl;
          if (typedArgs.displayName)
            updateData.displayName = typedArgs.displayName;

          // Call the GeminiService method to update the cache
          const updatedMetadata = await serviceInstance.updateCache(
            typedArgs.cacheName! as `cachedContents/${string}`,
            updateData
          );

          logger.info(`Cache updated successfully: ${typedArgs.cacheName}`);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(updatedMetadata, null, 2),
              },
            ],
          };
        }

        case "delete": {
          // Call the GeminiService method to delete the cache
          await serviceInstance.deleteCache(
            typedArgs.cacheName! as `cachedContents/${string}`
          );

          logger.info(`Cache deleted successfully: ${typedArgs.cacheName}`);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  success: true,
                  message: `Cache ${typedArgs.cacheName} deleted successfully`,
                }),
              },
            ],
          };
        }

        default:
          throw new Error(`Invalid operation: ${typedArgs.operation}`);
      }
    } catch (error: unknown) {
      logger.error(`Error processing ${GEMINI_CACHE_TOOL_NAME}:`, error);
      throw mapAnyErrorToMcpError(error, GEMINI_CACHE_TOOL_NAME);
    }
  };

  // Register the tool with the server
  server.tool(
    GEMINI_CACHE_TOOL_NAME,
    GEMINI_CACHE_TOOL_DESCRIPTION,
    GEMINI_CACHE_PARAMS,
    processRequest
  );

  logger.info(`Tool registered: ${GEMINI_CACHE_TOOL_NAME}`);
};
