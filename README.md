[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/bsmi021-mcp-gemini-server-badge.png)](https://mseep.ai/app/bsmi021-mcp-gemini-server)

# MCP Gemini Server

[![smithery badge](https://smithery.ai/badge/@bsmi021/mcp-gemini-server)](https://smithery.ai/server/@bsmi021/mcp-gemini-server)

## Overview

This project provides a dedicated MCP (Model Context Protocol) server that wraps the `@google/genai` SDK. It exposes Google's Gemini model capabilities as standard MCP tools, allowing other LLMs (like Cline) or MCP-compatible systems to leverage Gemini's features as a backend workhorse.

This server aims to simplify integration with Gemini models by providing a consistent, tool-based interface managed via the MCP standard.

## Features

* **Core Generation:** Standard (`gemini_generateContent`) and streaming (`gemini_generateContentStream`) text generation.
* **Function Calling:** Enables Gemini models to request the execution of client-defined functions (`gemini_functionCall`).
* **Stateful Chat:** Manages conversational context across multiple turns (`gemini_startChat`, `gemini_sendMessage`, `gemini_sendFunctionResult`).
* **File Handling:** Upload, list, retrieve, and delete files using the Gemini API.
* **Caching:** Create, list, retrieve, update, and delete cached content to optimize prompts.

## Prerequisites

* Node.js (v18 or later)
* An API Key from **Google AI Studio** (<https://aistudio.google.com/app/apikey>).
  * **Important:** The File Handling and Caching APIs are **only compatible with Google AI Studio API keys** and are **not supported** when using Vertex AI credentials. This server does not currently support Vertex AI authentication.

## Installation & Setup

### Installing via Smithery

To install Gemini Server for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@bsmi021/mcp-gemini-server):

```bash
npx -y @smithery/cli install @bsmi021/mcp-gemini-server --client claude
```

### Installing Manually

1. **Clone/Place Project:** Ensure the `mcp-gemini-server` project directory is accessible on your system.
2. **Install Dependencies:** Navigate to the project directory in your terminal and run:

    ```bash
    npm install
    ```

3. **Build Project:** Compile the TypeScript source code:

    ```bash
    npm run build
    ```

    This command uses the TypeScript compiler (`tsc`) and outputs the JavaScript files to the `./dist` directory (as specified by `outDir` in `tsconfig.json`). The main server entry point will be `dist/server.js`.
4. **Configure MCP Client:** Add the server configuration to your MCP client's settings file (e.g., `cline_mcp_settings.json` for Cline/VSCode, or `claude_desktop_config.json` for Claude Desktop App). Replace `/path/to/mcp-gemini-server` with the actual path on your system and `YOUR_API_KEY` with your Google AI Studio key.

    ```json
    {
      "mcpServers": {
        "gemini-server": { // Or your preferred name
          "command": "node",
          "args": ["/path/to/mcp-gemini-server/dist/server.js"], // Path to the compiled server entry point
          "env": {
            "GOOGLE_GEMINI_API_KEY": "YOUR_API_KEY",
            "GOOGLE_GEMINI_MODEL": "gemini-1.5-flash" // Optional: Set a default model
          },
          "disabled": false,
          "autoApprove": []
        }
        // ... other servers
      }
    }
    ```

5. **Restart MCP Client:** Restart your MCP client application (e.g., VS Code with Cline extension, Claude Desktop App) to load the new server configuration. The MCP client will manage starting and stopping the server process.

## Configuration

The server uses environment variables for configuration, passed via the `env` object in the MCP settings:

* `GOOGLE_GEMINI_API_KEY` (**Required**): Your API key obtained from Google AI Studio.
* `GOOGLE_GEMINI_MODEL` (*Optional*): Specifies a default Gemini model name (e.g., `gemini-1.5-flash`, `gemini-1.0-pro`). If set, tools that require a model name (like `gemini_generateContent`, `gemini_startChat`, etc.) will use this default when the `modelName` parameter is omitted in the tool call. This simplifies client calls when primarily using one model. If this environment variable is *not* set, the `modelName` parameter becomes required for those tools. See the [Google AI documentation](https://ai.google.dev/models/gemini) for available model names.

## Available Tools

This server provides the following MCP tools. Parameter schemas are defined using Zod for validation and description.

**Note on Optional Parameters:** Many tools accept complex optional parameters (e.g., `generationConfig`, `safetySettings`, `toolConfig`, `history`, `functionDeclarations`, `contents`). These parameters are typically objects or arrays whose structure mirrors the types defined in the underlying `@google/genai` SDK. For the exact structure and available fields within these complex parameters, please refer to:
    1. The corresponding `src/tools/*Params.ts` file in this project.
    2. The official [Google AI JS SDK Documentation](https://github.com/google/generative-ai-js).

### Core Generation

* **`gemini_generateContent`**
  * *Description:* Generates non-streaming text content from a prompt.
  * *Required Params:* `prompt` (string)
  * *Optional Params:* `modelName` (string), `generationConfig` (object), `safetySettings` (array)
* **`gemini_generateContentStream`**
  * *Description:* Generates text content via streaming. (Note: Current implementation uses a workaround and collects all chunks before returning the full text).
  * *Required Params:* `prompt` (string)
  * *Optional Params:* `modelName` (string), `generationConfig` (object), `safetySettings` (array)

### Function Calling

* **`gemini_functionCall`**
  * *Description:* Sends a prompt and function declarations to the model, returning either a text response or a requested function call object (as a JSON string).
  * *Required Params:* `prompt` (string), `functionDeclarations` (array)
  * *Optional Params:* `modelName` (string), `generationConfig` (object), `safetySettings` (array), `toolConfig` (object)

### Stateful Chat

* **`gemini_startChat`**
  * *Description:* Initiates a new stateful chat session and returns a unique `sessionId`.\n    *   *Required Params:* None
  * *Optional Params:* `modelName` (string), `history` (array), `tools` (array), `generationConfig` (object), `safetySettings` (array)
* **`gemini_sendMessage`**
  * *Description:* Sends a message within an existing chat session.\n    *   *Required Params:* `sessionId` (string), `message` (string)
  * *Optional Params:* `generationConfig` (object), `safetySettings` (array), `tools` (array), `toolConfig` (object)
* **`gemini_sendFunctionResult`**
  * *Description:* Sends the result of a function execution back to a chat session.\n    *   *Required Params:* `sessionId` (string), `functionResponses` (array)
  * *Optional Params:* `generationConfig` (object), `safetySettings` (array)

### File Handling (Google AI Studio Key Required)

* **`gemini_uploadFile`**
  * *Description:* Uploads a file from a local path.\n    **Required Params:* `filePath` (string - **must be an absolute path**)\n*   *Optional Params:* `displayName` (string), `mimeType` (string)
* **`gemini_listFiles`**
  * *Description:* Lists previously uploaded files.\n    *   *Required Params:* None
  * *Optional Params:* `pageSize` (number), `pageToken` (string - Note: `pageToken` may not be reliably returned currently).
* **`gemini_getFile`**
  * *Description:* Retrieves metadata for a specific uploaded file.\n    *   *Required Params:* `fileName` (string - e.g., `files/abc123xyz`)
* **`gemini_deleteFile`**
  * *Description:* Deletes an uploaded file.\n    *   *Required Params:* `fileName` (string - e.g., `files/abc123xyz`)

### Caching (Google AI Studio Key Required)

* **`gemini_createCache`**
  * *Description:* Creates cached content for compatible models (e.g., `gemini-1.5-flash`).\n    *   *Required Params:* `contents` (array)
  * *Optional Params:* `modelName` (string), `displayName` (string), `systemInstruction` (object), `ttl` (string - e.g., '3600s')
* **`gemini_listCaches`**
  * *Description:* Lists existing cached content.\n    *   *Required Params:* None
  * *Optional Params:* `pageSize` (number), `pageToken` (string - Note: `pageToken` may not be reliably returned currently).
* **`gemini_getCache`**
  * *Description:* Retrieves metadata for specific cached content.\n    *   *Required Params:* `cacheName` (string - e.g., `cachedContents/abc123xyz`)
* **`gemini_updateCache`**
  * *Description:* Updates metadata (TTL, displayName) for cached content.\n    *   *Required Params:* `cacheName` (string)
  * *Optional Params:* `ttl` (string), `displayName` (string)
* **`gemini_deleteCache`**
  * *Description:* Deletes cached content.\n    *   *Required Params:* `cacheName` (string - e.g., `cachedContents/abc123xyz`)

## Usage Examples

Here are examples of how an MCP client (like Cline) might call these tools using the `use_mcp_tool` format:

**Example 1: Simple Content Generation (Using Default Model)**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_generateContent</tool_name>
  <arguments>
    {
      "prompt": "Write a short poem about a rubber duck."
    }
  </arguments>
</use_mcp_tool>
```

**Example 2: Content Generation (Specifying Model & Config)**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_generateContent</tool_name>
  <arguments>
    {
      "modelName": "gemini-1.0-pro",
      "prompt": "Explain the concept of recursion in programming.",
      "generationConfig": {
        "temperature": 0.7,
        "maxOutputTokens": 500
      }
    }
  </arguments>
</use_mcp_tool>
```

**Example 3: Starting and Continuing a Chat**

*Start Chat:*

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_startChat</tool_name>
  <arguments>
    {}
  </arguments>
</use_mcp_tool>
```

*(Assume response contains `sessionId: "some-uuid-123"`)*

*Send Message:*

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_sendMessage</tool_name>
  <arguments>
    {
      "sessionId": "some-uuid-123",
      "message": "Hello! Can you tell me about the Gemini API?"
    }
  </arguments>
</use_mcp_tool>
```

**Example 4: Uploading a File**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_uploadFile</tool_name>
  <arguments>
    {
      "filePath": "C:\\Users\\YourUser\\Documents\\my_document.txt", // IMPORTANT: Use absolute path with escaped backslashes if needed
      "displayName": "My Document"
    }
  </arguments>
</use_mcp_tool>
```

## Error Handling

The server aims to return structured errors using the MCP standard `McpError` type when tool execution fails. This object typically contains:

* `code`: An `ErrorCode` enum value indicating the type of error (e.g., `InvalidParams`, `InternalError`, `PermissionDenied`, `NotFound`).
* `message`: A human-readable description of the error.
* `details`: (Optional) An object potentially containing more specific information from the underlying Gemini SDK error (like safety block reasons or API error messages) for troubleshooting.

**Common Error Scenarios:**

* **Invalid API Key:** Often results in an `InternalError` with details indicating an authentication failure.
* **Invalid Parameters:** Results in `InvalidParams` (e.g., missing required field, wrong data type).
* **Safety Blocks:** May result in `InternalError` with details indicating `SAFETY` as the block reason or finish reason.
* **File/Cache Not Found:** May result in `NotFound` or `InternalError` depending on how the SDK surfaces the error.
* **Rate Limits:** May result in `ResourceExhausted` or `InternalError`.

Check the `message` and `details` fields of the returned `McpError` for specific clues when troubleshooting.

## Development

This server follows the standard MCP server structure outlined in the project's `.clinerules` and internal documentation. Key patterns include:

* **Service Layer (`src/services`):** Encapsulates interactions with the `@google/genai` SDK, keeping it decoupled from MCP specifics.
* **Tool Layer (`src/tools`):** Adapts service layer functionality to MCP tools, handling parameter mapping and error translation.
* **Zod Schemas (`src/tools/*Params.ts`):** Used extensively for defining tool parameters, providing validation, and generating detailed descriptions crucial for LLM interaction.
* **Configuration (`src/config`):** Centralized management via `ConfigurationManager`.
* **Types (`src/types`):** Clear TypeScript definitions.

## Known Issues

* `gemini_generateContentStream` uses a workaround, collecting all chunks before returning the full text. True streaming to the MCP client is not yet implemented.
* `gemini_listFiles` and `gemini_listCaches` may not reliably return `nextPageToken` due to limitations in iterating the SDK's Pager object.
* `gemini_uploadFile` requires absolute file paths when run from the server environment.
* File Handling & Caching APIs are **not supported on Vertex AI**, only Google AI Studio API keys.
