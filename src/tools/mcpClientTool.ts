import { McpClientService, ConnectionDetails } from "../services/index.js";
import { logger } from "../utils/index.js";
import {
  TOOL_NAME_MCP_CLIENT,
  TOOL_DESCRIPTION_MCP_CLIENT,
  MCP_CLIENT_PARAMS,
  McpClientArgs,
} from "./mcpClientParams.js";
import { mapAnyErrorToMcpError } from "../utils/errors.js";
import { ConfigurationManager } from "../config/ConfigurationManager.js";
import { v4 as uuidv4 } from "uuid";
import { writeToFile } from "./writeToFileTool.js";

/**
 * Handles MCP client operations including connect, disconnect, list tools, and call tool.
 * The operation is determined by the operation parameter.
 */
export const mcpClientTool = {
  name: TOOL_NAME_MCP_CLIENT,
  description: TOOL_DESCRIPTION_MCP_CLIENT,
  inputSchema: MCP_CLIENT_PARAMS,
  execute: async (args: McpClientArgs, mcpClientService: McpClientService) => {
    logger.debug(`Received ${TOOL_NAME_MCP_CLIENT} request:`, {
      operation: args.operation,
    });

    try {
      switch (args.operation) {
        case "connect_stdio":
        case "connect_sse": {
          // Get the MCP config for default values
          const mcpConfig = ConfigurationManager.getInstance().getMcpConfig();

          // Get clientId from args or config
          const clientId = args.clientId || mcpConfig.clientId;

          logger.info(
            `Establishing MCP connection using ${args.transport} transport with client ID: ${clientId}`
          );

          // Create a unique server ID for this connection
          const serverId = uuidv4();

          // Prepare connection details object
          const connectionDetailsObject: ConnectionDetails = {
            type: args.transport,
            connectionToken: args.connectionToken || mcpConfig.connectionToken,
            ...(args.transport === "stdio"
              ? {
                  stdioCommand: args.command,
                  stdioArgs: args.args || [],
                }
              : {
                  sseUrl: args.url,
                }),
          };

          // Connect to the server
          const connectionId = await mcpClientService.connect(
            serverId,
            connectionDetailsObject
          );

          // Get server info after successful connection
          const serverInfo = await mcpClientService.getServerInfo(connectionId);

          return {
            content: [
              {
                type: "text",
                text: `Successfully connected to MCP server`,
              },
              {
                type: "text",
                text: JSON.stringify(
                  {
                    connectionId,
                    serverId,
                    transport: args.transport,
                    connectionType: connectionDetailsObject.type,
                    serverInfo,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case "disconnect": {
          // Disconnect from the server
          await mcpClientService.disconnect(args.connectionId);

          return {
            content: [
              {
                type: "text",
                text: `Successfully disconnected from MCP server`,
              },
              {
                type: "text",
                text: JSON.stringify(
                  {
                    connectionId: args.connectionId,
                    status: "disconnected",
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case "list_tools": {
          // List tools from the connected server
          const tools = await mcpClientService.listTools(args.connectionId);

          return {
            content: [
              {
                type: "text",
                text: `Available tools on connection ${args.connectionId}:`,
              },
              {
                type: "text",
                text: JSON.stringify(tools, null, 2),
              },
            ],
          };
        }

        case "call_tool": {
          // Call a tool on the connected server
          const result = await mcpClientService.callTool(
            args.connectionId,
            args.toolName,
            args.toolParameters || {}
          );

          // Check if we should write to file
          if (args.outputFilePath) {
            await writeToFile.execute({
              filePath: args.outputFilePath,
              content:
                typeof result === "string"
                  ? result
                  : JSON.stringify(result, null, 2),
              overwriteIfExists: args.overwriteFile,
            });

            return {
              content: [
                {
                  type: "text",
                  text: `Tool ${args.toolName} executed successfully. Output written to: ${args.outputFilePath}`,
                },
              ],
            };
          }

          // Return the result directly
          return {
            content: [
              {
                type: "text",
                text:
                  typeof result === "string"
                    ? result
                    : JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        default:
          // This should never happen due to discriminated union
          throw new Error(`Unknown operation: ${JSON.stringify(args)}`);
      }
    } catch (error: unknown) {
      logger.error(`Error processing ${TOOL_NAME_MCP_CLIENT}:`, error);
      throw mapAnyErrorToMcpError(error, TOOL_NAME_MCP_CLIENT);
    }
  },
};
