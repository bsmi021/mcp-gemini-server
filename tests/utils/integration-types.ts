/**
 * Types for integration tests
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpClientService } from "../../src/services/mcp/McpClientService.js";

/**
 * Tool processor function type
 */
export type ToolProcessor = (args: any) => Promise<{
  content: Array<{
    text: string;
    type: string;
  }>;
  functionCall?: any;
}>;

/**
 * Collection of tool processors for testing
 */
export interface ToolProcessors {
  connect: ToolProcessor;
  listTools: ToolProcessor;
  callServerTool: ToolProcessor;
  disconnect: ToolProcessor;
  writeToFile: ToolProcessor;
}

/**
 * Mock server tool handler
 */
export type MockServerToolHandler = (
  server: McpServer,
  mcpClientService: McpClientService
) => void;

/**
 * Tool registration function
 */
export type ToolRegistrationFn = (
  server: McpServer,
  service: McpClientService
) => unknown;
