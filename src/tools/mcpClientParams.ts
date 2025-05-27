import { z } from "zod";

export const TOOL_NAME_MCP_CLIENT = "mcp_client";

// Tool Description
export const TOOL_DESCRIPTION_MCP_CLIENT = `
Manages MCP (Model Context Protocol) client connections and operations.
Supports connecting to MCP servers via stdio or SSE transports, disconnecting from servers,
listing available tools on connected servers, and calling tools on those servers.
The operation parameter determines which action to perform.
`;

// Operation type enum
export const mcpOperationSchema = z
  .enum([
    "connect_stdio",
    "connect_sse",
    "disconnect",
    "list_tools",
    "call_tool",
  ])
  .describe("The MCP client operation to perform");

// Connect operation parameters - stdio variant
const connectStdioParams = z.object({
  operation: z.literal("connect_stdio"),
  transport: z.literal("stdio"),
  command: z
    .string()
    .describe("The command to execute to start the MCP server"),
  args: z
    .array(z.string())
    .optional()
    .describe("Arguments to pass to the command"),
  clientId: z
    .string()
    .optional()
    .describe("Unique identifier for this client connection"),
  connectionToken: z
    .string()
    .optional()
    .describe("Authentication token for secure connections"),
});

// Connect operation parameters - SSE variant
const connectSseParams = z.object({
  operation: z.literal("connect_sse"),
  transport: z.literal("sse"),
  url: z.string().url().describe("The URL of the SSE MCP server"),
  clientId: z
    .string()
    .optional()
    .describe("Unique identifier for this client connection"),
  connectionToken: z
    .string()
    .optional()
    .describe("Authentication token for secure connections"),
});

// Disconnect operation parameters
const disconnectParams = z.object({
  operation: z.literal("disconnect"),
  connectionId: z
    .string()
    .describe("Required. The ID of the connection to close"),
});

// List tools operation parameters
const listToolsParams = z.object({
  operation: z.literal("list_tools"),
  connectionId: z
    .string()
    .describe("Required. The ID of the connection to query for tools"),
});

// Call tool operation parameters
const callToolParams = z.object({
  operation: z.literal("call_tool"),
  connectionId: z
    .string()
    .describe("Required. The ID of the connection to use"),
  toolName: z.string().describe("Required. The name of the tool to call"),
  toolParameters: z
    .record(z.any())
    .optional()
    .describe("Parameters to pass to the tool"),
  outputFilePath: z
    .string()
    .optional()
    .describe(
      "If provided, writes the tool output to this file path instead of returning it"
    ),
  overwriteFile: z
    .boolean()
    .default(true)
    .describe(
      "Whether to overwrite the output file if it already exists. Defaults to true."
    ),
});

// Combined schema using discriminated union
export const MCP_CLIENT_PARAMS = z.discriminatedUnion("operation", [
  connectStdioParams,
  connectSseParams,
  disconnectParams,
  listToolsParams,
  callToolParams,
]);

// Type for parameter object using zod inference
export type McpClientArgs = z.infer<typeof MCP_CLIENT_PARAMS>;

// Export for use in other modules
export const McpClientParamsModule = {
  TOOL_NAME_MCP_CLIENT,
  TOOL_DESCRIPTION_MCP_CLIENT,
  MCP_CLIENT_PARAMS,
};
