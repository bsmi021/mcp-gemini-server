#!/usr/bin/env node

// Import the MCP SDK server module
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import express, { Request, Response } from "express";
import cors from "cors";
import { Server } from "http";

// Create a new MCP server
const server = new McpServer({
  name: "dummy-mcp-server-sse",
  version: "1.0.0",
  description: "A dummy MCP server for testing SSE transport",
});

// Register the same tools as in the stdio version
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

// Create Express app and add CORS middleware
const app = express();
app.use(cors());
app.use(express.json());

// Get port from command line argument or environment or default to 3456
const port = Number(process.argv[2]) || Number(process.env.PORT) || 3456;

// Create HTTP server
const httpServer: Server = app.listen(port, () => {
  console.error(`Dummy MCP Server (SSE) started on port ${port}`);
});

// Set up SSE endpoint
app.get("/mcp", async (_req: Request, res: Response) => {
  // Create SSE transport for this connection
  const transport = new SSEServerTransport("/mcp", res);
  await transport.start();

  // Connect to MCP server
  await server.connect(transport);
});

// Set up POST endpoint for receiving messages
app.post("/mcp", async (_req: Request, res: Response) => {
  try {
    // The SSE transport expects messages to be posted here
    // but we need to handle this in the context of an active SSE connection
    res.status(200).json({ status: "ok" });
  } catch (error: unknown) {
    console.error("Error handling POST request:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: errorMessage });
  }
});

// Add a handler for Ctrl+C to properly shut down the server
process.on("SIGINT", () => {
  console.error("Shutting down Dummy MCP Server (SSE)...");
  httpServer.close(() => {
    process.exit(0);
  });
});
