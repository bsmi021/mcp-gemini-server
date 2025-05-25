// Using vitest globals - see vitest.config.ts globals: true
/**
 * Mock types for testing
 * This file contains type definitions for mocks used in tests
 */
import type { Mock } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpClientService } from "../../src/services/mcp/McpClientService.js";

/**
 * Mock Event Source States for testing
 */
export const EVENT_SOURCE_STATES = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSED: 2,
};

/**
 * Mock Event for EventSource
 */
export interface MockEvent {
  type: string;
  data?: string;
  message?: string;
  error?: Error;
  lastEventId?: string;
  origin?: string;
  bubbles?: boolean;
  cancelBubble?: boolean;
  cancelable?: boolean;
  composed?: boolean;
}

/**
 * Mock EventSource for testing
 */
export class MockEventSource {
  url: string;
  readyState: number = EVENT_SOURCE_STATES.CONNECTING;
  onopen: ((event: MockEvent) => void) | null = null;
  onmessage: ((event: MockEvent) => void) | null = null;
  onerror: ((event: MockEvent) => void) | null = null;

  constructor(url: string, _options?: Record<string, unknown>) {
    this.url = url;
  }

  close(): void {
    this.readyState = EVENT_SOURCE_STATES.CLOSED;
  }
}

/**
 * Utility type for mocking a McpClientService
 */
export type MockMcpClientService = {
  [K in keyof McpClientService]: McpClientService[K] extends (
    ...args: unknown[]
  ) => unknown
    ? Mock
    : McpClientService[K];
};

/**
 * Create a mock McpClientService
 */
export function createMockMcpClientService(): MockMcpClientService {
  return {
    connect: vi.fn(),
    listTools: vi.fn(),
    callTool: vi.fn(),
    disconnect: vi.fn(),
    getActiveSseConnectionIds: vi.fn(),
    getActiveStdioConnectionIds: vi.fn(),
    getLastActivityTimestamp: vi.fn(),
    closeSseConnection: vi.fn(),
    closeStdioConnection: vi.fn(),
    closeAllConnections: vi.fn(),
  } as unknown as MockMcpClientService;
}

/**
 * Utility type for mocking a FileSecurityService
 */
export type MockFileSecurityService = {
  allowedDirectories: string[];
  DEFAULT_SAFE_BASE_DIR: string;
  setSecureBasePath: Mock;
  getSecureBasePath: Mock;
  setAllowedDirectories: Mock;
  getAllowedDirectories: Mock;
  validateAndResolvePath: Mock;
  isPathWithinAllowedDirs: Mock;
  fullyResolvePath: Mock;
  secureWriteFile: Mock;
};

/**
 * Create a mock FileSecurityService
 */
export function createMockFileSecurityService(): MockFileSecurityService {
  return {
    allowedDirectories: ["/test/dir"],
    DEFAULT_SAFE_BASE_DIR: "/test/dir",
    setSecureBasePath: vi.fn(),
    getSecureBasePath: vi.fn(),
    setAllowedDirectories: vi.fn(),
    getAllowedDirectories: vi.fn(),
    validateAndResolvePath: vi.fn(),
    isPathWithinAllowedDirs: vi.fn(),
    fullyResolvePath: vi.fn(),
    secureWriteFile: vi.fn(),
  };
}

/**
 * Tool handler function type for mcp server
 */
export type ToolHandler = (server: McpServer, service?: unknown) => unknown;

/**
 * Utility function to create a mock tool function
 */
export function createMockToolHandler(name: string): ToolHandler {
  return vi.fn().mockImplementation((server: McpServer, _service?: unknown) => {
    server.tool(name, `Mock ${name}`, {}, vi.fn());
    return { name, registered: true };
  });
}
