import { Request, Response } from "express";
import { ParamsDictionary } from "express-serve-static-core";
import { ParsedQs } from "qs";

/**
 * Creates a mock Express Request object for testing
 *
 * @param options Object containing request properties to mock
 * @returns A mock Express Request object
 */
export function createMockRequest<
  P = ParamsDictionary,
  ResBody = any,
  ReqBody = any,
  ReqQuery = ParsedQs,
>(
  options: Partial<Request<P, ResBody, ReqBody, ReqQuery>> = {}
): Request<P, ResBody, ReqBody, ReqQuery> {
  // Create a base mock request with common methods and properties
  const mockRequest = {
    app: {},
    baseUrl: "",
    body: {},
    cookies: {},
    fresh: false,
    hostname: "localhost",
    ip: "127.0.0.1",
    ips: [],
    method: "GET",
    originalUrl: "",
    params: {},
    path: "/",
    protocol: "http",
    query: {},
    route: {},
    secure: false,
    signedCookies: {},
    stale: true,
    subdomains: [],
    xhr: false,
    accepts: () => [],
    acceptsCharsets: () => [],
    acceptsEncodings: () => [],
    acceptsLanguages: () => [],
    get: () => "",
    header: () => "",
    is: () => false,
    range: () => [],
    ...options,
  } as Request<P, ResBody, ReqBody, ReqQuery>;

  return mockRequest;
}

/**
 * Creates a mock Express Response object for testing
 *
 * @param options Object containing response properties to mock
 * @returns A mock Express Response object
 */
export function createMockResponse<ResBody = any>(
  options: Partial<Response<ResBody>> = {}
): Response<ResBody> {
  // Create response behaviors
  let statusCode = 200;
  let responseData: unknown = {};
  let responseHeaders: Record<string, string> = {};
  let endCalled = false;

  // Create a base mock response with common methods that satisfies the Express Response interface
  const mockResponse = {
    app: {},
    headersSent: false,
    locals: {},
    statusCode,
    // Response chainable methods
    status: function (code: number): Response<ResBody> {
      statusCode = code;
      return this as Response<ResBody>;
    },
    sendStatus: function (code: number): Response<ResBody> {
      statusCode = code;
      return this as Response<ResBody>;
    },
    json: function (data: unknown): Response<ResBody> {
      responseData = data;
      return this as Response<ResBody>;
    },
    send: function (data: unknown): Response<ResBody> {
      responseData = data;
      return this as Response<ResBody>;
    },
    end: function (data?: unknown): Response<ResBody> {
      if (data) responseData = data;
      endCalled = true;
      return this as Response<ResBody>;
    },
    set: function (
      field: string | Record<string, string>,
      value?: string
    ): Response<ResBody> {
      if (typeof field === "string") {
        responseHeaders[field] = value as string;
      } else {
        responseHeaders = { ...responseHeaders, ...field };
      }
      return this as Response<ResBody>;
    },
    get: function (field: string): string | undefined {
      return responseHeaders[field];
    },
    // Testing helpers
    _getStatus: function () {
      return statusCode;
    },
    _getData: function () {
      return responseData;
    },
    _getHeaders: function () {
      return responseHeaders;
    },
    _isEnded: function () {
      return endCalled;
    },
    ...options,
  } as Response<ResBody>;

  return mockResponse;
}

// Export mock types for easier consumption
export type MockRequest = ReturnType<typeof createMockRequest>;
export type MockResponse = ReturnType<typeof createMockResponse>;
