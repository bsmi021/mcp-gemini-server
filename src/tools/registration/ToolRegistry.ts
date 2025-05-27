/**
 * Tool Registry - Central management for MCP tools
 *
 * This file introduces a more consistent approach to tool registration
 * that provides better type safety and simpler maintenance.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { logger } from "../../utils/logger.js";
import { GeminiService } from "../../services/GeminiService.js";
import { McpClientService } from "../../services/mcp/McpClientService.js";
import { z } from "zod";

/**
 * Interface for tool registration function - base type
 */
export interface ToolRegistration {
  /**
   * Registers a tool with the MCP server
   * @param server The MCP server instance
   * @param services Container with available services
   */
  registerTool(server: McpServer, services: ServiceContainer): void;
}

/**
 * Container with services available for tools
 */
export interface ServiceContainer {
  geminiService: GeminiService;
  mcpClientService: McpClientService;
}

/**
 * Tool registration function type - for standalone functions
 */
export type ToolRegistrationFn = (
  server: McpServer,
  services: ServiceContainer
) => void;

/**
 * Tool factory that creates a simple tool without parameter validation
 */
export function createBasicTool(
  name: string,
  description: string,
  handler: (args: unknown) => Promise<unknown>
): ToolRegistrationFn {
  return (server: McpServer, _services: ServiceContainer) => {
    server.tool(name, description, {}, handler);
    logger.info(`Basic tool registered: ${name}`);
  };
}

/**
 * Tool factory that creates a fully-validated tool with Zod schema
 */
export function createValidatedTool<T extends z.ZodRawShape, R>(
  name: string,
  description: string,
  params: T,
  handler: (args: z.infer<z.ZodObject<T>>) => Promise<R>
): ToolRegistrationFn {
  return (server: McpServer, _services: ServiceContainer) => {
    // Create a wrapper with proper type inference
    const wrappedHandler = async (args: z.infer<z.ZodObject<T>>) => {
      return handler(args);
    };
    server.tool(
      name,
      description,
      params,
      wrappedHandler as (args: unknown) => Promise<unknown>
    );
    logger.info(`Validated tool registered: ${name}`);
  };
}

/**
 * Registry that manages tool registration
 */
export class ToolRegistry {
  private toolRegistrations: ToolRegistrationFn[] = [];
  private services: ServiceContainer;

  /**
   * Creates a new tool registry
   * @param geminiService GeminiService instance
   * @param mcpClientService McpClientService instance
   */
  constructor(
    geminiService: GeminiService,
    mcpClientService: McpClientService
  ) {
    this.services = {
      geminiService,
      mcpClientService,
    };
  }

  /**
   * Adds a tool to the registry
   * @param registration Tool registration function
   */
  public registerTool(registration: ToolRegistrationFn): void {
    this.toolRegistrations.push(registration);
  }

  /**
   * Registers all tools with the MCP server
   * @param server McpServer instance
   */
  public registerAllTools(server: McpServer): void {
    logger.info(`Registering ${this.toolRegistrations.length} tools...`);

    for (const registration of this.toolRegistrations) {
      try {
        registration(server, this.services);
      } catch (error) {
        logger.error(
          `Failed to register tool: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    logger.info("All tools registered successfully");
  }
}
