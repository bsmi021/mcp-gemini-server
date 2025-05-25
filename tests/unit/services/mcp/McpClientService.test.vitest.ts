/// <reference types="../../../../vitest-globals.d.ts" />
// Using vitest globals - see vitest.config.ts globals: true

// Fixed UUID for testing
const TEST_UUID = "test-uuid-value";

// Import mock types first
import {
  EVENT_SOURCE_STATES,
  MockEvent,
  MockEventSource,
} from "../../../../tests/utils/mock-types.js";

// Store the mock instance for access in tests
let mockEventSourceInstance: MockEventSource;

// Create mock objects for child_process
export const mockStdout = {
  on: vi.fn(),
  removeAllListeners: vi.fn(),
};

export const mockStderr = {
  on: vi.fn(),
  removeAllListeners: vi.fn(),
};

export const mockStdin = {
  write: vi.fn(),
};

export const mockChildProcess = {
  stdout: mockStdout,
  stderr: mockStderr,
  stdin: mockStdin,
  on: vi.fn(),
  kill: vi.fn(),
  removeAllListeners: vi.fn(),
};

// Store the EventSource constructor for test expectations
let EventSourceConstructor: any;

// Setup mocks using doMock to avoid hoisting issues
vi.doMock("eventsource", () => {
  EventSourceConstructor = vi.fn().mockImplementation(function (
    url: string,
    _options?: any
  ) {
    // Create mock instance
    const instance = {
      onopen: null,
      onmessage: null,
      onerror: null,
      readyState: 0,
      url: url,
      withCredentials: false,
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn().mockReturnValue(true),
    };

    // Store instance for test access
    mockEventSourceInstance = instance as any;

    return instance;
  });

  return {
    default: EventSourceConstructor,
  };
});

vi.doMock("uuid", () => ({
  v4: vi.fn(() => TEST_UUID),
}));

const mockSpawn = vi.fn(() => mockChildProcess);

vi.doMock("child_process", () => ({
  spawn: mockSpawn,
}));

vi.doMock("node-fetch", () => ({
  default: vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    json: vi.fn().mockResolvedValue({ result: {} }),
  }),
}));

// Type helper for accessing private properties in tests - will be redefined after import
type McpClientServicePrivate = any;

describe("McpClientService", () => {
  let McpClientService: typeof import("../../../../src/services/mcp/McpClientService.js").McpClientService;
  let SdkMcpError: any;
  let logger: any;
  let service: any;
  let originalSetInterval: typeof global.setInterval;
  let originalClearInterval: typeof global.clearInterval;

  beforeAll(async () => {
    // Dynamic imports after mocks are set up
    const mcpService = await import(
      "../../../../src/services/mcp/McpClientService.js"
    );
    McpClientService = mcpService.McpClientService;

    const sdkTypes = await import("@modelcontextprotocol/sdk/types.js");
    SdkMcpError = sdkTypes.McpError;

    const loggerModule = await import("../../../../src/utils/logger.js");
    logger = loggerModule.logger;
  });

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Save original timing functions
    originalSetInterval = global.setInterval;
    originalClearInterval = global.clearInterval;

    // Mock timers
    vi.useFakeTimers();

    // Mock logger
    vi.spyOn(logger, "info").mockImplementation(vi.fn());
    vi.spyOn(logger, "warn").mockImplementation(vi.fn());
    vi.spyOn(logger, "error").mockImplementation(vi.fn());
    vi.spyOn(logger, "debug").mockImplementation(vi.fn());

    // Create a new instance of the service
    service = new McpClientService();
  });

  afterEach(() => {
    // Restore originals
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;

    // Restore all mocks
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("Constructor", () => {
    it("should initialize with empty connection maps", () => {
      expect(
        (service as McpClientServicePrivate).activeSseConnections.size
      ).toBe(0);
      expect(
        (service as McpClientServicePrivate).activeStdioConnections.size
      ).toBe(0);
      expect(
        (service as McpClientServicePrivate).pendingStdioRequests.size
      ).toBe(0);
    });

    it("should set up a cleanup interval", () => {
      expect(vi.getTimerCount()).toBeGreaterThan(0);
    });
  });

  describe("connect", () => {
    it("should validate serverId properly", async () => {
      await expect(
        service.connect("", { type: "sse", sseUrl: "http://test-url.com" })
      ).rejects.toThrow(SdkMcpError);
      await expect(
        service.connect("", { type: "sse", sseUrl: "http://test-url.com" })
      ).rejects.toThrow(/Server ID must be a non-empty string/);
    });

    it("should validate connection details properly", async () => {
      await expect(service.connect("server1", null as any)).rejects.toThrow(
        SdkMcpError
      );
      await expect(service.connect("server1", null as any)).rejects.toThrow(
        /Connection details must be an object/
      );
    });

    it("should validate connection type properly", async () => {
      // Using type assertion to test invalid inputs
      await expect(
        service.connect("server1", {
          type: "invalid" as unknown as "sse" | "stdio",
        })
      ).rejects.toThrow(SdkMcpError);
      // Using type assertion to test invalid inputs
      await expect(
        service.connect("server1", {
          type: "invalid" as unknown as "sse" | "stdio",
        })
      ).rejects.toThrow(/Connection type must be 'sse' or 'stdio'/);
    });

    it("should validate SSE URL properly", async () => {
      await expect(
        service.connect("server1", { type: "sse", sseUrl: "" })
      ).rejects.toThrow(SdkMcpError);
      await expect(
        service.connect("server1", { type: "sse", sseUrl: "" })
      ).rejects.toThrow(/sseUrl must be a non-empty string/);

      await expect(
        service.connect("server1", { type: "sse", sseUrl: "invalid-url" })
      ).rejects.toThrow(SdkMcpError);
      await expect(
        service.connect("server1", { type: "sse", sseUrl: "invalid-url" })
      ).rejects.toThrow(/valid URL format/);
    });

    it("should validate stdio command properly", async () => {
      await expect(
        service.connect("server1", { type: "stdio", stdioCommand: "" })
      ).rejects.toThrow(SdkMcpError);
      await expect(
        service.connect("server1", { type: "stdio", stdioCommand: "" })
      ).rejects.toThrow(/stdioCommand must be a non-empty string/);
    });

    it("should establish an SSE connection successfully", async () => {
      const connectPromise = service.connect("server1", {
        type: "sse",
        sseUrl: "http://test-server.com/sse",
      });

      // Wait for the EventSource to be created and callbacks to be assigned
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Simulate successful connection by calling the onopen callback
      if (mockEventSourceInstance && mockEventSourceInstance.onopen) {
        mockEventSourceInstance.onopen({} as MockEvent);
      }

      const connectionId = await connectPromise;

      expect(connectionId).toBe(TEST_UUID);
      expect(
        (service as McpClientServicePrivate).activeSseConnections.size
      ).toBe(1);

      // Check correct parameters were used
      expect(EventSourceConstructor).toHaveBeenCalledWith(
        "http://test-server.com/sse"
      );
    });

    it("should establish a stdio connection successfully", async () => {
      const connectionId = await service.connect("server1", {
        type: "stdio",
        stdioCommand: "test-command",
        stdioArgs: ["arg1", "arg2"],
      });

      expect(connectionId).toBe(TEST_UUID);
      expect(
        (service as McpClientServicePrivate).activeStdioConnections.size
      ).toBe(1);

      // Check correct parameters were used
      expect(mockSpawn).toHaveBeenCalledWith(
        "test-command",
        ["arg1", "arg2"],
        expect.anything()
      );
    });
  });

  describe("cleanupStaleConnections", () => {
    it("should close stale SSE connections", async () => {
      // Create a connection
      const connectPromise = (service as McpClientServicePrivate).connectSse(
        "http://test-server.com/sse"
      );
      mockEventSourceInstance.onopen &&
        mockEventSourceInstance.onopen({} as MockEvent);
      const connectionId = await connectPromise;

      // Verify connection exists
      expect(
        (service as McpClientServicePrivate).activeSseConnections.size
      ).toBe(1);

      // Set the last activity timestamp to be stale (10 minutes + 1 second ago)
      const staleTimestamp = Date.now() - (600000 + 1000);
      (service as McpClientServicePrivate).activeSseConnections.get(
        connectionId
      ).lastActivityTimestamp = staleTimestamp;

      // Call the cleanup method
      (service as McpClientServicePrivate).cleanupStaleConnections();

      // Verify connection was closed
      expect(mockEventSourceInstance.close).toHaveBeenCalled();
      expect(
        (service as McpClientServicePrivate).activeSseConnections.size
      ).toBe(0);
    });

    it("should close stale stdio connections", async () => {
      // Create a connection
      const connectionId = await (
        service as McpClientServicePrivate
      ).connectStdio("test-command");

      // Verify connection exists
      expect(
        (service as McpClientServicePrivate).activeStdioConnections.size
      ).toBe(1);

      // Set the last activity timestamp to be stale (10 minutes + 1 second ago)
      const staleTimestamp = Date.now() - (600000 + 1000);
      (service as McpClientServicePrivate).activeStdioConnections.get(
        connectionId
      ).lastActivityTimestamp = staleTimestamp;

      // Call the cleanup method
      (service as McpClientServicePrivate).cleanupStaleConnections();

      // Verify connection was closed
      expect(mockChildProcess.kill).toHaveBeenCalled();
      expect(
        (service as McpClientServicePrivate).activeStdioConnections.size
      ).toBe(0);
    });

    it("should not close active connections", async () => {
      // Create a connection
      const connectPromise = (service as McpClientServicePrivate).connectSse(
        "http://test-server.com/sse"
      );
      mockEventSourceInstance.onopen &&
        mockEventSourceInstance.onopen({} as MockEvent);
      await connectPromise;

      // Verify connection exists (with current timestamp)
      expect(
        (service as McpClientServicePrivate).activeSseConnections.size
      ).toBe(1);

      // Call the cleanup method
      (service as McpClientServicePrivate).cleanupStaleConnections();

      // Verify connection was not closed
      expect(mockEventSourceInstance.close).not.toHaveBeenCalled();
      expect(
        (service as McpClientServicePrivate).activeSseConnections.size
      ).toBe(1);
    });
  });

  describe("SSE Connections", () => {
    const testUrl = "http://test-server.com/sse";

    it("should create an EventSource and return a connection ID when successful", async () => {
      const connectPromise = (service as McpClientServicePrivate).connectSse(
        testUrl
      );

      // Trigger the onopen event to simulate successful connection
      mockEventSourceInstance.onopen &&
        mockEventSourceInstance.onopen({} as MockEvent);

      const connectionId = await connectPromise;

      // Check EventSource was constructed with the correct URL
      expect(EventSourceConstructor).toHaveBeenCalledWith(testUrl);

      // Check the connection ID is returned
      expect(connectionId).toBe(TEST_UUID);

      // Check the connection was stored with last activity timestamp
      expect(
        (service as McpClientServicePrivate).activeSseConnections.size
      ).toBe(1);
      expect(
        (service as McpClientServicePrivate).activeSseConnections.has(TEST_UUID)
      ).toBe(true);

      const connection = (
        service as McpClientServicePrivate
      ).activeSseConnections.get(TEST_UUID);
      expect(connection.lastActivityTimestamp).toBeGreaterThan(0);
    });

    it("should handle SSE messages and pass them to the messageHandler", async () => {
      const messageHandler = vi.fn();
      const testData = { foo: "bar" };

      const connectPromise = (service as McpClientServicePrivate).connectSse(
        testUrl,
        messageHandler
      );
      // Manually trigger the onopen callback to resolve the connection promise
      mockEventSourceInstance.onopen &&
        mockEventSourceInstance.onopen({} as MockEvent);
      await connectPromise;

      // Get the initial activity timestamp
      const initialTimestamp = (
        service as McpClientServicePrivate
      ).activeSseConnections.get(TEST_UUID).lastActivityTimestamp;

      // Store original timestamp so we can mock a newer one
      const originalTimestamp = Date.now;
      // Mock Date.now to return a later timestamp
      Date.now = vi.fn().mockReturnValue(initialTimestamp + 1000);

      // Trigger the onmessage event with test data
      const messageEvent = { data: JSON.stringify(testData) };
      mockEventSourceInstance.onmessage &&
        mockEventSourceInstance.onmessage(messageEvent as MessageEvent);

      // Verify message handler was called with parsed data
      expect(messageHandler).toHaveBeenCalledWith(testData);

      // Verify last activity timestamp was updated
      const newTimestamp = (
        service as McpClientServicePrivate
      ).activeSseConnections.get(TEST_UUID).lastActivityTimestamp;
      expect(newTimestamp).toBeGreaterThan(initialTimestamp);

      // Restore original Date.now
      Date.now = originalTimestamp;
    });

    it("should handle SSE message parse errors and pass raw data to the messageHandler", async () => {
      const messageHandler = vi.fn();
      const invalidJson = "{ not valid json";

      const connectPromise = (service as McpClientServicePrivate).connectSse(
        testUrl,
        messageHandler
      );
      // Manually trigger the onopen callback to resolve the connection promise
      mockEventSourceInstance.onopen &&
        mockEventSourceInstance.onopen({} as MockEvent);
      await connectPromise;

      // Store original timestamp and mock it
      const originalTimestamp = Date.now;
      Date.now = vi.fn().mockReturnValue(Date.now() + 1000);

      // Trigger the onmessage event with invalid JSON
      const messageEvent = { data: invalidJson };
      mockEventSourceInstance.onmessage &&
        mockEventSourceInstance.onmessage(messageEvent as MessageEvent);

      // Verify message handler was called with raw data
      expect(messageHandler).toHaveBeenCalledWith(invalidJson);

      // Restore original Date.now
      Date.now = originalTimestamp;
    });

    it("should reject the promise when an SSE error occurs before connection", async () => {
      const connectPromise = (service as McpClientServicePrivate).connectSse(
        testUrl
      );

      // Trigger the onerror event before onopen
      const errorEvent: MockEvent = {
        type: "error",
        message: "Connection failed",
      };
      mockEventSourceInstance.onerror &&
        mockEventSourceInstance.onerror(errorEvent);

      // Expect the promise to reject
      await expect(connectPromise).rejects.toThrow(SdkMcpError);
      await expect(connectPromise).rejects.toThrow(
        /Failed to establish SSE connection/
      );

      // Verify no connection was stored
      expect(
        (service as McpClientServicePrivate).activeSseConnections.size
      ).toBe(0);
    });

    it("should close and remove the connection when an SSE error occurs after connection", async () => {
      // Successfully connect first
      const connectPromise = (service as McpClientServicePrivate).connectSse(
        testUrl
      );
      mockEventSourceInstance.onopen &&
        mockEventSourceInstance.onopen({} as MockEvent);
      const connectionId = await connectPromise;

      // Verify connection exists before error
      expect(
        (service as McpClientServicePrivate).activeSseConnections.size
      ).toBe(1);
      expect(
        (service as McpClientServicePrivate).activeSseConnections.has(
          connectionId
        )
      ).toBe(true);

      // Update readyState to simulate a connected then closed state
      mockEventSourceInstance.readyState = EVENT_SOURCE_STATES.CLOSED;

      // Trigger an error after successful connection
      const errorEvent: MockEvent = {
        type: "error",
        message: "Connection lost",
      };
      mockEventSourceInstance.onerror &&
        mockEventSourceInstance.onerror(errorEvent);

      // Verify connection was removed
      expect(
        (service as McpClientServicePrivate).activeSseConnections.size
      ).toBe(0);
      expect(
        (service as McpClientServicePrivate).activeSseConnections.has(
          connectionId
        )
      ).toBe(false);
    });

    it("should close an SSE connection on disconnect", async () => {
      // Reset mocks before this test to ensure clean state
      vi.clearAllMocks();
      service = new McpClientService();

      // In this test we're going to directly set up the activeSseConnections map to match the test scenario
      // This is necessary because the implementation uses the connectionId for storage and lookup
      const connectionId = TEST_UUID;

      // Manually set up the connection in the map
      (service as McpClientServicePrivate).activeSseConnections.set(
        connectionId,
        {
          eventSource: mockEventSourceInstance,
          baseUrl: testUrl,
          lastActivityTimestamp: Date.now(),
        }
      );

      // Verify connection exists before disconnecting
      expect(
        (service as McpClientServicePrivate).activeSseConnections.size
      ).toBe(1);
      expect(
        (service as McpClientServicePrivate).activeSseConnections.has(
          connectionId
        )
      ).toBe(true);

      // Disconnect
      const result = service.disconnect(connectionId);

      // Verify connection was closed
      expect(result).toBe(true);
      expect(mockEventSourceInstance.close).toHaveBeenCalled();
      expect(
        (service as McpClientServicePrivate).activeSseConnections.size
      ).toBe(0);
    });

    it("should throw an error when disconnecting from a non-existent connection", () => {
      expect(() => service.disconnect("non-existent-server")).toThrow(
        SdkMcpError
      );
      expect(() => service.disconnect("non-existent-server")).toThrow(
        /Connection not found/
      );
    });
  });

  // Additional tests for callTool, listTools, etc. would follow the same pattern
});
