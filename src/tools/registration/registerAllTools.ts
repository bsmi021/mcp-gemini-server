/**
 * Tool Registration - Central registration point for all tools
 *
 * This file uses the new ToolRegistry system to register all tools.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ToolRegistry } from "./ToolRegistry.js";
import {
  adaptServerOnlyTool,
  adaptGeminiServiceTool,
  adaptNewToolObject,
  adaptNewGeminiServiceToolObject,
  adaptNewMcpClientServiceToolObject,
} from "./ToolAdapter.js";
import { logger } from "../../utils/logger.js";
import { GeminiService } from "../../services/GeminiService.js";
import { McpClientService } from "../../services/mcp/McpClientService.js";

// Import tool registration functions
import { geminiGenerateContentConsolidatedTool } from "../geminiGenerateContentConsolidatedTool.js";
import { geminiChatTool } from "../geminiChatTool.js";
import { geminiRouteMessageTool } from "../geminiRouteMessageTool.js";
// --- Remote Files Migration and Cache Tools ---
import { geminiRemoteFilesTool } from "../geminiRemoteFilesTool.js";
import { geminiCacheTool } from "../geminiCacheTool.js";
// Image feature tools
import { geminiGenerateImageTool } from "../geminiGenerateImageTool.js";
import { geminiAnalyzeMediaTool } from "../geminiAnalyzeMediaTool.js";
// Code review tools
import {
  geminiCodeReviewTool,
  geminiCodeReviewStreamTool,
} from "../geminiCodeReviewTool.js";
import type { GeminiCodeReviewArgs } from "../geminiCodeReviewParams.js";
// URL Context tools
import { geminiUrlAnalysisTool } from "../geminiUrlAnalysisTool.js";
// MCP tools
import { mcpClientTool } from "../mcpClientTool.js";
// File utils tool
import { writeToFileTool } from "../writeToFileTool.js";

/**
 * Register all tools with the MCP server using the new registry system
 * @param server MCP server instance
 * @returns McpClientService instance for managing connections
 */
export function registerAllTools(server: McpServer): McpClientService {
  logger.info("Initializing services and tool registry...");

  // Create service instances
  const geminiService = new GeminiService();
  const mcpClientService = new McpClientService();

  // Create the tool registry
  const registry = new ToolRegistry(geminiService, mcpClientService);

  try {
    // Register all tools with appropriate adapters

    // Note: Example tool removed as per refactoring

    // Content generation tools
    registry.registerTool(
      adaptGeminiServiceTool(
        geminiGenerateContentConsolidatedTool,
        "geminiGenerateContentConsolidatedTool"
      )
    );

    // Chat tools
    registry.registerTool(
      adaptGeminiServiceTool(geminiChatTool, "geminiChatTool")
    );
    registry.registerTool(
      adaptGeminiServiceTool(geminiRouteMessageTool, "geminiRouteMessageTool")
    );

    // File and cache management tools
    registry.registerTool(
      adaptGeminiServiceTool(geminiRemoteFilesTool, "geminiRemoteFilesTool")
    );
    registry.registerTool(
      adaptGeminiServiceTool(geminiCacheTool, "geminiCacheTool")
    );

    // Image feature tools
    registry.registerTool(
      adaptNewGeminiServiceToolObject(geminiGenerateImageTool)
    );
    registry.registerTool(
      adaptNewToolObject({
        ...geminiAnalyzeMediaTool,
        execute: geminiAnalyzeMediaTool.execute, // No cast needed
      })
    );

    // URL Context tools
    registry.registerTool(
      adaptGeminiServiceTool(geminiUrlAnalysisTool, "geminiUrlAnalysisTool")
    );

    // Code review tools
    registry.registerTool(
      adaptNewGeminiServiceToolObject(geminiCodeReviewTool)
    );
    // Note: geminiCodeReviewStreamTool returns an AsyncGenerator, not a Promise
    // We need to wrap it to collect all chunks into a single response
    registry.registerTool(
      adaptNewGeminiServiceToolObject({
        ...geminiCodeReviewStreamTool,
        execute: async (args: GeminiCodeReviewArgs, service: GeminiService) => {
          const results = [];
          const generator = await geminiCodeReviewStreamTool.execute(
            args,
            service
          );
          for await (const chunk of generator) {
            results.push(chunk);
          }
          // Return the last chunk which should contain the complete result
          return results[results.length - 1];
        },
      })
    );

    // MCP client tool
    registry.registerTool(
      adaptNewMcpClientServiceToolObject({
        ...mcpClientTool,
        execute: mcpClientTool.execute, // No cast needed
      })
    );

    // File utility tools
    registry.registerTool(
      adaptServerOnlyTool(writeToFileTool, "writeToFileTool")
    );

    // Register all tools with the server
    registry.registerAllTools(server);
  } catch (error) {
    logger.error(
      "Error registering tools:",
      error instanceof Error ? error.message : String(error)
    );
  }

  // Return the McpClientService instance for use in graceful shutdown
  return mcpClientService;
}
