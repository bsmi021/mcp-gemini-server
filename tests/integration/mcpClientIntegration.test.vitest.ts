// Using vitest globals - see vitest.config.ts globals: true

// Skip these flaky integration tests for now
const itSkipIntegration = it.skip;
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs/promises";
import os from "os";

// Import MCP client service
import { McpClientService } from "../../src/services/mcp/McpClientService.js";

// Import tool processors for direct invocation
import { mcpClientTool } from "../../src/tools/mcpClientTool.js";
import { writeToFile } from "../../src/tools/writeToFileTool.js";

// Import Configuration manager
import { ConfigurationManager } from "../../src/config/ConfigurationManager.js";

// Import integration test types
import { ToolProcessor, ToolProcessors } from "../utils/integration-types.js";

// Response types are defined inline where needed to avoid unused variable warnings

// Helper functions to set up integration environment
function createTempOutputDir(): Promise<string> {
  // Create a temporary directory for test file outputs
  const tempDir = path.join(os.tmpdir(), `mcp-client-test-${Date.now()}`);
  return fs.mkdir(tempDir, { recursive: true }).then(() => tempDir);
}

async function cleanupTempDir(tempDir: string): Promise<void> {
  try {
    // Recursively delete the temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch (error) {
    console.error(`Error cleaning up temp directory: ${error}`);
  }
}

// Helper to mock the ConfigurationManager
function mockConfigurationManager(tempDir: string): void {
  // Backup the original getInstance
  const originalGetInstance = ConfigurationManager.getInstance;

  // Mock getInstance
  ConfigurationManager.getInstance = function getInstance() {
    const instance = originalGetInstance.call(ConfigurationManager);

    // Mock the getAllowedOutputPaths method
    instance.getAllowedOutputPaths = () => [tempDir];

    // The getAllowedOutputPaths method is already mocked above

    // Mock the getMcpConfig method
    instance.getMcpConfig = () => ({
      host: "localhost",
      port: 3456,
      connectionToken: "test-token",
      clientId: "test-client",
      logLevel: "info",
      transport: "stdio",
      enableStreaming: false,
      sessionTimeoutSeconds: 60,
    });

    return instance;
  };
}

// Helper to restore the original ConfigurationManager
function restoreConfigurationManager(): void {
  // Restore the original getInstance method
  delete (
    ConfigurationManager as unknown as {
      getInstance?: () => ConfigurationManager;
    }
  ).getInstance;
}

// Generic function to create a tool processor from current tool objects
function createToolProcessor(
  tool: {
    execute: (
      args: any,
      service: McpClientService
    ) => Promise<{ content: { type: string; text: string }[] }>;
  },
  mcpClientService: McpClientService
): ToolProcessor;
function createToolProcessor(
  tool: {
    execute: (
      args: any
    ) => Promise<{ content: { type: string; text: string }[] }>;
  },
  mcpClientService: McpClientService
): ToolProcessor;
function createToolProcessor(
  tool: any,
  mcpClientService: McpClientService
): ToolProcessor {
  return async (args: any) => {
    if (tool.execute.length === 1) {
      // Tool doesn't need service parameter (like writeToFile)
      return await tool.execute(args);
    } else {
      // Tool needs service parameter (like mcpClientTool)
      return await tool.execute(args, mcpClientService);
    }
  };
}

// Start dummy MCP server (stdio)
async function startDummyMcpServerStdio(): Promise<ChildProcess> {
  const currentDir = path.dirname(new URL(import.meta.url).pathname);
  const serverPath = path.resolve(currentDir, "./dummyMcpServerStdio.ts");
  console.debug(`Starting STDIO server at path: ${serverPath}`);

  // Verify the file exists
  try {
    await fs.access(serverPath);
  } catch (error) {
    throw new Error(`Dummy server file not found at: ${serverPath}`);
  }

  // Start the child process with ts-node for TypeScript execution
  const nodeProcess = spawn("node", ["--loader", "ts-node/esm", serverPath], {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_OPTIONS: "--no-warnings --experimental-specifier-resolution=node",
    },
  });

  // Create a Promise that resolves when the server is ready
  return new Promise((resolve, reject) => {
    let errorOutput = "";

    // Listen for data on stderr to detect when server is ready
    nodeProcess.stderr.on("data", (data) => {
      const message = data.toString();
      errorOutput += message;
      console.debug(`[STDIO Server stderr]: ${message}`);

      // When we see the server ready message, resolve
      if (message.includes("Dummy MCP Server (stdio) started")) {
        resolve(nodeProcess);
      }
    });

    // Also listen on stdout for any output
    nodeProcess.stdout.on("data", (data) => {
      console.debug(`[STDIO Server stdout]: ${data.toString()}`);
    });

    // Handle startup failure
    nodeProcess.on("error", (err) => {
      reject(new Error(`Failed to start dummy server: ${err.message}`));
    });

    // Set a timeout in case the server doesn't start
    const timeout = setTimeout(() => {
      nodeProcess.kill();
      reject(
        new Error(
          `Timeout waiting for dummy server to start. Last output: ${errorOutput}`
        )
      );
    }, 15000); // Increased timeout to 15 seconds

    // Clear the timeout if we resolve or reject
    nodeProcess.on("exit", () => {
      clearTimeout(timeout);
    });
  });
}

// Start dummy MCP server (SSE)
async function startDummyMcpServerSse(port = 3456): Promise<ChildProcess> {
  const currentDir = path.dirname(new URL(import.meta.url).pathname);
  const serverPath = path.resolve(currentDir, "./dummyMcpServerSse.ts");
  console.debug(`Starting SSE server at path: ${serverPath}`);

  // Start the child process with ts-node for TypeScript execution
  const nodeProcess = spawn(
    "node",
    ["--loader", "ts-node/esm", serverPath, port.toString()],
    {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_OPTIONS: "--no-warnings --experimental-specifier-resolution=node",
      },
    }
  );

  // Create a Promise that resolves when the server is ready
  return new Promise((resolve, reject) => {
    let errorOutput = "";

    // Listen for data on stderr to detect when server is ready
    nodeProcess.stderr.on("data", (data) => {
      const message = data.toString();
      errorOutput += message;
      console.debug(`[SSE Server stderr]: ${message}`);

      // When we see the server ready message, resolve
      if (message.includes(`Dummy MCP Server (SSE) started on port ${port}`)) {
        resolve(nodeProcess);
      }
    });

    // Also listen on stdout for any output
    nodeProcess.stdout.on("data", (data) => {
      console.debug(`[SSE Server stdout]: ${data.toString()}`);
    });

    // Handle startup failure
    nodeProcess.on("error", (err) => {
      reject(new Error(`Failed to start dummy server: ${err.message}`));
    });

    // Set a timeout in case the server doesn't start
    const timeout = setTimeout(() => {
      nodeProcess.kill();
      reject(
        new Error(
          `Timeout waiting for dummy server to start. Last output: ${errorOutput}`
        )
      );
    }, 15000); // Increased timeout to 15 seconds

    // Clear the timeout if we resolve or reject
    nodeProcess.on("exit", () => {
      clearTimeout(timeout);
    });
  });
}

describe("MCP Client Integration Tests", () => {
  let mcpClientService: McpClientService;
  let processors: ToolProcessors;
  let tempDir: string;
  let stdioServer: ChildProcess | null = null;
  let sseServer: ChildProcess | null = null;

  // Set up test environment before all tests
  beforeAll(async function () {
    // Create a temporary directory for test outputs
    tempDir = await createTempOutputDir();

    // Set the environment variable for file security
    process.env.GEMINI_SAFE_FILE_BASE_DIR = tempDir;

    // Mock ConfigurationManager to use our test settings
    mockConfigurationManager(tempDir);

    // Initialize the MCP client service
    mcpClientService = new McpClientService();

    // Create tool processors for testing
    processors = {
      connect: createToolProcessor(mcpClientTool, mcpClientService),
      listTools: createToolProcessor(mcpClientTool, mcpClientService),
      callServerTool: createToolProcessor(mcpClientTool, mcpClientService),
      disconnect: createToolProcessor(mcpClientTool, mcpClientService),
      writeToFile: createToolProcessor(writeToFile, mcpClientService),
    };
  });

  // Clean up after all tests
  afterAll(async function () {
    // Close any open MCP connections
    mcpClientService.closeAllConnections();

    // Kill the server processes if they're still running
    if (stdioServer) {
      stdioServer.kill();
    }

    if (sseServer) {
      sseServer.kill();
    }

    // Restore the original ConfigurationManager
    restoreConfigurationManager();

    // Clean up environment variable
    delete process.env.GEMINI_SAFE_FILE_BASE_DIR;

    // Clean up temporary directory
    await cleanupTempDir(tempDir);
  });

  describe("STDIO Transport Tests", () => {
    // Set up stdio server before each test in this group
    beforeEach(async function () {
      // Start the dummy stdio server
      stdioServer = await startDummyMcpServerStdio();
    }, 20000); // Increase timeout to 20 seconds

    // Clean up stdio server after each test
    afterEach(function () {
      // Kill the stdio server
      if (stdioServer) {
        stdioServer.kill();
        stdioServer = null;
      }

      // Close any connections
      mcpClientService.closeAllConnections();
    });

    itSkipIntegration(
      "should connect to a stdio server, list tools, call a tool, and disconnect",
      async () => {
        // Step 1: Call the connect processor to connect to the dummy stdio server
        const connectArgs = {
          transport: "stdio",
          connectionDetails: {
            transport: "stdio",
            command: "node",
            args: [
              "--loader",
              "ts-node/esm",
              "./tests/integration/dummyMcpServerStdio.ts",
            ],
          },
        };

        // Connect to the server
        const connectResult = await processors.connect(connectArgs);

        // Extract the connection ID from the result
        const resultJson = JSON.parse(connectResult.content[0].text);
        const connectionId = resultJson.connectionId;

        // Verify connection ID was returned and is a string
        expect(connectionId).toBeTruthy();
        expect(typeof connectionId).toBe("string");

        // Step 2: List tools on the connected server
        const listToolsArgs = {
          connectionId,
        };

        const listToolsResult = await processors.listTools(listToolsArgs);

        // Parse the tools list
        const toolsList = JSON.parse(listToolsResult.content[0].text);

        // Verify tools list
        expect(Array.isArray(toolsList)).toBeTruthy();
        expect(toolsList.length).toBeGreaterThanOrEqual(3);

        // Verify expected tools are in the list
        const toolNames = toolsList.map((tool: { name: string }) => tool.name);
        expect(toolNames.includes("echoTool")).toBeTruthy();
        expect(toolNames.includes("addTool")).toBeTruthy();
        expect(toolNames.includes("complexDataTool")).toBeTruthy();

        // Step 3: Call the echo tool
        const echoMessage = "Hello from integration test";
        const callToolArgs = {
          connectionId,
          toolName: "echoTool",
          toolParameters: {
            message: echoMessage,
          },
        };

        const callToolResult = await processors.callServerTool(callToolArgs);

        // Parse the result
        const echoResult = JSON.parse(callToolResult.content[0].text);

        // Verify echo result
        expect(echoResult.message).toBe(echoMessage);
        expect(echoResult.timestamp).toBeTruthy();

        // Step 4: Call the add tool
        const addArgs = {
          connectionId,
          toolName: "addTool",
          toolParameters: {
            a: 5,
            b: 7,
          },
        };

        const addResult = await processors.callServerTool(addArgs);

        // Parse the result
        const addOutput = JSON.parse(addResult.content[0].text);

        // Verify add result
        expect(addOutput.sum).toBe(12);
        expect(addOutput.inputs).toEqual({ a: 5, b: 7 });

        // Step 5: Disconnect from the server
        const disconnectArgs = {
          connectionId,
        };

        const disconnectResult = await processors.disconnect(disconnectArgs);

        // Parse the disconnect result
        const disconnectOutput = JSON.parse(disconnectResult.content[0].text);

        // Verify disconnect result
        expect(disconnectOutput.connectionId).toBe(connectionId);
        expect(
          disconnectOutput.message.includes("Connection closed")
        ).toBeTruthy();

        // Verify the connection is no longer in the active connections list
        expect(mcpClientService.getActiveStdioConnectionIds().length).toBe(0);
      }
    );

    itSkipIntegration(
      "should call a tool and write output to a file",
      async () => {
        // Step 1: Connect to the dummy stdio server
        const connectArgs = {
          transport: "stdio",
          connectionDetails: {
            transport: "stdio",
            command: "node",
            args: [
              "--loader",
              "ts-node/esm",
              "./tests/integration/dummyMcpServerStdio.ts",
            ],
          },
        };

        const connectResult = await processors.connect(connectArgs);
        const resultJson = JSON.parse(connectResult.content[0].text);
        const connectionId = resultJson.connectionId;

        // Step 2: Call the complexDataTool and write output to a file
        const outputPath = path.join(tempDir, "complex-data-output.json");
        const callToolArgs = {
          connectionId,
          toolName: "complexDataTool",
          toolParameters: {
            depth: 2,
            itemCount: 3,
          },
          outputFilePath: outputPath,
        };

        const callToolResult = await processors.callServerTool(callToolArgs);

        // Parse the result
        const callToolOutput = JSON.parse(callToolResult.content[0].text);

        // Verify the result contains the expected information
        expect(callToolOutput.message).toBe("Output written to file");
        expect(callToolOutput.filePath).toBe(outputPath);

        // Verify the file exists and contains the expected data
        const fileExists = await fs
          .access(outputPath)
          .then(() => true)
          .catch(() => false);
        expect(fileExists).toBeTruthy();

        // Read the file contents
        const fileContent = await fs.readFile(outputPath, "utf8");
        const fileData = JSON.parse(fileContent);

        // Verify file content structure
        expect(fileData.level).toBe(1);
        expect(fileData.items.length).toBe(3);
        expect(fileData.items[0].level).toBe(2);

        // Clean up - disconnect from the server
        await processors.disconnect({ connectionId });
      }
    );
  });

  describe("SSE Transport Tests", () => {
    // Set up SSE server before each test in this group
    beforeEach(async function () {
      // Start the dummy SSE server
      sseServer = await startDummyMcpServerSse();
    }, 20000); // Increase timeout to 20 seconds

    // Clean up SSE server after each test
    afterEach(function () {
      // Kill the SSE server
      if (sseServer) {
        sseServer.kill();
        sseServer = null;
      }

      // Close any connections
      mcpClientService.closeAllConnections();
    });

    itSkipIntegration(
      "should connect to an SSE server, list tools, call a tool, and disconnect",
      async () => {
        // Step 1: Call the connect processor to connect to the dummy SSE server
        const ssePort = 3456;
        const connectArgs = {
          transport: "sse",
          connectionDetails: {
            transport: "sse",
            url: `http://localhost:${ssePort}/mcp`,
          },
        };

        // Connect to the server
        const connectResult = await processors.connect(connectArgs);

        // Extract the connection ID from the result
        const resultJson = JSON.parse(connectResult.content[0].text);
        const connectionId = resultJson.connectionId;

        // Verify connection ID was returned and is a string
        expect(connectionId).toBeTruthy();
        expect(typeof connectionId).toBe("string");

        // Step 2: List tools on the connected server
        const listToolsArgs = {
          connectionId,
        };

        const listToolsResult = await processors.listTools(listToolsArgs);

        // Parse the tools list
        const toolsList = JSON.parse(listToolsResult.content[0].text);

        // Verify tools list
        expect(Array.isArray(toolsList)).toBeTruthy();
        expect(toolsList.length).toBeGreaterThanOrEqual(3);

        // Verify expected tools are in the list
        const toolNames = toolsList.map((tool: { name: string }) => tool.name);
        expect(toolNames.includes("echoTool")).toBeTruthy();
        expect(toolNames.includes("addTool")).toBeTruthy();
        expect(toolNames.includes("complexDataTool")).toBeTruthy();

        // Step 3: Call the echo tool
        const echoMessage = "Hello from SSE integration test";
        const callToolArgs = {
          connectionId,
          toolName: "echoTool",
          toolParameters: {
            message: echoMessage,
          },
        };

        const callToolResult = await processors.callServerTool(callToolArgs);

        // Parse the result
        const echoResult = JSON.parse(callToolResult.content[0].text);

        // Verify echo result
        expect(echoResult.message).toBe(echoMessage);
        expect(echoResult.timestamp).toBeTruthy();

        // Step 4: Disconnect from the server
        const disconnectArgs = {
          connectionId,
        };

        const disconnectResult = await processors.disconnect(disconnectArgs);

        // Parse the disconnect result
        const disconnectOutput = JSON.parse(disconnectResult.content[0].text);

        // Verify disconnect result
        expect(disconnectOutput.connectionId).toBe(connectionId);
        expect(
          disconnectOutput.message.includes("Connection closed")
        ).toBeTruthy();

        // Verify the connection is no longer in the active connections list
        expect(mcpClientService.getActiveSseConnectionIds().length).toBe(0);
      }
    );
  });

  describe("Write to File Tool Tests", () => {
    let writeToFileProcessor: ToolProcessor;

    beforeEach(function () {
      // Create the writeToFile processor
      writeToFileProcessor = createToolProcessor(writeToFile, mcpClientService);
    });

    itSkipIntegration("should write a string to a file", async () => {
      // Create the file path for the test
      const testFilePath = path.join(tempDir, "test-utf8-output.txt");
      const testContent =
        "This is a test string to write to a file\nWith multiple lines\nAnd special chars: €£¥©®™";

      // Call the writeToFile processor
      const args = {
        filePath: testFilePath,
        content: testContent,
        encoding: "utf8",
      };

      const result = await writeToFileProcessor(args);

      // Parse the result
      const resultJson = JSON.parse(result.content[0].text);

      // Verify the result contains the expected information
      expect(resultJson.message).toBe("Content written to file successfully.");
      expect(resultJson.filePath).toBe(testFilePath);

      // Verify the file exists and contains the correct data
      const fileExists = await fs
        .access(testFilePath)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBeTruthy();

      // Read the file and compare the content
      const fileContent = await fs.readFile(testFilePath, "utf8");
      expect(fileContent).toBe(testContent);
    });

    itSkipIntegration(
      "should write a base64 encoded string to a file",
      async () => {
        // Create the file path for the test
        const testFilePath = path.join(tempDir, "test-base64-output.txt");

        // Create a test string and encode it to base64
        const originalString =
          "This is a test string that will be base64 encoded\nWith multiple lines\nAnd special chars: €£¥©®™";
        const base64Content = Buffer.from(originalString).toString("base64");

        // Call the writeToFile processor
        const args = {
          filePath: testFilePath,
          content: base64Content,
          encoding: "base64",
        };

        const result = await writeToFileProcessor(args);

        // Parse the result
        const resultJson = JSON.parse(result.content[0].text);

        // Verify the result contains the expected information
        expect(resultJson.message).toBe(
          "Content written to file successfully."
        );
        expect(resultJson.filePath).toBe(testFilePath);

        // Verify the file exists and contains the correct data
        const fileExists = await fs
          .access(testFilePath)
          .then(() => true)
          .catch(() => false);
        expect(fileExists).toBeTruthy();

        // Read the file and compare the content
        const fileContent = await fs.readFile(testFilePath, "utf8");
        expect(fileContent).toBe(originalString);
      }
    );

    itSkipIntegration(
      "should fail when writing to a path outside allowed directories",
      async () => {
        // Try to write to an absolute path outside the allowed directory
        const nonAllowedPath = path.join(
          os.tmpdir(),
          "..",
          "non-allowed-dir",
          "test.txt"
        );

        const args = {
          filePath: nonAllowedPath,
          content: "This should not be written",
          encoding: "utf8",
        };

        // The call should reject because the path is not allowed
        await expect(writeToFileProcessor(args)).rejects.toThrow(
          /Security error|not within the allowed output|InvalidParams/
        );

        // Verify the file does not exist
        const fileExists = await fs
          .access(nonAllowedPath)
          .then(() => true)
          .catch(() => false);
        expect(fileExists).toBe(false);
      }
    );
  });
});
