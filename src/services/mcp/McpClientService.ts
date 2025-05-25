import { logger } from "../../utils/index.js";
import { spawn, ChildProcess } from "child_process";
import EventSource from "eventsource";
import {
  McpError as SdkMcpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import { v4 as uuidv4 } from "uuid";
// Import node-fetch types only
// We'll dynamically import the actual implementation later to handle CJS/ESM compatibility
import type { Response, RequestInit } from "node-fetch";

// Define custom types for EventSource events since the eventsource package
// doesn't export its own types
interface ESMessageEvent {
  data: string;
  type: string;
  lastEventId: string;
  origin: string;
}

interface ESErrorEvent {
  type: string;
  message?: string;
  error?: Error;
}

// Add appropriate error handler typings
type ESErrorHandler = (event: ESErrorEvent) => void;
type ESMessageHandler = (event: ESMessageEvent) => void;

// Extended EventSource interface to properly type the handlers
interface ExtendedEventSource extends EventSource {
  onopen: (this: EventSource, ev: MessageEvent<unknown>) => unknown;
  onmessage: (this: EventSource, ev: MessageEvent) => unknown;
  onerror: (this: EventSource, ev: Event) => unknown;
}

export interface McpRequest {
  id: string;
  method: "listTools" | "callTool" | "initialize";
  params?: Record<string, unknown>;
}

export interface McpResponseError {
  code: number;
  message: string;
  data?: Record<string, unknown>;
}

export interface McpResponse {
  id: string;
  result?: Record<string, unknown> | Array<unknown>;
  error?: McpResponseError;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parametersSchema: Record<string, unknown>; // JSON Schema object
}

export interface ConnectionDetails {
  type: "sse" | "stdio";
  sseUrl?: string;
  stdioCommand?: string;
  stdioArgs?: string[];
  connectionToken?: string;
}

// Re-export SDK McpError under the local name used throughout this file
type McpError = SdkMcpError;
const McpError = SdkMcpError;

/**
 * Service for connecting to external Model Context Protocol (MCP) servers.
 * Provides methods to establish different types of connections (SSE, stdio).
 */
export class McpClientService {
  // Maps to store active connections
  private activeSseConnections: Map<
    string,
    {
      eventSource: EventSource;
      baseUrl: string;
      lastActivityTimestamp: number; // Track when connection was last used
    }
  >;
  private activeStdioConnections: Map<
    string,
    {
      process: ChildProcess;
      lastActivityTimestamp: number; // Track when connection was last used
    }
  >;
  private pendingStdioRequests: Map<
    string, // connectionId
    Map<
      string,
      {
        resolve: (value: Record<string, unknown> | Array<unknown>) => void;
        reject: (reason: Error | McpError) => void;
      }
    > // requestId -> handlers
  > = new Map();

  // Configuration values
  private static readonly DEFAULT_REQUEST_TIMEOUT_MS = 30000; // 30 seconds
  private static readonly DEFAULT_CONNECTION_MAX_IDLE_MS = 600000; // 10 minutes
  private static readonly CONNECTION_CLEANUP_INTERVAL_MS = 300000; // Check every 5 minutes

  /**
   * Helper method to fetch with timeout
   * @param url - The URL to fetch
   * @param options - Fetch options
   * @param timeoutMs - Timeout in milliseconds
   * @param timeoutMessage - Message to include in timeout error
   * @returns The fetch response
   * @throws {SdkMcpError} - If the request times out
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs = McpClientService.DEFAULT_REQUEST_TIMEOUT_MS,
    timeoutMessage = "Request timed out"
  ): Promise<Response> {
    // Create controller for aborting the fetch
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Add the signal to the options
      const fetchOptions = {
        ...options,
        signal: controller.signal,
      };

      // Dynamically import node-fetch (v2 is CommonJS)
      const nodeFetch = await import("node-fetch");
      const fetch = nodeFetch.default;

      // Make the fetch request
      const response = await fetch(url, fetchOptions);
      clearTimeout(id);
      return response;
    } catch (error) {
      clearTimeout(id);
      throw new SdkMcpError(
        ErrorCode.InternalError,
        `${timeoutMessage} after ${timeoutMs}ms`
      );
    }
  }

  // Cleanup timer reference
  private cleanupIntervalId?: NodeJS.Timeout;

  constructor() {
    this.activeSseConnections = new Map();
    this.activeStdioConnections = new Map();
    logger.info("McpClientService initialized.");

    // Start the connection cleanup interval
    this.cleanupIntervalId = setInterval(
      () => this.cleanupStaleConnections(),
      McpClientService.CONNECTION_CLEANUP_INTERVAL_MS
    );
  }

  /**
   * Cleans up stale connections that haven't been used for a while
   * @private
   */
  private cleanupStaleConnections(): void {
    const now = Date.now();
    const maxIdleTime = McpClientService.DEFAULT_CONNECTION_MAX_IDLE_MS;
    let closedCount = 0;

    // Check SSE connections
    for (const [
      connectionId,
      { lastActivityTimestamp },
    ] of this.activeSseConnections.entries()) {
      if (now - lastActivityTimestamp > maxIdleTime) {
        logger.info(
          `Closing stale SSE connection ${connectionId} (idle for ${Math.floor((now - lastActivityTimestamp) / 1000)} seconds)`
        );
        this.closeSseConnection(connectionId);
        closedCount++;
      }
    }

    // Check stdio connections
    for (const [
      connectionId,
      { lastActivityTimestamp },
    ] of this.activeStdioConnections.entries()) {
      if (now - lastActivityTimestamp > maxIdleTime) {
        logger.info(
          `Closing stale stdio connection ${connectionId} (idle for ${Math.floor((now - lastActivityTimestamp) / 1000)} seconds)`
        );
        this.closeStdioConnection(connectionId);
        closedCount++;
      }
    }

    if (closedCount > 0) {
      logger.info(`Cleaned up ${closedCount} stale connections`);
    }
  }

  /**
   * Validates a server ID.
   * @param serverId - The server ID to validate.
   * @throws {McpError} Throws an error if the server ID is invalid.
   */
  private validateServerId(serverId: string): void {
    if (!serverId || typeof serverId !== "string" || serverId.trim() === "") {
      throw new McpError(
        ErrorCode.InvalidParams,
        "Server ID must be a non-empty string"
      );
    }
  }

  /**
   * Checks if a connection exists for the given server ID.
   * @param serverId - The server ID to check.
   * @throws {McpError} Throws an error if the connection doesn't exist.
   */
  private validateConnectionExists(serverId: string): void {
    if (
      !this.activeSseConnections.has(serverId) &&
      !this.activeStdioConnections.has(serverId)
    ) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Connection not found for serverId: ${serverId}`
      );
    }
  }

  /**
   * Establishes a connection to an MCP server.
   * @param serverId - A unique identifier provided by the caller to reference this server connection.
   *                   Note: This is NOT used as the internal connection tracking ID.
   * @param connectionDetails - The details for establishing the connection.
   * @param messageHandler - Optional callback for handling received messages.
   * @returns A promise that resolves to a connection ID (different from serverId) when the connection is established.
   *          This returned connectionId should be used for all subsequent interactions with this connection.
   * @throws {McpError} Throws an error if the parameters are invalid.
   */
  public async connect(
    serverId: string,
    connectionDetails: ConnectionDetails,
    messageHandler?: (data: unknown) => void
  ): Promise<string> {
    // Validate serverId
    this.validateServerId(serverId);

    // Validate connectionDetails
    if (!connectionDetails || typeof connectionDetails !== "object") {
      throw new McpError(
        ErrorCode.InvalidParams,
        "Connection details must be an object"
      );
    }

    // Validate connection type
    if (
      connectionDetails.type !== "sse" &&
      connectionDetails.type !== "stdio"
    ) {
      throw new McpError(
        ErrorCode.InvalidParams,
        "Connection type must be 'sse' or 'stdio'"
      );
    }

    // Validate SSE connection details
    if (connectionDetails.type === "sse") {
      if (
        !connectionDetails.sseUrl ||
        typeof connectionDetails.sseUrl !== "string" ||
        connectionDetails.sseUrl.trim() === ""
      ) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "For SSE connections, sseUrl must be a non-empty string"
        );
      }

      // Basic URL format validation
      if (
        !connectionDetails.sseUrl.startsWith("http://") &&
        !connectionDetails.sseUrl.startsWith("https://")
      ) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "sseUrl must be a valid URL format starting with http:// or https://"
        );
      }

      return this.connectSse(
        connectionDetails.sseUrl,
        connectionDetails.connectionToken,
        messageHandler
      );
    }
    // Validate stdio connection details
    else if (connectionDetails.type === "stdio") {
      if (
        !connectionDetails.stdioCommand ||
        typeof connectionDetails.stdioCommand !== "string" ||
        connectionDetails.stdioCommand.trim() === ""
      ) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "For stdio connections, stdioCommand must be a non-empty string"
        );
      }

      return this.connectStdio(
        connectionDetails.stdioCommand,
        connectionDetails.stdioArgs || [],
        connectionDetails.connectionToken,
        messageHandler
      );
    }

    // This should never be reached due to the type check above
    throw new McpError(
      ErrorCode.InvalidParams,
      "Invalid connection type specified"
    );
  }

  /**
   * Establishes an SSE connection to the specified MCP server.
   * @param url - The URL of the MCP server to connect to.
   * @param connectionToken - Optional token for authentication with the server.
   * @param messageHandler - Optional callback for handling received messages.
   * @returns A promise that resolves to a connection ID when the connection is established.
   */
  private connectSse(
    url: string,
    connectionToken?: string,
    messageHandler?: (data: unknown) => void
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      logger.info(`Connecting to MCP server via SSE: ${url}`);

      try {
        // Generate a unique connectionId for internal tracking
        // This will be different from the serverId passed to the connect() method
        const connectionId = uuidv4();

        // Create a timeout for the connection attempt
        const connectionTimeout = setTimeout(() => {
          reject(
            new SdkMcpError(
              ErrorCode.InternalError,
              `Connection timeout while attempting to connect to ${url}`
            )
          );
        }, McpClientService.DEFAULT_REQUEST_TIMEOUT_MS);

        // Add connectionToken to headers if provided
        const options: EventSource.EventSourceInitDict = {};
        if (connectionToken) {
          logger.debug(`Adding connection token to SSE request`);
          options.headers = {
            Authorization: `Bearer ${connectionToken}`,
          };
        }

        // Create EventSource for SSE connection with options
        const eventSource = new EventSource(url, options);

        // Handler functions to store for proper cleanup
        const onOpen = () => {
          // Clear the connection timeout
          clearTimeout(connectionTimeout);

          logger.info(`SSE connection established to ${url}`);
          this.activeSseConnections.set(connectionId, {
            eventSource,
            baseUrl: url,
            lastActivityTimestamp: Date.now(),
          });
          resolve(connectionId);
        };

        const onMessage = ((event: ESMessageEvent) => {
          logger.debug(`SSE message received from ${url}:`, event.data);

          // Update the last activity timestamp
          const connection = this.activeSseConnections.get(connectionId);
          if (connection) {
            connection.lastActivityTimestamp = Date.now();
          }

          if (messageHandler) {
            try {
              const parsedData = JSON.parse(event.data);
              messageHandler(parsedData);
            } catch (error) {
              logger.error(`Error parsing SSE message:`, error);
              messageHandler(event.data);
            }
          }
        }) as ESMessageHandler;

        const onError = ((error: ESErrorEvent) => {
          // Clear the connection timeout if it's still pending
          clearTimeout(connectionTimeout);

          logger.error(
            `SSE connection error for ${url}:`,
            error.message || "Unknown error"
          );

          if (!this.activeSseConnections.has(connectionId)) {
            // If we haven't resolved yet, this is a connection failure
            reject(
              new SdkMcpError(
                ErrorCode.InternalError,
                `Failed to establish SSE connection to ${url}: ${error.message || "Unknown error"}`
              )
            );
          } else if (eventSource.readyState === EventSource.CLOSED) {
            // Connection was established but is now closed
            logger.info(`SSE connection ${connectionId} closed due to error.`);
            this.activeSseConnections.delete(connectionId);
          } else {
            // Connection is still open but had an error
            logger.warn(
              `SSE connection ${connectionId} had an error but is still open. Monitoring for further issues.`
            );
          }
        }) as ESErrorHandler;

        // Set up event handlers
        eventSource.onopen = onOpen;
        eventSource.onmessage = onMessage;
        eventSource.onerror = onError;
      } catch (error) {
        logger.error(`Error creating SSE connection to ${url}:`, error);
        reject(error);
      }
    });
  }

  /**
   * Closes an SSE connection.
   * @param connectionId - The ID of the connection to close.
   * @returns True if the connection was closed, false if it wasn't found.
   */
  public closeSseConnection(connectionId: string): boolean {
    const connection = this.activeSseConnections.get(connectionId);
    if (connection) {
      // Close the EventSource and remove listeners
      const eventSource = connection.eventSource;

      // Clean up event listeners by setting handlers to empty functions
      // (EventSource doesn't support removeEventListener)
      (eventSource as ExtendedEventSource).onopen = () => {};
      (eventSource as ExtendedEventSource).onmessage = () => {};
      (eventSource as ExtendedEventSource).onerror = () => {};

      // Close the connection
      eventSource.close();

      // Remove from active connections
      this.activeSseConnections.delete(connectionId);

      // Clean up any pending requests for this connection (this shouldn't generally happen for SSE)
      this.cleanupPendingRequestsForConnection(connectionId);

      logger.info(`SSE connection ${connectionId} closed.`);
      return true;
    }
    logger.warn(
      `Attempted to close non-existent SSE connection: ${connectionId}`
    );
    return false;
  }

  /**
   * Helper method to clean up pending requests for a connection
   * @param connectionId - The ID of the connection to clean up pending requests for
   */
  private cleanupPendingRequestsForConnection(connectionId: string): void {
    // If there are any pending requests for this connection, reject them all
    if (this.pendingStdioRequests.has(connectionId)) {
      const pendingRequests = this.pendingStdioRequests.get(connectionId)!;
      for (const [
        requestId,
        { reject: rejectRequest },
      ] of pendingRequests.entries()) {
        logger.warn(
          `Rejecting pending request ${requestId} due to connection cleanup`
        );
        rejectRequest(
          new McpError(
            ErrorCode.InternalError,
            `Connection closed during cleanup before response was received`
          )
        );
      }
      // Clean up the map entry
      this.pendingStdioRequests.delete(connectionId);
    }
  }

  /**
   * Establishes a stdio connection using the specified command.
   * @param command - The command to execute for stdio connection.
   * @param args - Arguments to pass to the command.
   * @param connectionToken - Optional token for authentication with the server.
   * @param messageHandler - Optional callback for handling stdout data.
   * @returns A promise that resolves to a connection ID when the process is spawned.
   */
  private connectStdio(
    command: string,
    args: string[] = [],
    connectionToken?: string,
    messageHandler?: (data: unknown) => void
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      logger.info(
        `Connecting to MCP server via stdio using command: ${command} ${args.join(" ")}`
      );

      try {
        // Generate a unique connectionId for internal tracking
        // This will be different from the serverId passed to the connect() method
        const connectionId = uuidv4();

        // Create a timeout for the connection establishment
        const connectionTimeout = setTimeout(() => {
          reject(
            new SdkMcpError(
              ErrorCode.InternalError,
              `Timeout while establishing stdio connection for command: ${command}`
            )
          );
        }, McpClientService.DEFAULT_REQUEST_TIMEOUT_MS);

        // Prepare the environment for the child process
        const env = { ...process.env };

        // Add connectionToken to environment if provided
        if (connectionToken) {
          logger.debug("Adding connection token to stdio environment");
          env.MCP_CONNECTION_TOKEN = connectionToken;
        }

        // Spawn the child process with environment
        const childProcess = spawn(command, args, {
          stdio: "pipe",
          env: env,
        });

        // Store the connection with timestamp
        this.activeStdioConnections.set(connectionId, {
          process: childProcess,
          lastActivityTimestamp: Date.now(),
        });

        // Buffer to accumulate data chunks
        let buffer = "";

        // We'll mark connection as established when the process is ready
        const connectionEstablished = () => {
          clearTimeout(connectionTimeout);
          logger.info(`Stdio connection established for ${command}`);
          resolve(connectionId);
        };

        // Data handler function for stdout
        const onStdoutData = (data: Buffer) => {
          // Update the last activity timestamp to prevent cleanup
          const connection = this.activeStdioConnections.get(connectionId);
          if (connection) {
            connection.lastActivityTimestamp = Date.now();
          }

          // Append the new data to our buffer
          buffer += data.toString();
          logger.debug(
            `Stdio stdout from ${command} (raw chunk):`,
            data.toString()
          );

          // Process complete lines in the buffer
          let newlineIndex;
          while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
            // Extract the line (excluding the newline)
            const line = buffer.substring(0, newlineIndex);
            // Remove the processed line from the buffer (including the newline)
            buffer = buffer.substring(newlineIndex + 1);

            // Skip empty lines
            if (!line.trim()) continue;

            try {
              // Try to parse the line as JSON
              const parsedData = JSON.parse(line);
              logger.debug(`Parsed JSON message:`, parsedData);

              // Check if this is a response to a pending request
              if (parsedData.id) {
                // Only check pending requests for the current connection (connectionId)
                const requestsMap = this.pendingStdioRequests.get(connectionId);
                let foundRequest = false;

                if (requestsMap && requestsMap.has(parsedData.id)) {
                  const { resolve, reject } = requestsMap.get(parsedData.id)!;

                  requestsMap.delete(parsedData.id);

                  // If this was the last pending request, clean up the connection map
                  if (requestsMap.size === 0) {
                    this.pendingStdioRequests.delete(connectionId);
                  }

                  foundRequest = true;

                  if (parsedData.error) {
                    reject(
                      new SdkMcpError(
                        (parsedData.error.code as ErrorCode) ||
                          ErrorCode.InternalError,
                        parsedData.error.message || "Tool execution error",
                        parsedData.error.data
                      )
                    );
                  } else {
                    // Verify the result is an object or array
                    if (
                      parsedData.result === null ||
                      parsedData.result === undefined
                    ) {
                      reject(
                        new McpError(
                          ErrorCode.InternalError,
                          "Received null or undefined result from tool",
                          { responseId: parsedData.id }
                        )
                      );
                    } else if (
                      typeof parsedData.result !== "object" &&
                      !Array.isArray(parsedData.result)
                    ) {
                      reject(
                        new McpError(
                          ErrorCode.InternalError,
                          "Expected object or array result from tool",
                          {
                            responseId: parsedData.id,
                            receivedType: typeof parsedData.result,
                          }
                        )
                      );
                    } else {
                      resolve(
                        parsedData.result as
                          | Record<string, unknown>
                          | Array<unknown>
                      );
                    }
                  }
                }

                // Only log if we didn't find the request
                if (!foundRequest && messageHandler) {
                  logger.debug(
                    `Received message with ID ${parsedData.id} but no matching pending request found for this connection`
                  );
                  messageHandler(parsedData);
                }
              } else if (messageHandler) {
                // If not a response to a pending request, pass to the message handler
                messageHandler(parsedData);
              }
            } catch (error) {
              logger.warn(`Error parsing JSON from stdio:`, error);
              // If not valid JSON and we have a message handler, pass the raw line
              if (messageHandler) {
                messageHandler(line);
              }
            }
          }
        };

        // Error handler for stderr
        const onStderrData = (data: Buffer) => {
          // Update the last activity timestamp to prevent cleanup
          const connection = this.activeStdioConnections.get(connectionId);
          if (connection) {
            connection.lastActivityTimestamp = Date.now();
          }

          logger.warn(`Stdio stderr from ${command}:`, data.toString());
        };

        // Error handler for the process
        const onError = (error: Error) => {
          // Clear the connection timeout
          clearTimeout(connectionTimeout);

          logger.error(`Stdio error for ${command}:`, error);
          if (this.activeStdioConnections.has(connectionId)) {
            this.activeStdioConnections.delete(connectionId);

            // Reject all pending requests for this connection
            if (this.pendingStdioRequests.has(connectionId)) {
              const pendingRequests =
                this.pendingStdioRequests.get(connectionId)!;
              for (const [
                requestId,
                { reject: rejectRequest },
              ] of pendingRequests.entries()) {
                logger.warn(
                  `Rejecting pending request ${requestId} due to connection error`
                );
                rejectRequest(
                  new SdkMcpError(
                    ErrorCode.InternalError,
                    `Connection error occurred before response: ${error.message}`
                  )
                );
              }
              this.pendingStdioRequests.delete(connectionId);
            }
          }
          reject(error);
        };

        // Close handler for the process
        const onClose = (
          code: number | null,
          signal: NodeJS.Signals | null
        ) => {
          // Clear the connection timeout if process closes before we establish connection
          clearTimeout(connectionTimeout);

          logger.info(
            `Stdio process ${command} closed with code ${code} and signal ${signal}`
          );
          if (this.activeStdioConnections.has(connectionId)) {
            this.activeStdioConnections.delete(connectionId);

            // Reject all pending requests for this connection
            if (this.pendingStdioRequests.has(connectionId)) {
              const pendingRequests =
                this.pendingStdioRequests.get(connectionId)!;
              for (const [
                requestId,
                { reject: rejectRequest },
              ] of pendingRequests.entries()) {
                logger.warn(
                  `Rejecting pending request ${requestId} due to connection closure`
                );
                rejectRequest(
                  new McpError(
                    ErrorCode.InternalError,
                    `Connection closed before response (code: ${code}, signal: ${signal})`
                  )
                );
              }
              this.pendingStdioRequests.delete(connectionId);
            }
          }
        };

        // Set up event handlers
        childProcess.stdout.on("data", onStdoutData);
        childProcess.stderr.on("data", onStderrData);
        childProcess.on("error", onError);
        childProcess.on("close", onClose);

        // The connection is established immediately after we set up event handlers
        connectionEstablished();
      } catch (error) {
        logger.error(`Error creating stdio connection for ${command}:`, error);
        reject(error);
      }
    });
  }

  /**
   * Sends data to a stdio connection.
   * @param connectionId - The ID of the connection to send data to.
   * @param data - The data to send.
   * @returns True if the data was sent, false if the connection wasn't found.
   */
  private sendToStdio(connectionId: string, data: string | object): boolean {
    const connection = this.activeStdioConnections.get(connectionId);
    if (connection) {
      const childProcess = connection.process;

      // Update the last activity timestamp
      connection.lastActivityTimestamp = Date.now();

      // Safety check for data size to prevent buffer overflow
      const dataStr = typeof data === "string" ? data : JSON.stringify(data);

      // Limit data size to 1MB to prevent abuse
      const MAX_DATA_SIZE = 1024 * 1024; // 1MB
      if (dataStr.length > MAX_DATA_SIZE) {
        logger.error(
          `Data to send to stdio connection ${connectionId} exceeds size limit (${dataStr.length} > ${MAX_DATA_SIZE})`
        );
        return false;
      }

      if (childProcess.stdin) {
        try {
          childProcess.stdin.write(dataStr + "\n");
        } catch (error) {
          logger.error(
            `Error writing to stdin for connection ${connectionId}:`,
            error
          );
          return false;
        }
      } else {
        logger.error(`Stdio connection ${connectionId} has no stdin`);
        return false;
      }
      logger.debug(`Sent data to stdio connection ${connectionId}`);
      return true;
    }
    logger.warn(
      `Attempted to send data to non-existent stdio connection: ${connectionId}`
    );
    return false;
  }

  /**
   * Closes a stdio connection.
   * @param connectionId - The ID of the connection to close.
   * @param signal - Optional signal to send to the process. Default is 'SIGTERM'.
   * @returns True if the connection was closed, false if it wasn't found.
   */
  public closeStdioConnection(
    connectionId: string,
    signal: NodeJS.Signals = "SIGTERM"
  ): boolean {
    const connection = this.activeStdioConnections.get(connectionId);
    if (connection) {
      const childProcess = connection.process;

      // Remove all listeners to prevent memory leaks
      childProcess.stdout?.removeAllListeners();
      childProcess.stderr?.removeAllListeners();
      childProcess.removeAllListeners();

      // Kill the process
      childProcess.kill(signal);

      // Remove from active connections
      this.activeStdioConnections.delete(connectionId);

      // Clean up any pending requests for this connection
      this.cleanupPendingRequestsForConnection(connectionId);

      logger.info(
        `Stdio connection ${connectionId} closed with signal ${signal}.`
      );
      return true;
    }
    logger.warn(
      `Attempted to close non-existent stdio connection: ${connectionId}`
    );
    return false;
  }

  /**
   * Gets all active SSE connection IDs.
   * @returns Array of active SSE connection IDs.
   */
  public getActiveSseConnectionIds(): string[] {
    return Array.from(this.activeSseConnections.keys());
  }

  /**
   * Gets all active stdio connection IDs.
   * @returns Array of active stdio connection IDs.
   */
  public getActiveStdioConnectionIds(): string[] {
    return Array.from(this.activeStdioConnections.keys());
  }

  /**
   * Gets the last activity timestamp for a connection
   * @param connectionId - The ID of the connection to check
   * @returns The last activity timestamp in milliseconds since the epoch, or undefined if the connection doesn't exist
   */
  public getLastActivityTimestamp(connectionId: string): number | undefined {
    const sseConnection = this.activeSseConnections.get(connectionId);
    if (sseConnection) {
      return sseConnection.lastActivityTimestamp;
    }

    const stdioConnection = this.activeStdioConnections.get(connectionId);
    if (stdioConnection) {
      return stdioConnection.lastActivityTimestamp;
    }

    return undefined;
  }

  /**
   * Lists all available tools from an MCP server.
   * @param serverId - The ID of the connection to query.
   * @returns A promise that resolves to an array of tool definitions.
   * @throws {McpError} Throws an error if the parameters are invalid or the connection doesn't exist.
   */
  public async listTools(serverId: string): Promise<ToolDefinition[]> {
    // Validate serverId
    this.validateServerId(serverId);

    // Validate connection exists
    this.validateConnectionExists(serverId);

    logger.info(`Listing tools for connection ${serverId}`);

    // Check if this is an SSE connection
    if (this.activeSseConnections.has(serverId)) {
      const connection = this.activeSseConnections.get(serverId)!;
      const requestId = uuidv4();
      const request: McpRequest = { id: requestId, method: "listTools" };

      try {
        // Create URL for the MCP request
        const mcpRequestUrl = new URL(connection.baseUrl);

        // Update the connection's last activity timestamp
        connection.lastActivityTimestamp = Date.now();

        // Make the request with timeout
        const response = await this.fetchWithTimeout(
          mcpRequestUrl.toString(),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(request),
          },
          McpClientService.DEFAULT_REQUEST_TIMEOUT_MS,
          "Request timed out"
        );

        if (!response.ok) {
          throw new McpError(
            ErrorCode.InternalError,
            `HTTP error from MCP server: ${response.status} ${response.statusText}`
          );
        }

        const mcpResponse = (await response.json()) as McpResponse;

        if (mcpResponse.error) {
          throw new SdkMcpError(
            ErrorCode.InternalError,
            `MCP error: ${mcpResponse.error.message} (code: ${mcpResponse.error.code})`,
            mcpResponse.error.data
          );
        }

        // Type assertion with verification to ensure we have an array of ToolDefinition
        const result = mcpResponse.result;
        if (!Array.isArray(result)) {
          throw new McpError(
            ErrorCode.InternalError,
            "Expected array of tools in response",
            { receivedType: typeof result }
          );
        }

        return result as ToolDefinition[];
      } catch (error) {
        logger.error(
          `Error listing tools for SSE connection ${serverId}:`,
          error
        );

        // Wrap non-McpError instances
        if (!(error instanceof McpError)) {
          throw new McpError(
            ErrorCode.InternalError,
            `Failed to list tools for connection ${serverId}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
        throw error;
      }
    }

    // Check if this is a stdio connection
    else if (this.activeStdioConnections.has(serverId)) {
      const requestId = uuidv4();
      const request: McpRequest = { id: requestId, method: "listTools" };

      return new Promise<ToolDefinition[]>((resolve, reject) => {
        // Initialize the map for this connection if it doesn't exist
        if (!this.pendingStdioRequests.has(serverId)) {
          this.pendingStdioRequests.set(serverId, new Map());
        }

        // Store the promise resolution functions
        this.pendingStdioRequests.get(serverId)!.set(requestId, {
          resolve: (value) => {
            // Type-safe resolution for tool definitions
            resolve(value as ToolDefinition[]);
          },
          reject: reject,
        });

        // Set up a timeout to automatically reject this request if it takes too long
        setTimeout(() => {
          // If the request is still pending, reject it
          if (
            this.pendingStdioRequests.has(serverId) &&
            this.pendingStdioRequests.get(serverId)!.has(requestId)
          ) {
            // Get the reject function
            const { reject: rejectRequest } = this.pendingStdioRequests
              .get(serverId)!
              .get(requestId)!;

            // Delete the request
            this.pendingStdioRequests.get(serverId)!.delete(requestId);

            // If this was the last pending request, clean up the connection map
            if (this.pendingStdioRequests.get(serverId)!.size === 0) {
              this.pendingStdioRequests.delete(serverId);
            }

            // Reject the request with a timeout error
            rejectRequest(
              new SdkMcpError(
                ErrorCode.InternalError,
                "Request timed out waiting for response"
              )
            );
          }
        }, McpClientService.DEFAULT_REQUEST_TIMEOUT_MS);

        // Send the request
        const sent = this.sendToStdio(serverId, request);

        if (!sent) {
          // Clean up the pending request if sending fails
          this.pendingStdioRequests.get(serverId)!.delete(requestId);

          // If this was the last pending request, clean up the connection map
          if (this.pendingStdioRequests.get(serverId)!.size === 0) {
            this.pendingStdioRequests.delete(serverId);
          }

          reject(
            new Error(`Failed to send request to stdio connection ${serverId}`)
          );
        }
      });
    }

    // This should never be reached due to the validateConnectionExists check above
    throw new McpError(
      ErrorCode.InvalidRequest,
      `No connection found with ID ${serverId}`
    );
  }
  /**
   * Gets server information from an MCP server.
   * @param serverId - The ID of the connection to use.
   * @returns A promise that resolves to the server information.
   * @throws {McpError} Throws an error if the parameters are invalid or the connection doesn't exist.
   */
  public async getServerInfo(
    serverId: string
  ): Promise<Record<string, unknown>> {
    // Validate serverId
    this.validateServerId(serverId);

    // Check if connection exists
    this.validateConnectionExists(serverId);

    logger.debug(`Getting server info for connection: ${serverId}`);

    // Check if this is an SSE connection
    if (this.activeSseConnections.has(serverId)) {
      const connection = this.activeSseConnections.get(serverId)!;
      connection.lastActivityTimestamp = Date.now();

      // For SSE connections, we'll make an HTTP request to get server info
      const baseUrl = connection.baseUrl;
      const infoUrl = `${baseUrl}/info`;

      try {
        const response = await this.fetchWithTimeout(
          infoUrl,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          },
          McpClientService.DEFAULT_REQUEST_TIMEOUT_MS,
          `Server info request timed out for ${serverId}`
        );

        if (!response.ok) {
          throw new McpError(
            ErrorCode.InternalError,
            `Server info request failed with status ${response.status}: ${response.statusText}`
          );
        }

        const serverInfo = await response.json();
        return serverInfo as Record<string, unknown>;
      } catch (error) {
        logger.error(
          `Error getting server info for SSE connection ${serverId}:`,
          error
        );
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to get server info: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }

    // Check if this is a stdio connection
    if (this.activeStdioConnections.has(serverId)) {
      const connection = this.activeStdioConnections.get(serverId)!;
      connection.lastActivityTimestamp = Date.now();

      // For stdio connections, send an initialize request
      const requestId = uuidv4();
      const request: McpRequest = {
        id: requestId,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: {
            name: "mcp-gemini-server",
            version: "1.0.0",
          },
        },
      };

      return new Promise<Record<string, unknown>>((resolve, reject) => {
        // Set up timeout for the request
        const timeout = setTimeout(() => {
          // Clean up the pending request
          const pendingRequests = this.pendingStdioRequests.get(serverId);
          if (pendingRequests) {
            pendingRequests.delete(requestId);
            if (pendingRequests.size === 0) {
              this.pendingStdioRequests.delete(serverId);
            }
          }

          reject(
            new McpError(
              ErrorCode.InternalError,
              `Server info request timed out for ${serverId} after ${McpClientService.DEFAULT_REQUEST_TIMEOUT_MS}ms`
            )
          );
        }, McpClientService.DEFAULT_REQUEST_TIMEOUT_MS);

        // Store the request handlers
        if (!this.pendingStdioRequests.has(serverId)) {
          this.pendingStdioRequests.set(serverId, new Map());
        }
        this.pendingStdioRequests.get(serverId)!.set(requestId, {
          resolve: (result) => {
            clearTimeout(timeout);
            resolve(result as Record<string, unknown>);
          },
          reject: (error) => {
            clearTimeout(timeout);
            reject(error);
          },
        });

        // Send the request
        const success = this.sendToStdio(serverId, request);
        if (!success) {
          // Clean up the pending request
          const pendingRequests = this.pendingStdioRequests.get(serverId);
          if (pendingRequests) {
            pendingRequests.delete(requestId);
            if (pendingRequests.size === 0) {
              this.pendingStdioRequests.delete(serverId);
            }
          }
          clearTimeout(timeout);
          reject(
            new McpError(
              ErrorCode.InternalError,
              `Failed to send server info request to ${serverId}`
            )
          );
        }
      });
    }

    // This should never be reached due to the validateConnectionExists check above
    throw new McpError(
      ErrorCode.InvalidRequest,
      `No connection found with ID ${serverId}`
    );
  }

  /**
   * Calls a tool on an MCP server.
   * @param serverId - The ID of the connection to use.
   * @param toolName - The name of the tool to call.
   * @param toolArgs - The arguments to pass to the tool.
   * @returns A promise that resolves to the tool's result.
   * @throws {McpError} Throws an error if the parameters are invalid or the connection doesn't exist.
   */
  public async callTool(
    serverId: string,
    toolName: string,
    toolArgs: Record<string, unknown> | null | undefined
  ): Promise<Record<string, unknown> | Array<unknown>> {
    // Validate serverId
    this.validateServerId(serverId);

    // Validate connection exists
    this.validateConnectionExists(serverId);

    // Validate toolName
    if (!toolName || typeof toolName !== "string" || toolName.trim() === "") {
      throw new McpError(
        ErrorCode.InvalidParams,
        "Tool name must be a non-empty string"
      );
    }

    // Validate toolArgs (ensure it's an object if provided)
    if (
      toolArgs !== null &&
      toolArgs !== undefined &&
      typeof toolArgs !== "object"
    ) {
      throw new McpError(
        ErrorCode.InvalidParams,
        "Tool arguments must be an object, null, or undefined"
      );
    }

    // Normalize toolArgs to an empty object if null or undefined
    const normalizedToolArgs: Record<string, unknown> = toolArgs || {};

    logger.info(`Calling tool ${toolName} on connection ${serverId}`);

    // Check if this is an SSE connection
    if (this.activeSseConnections.has(serverId)) {
      const connection = this.activeSseConnections.get(serverId)!;
      const requestId = uuidv4();
      const request: McpRequest = {
        id: requestId,
        method: "callTool",
        params: { toolName, arguments: normalizedToolArgs },
      };

      try {
        // Create URL for the MCP request
        const mcpRequestUrl = new URL(connection.baseUrl);

        // Update the connection's last activity timestamp
        connection.lastActivityTimestamp = Date.now();

        // Make the request with timeout
        const response = await this.fetchWithTimeout(
          mcpRequestUrl.toString(),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(request),
          },
          McpClientService.DEFAULT_REQUEST_TIMEOUT_MS,
          "Request timed out"
        );

        if (!response.ok) {
          throw new McpError(
            ErrorCode.InternalError,
            `HTTP error from MCP server: ${response.status} ${response.statusText}`
          );
        }

        const mcpResponse = (await response.json()) as McpResponse;

        if (mcpResponse.error) {
          throw new SdkMcpError(
            ErrorCode.InternalError,
            `MCP error: ${mcpResponse.error.message} (code: ${mcpResponse.error.code})`,
            mcpResponse.error.data
          );
        }

        // Ensure result is either an object or array
        if (
          !mcpResponse.result ||
          (typeof mcpResponse.result !== "object" &&
            !Array.isArray(mcpResponse.result))
        ) {
          throw new McpError(
            ErrorCode.InternalError,
            "Expected object or array result from tool call",
            { receivedType: typeof mcpResponse.result }
          );
        }

        return mcpResponse.result;
      } catch (error) {
        logger.error(
          `Error calling tool ${toolName} on SSE connection ${serverId}:`,
          error
        );

        // Wrap non-McpError instances
        if (!(error instanceof McpError)) {
          throw new McpError(
            ErrorCode.InternalError,
            `Failed to call tool ${toolName} on connection ${serverId}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
        throw error;
      }
    }

    // Check if this is a stdio connection
    else if (this.activeStdioConnections.has(serverId)) {
      const requestId = uuidv4();
      const request: McpRequest = {
        id: requestId,
        method: "callTool",
        params: { toolName, arguments: normalizedToolArgs },
      };

      return new Promise((resolve, reject) => {
        // Initialize the map for this connection if it doesn't exist
        if (!this.pendingStdioRequests.has(serverId)) {
          this.pendingStdioRequests.set(serverId, new Map());
        }

        // Store the promise resolution functions
        this.pendingStdioRequests.get(serverId)!.set(requestId, {
          resolve: (value) => {
            // Type-safe resolution for tool call results
            resolve(value as Record<string, unknown>);
          },
          reject: reject,
        });

        // Set up a timeout to automatically reject this request if it takes too long
        setTimeout(() => {
          // If the request is still pending, reject it
          if (
            this.pendingStdioRequests.has(serverId) &&
            this.pendingStdioRequests.get(serverId)!.has(requestId)
          ) {
            // Get the reject function
            const { reject: rejectRequest } = this.pendingStdioRequests
              .get(serverId)!
              .get(requestId)!;

            // Delete the request
            this.pendingStdioRequests.get(serverId)!.delete(requestId);

            // If this was the last pending request, clean up the connection map
            if (this.pendingStdioRequests.get(serverId)!.size === 0) {
              this.pendingStdioRequests.delete(serverId);
            }

            // Reject the request with a timeout error
            rejectRequest(
              new SdkMcpError(
                ErrorCode.InternalError,
                "Request timed out waiting for response"
              )
            );
          }
        }, McpClientService.DEFAULT_REQUEST_TIMEOUT_MS);

        // Send the request
        const sent = this.sendToStdio(serverId, request);

        if (!sent) {
          // Clean up the pending request if sending fails
          this.pendingStdioRequests.get(serverId)!.delete(requestId);

          // If this was the last pending request, clean up the connection map
          if (this.pendingStdioRequests.get(serverId)!.size === 0) {
            this.pendingStdioRequests.delete(serverId);
          }

          reject(
            new Error(`Failed to send request to stdio connection ${serverId}`)
          );
        }
      });
    }

    // This should never be reached due to the validateConnectionExists check above
    throw new McpError(
      ErrorCode.InvalidRequest,
      `No connection found with ID ${serverId}`
    );
  }

  /**
   * Disconnects from an MCP server.
   * @param serverId - The ID of the connection to close.
   * @returns True if the connection was closed, false if it wasn't found.
   * @throws {McpError} Throws an error if the parameters are invalid.
   */
  public disconnect(serverId: string): boolean {
    // Validate serverId
    this.validateServerId(serverId);

    // Check if this is an SSE connection
    if (this.activeSseConnections.has(serverId)) {
      return this.closeSseConnection(serverId);
    }

    // Check if this is a stdio connection
    else if (this.activeStdioConnections.has(serverId)) {
      return this.closeStdioConnection(serverId);
    }

    // Connection not found
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Connection not found for serverId: ${serverId}`
    );
  }

  /**
   * Closes all active connections.
   */
  public closeAllConnections(): void {
    // Close all SSE connections
    for (const id of this.activeSseConnections.keys()) {
      this.closeSseConnection(id);
    }

    // Close all stdio connections
    for (const id of this.activeStdioConnections.keys()) {
      this.closeStdioConnection(id);
    }

    // Clean up all pending requests
    for (const [, requestsMap] of this.pendingStdioRequests.entries()) {
      for (const [requestId, { reject }] of requestsMap.entries()) {
        logger.warn(
          `Rejecting pending request ${requestId} due to service shutdown`
        );
        reject(new Error("Connection closed due to service shutdown"));
      }
    }

    // Clear the pending requests map
    this.pendingStdioRequests.clear();

    // Clear the cleanup interval
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = undefined;
    }

    logger.info("All MCP connections closed.");
  }
}
