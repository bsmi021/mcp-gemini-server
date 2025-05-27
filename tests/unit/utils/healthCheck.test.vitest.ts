// Using vitest globals - see vitest.config.ts globals: true
import http from "node:http";
import {
  getHealthStatus,
  setServerState,
  startHealthCheckServer,
  ServerState,
} from "../../../src/utils/healthCheck.js";

describe("Health Check", () => {
  let healthServer: http.Server;
  const testPort = 3333; // Use a specific port for tests
  // Store the original environment variable value
  const originalHealthCheckPort = process.env.HEALTH_CHECK_PORT;

  // Mock server state
  const mockServerState: ServerState = {
    isRunning: true,
    startTime: Date.now() - 5000, // 5 seconds ago
    transport: null, // Transport interface doesn't have constructor property
    server: {},
    healthCheckServer: null,
    mcpClientService: null,
  };

  // Setup: Start health check server
  it("should initialize health check server", () => {
    setServerState(mockServerState);

    // Set the port via environment variable for our test
    process.env.HEALTH_CHECK_PORT = testPort.toString();

    healthServer = startHealthCheckServer();

    expect(healthServer).toBeTruthy();

    // Wait briefly for the server to start listening
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, 100);
    });
  });

  // Test health status function
  it("should return correct health status", () => {
    const status = getHealthStatus();

    expect(status.status).toBe("running");
    expect(status.uptime).toBeGreaterThanOrEqual(5);
    expect(status.transport).toBe("MockTransport");
  });

  // Test health endpoint
  it("should respond to health endpoint", async () => {
    // Make HTTP request to health endpoint
    const response = await new Promise<http.IncomingMessage>((resolve) => {
      const req = http.request(
        {
          hostname: "localhost",
          port: testPort,
          path: "/health",
          method: "GET",
        },
        (res) => {
          resolve(res);
        }
      );

      req.end();
    });

    // Check response status
    expect(response.statusCode).toBe(200);

    // Check response content
    const data = await new Promise<string>((resolve) => {
      let body = "";
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        resolve(body);
      });
    });

    const healthData = JSON.parse(data);
    expect(healthData.status).toBe("running");
    expect(healthData.uptime).toBeGreaterThanOrEqual(0);
    expect(healthData.transport).toBe("MockTransport");
  });

  // Test 404 for unknown paths
  it("should return 404 for unknown paths", async () => {
    // Make HTTP request to unknown path
    const response = await new Promise<http.IncomingMessage>((resolve) => {
      const req = http.request(
        {
          hostname: "localhost",
          port: testPort,
          path: "/unknown",
          method: "GET",
        },
        (res) => {
          resolve(res);
        }
      );

      req.end();
    });

    // Check response status
    expect(response.statusCode).toBe(404);
  });

  // Cleanup: Close server after tests
  afterAll(() => {
    if (healthServer) {
      healthServer.close();
    }

    // Restore the environment variable or delete it if it wasn't set before
    if (originalHealthCheckPort === undefined) {
      delete process.env.HEALTH_CHECK_PORT;
    } else {
      process.env.HEALTH_CHECK_PORT = originalHealthCheckPort;
    }
  });
});
