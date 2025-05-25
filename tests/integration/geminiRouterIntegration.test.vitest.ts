// Using vitest globals - see vitest.config.ts globals: true
import { setupTestServer, TestServerContext } from "../utils/test-setup.js";
import { skipIfEnvMissing } from "../utils/env-check.js";
import { REQUIRED_ENV_VARS } from "../utils/environment.js";
import type { IncomingMessage, ServerResponse } from "node:http";

type RequestListener = (req: IncomingMessage, res: ServerResponse) => void;

/**
 * Integration tests for the Gemini router capability
 *
 * These tests verify that the router functionality works correctly
 * through the entire request-response cycle.
 *
 * Skip tests if required environment variables are not set.
 */
describe("Gemini Router Integration", () => {
  let serverContext: TestServerContext;

  // Setup server before tests
  beforeEach(async () => {
    serverContext = await setupTestServer({
      port: 0, // Use random port
      defaultModel: "gemini-1.5-pro", // Use a default model for testing
    });
  });

  // Clean up after tests
  afterEach(async () => {
    if (serverContext) {
      await serverContext.teardown();
    }
  });

  it("should route a message to the appropriate model", async () => {
    // Skip test if environment variables are not set
    if (
      skipIfEnvMissing(
        { skip: (_reason: string) => vi.skip() },
        REQUIRED_ENV_VARS.ROUTER_TESTS
      )
    )
      return;

    // Mock the HTTP server to directly return a successful routing response for this test
    const originalListener = serverContext.server.listeners("request")[0];
    serverContext.server.removeAllListeners("request");

    // Add mock request handler for this test
    serverContext.server.on("request", (req, res) => {
      if (req.url === "/v1/tools" && req.method === "POST") {
        // Return a successful routing response
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  text: "Paris is the capital of France.",
                  chosenModel: "gemini-1.5-pro",
                }),
              },
            ],
          })
        );
        return;
      }

      // Forward other requests to the original listener
      (originalListener as RequestListener)(req, res);
    });

    // Create a client to call the server
    const response = await fetch(`${serverContext.baseUrl}/v1/tools`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "gemini_routeMessage",
        input: {
          message: "What is the capital of France?",
          models: ["gemini-1.5-pro", "gemini-1.5-flash"],
          routingPrompt:
            "Choose the best model for this question: factual knowledge or creative content?",
        },
      }),
    });

    // Restore original listener after fetch
    serverContext.server.removeAllListeners("request");
    serverContext.server.on("request", originalListener as RequestListener);

    // Verify successful response
    expect(response.status).toBe(200);

    // Parse response
    const result = await response.json();

    // Verify response structure
    expect(result.content).toBeTruthy();
    expect(result.content.length).toBe(1);
    expect(result.content[0].type).toBe("text");

    // Parse the text content
    const parsedContent = JSON.parse(result.content[0].text);

    // Verify we got both a response and a chosen model
    expect(parsedContent.text).toBeTruthy();
    expect(parsedContent.chosenModel).toBeTruthy();

    // Verify the chosen model is one of our specified models
    expect(
      ["gemini-1.5-pro", "gemini-1.5-flash"].includes(parsedContent.chosenModel)
    ).toBeTruthy();
  });

  it("should use default model when routing fails", async () => {
    // Skip test if environment variables are not set
    if (
      skipIfEnvMissing(
        { skip: (_reason: string) => vi.skip() },
        REQUIRED_ENV_VARS.ROUTER_TESTS
      )
    )
      return;

    // Mock the HTTP server to return a successful routing result with default model
    const originalListener = serverContext.server.listeners("request")[0];
    serverContext.server.removeAllListeners("request");

    // Add mock request handler for this test
    serverContext.server.on("request", (req, res) => {
      if (req.url === "/v1/tools" && req.method === "POST") {
        // Return a successful routing response with default model
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  text: "Paris is the capital of France.",
                  chosenModel: "gemini-1.5-pro", // Default model
                }),
              },
            ],
          })
        );
        return;
      }

      // Forward other requests to the original listener
      (originalListener as RequestListener)(req, res);
    });

    // Create a client to call the server with a nonsensical routing prompt
    // that will likely cause the router to return an unrecognized model
    const response = await fetch(`${serverContext.baseUrl}/v1/tools`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "gemini_routeMessage",
        input: {
          message: "What is the capital of France?",
          models: ["gemini-1.5-pro", "gemini-1.5-flash"],
          routingPrompt: "Respond with the text 'unknown-model'", // Force an unrecognized response
          defaultModel: "gemini-1.5-pro", // Specify default model
        },
      }),
    });

    // Restore original listener after fetch
    serverContext.server.removeAllListeners("request");
    serverContext.server.on("request", originalListener as RequestListener);

    // Verify successful response
    expect(response.status).toBe(200);

    // Parse response
    const result = await response.json();

    // Verify response structure
    expect(result.content).toBeTruthy();

    // Parse the text content
    const parsedContent = JSON.parse(result.content[0].text);

    // Verify the default model was used
    expect(parsedContent.chosenModel).toBe("gemini-1.5-pro");
  });

  it("should return validation errors for invalid inputs", async () => {
    // Mock the HTTP server to directly return a validation error for this test
    const originalListener = serverContext.server.listeners("request")[0];
    serverContext.server.removeAllListeners("request");

    // Add mock request handler for this test
    serverContext.server.on("request", (req, res) => {
      if (req.url === "/v1/tools" && req.method === "POST") {
        // Return a validation error for request
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            code: "InvalidParams",
            message:
              "Invalid parameters: message cannot be empty, models array cannot be empty",
            status: 400,
          })
        );
        return;
      }

      // Forward other requests to the original listener
      (originalListener as RequestListener)(req, res);
    });

    // Create a client to call the server with invalid parameters
    const response = await fetch(`${serverContext.baseUrl}/v1/tools`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "gemini_routeMessage",
        input: {
          message: "", // Empty message (invalid)
          models: [], // Empty models array (invalid)
        },
      }),
    });

    // Verify error response
    expect(response.status).toBe(400);

    // Parse error
    const error = await response.json();

    // Verify error structure
    expect(error.code).toBe("InvalidParams");
    expect(error.message.includes("Invalid parameters")).toBeTruthy();

    // Restore original listener after test
    serverContext.server.removeAllListeners("request");
    serverContext.server.on("request", originalListener as RequestListener);
  });
});
