/**
 * Tool Adapter
 *
 * Provides adapter functions to convert existing tool implementations
 * to work with the new standardized registry system.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ServiceContainer, ToolRegistrationFn } from "./ToolRegistry.js";
import { GeminiService } from "../../services/GeminiService.js";
import { McpClientService } from "../../services/mcp/McpClientService.js";
import { logger } from "../../utils/logger.js";

/**
 * Legacy tool function that only accepts server parameter
 */
export type LegacyServerOnlyTool = (server: McpServer) => void;

/**
 * Legacy tool function that accepts server and GeminiService
 */
export type LegacyGeminiServiceTool = (
  server: McpServer,
  service: GeminiService
) => void;

/**
 * Legacy tool function that accepts server and McpClientService
 */
export type LegacyMcpClientServiceTool = (
  server: McpServer,
  service: McpClientService
) => void;

/**
 * New tool object format with execute function
 */
export interface NewToolObject<TArgs = unknown, TResult = unknown> {
  name: string;
  description: string;
  inputSchema: unknown;
  execute: (args: TArgs) => Promise<TResult>;
}

/**
 * New tool object format that needs GeminiService
 */
export interface NewGeminiServiceToolObject<
  TArgs = unknown,
  TResult = unknown,
> {
  name: string;
  description: string;
  inputSchema: unknown;
  execute: (args: TArgs, service: GeminiService) => Promise<TResult>;
}

/**
 * New tool object format that needs McpClientService
 */
export interface NewMcpClientServiceToolObject<
  TArgs = unknown,
  TResult = unknown,
> {
  name: string;
  description: string;
  inputSchema: unknown;
  execute: (args: TArgs, service: McpClientService) => Promise<TResult>;
}

/**
 * Adapts a legacy tool that only uses server to the new registration system
 * @param tool Legacy tool function
 * @param name Optional name for logging
 */
export function adaptServerOnlyTool(
  tool: LegacyServerOnlyTool,
  name?: string
): ToolRegistrationFn {
  return (server: McpServer, _services: ServiceContainer) => {
    try {
      tool(server);
      if (name) {
        logger.debug(`Registered server-only tool: ${name}`);
      }
    } catch (error) {
      logger.error(
        `Failed to register server-only tool${name ? ` ${name}` : ""}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };
}

/**
 * Adapts a legacy tool that uses GeminiService to the new registration system
 * @param tool Legacy tool function
 * @param name Optional name for logging
 */
export function adaptGeminiServiceTool(
  tool: LegacyGeminiServiceTool,
  name?: string
): ToolRegistrationFn {
  return (server: McpServer, services: ServiceContainer) => {
    try {
      tool(server, services.geminiService);
      if (name) {
        logger.debug(`Registered GeminiService tool: ${name}`);
      }
    } catch (error) {
      logger.error(
        `Failed to register GeminiService tool${name ? ` ${name}` : ""}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };
}

/**
 * Adapts a legacy tool that uses McpClientService to the new registration system
 * @param tool Legacy tool function
 * @param name Optional name for logging
 */
export function adaptMcpClientServiceTool(
  tool: LegacyMcpClientServiceTool,
  name?: string
): ToolRegistrationFn {
  return (server: McpServer, services: ServiceContainer) => {
    try {
      tool(server, services.mcpClientService);
      if (name) {
        logger.debug(`Registered McpClientService tool: ${name}`);
      }
    } catch (error) {
      logger.error(
        `Failed to register McpClientService tool${name ? ` ${name}` : ""}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };
}

/**
 * Adapts a new tool object format to the registration system
 * @param tool New tool object with execute method
 */
export function adaptNewToolObject<TArgs, TResult>(
  tool: NewToolObject<TArgs, TResult>
): ToolRegistrationFn {
  return (server: McpServer, _services: ServiceContainer) => {
    try {
      // Wrap the execute function with proper type inference
      const wrappedExecute = async (args: TArgs): Promise<TResult> => {
        return tool.execute(args);
      };
      server.tool(
        tool.name,
        tool.description,
        tool.inputSchema,
        wrappedExecute as (args: unknown) => Promise<unknown>
      );
      logger.debug(`Registered new tool object: ${tool.name}`);
    } catch (error) {
      logger.error(
        `Failed to register new tool object ${tool.name}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };
}

/**
 * Adapts a new tool object that needs GeminiService to the registration system
 * @param tool New tool object with execute method that needs GeminiService
 */
export function adaptNewGeminiServiceToolObject<TArgs, TResult>(
  tool: NewGeminiServiceToolObject<TArgs, TResult>
): ToolRegistrationFn {
  return (server: McpServer, services: ServiceContainer) => {
    try {
      // Wrap the execute function with proper type inference
      const wrappedExecute = async (args: TArgs): Promise<TResult> => {
        return tool.execute(args, services.geminiService);
      };
      server.tool(
        tool.name,
        tool.description,
        tool.inputSchema,
        wrappedExecute as (args: unknown) => Promise<unknown>
      );
      logger.debug(`Registered new Gemini service tool object: ${tool.name}`);
    } catch (error) {
      logger.error(
        `Failed to register new Gemini service tool object ${tool.name}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };
}

/**
 * Adapts a new tool object that needs McpClientService to the registration system
 * @param tool New tool object with execute method that needs McpClientService
 */
export function adaptNewMcpClientServiceToolObject<TArgs, TResult>(
  tool: NewMcpClientServiceToolObject<TArgs, TResult>
): ToolRegistrationFn {
  return (server: McpServer, services: ServiceContainer) => {
    try {
      // Wrap the execute function with proper type inference
      const wrappedExecute = async (args: TArgs): Promise<TResult> => {
        return tool.execute(args, services.mcpClientService);
      };
      server.tool(
        tool.name,
        tool.description,
        tool.inputSchema,
        wrappedExecute as (args: unknown) => Promise<unknown>
      );
      logger.debug(
        `Registered new MCP client service tool object: ${tool.name}`
      );
    } catch (error) {
      logger.error(
        `Failed to register new MCP client service tool object ${tool.name}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };
}

/**
 * Adapts a direct tool implementation that bypasses the normal registration
 * @param name Tool name
 * @param description Tool description
 * @param handler The handler function
 */
export function adaptDirectTool(
  name: string,
  description: string,
  handler: (args: unknown) => Promise<unknown>
): ToolRegistrationFn {
  return (server: McpServer, _services: ServiceContainer) => {
    try {
      server.tool(name, description, {}, handler);
      logger.debug(`Registered direct tool: ${name}`);
    } catch (error) {
      logger.error(
        `Failed to register direct tool ${name}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };
}
