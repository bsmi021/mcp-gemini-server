#!/usr/bin/env node

// Import the MCP SDK server module
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Create a new MCP server
const server = new McpServer({
  name: "dummy-mcp-server-stdio",
  version: "1.0.0",
  description: "A dummy MCP server for testing stdio transport",
});

// Register an echo tool
server.tool(
  "echoTool",
  "A tool that echoes back the input message",
  {
    message: z.string().describe("The message to echo"),
  },
  async (args: unknown) => {
    const typedArgs = args as { message: string };
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              message: typedArgs.message,
              timestamp: new Date().toISOString(),
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Register an add tool
server.tool(
  "addTool",
  "A tool that adds two numbers",
  {
    a: z.number().describe("First number"),
    b: z.number().describe("Second number"),
  },
  async (args: unknown) => {
    const typedArgs = args as { a: number; b: number };
    const sum = typedArgs.a + typedArgs.b;
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              sum,
              inputs: { a: typedArgs.a, b: typedArgs.b },
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Register a complex data tool that returns a nested JSON structure
server.tool(
  "complexDataTool",
  "A tool that returns a complex JSON structure",
  {
    depth: z
      .number()
      .optional()
      .describe("Depth of nested objects to generate"),
    itemCount: z
      .number()
      .optional()
      .describe("Number of items to generate in arrays"),
  },
  async (args: unknown) => {
    const typedArgs = args as { depth?: number; itemCount?: number };
    const depth = typedArgs.depth || 3;
    const itemCount = typedArgs.itemCount || 2;

    // Generate a nested structure of specified depth
    function generateNestedData(currentDepth: number): any {
      if (currentDepth <= 0) {
        return { value: "leaf data" };
      }

      const result = {
        level: depth - currentDepth + 1,
        timestamp: new Date().toISOString(),
        items: [] as any[],
      };

      for (let i = 0; i < itemCount; i++) {
        result.items.push(generateNestedData(currentDepth - 1));
      }

      return result;
    }

    const data = generateNestedData(depth);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }
);

// Connect a stdio transport
async function startServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log a message to stderr
  console.error("Dummy MCP Server (stdio) started");
}

startServer().catch(console.error);
