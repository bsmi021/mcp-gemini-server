# MCP Gemini Server

## Table of Contents
- [Overview](#overview)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation & Setup](#installation--setup)
- [Configuration](#configuration)
- [Available Tools](#available-tools)
- [Usage Examples](#usage-examples)
- [MCP Gemini Server and Gemini SDK's MCP Function Calling](#mcp-gemini-server-and-gemini-sdks-mcp-function-calling)
- [Environment Variables](#environment-variables)
- [Security Considerations](#security-considerations)
- [Error Handling](#error-handling)
- [Development and Testing](#development-and-testing)
- [Contributing](#contributing)
- [Code Review Tools](#code-review-tools)
- [Server Features](#server-features)
- [Known Issues](#known-issues)

## Overview

This project provides a dedicated MCP (Model Context Protocol) server that wraps the `@google/genai` SDK (v0.10.0). It exposes Google's Gemini model capabilities as standard MCP tools, allowing other LLMs (like Claude) or MCP-compatible systems to leverage Gemini's features as a backend workhorse.

This server aims to simplify integration with Gemini models by providing a consistent, tool-based interface managed via the MCP standard. It supports the latest Gemini models including `gemini-1.5-pro-latest`, `gemini-1.5-flash`, and `gemini-2.5-pro` models.


## Features

* **Core Generation:** Standard (`gemini_generateContent`) and streaming (`gemini_generateContentStream`) text generation with support for system instructions and cached content.
* **Function Calling:** Enables Gemini models to request the execution of client-defined functions (`gemini_functionCall`).
* **Stateful Chat:** Manages conversational context across multiple turns (`gemini_startChat`, `gemini_sendMessage`, `gemini_sendFunctionResult`) with support for system instructions, tools, and cached content.
* **Inline Data Processing:** Process images and audio content using inline base64 encoding for efficient content analysis without file uploads.
* **Caching:** Create, list, retrieve, update, and delete cached content to optimize prompts with support for tools and tool configurations.
* **Image Generation:** Generate images from text prompts using Gemini 2.0 Flash Experimental (`gemini_generateImage`) with control over resolution, number of images, and negative prompts. Also supports the latest Imagen 3.1 model for high-quality dedicated image generation with advanced style controls. Note that Gemini 2.5 models (Flash and Pro) do not currently support image generation.
* **Object Detection:** Detect objects in images and return bounding box coordinates (`gemini_objectDetection`) with custom prompt additions and output format options.
* **Visual Content Understanding:** Extract information from charts, diagrams, and other visual content (`gemini_contentUnderstanding`) with structured output options.
* **Audio Transcription:** Transcribe audio files with optional timestamps and multilingual support (`gemini_analyze_media` with `analysisType: "audio_transcription"`) - server reads files from disk and handles base64 conversion internally (up to 20MB file size limit).
* **URL Context Processing:** Fetch and analyze web content directly from URLs with advanced security, caching, and content processing capabilities.
  * `gemini_generateContent`: Enhanced with URL context support for including web content in prompts
  * `gemini_generateContentStream`: Streaming generation with URL context integration
  * `gemini_url_analysis`: Specialized tool for advanced URL content analysis with multiple analysis types
* **MCP Client:** Connect to and interact with external MCP servers.
  * `mcpConnectToServer`: Establishes a connection to an external MCP server.
  * `mcpListServerTools`: Lists available tools on a connected MCP server.
  * `mcpCallServerTool`: Calls a function on a connected MCP server, with an option for file output.
  * `mcpDisconnectFromServer`: Disconnects from an external MCP server.
  * `writeToFile`: Writes content directly to files within allowed directories.


## Prerequisites

* Node.js (v18 or later)
* An API Key from **Google AI Studio** (<https://aistudio.google.com/app/apikey>).
  * **Important:** The Caching API is **only compatible with Google AI Studio API keys** and is **not supported** when using Vertex AI credentials. This server does not currently support Vertex AI authentication.

## Installation & Setup

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
4. **Generate Connection Token:** Create a strong, unique connection token for secure communication between your MCP client and the server. This is a shared secret that you generate and configure on both the server and client sides.

    **Generate a secure token using one of these methods:**

    **Option A: Using Node.js crypto (Recommended)**
    ```bash
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    ```

    **Option B: Using OpenSSL**
    ```bash
    openssl rand -hex 32
    ```

    **Option C: Using PowerShell (Windows)**
    ```powershell
    [System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
    ```

    **Option D: Online Generator (Use with caution)**
    Use a reputable password generator like [1Password](https://1password.com/password-generator/) or [Bitwarden](https://bitwarden.com/password-generator/) to generate a 64-character random string.

    **Important Security Notes:**
    - The token should be at least 32 characters long and contain random characters
    - Never share this token or commit it to version control
    - Use a different token for each server instance
    - Store the token securely (environment variables, secrets manager, etc.)
    - Save this token - you'll need to use the exact same value in both server and client configurations

5. **Configure MCP Client:** Add the server configuration to your MCP client's settings file (e.g., `cline_mcp_settings.json` for Cline/VSCode, or `claude_desktop_config.json` for Claude Desktop App). Replace `/path/to/mcp-gemini-server` with the actual **absolute path** on your system, `YOUR_API_KEY` with your Google AI Studio key, and `YOUR_GENERATED_CONNECTION_TOKEN` with the token you generated in step 4.

    ```json
    {
      "mcpServers": {
        "gemini-server": { // Or your preferred name
          "command": "node",
          "args": ["/path/to/mcp-gemini-server/dist/server.js"], // Absolute path to the compiled server entry point
          "env": {
            "GOOGLE_GEMINI_API_KEY": "YOUR_API_KEY",
            "MCP_SERVER_HOST": "localhost",       // Required: Server host
            "MCP_SERVER_PORT": "8080",            // Required: Server port  
            "MCP_CONNECTION_TOKEN": "YOUR_GENERATED_CONNECTION_TOKEN", // Required: Use the token from step 4
            "GOOGLE_GEMINI_MODEL": "gemini-1.5-flash", // Optional: Set a default model
            // Optional security configurations removed - file operations no longer supported
            "ALLOWED_OUTPUT_PATHS": "/var/opt/mcp-gemini-server/outputs,/tmp/mcp-gemini-outputs" // Optional: Comma-separated list of allowed output directories for mcpCallServerTool and writeToFileTool
          },
          "disabled": false,
          "autoApprove": []
        }
        // ... other servers
      }
    }
    ```

    **Important Notes:**
    - The path in `args` must be the **absolute path** to the compiled `dist/server.js` file
    - `MCP_SERVER_HOST`, `MCP_SERVER_PORT`, and `MCP_CONNECTION_TOKEN` are required unless `NODE_ENV` is set to `test`
    - `MCP_CONNECTION_TOKEN` must be the exact same value you generated in step 4
    - Ensure the path exists and the server has been built using `npm run build`
6. **Restart MCP Client:** Restart your MCP client application (e.g., VS Code with Cline extension, Claude Desktop App) to load the new server configuration. The MCP client will manage starting and stopping the server process.

## Configuration

The server uses environment variables for configuration, passed via the `env` object in the MCP settings:

* `GOOGLE_GEMINI_API_KEY` (**Required**): Your API key obtained from Google AI Studio.
* `GOOGLE_GEMINI_MODEL` (*Optional*): Specifies a default Gemini model name (e.g., `gemini-1.5-flash`, `gemini-1.0-pro`). If set, tools that require a model name (like `gemini_generateContent`, `gemini_startChat`, etc.) will use this default when the `modelName` parameter is omitted in the tool call. This simplifies client calls when primarily using one model. If this environment variable is *not* set, the `modelName` parameter becomes required for those tools. See the [Google AI documentation](https://ai.google.dev/models/gemini) for available model names.
* `ALLOWED_OUTPUT_PATHS` (*Optional*): A comma-separated list of absolute paths to directories where the `mcpCallServerTool` (with `outputToFile` parameter) and `writeToFileTool` are allowed to write files. If not set, file output will be disabled for these tools. This is a security measure to prevent arbitrary file writes.

## Available Tools

This server provides the following MCP tools. Parameter schemas are defined using Zod for validation and description.

**Validation and Error Handling:** All parameters are validated using Zod schemas at both the MCP tool level and service layer, providing consistent validation, detailed error messages, and type safety. The server implements comprehensive error mapping to provide clear, actionable error messages.

**Retry Logic:** API requests automatically use exponential backoff retry for transient errors (network issues, rate limits, timeouts), improving reliability for unstable connections. The retry mechanism includes configurable parameters for maximum attempts, delay times, and jitter to prevent thundering herd effects.

**Note on Optional Parameters:** Many tools accept complex optional parameters (e.g., `generationConfig`, `safetySettings`, `toolConfig`, `history`, `functionDeclarations`, `contents`). These parameters are typically objects or arrays whose structure mirrors the types defined in the underlying `@google/genai` SDK (v0.10.0). For the exact structure and available fields within these complex parameters, please refer to:
    1. The corresponding `src/tools/*Params.ts` file in this project.
    2. The official [Google AI JS SDK Documentation](https://github.com/google/generative-ai-js).

### Core Generation

* **`gemini_generateContent`**
  * *Description:* Generates non-streaming text content from a prompt with optional URL context support.
  * *Required Params:* `prompt` (string)
  * *Optional Params:* 
    * `modelName` (string) - Name of the model to use
    * `generationConfig` (object) - Controls generation parameters like temperature, topP, etc.
      * `thinkingConfig` (object) - Controls model reasoning process
        * `thinkingBudget` (number) - Maximum tokens for reasoning (0-24576)
        * `reasoningEffort` (string) - Simplified control: "none" (0 tokens), "low" (1K), "medium" (8K), "high" (24K)
    * `safetySettings` (array) - Controls content filtering by harm category
    * `systemInstruction` (string or object) - System instruction to guide model behavior
    * `cachedContentName` (string) - Identifier for cached content to use with this request
    * `urlContext` (object) - Fetch and include web content from URLs
      * `urls` (array) - URLs to fetch and include as context (max 20)
      * `fetchOptions` (object) - Configuration for URL fetching
        * `maxContentKb` (number) - Maximum content size per URL in KB (default: 100)
        * `timeoutMs` (number) - Fetch timeout per URL in milliseconds (default: 10000)
        * `includeMetadata` (boolean) - Include URL metadata in context (default: true)
        * `convertToMarkdown` (boolean) - Convert HTML to markdown (default: true)
        * `allowedDomains` (array) - Specific domains to allow for this request
        * `userAgent` (string) - Custom User-Agent header for URL requests
    * `modelPreferences` (object) - Model selection preferences
  * *Note:* Can handle multimodal inputs, cached content, and URL context for comprehensive content generation
  * *Thinking Budget:* Controls the token budget for model reasoning. Lower values provide faster responses, higher values improve complex reasoning.
* **`gemini_generateContentStream`**
  * *Description:* Generates text content via streaming using Server-Sent Events (SSE) for real-time content delivery with URL context support.
  * *Required Params:* `prompt` (string)
  * *Optional Params:* 
    * `modelName` (string) - Name of the model to use
    * `generationConfig` (object) - Controls generation parameters like temperature, topP, etc.
      * `thinkingConfig` (object) - Controls model reasoning process
        * `thinkingBudget` (number) - Maximum tokens for reasoning (0-24576)
        * `reasoningEffort` (string) - Simplified control: "none" (0 tokens), "low" (1K), "medium" (8K), "high" (24K)
    * `safetySettings` (array) - Controls content filtering by harm category
    * `systemInstruction` (string or object) - System instruction to guide model behavior
    * `cachedContentName` (string) - Identifier for cached content to use with this request
    * `urlContext` (object) - Same URL context options as `gemini_generateContent`
    * `modelPreferences` (object) - Model selection preferences

### Function Calling

* **`gemini_functionCall`**
  * *Description:* Sends a prompt and function declarations to the model, returning either a text response or a requested function call object (as a JSON string).
  * *Required Params:* `prompt` (string), `functionDeclarations` (array)
  * *Optional Params:* 
    * `modelName` (string) - Name of the model to use
    * `generationConfig` (object) - Controls generation parameters
    * `safetySettings` (array) - Controls content filtering
    * `toolConfig` (object) - Configures tool behavior like temperature and confidence thresholds

### Stateful Chat

* **`gemini_startChat`**
  * *Description:* Initiates a new stateful chat session and returns a unique `sessionId`.
  * *Optional Params:* 
    * `modelName` (string) - Name of the model to use
    * `history` (array) - Initial conversation history
    * `tools` (array) - Tool definitions including function declarations
    * `generationConfig` (object) - Controls generation parameters
      * `thinkingConfig` (object) - Controls model reasoning process
        * `thinkingBudget` (number) - Maximum tokens for reasoning (0-24576)
        * `reasoningEffort` (string) - Simplified control: "none" (0 tokens), "low" (1K), "medium" (8K), "high" (24K)
    * `safetySettings` (array) - Controls content filtering
    * `systemInstruction` (string or object) - System instruction to guide model behavior
    * `cachedContentName` (string) - Identifier for cached content to use with this session
* **`gemini_sendMessage`**
  * *Description:* Sends a message within an existing chat session.
  * *Required Params:* `sessionId` (string), `message` (string)
  * *Optional Params:* 
    * `generationConfig` (object) - Controls generation parameters
      * `thinkingConfig` (object) - Controls model reasoning process
        * `thinkingBudget` (number) - Maximum tokens for reasoning (0-24576)
        * `reasoningEffort` (string) - Simplified control: "none" (0 tokens), "low" (1K), "medium" (8K), "high" (24K)
    * `safetySettings` (array) - Controls content filtering
    * `tools` (array) - Tool definitions including function declarations
    * `toolConfig` (object) - Configures tool behavior
    * `cachedContentName` (string) - Identifier for cached content to use with this message
* **`gemini_sendFunctionResult`**
  * *Description:* Sends the result of a function execution back to a chat session.
  * *Required Params:* `sessionId` (string), `functionResponse` (string) - The result of the function execution
  * *Optional Params:* `functionCall` (object) - Reference to the original function call
* **`gemini_routeMessage`**
  * *Description:* Routes a message to the most appropriate model from a provided list based on message content. Returns both the model's response and which model was selected.
  * *Required Params:* 
    * `message` (string) - The text message to be routed to the most appropriate model
    * `models` (array) - Array of model names to consider for routing (e.g., ['gemini-1.5-flash', 'gemini-1.5-pro']). The first model in the list will be used for routing decisions.
  * *Optional Params:* 
    * `routingPrompt` (string) - Custom prompt to use for routing decisions. If not provided, a default routing prompt will be used.
    * `defaultModel` (string) - Model to fall back to if routing fails. If not provided and routing fails, an error will be thrown.
    * `generationConfig` (object) - Generation configuration settings to apply to the selected model's response.
      * `thinkingConfig` (object) - Controls model reasoning process
        * `thinkingBudget` (number) - Maximum tokens for reasoning (0-24576)
        * `reasoningEffort` (string) - Simplified control: "none" (0 tokens), "low" (1K), "medium" (8K), "high" (24K)
    * `safetySettings` (array) - Safety settings to apply to both routing and final response.
    * `systemInstruction` (string or object) - A system instruction to guide the model's behavior after routing.

### Remote File Operations (Deprecated - Use Inline Data Instead)

* **`gemini_remote_files`**
  * *Description:* Provides guidance on migrating from file upload operations to inline data usage. File upload, list, get, and delete operations are no longer supported.
  * *Required Params:* `operation` (string - "upload", "list", "get", or "delete")
  * *Optional Params:* `fileName` (string - for get/delete operations)
  * *Response:* Returns detailed guidance on how to use inline base64 data instead of file operations, including code examples and limitations.
  * *Migration Note:* This tool helps users transition from the deprecated file upload system to the current inline data approach. For images and audio files under 20MB, use base64 encoding directly in tool parameters.

### Caching (Google AI Studio Key Required)

* **`gemini_createCache`**
  * *Description:* Creates cached content for compatible models (e.g., `gemini-1.5-flash`).
  * *Required Params:* `contents` (array), `model` (string)
  * *Optional Params:* 
    * `displayName` (string) - Human-readable name for the cached content
    * `systemInstruction` (string or object) - System instruction to apply to the cached content
    * `ttl` (string - e.g., '3600s') - Time-to-live for the cached content
    * `tools` (array) - Tool definitions for use with the cached content
    * `toolConfig` (object) - Configuration for the tools
* **`gemini_listCaches`**
  * *Description:* Lists existing cached content.
  * *Required Params:* None
  * *Optional Params:* `pageSize` (number), `pageToken` (string - Note: `pageToken` may not be reliably returned currently).
* **`gemini_getCache`**
  * *Description:* Retrieves metadata for specific cached content.
  * *Required Params:* `cacheName` (string - e.g., `cachedContents/abc123xyz`)
* **`gemini_updateCache`**
  * *Description:* Updates metadata and contents for cached content.
  * *Required Params:* `cacheName` (string), `contents` (array)
  * *Optional Params:* 
    * `displayName` (string) - Updated display name
    * `systemInstruction` (string or object) - Updated system instruction
    * `ttl` (string) - Updated time-to-live
    * `tools` (array) - Updated tool definitions
    * `toolConfig` (object) - Updated tool configuration
* **`gemini_deleteCache`**
  * *Description:* Deletes cached content.
  * *Required Params:* `cacheName` (string - e.g., `cachedContents/abc123xyz`)

### Image Generation

* **`gemini_generateImage`**
  * *Description:* Generates images from text prompts using available image generation models.
  * *Required Params:* `prompt` (string - descriptive text prompt for image generation)
  * *Optional Params:* 
    * `modelName` (string - defaults to "imagen-3.1-generate-003" for high-quality dedicated image generation or use "gemini-2.0-flash-exp-image-generation" for Gemini models)
    * `resolution` (string enum: "512x512", "1024x1024", "1536x1536")
    * `numberOfImages` (number - 1-8, default: 1)
    * `safetySettings` (array) - Controls content filtering for generated images
    * `negativePrompt` (string - features to avoid in the generated image)
    * `stylePreset` (string enum: "photographic", "digital-art", "cinematic", "anime", "3d-render", "oil-painting", "watercolor", "pixel-art", "sketch", "comic-book", "neon", "fantasy")
    * `seed` (number - integer value for reproducible generation)
    * `styleStrength` (number - strength of style preset, 0.0-1.0)
  * *Response:* Returns an array of base64-encoded images with metadata including dimensions and MIME type.
  * *Notes:* Image generation uses significant resources, especially at higher resolutions. Consider using smaller resolutions for faster responses and less resource usage.

### Object Detection

* **`gemini_objectDetection`**
  * *Description:* Detects objects in images and returns their positions with bounding box coordinates.
  * *Required Params:* `image` (object with `type` "base64", `data` [base64-encoded image data], and `mimeType`)
  * *Optional Params:* 
    * `modelName` (string - defaults to server's default model)
    * `promptAddition` (string - custom instructions for detection)
    * `outputFormat` (string enum: "json" | "text", default: "json")
    * `safetySettings` (array) - Controls content filtering
  * *Response:* JSON array of detected objects with labels, normalized bounding box coordinates (0-1000 scale), and confidence scores. When `outputFormat` is "text", returns natural language description.
  * *Notes:* This tool is optimized for common object detection in photographs, diagrams, and scenes. Images must be provided as base64-encoded data.

### Visual Content Understanding

* **`gemini_contentUnderstanding`**
  * *Description:* Analyzes and extracts information from visual content like charts, diagrams, documents, and complex visuals.
  * *Required Params:* 
    * `image` (object with `type` "base64", `data` [base64-encoded image data], and `mimeType`)
    * `prompt` (string - instructions for analyzing the content)
  * *Optional Params:* 
    * `modelName` (string - defaults to server's default model)
    * `structuredOutput` (boolean - whether to return JSON structure)
    * `safetySettings` (array) - Controls content filtering
  * *Response:* When `structuredOutput` is true, returns JSON-structured data extracted from the visual content. Otherwise, returns natural language analysis.
  * *Notes:* Particularly effective for extracting data from charts, tables, diagrams, receipts, documents, and other structured visual information. Images must be provided as base64-encoded data.

### Audio Transcription

* **`gemini_analyze_media`** (with `analysisType: "audio_transcription"`)
  * *Description:* Transcribes audio files using Gemini models. The server reads the file from disk and handles base64 conversion internally.
  * *Required Params:* 
    * `analysisType` (string - must be "audio_transcription")
    * `filePath` (string - **must be an absolute path** accessible by the server process)
  * *Optional Params:*
    * `modelName` (string - defaults to server's default model)
    * `includeTimestamps` (boolean - include timestamps for paragraphs/speaker changes)
    * `language` (string - BCP-47 code, e.g., 'en-US', 'fr-FR')
    * `prompt` (string - additional instructions for transcription)
    * `mimeType` (string - audio format, inferred from extension if not provided)
  * *Supported Audio Formats:* WAV, MP3, AIFF, AAC, OGG, FLAC (audio/wav, audio/mp3, audio/aiff, audio/aac, audio/ogg, audio/flac)
  * *File Size Limitation:* The server enforces a 20MB limit on the original file size (before base64 encoding). Files exceeding this limit will be rejected with an error message.
  * *Notes:*
    * The server reads the file from the provided path and converts it to base64 internally
    * File paths are validated for security - must be within allowed directories
    * The 20MB limit applies to the original file size, not the base64-encoded size
    * Transcription quality may vary based on audio quality, background noise, and number of speakers
    * For larger files, consider splitting the audio into smaller segments before transcription

### URL Content Analysis

* **`gemini_url_analysis`**
  * *Description:* Advanced URL analysis tool that fetches content from web pages and performs specialized analysis tasks with comprehensive security and performance optimizations.
  * *Required Params:* 
    * `urls` (array) - URLs to analyze (1-20 URLs supported)
    * `analysisType` (string enum) - Type of analysis to perform:
      * `summary` - Comprehensive content summarization
      * `comparison` - Multi-URL content comparison
      * `extraction` - Structured information extraction
      * `qa` - Question-based content analysis
      * `sentiment` - Emotional tone analysis
      * `fact-check` - Credibility assessment
      * `content-classification` - Topic and type categorization
      * `readability` - Accessibility and complexity analysis
      * `seo-analysis` - Search optimization evaluation
  * *Optional Params:*
    * `query` (string) - Specific query or instruction for the analysis
    * `extractionSchema` (object) - JSON schema for structured data extraction
    * `questions` (array) - List of specific questions to answer (for Q&A analysis)
    * `compareBy` (array) - Specific aspects to compare when using comparison analysis
    * `outputFormat` (string enum: "text", "json", "markdown", "structured") - Desired output format
    * `includeMetadata` (boolean) - Include URL metadata in the analysis (default: true)
    * `fetchOptions` (object) - Advanced URL fetching options (same as urlContext fetchOptions)
    * `modelName` (string) - Specific Gemini model to use (auto-selected if not specified)
  * *Security Features:* Multi-layer URL validation, domain restrictions, private network protection, and rate limiting
  * *Performance Features:* Intelligent caching, concurrent processing, and optimal model selection based on content complexity

### MCP Client Tools

* **`mcpConnectToServer`**
  * *Description:* Establishes a connection to an external MCP server and returns a connection ID.
  * *Required Params:*
    * `serverId` (string): A unique identifier for this server connection.
    * `connectionType` (string enum: "sse" | "stdio"): The transport protocol to use.
    * `sseUrl` (string, optional if `connectionType` is "stdio"): The URL for SSE connection.
    * `stdioCommand` (string, optional if `connectionType` is "sse"): The command to run for stdio connection.
    * `stdioArgs` (array of strings, optional): Arguments for the stdio command.
    * `stdioEnv` (object, optional): Environment variables for the stdio command.
  * *Important:* This tool returns a `connectionId` that must be used in subsequent calls to `mcpListServerTools`, `mcpCallServerTool`, and `mcpDisconnectFromServer`. This `connectionId` is generated internally and is different from the `serverId` parameter.
* **`mcpListServerTools`**
  * *Description:* Lists available tools on a connected MCP server.
  * *Required Params:*
    * `connectionId` (string): The connection identifier returned by `mcpConnectToServer`.
* **`mcpCallServerTool`**
  * *Description:* Calls a function on a connected MCP server.
  * *Required Params:*
    * `connectionId` (string): The connection identifier returned by `mcpConnectToServer`.
    * `toolName` (string): The name of the tool to call on the remote server.
    * `toolArgs` (object): The arguments to pass to the remote tool.
  * *Optional Params:*
    * `outputToFile` (string): If provided, the tool's output will be written to this file path. The path must be within one of the directories specified in the `ALLOWED_OUTPUT_PATHS` environment variable.
* **`mcpDisconnectFromServer`**
  * *Description:* Disconnects from an external MCP server.
  * *Required Params:*
    * `connectionId` (string): The connection identifier returned by `mcpConnectToServer`.
* **`writeToFile`**
  * *Description:* Writes content directly to a file.
  * *Required Params:*
    * `filePath` (string): The absolute path of the file to write to. Must be within one of the directories specified in the `ALLOWED_OUTPUT_PATHS` environment variable.
    * `content` (string): The content to write to the file.
  * *Optional Params:*
    * `overwrite` (boolean, default: false): If true, overwrite the file if it already exists. Otherwise, an error will be thrown if the file exists.

## Usage Examples

Here are examples of how an MCP client (like Claude) might call these tools using the `use_mcp_tool` format:


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

**Example 2b: Content Generation with Thinking Budget Control**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_generateContent</tool_name>
  <arguments>
    {
      "modelName": "gemini-1.5-pro",
      "prompt": "Solve this complex math problem: Find all values of x where 2sin(x) = x^2-x+1 in the range [0, 2π].",
      "generationConfig": {
        "temperature": 0.2,
        "maxOutputTokens": 1000,
        "thinkingConfig": {
          "thinkingBudget": 8192
        }
      }
    }
  </arguments>
</use_mcp_tool>
```

**Example 2c: Content Generation with Simplified Reasoning Effort**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_generateContent</tool_name>
  <arguments>
    {
      "modelName": "gemini-1.5-pro",
      "prompt": "Solve this complex math problem: Find all values of x where 2sin(x) = x^2-x+1 in the range [0, 2π].",
      "generationConfig": {
        "temperature": 0.2,
        "maxOutputTokens": 1000,
        "thinkingConfig": {
          "reasoningEffort": "high"
        }
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

**Example 4: Content Generation with System Instructions (Simplified Format)**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_generateContent</tool_name>
  <arguments>
    {
      "modelName": "gemini-2.5-pro-exp",
      "prompt": "What should I do with my day off?",
      "systemInstruction": "You are a helpful assistant that provides friendly and detailed advice. You should focus on outdoor activities and wellness."
    }
  </arguments>
</use_mcp_tool>
```

**Example 5: Content Generation with System Instructions (Object Format)**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_generateContent</tool_name>
  <arguments>
    {
      "modelName": "gemini-1.5-pro-latest",
      "prompt": "What should I do with my day off?",
      "systemInstruction": {
        "parts": [
          {
            "text": "You are a helpful assistant that provides friendly and detailed advice. You should focus on outdoor activities and wellness."
          }
        ]
      }
    }
  </arguments>
</use_mcp_tool>
```

**Example 6: Using Cached Content with System Instruction**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_generateContent</tool_name>
  <arguments>
    {
      "modelName": "gemini-2.5-pro-exp",
      "prompt": "Explain how these concepts relate to my product?",
      "cachedContentName": "cachedContents/abc123xyz",
      "systemInstruction": "You are a product expert who explains technical concepts in simple terms."
    }
  </arguments>
</use_mcp_tool>
```

**Example 6: Using Remote Files Tool for Migration Guidance**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_remote_files</tool_name>
  <arguments>
    {
      "operation": "upload"
    }
  </arguments>
</use_mcp_tool>
```

*This returns detailed guidance on how to use inline base64 data instead of file uploads.*


**Example 7: Generating an Image**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_generateImage</tool_name>
  <arguments>
    {
      "prompt": "A futuristic cityscape with flying cars and neon lights",
      "modelName": "gemini-2.0-flash-exp-image-generation",
      "resolution": "1024x1024",
      "numberOfImages": 1,
      "negativePrompt": "dystopian, ruins, dark, gloomy"
    }
  </arguments>
</use_mcp_tool>
```

**Example 7b: Generating a High-Quality Image with Imagen 3.1**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_generateImage</tool_name>
  <arguments>
    {
      "prompt": "A futuristic cityscape with flying cars and neon lights",
      "modelName": "imagen-3.1-generate-003",
      "resolution": "1024x1024",
      "numberOfImages": 4,
      "negativePrompt": "dystopian, ruins, dark, gloomy"
    }
  </arguments>
</use_mcp_tool>
```

**Example 7c: Using Advanced Style Options**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_generateImage</tool_name>
  <arguments>
    {
      "prompt": "A futuristic cityscape with flying cars and neon lights",
      "modelName": "imagen-3.1-generate-003",
      "resolution": "1024x1024",
      "numberOfImages": 2,
      "stylePreset": "anime",
      "styleStrength": 0.8,
      "seed": 12345
    }
  </arguments>
</use_mcp_tool>
```

**Example 8: Detecting Objects in an Image**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_objectDetection</tool_name>
  <arguments>
    {
      "image": {
        "type": "base64",
        "data": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkG...", // Base64 encoded image data
        "mimeType": "image/jpeg"
      },
      "outputFormat": "json",
      "promptAddition": "Focus on vehicles and pedestrians, ignore buildings"
    }
  </arguments>
</use_mcp_tool>
```

**Example 9: Understanding Chart Content**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_contentUnderstanding</tool_name>
  <arguments>
    {
      "image": {
        "type": "base64",
        "data": "data:image/png;base64,iVBORw0KGgoAA...", // Base64 encoded chart image
        "mimeType": "image/png"
      },
      "prompt": "Extract the data from this sales chart and identify the key trends",
      "structuredOutput": true
    }
  </arguments>
</use_mcp_tool>
```

**Example 10: Audio Transcription**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_analyze_media</tool_name>
  <arguments>
    {
      "analysisType": "audio_transcription",
      "filePath": "/absolute/path/to/recording.mp3",
      "includeTimestamps": true,
      "language": "en-US",
      "prompt": "Identify different speakers if possible"
    }
  </arguments>
</use_mcp_tool>
```

**Example 11: Audio Transcription with MIME Type**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_analyze_media</tool_name>
  <arguments>
    {
      "analysisType": "audio_transcription",
      "filePath": "/absolute/path/to/recording.wav",
      "mimeType": "audio/wav",
      "includeTimestamps": true,
      "language": "fr-FR"
    }
  </arguments>
</use_mcp_tool>
```

*Note: The server reads the file and converts it to base64 internally. Files over 20MB (original size) will return an error. Consider splitting large audio files into smaller segments.*

**Example 12: Message Routing Between Models**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_routeMessage</tool_name>
  <arguments>
    {
      "message": "Can you create a detailed business plan for a sustainable fashion startup?",
      "models": ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.5-pro"],
      "routingPrompt": "Analyze this message and determine which model would be best suited to handle it. Consider: gemini-1.5-flash for simpler tasks, gemini-1.5-pro for balanced capabilities, and gemini-2.5-pro for complex creative tasks.",
      "defaultModel": "gemini-1.5-pro",
      "generationConfig": {
        "temperature": 0.7,
        "maxOutputTokens": 1024
      }
    }
  </arguments>
</use_mcp_tool>
```

The response will be a JSON string containing both the text response and which model was chosen:

```json
{
  "text": "# Business Plan for Sustainable Fashion Startup\n\n## Executive Summary\n...",
  "chosenModel": "gemini-2.5-pro"
}
```

**Example 13: Using URL Context with Content Generation**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_generateContent</tool_name>
  <arguments>
    {
      "prompt": "Summarize the main points from these articles and compare their approaches to sustainable technology",
      "urlContext": {
        "urls": [
          "https://example.com/sustainable-tech-2024",
          "https://techblog.com/green-innovation"
        ],
        "fetchOptions": {
          "maxContentKb": 150,
          "includeMetadata": true,
          "convertToMarkdown": true
        }
      },
      "modelPreferences": {
        "preferQuality": true,
        "taskType": "reasoning"
      }
    }
  </arguments>
</use_mcp_tool>
```

**Example 14: Advanced URL Analysis**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_url_analysis</tool_name>
  <arguments>
    {
      "urls": ["https://company.com/about", "https://company.com/products"],
      "analysisType": "extraction",
      "extractionSchema": {
        "companyName": "string",
        "foundedYear": "number",
        "numberOfEmployees": "string",
        "mainProducts": "array",
        "headquarters": "string",
        "financialInfo": "object"
      },
      "outputFormat": "json",
      "query": "Extract comprehensive company information including business details and product offerings"
    }
  </arguments>
</use_mcp_tool>
```

**Example 15: Multi-URL Content Comparison**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_url_analysis</tool_name>
  <arguments>
    {
      "urls": [
        "https://site1.com/pricing",
        "https://site2.com/pricing", 
        "https://site3.com/pricing"
      ],
      "analysisType": "comparison",
      "compareBy": ["pricing models", "features", "target audience", "value proposition"],
      "outputFormat": "markdown",
      "includeMetadata": true
    }
  </arguments>
</use_mcp_tool>
```

**Example 16: URL Content with Security Restrictions**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_generateContent</tool_name>
  <arguments>
    {
      "prompt": "Analyze the content from these trusted news sources",
      "urlContext": {
        "urls": [
          "https://reuters.com/article/tech-news",
          "https://bbc.com/news/technology"
        ],
        "fetchOptions": {
          "allowedDomains": ["reuters.com", "bbc.com"],
          "maxContentKb": 200,
          "timeoutMs": 15000,
          "userAgent": "Research-Bot/1.0"
        }
      }
    }
  </arguments>
</use_mcp_tool>
```

**Example 8: Connecting to an External MCP Server (SSE)**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>mcpConnectToServer</tool_name>
  <arguments>
    {
      "serverId": "my-external-server",
      "connectionType": "sse",
      "sseUrl": "http://localhost:8080/mcp"
    }
  </arguments>
</use_mcp_tool>
```

*(Assume response contains a unique connection ID like: `connectionId: "12345-abcde-67890"`)*

**Example 9: Calling a Tool on an External MCP Server and Writing Output to File**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>mcpCallServerTool</tool_name>
  <arguments>
    {
      "connectionId": "12345-abcde-67890", // Use the connectionId returned by mcpConnectToServer
      "toolName": "remote_tool_name",
      "toolArgs": { "param1": "value1" },
      "outputToFile": "/var/opt/mcp-gemini-server/outputs/result.json"
    }
  </arguments>
</use_mcp_tool>
```

**Important: The `connectionId` used in MCP client tools must be the connection identifier returned by `mcpConnectToServer`, not the original `serverId` parameter.**

**Note:** The `outputToFile` path must be within one of the directories specified in the `ALLOWED_OUTPUT_PATHS` environment variable. For example, if `ALLOWED_OUTPUT_PATHS="/path/to/allowed/output,/another/allowed/path"`, then the file path must be a subdirectory of one of these paths.

**Example 10: Writing Content Directly to a File**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>writeToFile</tool_name>
  <arguments>
    {
      "filePath": "/path/to/allowed/output/my_notes.txt",
      "content": "This is some important content.",
      "overwrite": true
    }
  </arguments>
</use_mcp_tool>
```

**Note:** Like with `mcpCallServerTool`, the `filePath` must be within one of the directories specified in the `ALLOWED_OUTPUT_PATHS` environment variable. This is a critical security feature to prevent unauthorized file writes.

## `mcp-gemini-server` and Gemini SDK's MCP Function Calling

The official Google Gemini API documentation includes examples (such as for [function calling with MCP structure](https://ai.google.dev/gemini-api/docs/function-calling?example=weather#model_context_protocol_mcp)) that demonstrate how you can use the client-side Gemini SDK (e.g., in Python or Node.js) to interact with the Gemini API. In such scenarios, particularly for function calling, the client SDK itself can be used to structure requests and handle responses in a manner that aligns with MCP principles.

The `mcp-gemini-server` project offers a complementary approach by providing a **fully implemented, standalone MCP server**. Instead of your client application directly using the Gemini SDK to format MCP-style messages for the Gemini API, your client application (which could be another LLM like Claude, a custom script, or any MCP-compatible system) would:

1.  Connect to an instance of this `mcp-gemini-server`.
2.  Call the pre-defined MCP tools exposed by this server, such as `gemini_functionCall`, `gemini_generateContent`, etc.

This `mcp-gemini-server` then internally handles all the necessary interactions with the Google Gemini API, including structuring the requests, managing API keys, and processing responses, abstracting these details away from your MCP client.

### Benefits of using `mcp-gemini-server`:

*   **Abstraction & Simplicity:** Client applications don't need to integrate the Gemini SDK directly or manage the specifics of its API for MCP-style interactions. They simply make standard MCP tool calls.
*   **Centralized Configuration:** API keys, default model choices, safety settings, and other configurations are managed centrally within the `mcp-gemini-server`.
*   **Rich Toolset:** Provides a broad set of pre-defined MCP tools for various Gemini features (text generation, chat, file handling, image generation, etc.), not just function calling.
*   **Interoperability:** Enables any MCP-compatible client to leverage Gemini's capabilities without needing native Gemini SDK support.

### When to Choose Which Approach:

*   **Direct SDK Usage (as in Google's MCP examples):**
    *   Suitable if you are building a client application (e.g., in Python or Node.js) and want fine-grained control over the Gemini API interaction directly within that client.
    *   Useful if you prefer to manage the Gemini SDK dependencies and logic within your client application and are primarily focused on function calling structured in an MCP-like way.
*   **Using `mcp-gemini-server`:**
    *   Ideal if you want to expose Gemini capabilities to an existing MCP-compatible ecosystem (e.g., another LLM, a workflow automation system).
    *   Beneficial if you want to rapidly prototype or deploy Gemini features as tools without extensive client-side SDK integration.
    *   Preferable if you need a wider range of Gemini features exposed as consistent MCP tools and want to centralize the Gemini API interaction point.

### A Note on This Server's Own MCP Client Tools:

The `mcp-gemini-server` also includes tools like `mcpConnectToServer`, `mcpListServerTools`, and `mcpCallServerTool`. These tools allow *this server* to act as an MCP *client* to *other external* MCP servers. This is a distinct capability from how an MCP client would connect *to* `mcp-gemini-server` to utilize Gemini features.

## Environment Variables

### Required:
- `GOOGLE_GEMINI_API_KEY`: Your Google Gemini API key (required)

### Required for Production (unless NODE_ENV=test):
- `MCP_SERVER_HOST`: Server host address (e.g., "localhost")
- `MCP_SERVER_PORT`: Port for network transports (e.g., "8080")
- `MCP_CONNECTION_TOKEN`: A strong, unique shared secret token that clients must provide when connecting to this server. This is NOT provided by Google or any external service - you must generate it yourself using a cryptographically secure method. See the installation instructions (step 4) for generation methods. This token must be identical on both the server and all connecting clients.

### Optional - Gemini API Configuration:
- `GOOGLE_GEMINI_MODEL`: Default model to use (e.g., `gemini-1.5-pro-latest`, `gemini-1.5-flash`)
- `GOOGLE_GEMINI_DEFAULT_THINKING_BUDGET`: Default thinking budget in tokens (0-24576) for controlling model reasoning
- `GOOGLE_GEMINI_IMAGE_RESOLUTION`: Default image resolution (512x512, 1024x1024, or 1536x1536)
- `GOOGLE_GEMINI_MAX_IMAGE_SIZE_MB`: Maximum allowed image size in MB
- `GOOGLE_GEMINI_SUPPORTED_IMAGE_FORMATS`: JSON array of supported image formats (e.g., `["image/jpeg","image/png","image/webp"]`)
- `GEMINI_SAFE_AUDIO_BASE_DIR`: Restricts audio file access for transcription to a specific directory for security (defaults to current working directory). This is used for validating file paths in `gemini_analyze_media` when `analysisType` is "audio_transcription".

### Optional - URL Context Configuration:
- `GOOGLE_GEMINI_ENABLE_URL_CONTEXT`: Enable URL context features (options: `true`, `false`; default: `false`)
- `GOOGLE_GEMINI_URL_MAX_COUNT`: Maximum URLs per request (default: `20`)
- `GOOGLE_GEMINI_URL_MAX_CONTENT_KB`: Maximum content size per URL in KB (default: `100`)
- `GOOGLE_GEMINI_URL_FETCH_TIMEOUT_MS`: Fetch timeout per URL in milliseconds (default: `10000`)
- `GOOGLE_GEMINI_URL_ALLOWED_DOMAINS`: Comma-separated list or JSON array of allowed domains (default: `*` for all domains)
- `GOOGLE_GEMINI_URL_BLOCKLIST`: Comma-separated list or JSON array of blocked domains (default: empty)
- `GOOGLE_GEMINI_URL_CONVERT_TO_MARKDOWN`: Convert HTML content to markdown (options: `true`, `false`; default: `true`)
- `GOOGLE_GEMINI_URL_INCLUDE_METADATA`: Include URL metadata in context (options: `true`, `false`; default: `true`)
- `GOOGLE_GEMINI_URL_ENABLE_CACHING`: Enable URL content caching (options: `true`, `false`; default: `true`)
- `GOOGLE_GEMINI_URL_USER_AGENT`: Custom User-Agent header for URL requests (default: `MCP-Gemini-Server/1.0`)

### Optional - Security Configuration:
- `ALLOWED_OUTPUT_PATHS`: A comma-separated list of absolute paths to directories where tools like `mcpCallServerTool` (with outputToFile parameter) and `writeToFileTool` are allowed to write files. Critical security feature to prevent unauthorized file writes. If not set, file output will be disabled for these tools.

### Optional - Server Configuration:
- `MCP_CLIENT_ID`: Default client ID used when this server acts as a client to other MCP servers (defaults to "gemini-sdk-client")
- `MCP_TRANSPORT`: Transport to use for MCP server (options: `stdio`, `sse`, `streamable`, `http`; default: `stdio`)
  - IMPORTANT: SSE (Server-Sent Events) is NOT deprecated and remains a critical component of the MCP protocol
  - SSE is particularly valuable for bidirectional communication, enabling features like dynamic tool updates and sampling
  - Each transport type has specific valid use cases within the MCP ecosystem
- `MCP_LOG_LEVEL`: Log level for MCP operations (options: `debug`, `info`, `warn`, `error`; default: `info`)
- `MCP_ENABLE_STREAMING`: Enable SSE streaming for HTTP transport (options: `true`, `false`; default: `false`)
- `MCP_SESSION_TIMEOUT`: Session timeout in seconds for HTTP transport (default: `3600` = 1 hour)
- `SESSION_STORE_TYPE`: Session storage backend (`memory` or `sqlite`; default: `memory`)
- `SQLITE_DB_PATH`: Path to SQLite database file when using sqlite store (default: `./data/sessions.db`)

### Optional - GitHub Integration:
- `GITHUB_API_TOKEN`: Personal Access Token for GitHub API access (required for GitHub code review features). For public repos, token needs 'public_repo' and 'read:user' scopes. For private repos, token needs 'repo' scope.

### Optional - Legacy Server Configuration (Deprecated):
- `MCP_TRANSPORT_TYPE`: Deprecated - Use `MCP_TRANSPORT` instead
- `MCP_WS_PORT`: Deprecated - Use `MCP_SERVER_PORT` instead
- `ENABLE_HEALTH_CHECK`: Enable health check server (options: `true`, `false`; default: `true`)
- `HEALTH_CHECK_PORT`: Port for health check HTTP server (default: `3000`)

You can create a `.env` file in the root directory with these variables:

```env
# Required API Configuration
GOOGLE_GEMINI_API_KEY=your_api_key_here

# Required for Production (unless NODE_ENV=test)
MCP_SERVER_HOST=localhost
MCP_SERVER_PORT=8080
MCP_CONNECTION_TOKEN=your_secure_token_here

# Optional API Configuration
GOOGLE_GEMINI_MODEL=gemini-1.5-pro-latest
GOOGLE_GEMINI_DEFAULT_THINKING_BUDGET=4096
GOOGLE_GEMINI_IMAGE_RESOLUTION=1024x1024
GOOGLE_GEMINI_MAX_IMAGE_SIZE_MB=10
GOOGLE_GEMINI_SUPPORTED_IMAGE_FORMATS=["image/jpeg","image/png","image/webp"]

# Security Configuration
GEMINI_SAFE_AUDIO_BASE_DIR=/var/opt/mcp-gemini-server/audio_files  # For audio transcription file validation
ALLOWED_OUTPUT_PATHS=/var/opt/mcp-gemini-server/outputs,/tmp/mcp-gemini-outputs   # For mcpCallServerTool and writeToFileTool

# URL Context Configuration
GOOGLE_GEMINI_ENABLE_URL_CONTEXT=true  # Enable URL context features
GOOGLE_GEMINI_URL_MAX_COUNT=20          # Maximum URLs per request
GOOGLE_GEMINI_URL_MAX_CONTENT_KB=100    # Maximum content size per URL in KB
GOOGLE_GEMINI_URL_FETCH_TIMEOUT_MS=10000 # Fetch timeout per URL in milliseconds
GOOGLE_GEMINI_URL_ALLOWED_DOMAINS=*     # Allowed domains (* for all, or comma-separated list)
GOOGLE_GEMINI_URL_BLOCKLIST=malicious.com,spam.net # Blocked domains (comma-separated)
GOOGLE_GEMINI_URL_CONVERT_TO_MARKDOWN=true # Convert HTML to markdown
GOOGLE_GEMINI_URL_INCLUDE_METADATA=true # Include URL metadata in context
GOOGLE_GEMINI_URL_ENABLE_CACHING=true   # Enable URL content caching
GOOGLE_GEMINI_URL_USER_AGENT=MCP-Gemini-Server/1.0 # Custom User-Agent

# Server Configuration
MCP_CLIENT_ID=gemini-sdk-client  # Optional: Default client ID for MCP connections (defaults to "gemini-sdk-client")
MCP_TRANSPORT=stdio  # Options: stdio, sse, streamable, http (replaced deprecated MCP_TRANSPORT_TYPE)
MCP_LOG_LEVEL=info   # Optional: Log level for MCP operations (debug, info, warn, error)
MCP_ENABLE_STREAMING=true # Enable SSE streaming for HTTP transport
MCP_SESSION_TIMEOUT=3600  # Session timeout in seconds for HTTP transport
SESSION_STORE_TYPE=memory  # Options: memory, sqlite
SQLITE_DB_PATH=./data/sessions.db  # Path to SQLite database file when using sqlite store
ENABLE_HEALTH_CHECK=true
HEALTH_CHECK_PORT=3000

# GitHub Integration
GITHUB_API_TOKEN=your_github_token_here
```

## Security Considerations

This server implements several security measures to protect against common vulnerabilities. Understanding these security features is critical when deploying in production environments.

### File System Security

1. **Path Validation and Isolation**
   - **ALLOWED_OUTPUT_PATHS**: Critical security feature that restricts where file writing tools can write files
   - **GEMINI_SAFE_AUDIO_BASE_DIR**: Restricts where audio transcription can access audio files for processing
   - **Security Principle**: Files can only be created, read, or modified within explicitly allowed directories
   - **Production Requirement**: Always use absolute paths to prevent potential directory traversal attacks

2. **Path Traversal Protection**
   - The `FileSecurityService` implements robust path traversal protection by:
     - Fully resolving paths to their absolute form
     - Normalizing paths to handle ".." and "." segments properly
     - Validating that normalized paths stay within allowed directories
     - Checking both string-based prefixes and relative path calculations for redundant security

3. **Symlink Security**
   - Symbolic links are fully resolved and checked against allowed directories
   - Both the symlink itself and its target are validated
   - Parent directory symlinks are iteratively checked to prevent circumvention 
   - Multi-level symlink chains are fully resolved before validation

### Authentication & Authorization

1. **Connection Tokens**
   - `MCP_CONNECTION_TOKEN` provides basic authentication for clients connecting to this server
   - Should be treated as a secret and use a strong, unique value in production

2. **API Key Security**
   - `GOOGLE_GEMINI_API_KEY` grants access to Google Gemini API services
   - Must be kept secure and never exposed in client-side code or logs
   - Use environment variables or secure secret management systems to inject this value

### URL Context Security

1. **Multi-Layer URL Validation**
   - **Protocol Validation**: Only HTTP/HTTPS protocols are allowed
   - **Private Network Protection**: Blocks access to localhost, private IP ranges, and internal domains
   - **Domain Control**: Configurable allowlist/blocklist with wildcard support
   - **Suspicious Pattern Detection**: Identifies potential path traversal, dangerous characters, and malicious patterns
   - **IDN Homograph Attack Prevention**: Detects potentially confusing Unicode domain names

2. **Rate Limiting and Resource Protection**
   - **Per-domain rate limiting**: Default 10 requests per minute per domain
   - **Content size limits**: Configurable maximum content size per URL (default 100KB)
   - **Request timeout controls**: Prevents hanging requests (default 10 seconds)
   - **Concurrent request limits**: Controlled batch processing to prevent overload

3. **Content Security**
   - **Content type validation**: Only processes text-based content types
   - **HTML sanitization**: Removes script tags, style blocks, and dangerous content
   - **Metadata extraction**: Safely parses HTML metadata without executing code
   - **Memory protection**: Content truncation prevents memory exhaustion attacks

### Network Security

1. **Transport Options**
   - stdio: Provides process isolation when used as a spawned child process
   - SSE/HTTP: Ensure proper network-level protection when exposing over networks

2. **Port Configuration**
   - Configure firewall rules appropriately when exposing server ports
   - Consider reverse proxies with TLS termination for production deployments

### Production Deployment Recommendations

1. **File Paths**
   - Always use absolute paths for `ALLOWED_OUTPUT_PATHS` and `GEMINI_SAFE_AUDIO_BASE_DIR` 
   - Use paths outside the application directory to prevent source code modification
   - Restrict to specific, limited-purpose directories with appropriate permissions
   - NEVER include sensitive system directories like "/", "/etc", "/usr", "/bin", or "/home"

2. **Process Isolation**
   - Run the server with restricted user permissions
   - Consider containerization (Docker) for additional isolation

3. **Secrets Management**
   - Use a secure secrets management solution instead of .env files in production
   - Rotate API keys and connection tokens regularly

4. **URL Context Security**
   - Enable URL context only when needed: Set `GOOGLE_GEMINI_ENABLE_URL_CONTEXT=false` if not required
   - Use restrictive domain allowlists: Avoid `GOOGLE_GEMINI_URL_ALLOWED_DOMAINS=*` in production
   - Configure comprehensive blocklists: Add known malicious domains to `GOOGLE_GEMINI_URL_BLOCKLIST`
   - Set conservative resource limits: Use appropriate values for `GOOGLE_GEMINI_URL_MAX_CONTENT_KB` and `GOOGLE_GEMINI_URL_MAX_COUNT`
   - Monitor URL access patterns: Review logs for suspicious URL access attempts
   - Consider network-level protection: Use firewalls or proxies to add additional URL filtering

## Error Handling

The server provides enhanced error handling using the MCP standard `McpError` type when tool execution fails. This object contains:

* `code`: An `ErrorCode` enum value indicating the type of error:
  * `InvalidParams`: Parameter validation errors (wrong type, missing required field, etc.)
  * `InvalidRequest`: General request errors, including safety blocks and not found resources 
  * `PermissionDenied`: Authentication or authorization failures
  * `ResourceExhausted`: Rate limits, quotas, or resource capacity issues
  * `FailedPrecondition`: Operations that require conditions that aren't met
  * `InternalError`: Unexpected server or API errors
* `message`: A human-readable description of the error with specific details.
* `details`: (Optional) An object with more specific information from the Gemini SDK error.

### Implementation Details

The server uses a multi-layered approach to error handling:

1. **Validation Layer**: Zod schemas validate all parameters at both the tool level (MCP request) and service layer (before API calls).
2. **Error Classification**: A detailed error mapping system categorizes errors from the Google GenAI SDK into specific error types:
   * `GeminiValidationError`: Parameter validation failures 
   * `GeminiAuthError`: Authentication issues
   * `GeminiQuotaError`: Rate limiting and quota exhaustion
   * `GeminiContentFilterError`: Content safety filtering
   * `GeminiNetworkError`: Connection and timeout issues
   * `GeminiModelError`: Model-specific problems
3. **Retry Mechanism**: Automatic retry with exponential backoff for transient errors:
   * Network issues, timeouts, and rate limit errors are automatically retried
   * Configurable retry parameters (attempts, delay, backoff factor)
   * Jitter randomization to prevent synchronized retry attempts
   * Detailed logging of retry attempts for debugging

**Common Error Scenarios:**

* **Authentication Failures:** `PermissionDenied` - Invalid API key, expired credentials, or unauthorized access.
* **Parameter Validation:** `InvalidParams` - Missing required fields, wrong data types, invalid values.
* **Safety Blocks:** `InvalidRequest` - Content blocked by safety filters with details indicating `SAFETY` as the block reason.
* **File/Cache Not Found:** `InvalidRequest` - Resource not found, with details about the missing resource.
* **Rate Limits:** `ResourceExhausted` - API quota exceeded or rate limits hit, with details about limits.
* **File API Unavailable:** `FailedPrecondition` - When attempting File API operations without a valid Google AI Studio key.
* **Path Traversal Security:** `InvalidParams` - Attempts to access audio files outside the allowed directory with details about the security validation failure.
* **Image/Audio Processing Errors:** 
  * `InvalidParams` - For format issues, size limitations, or invalid inputs
  * `InternalError` - For processing failures during analysis
  * `ResourceExhausted` - For resource-intensive operations exceeding limits

The server includes additional context in error messages to help with troubleshooting, including session IDs for chat-related errors and specific validation details for parameter errors.

Check the `message` and `details` fields of the returned `McpError` for specific troubleshooting information.

## Development and Testing

This server includes a comprehensive test suite to ensure functionality and compatibility with the Gemini API. The tests are organized into unit tests (for individual components) and integration tests (for end-to-end functionality).

### Test Structure

- **Unit Tests**: Located in `tests/unit/` - Test individual components in isolation with mocked dependencies
- **Integration Tests**: Located in `tests/integration/` - Test end-to-end functionality with real server interaction
- **Test Utilities**: Located in `tests/utils/` - Helper functions and fixtures for testing

### Running Tests

```bash
# Install dependencies first
npm install

# Run all tests
npm run test

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run a specific test file
node --test --loader ts-node/esm tests/path/to/test-file.test.ts
```

### Testing Approach

1. **Service Mocking**: The tests use a combination of direct method replacement and mock interfaces to simulate the Gemini API response. This is particularly important for the `@google/genai` SDK (v0.10.0) which has a complex object structure.

2. **Environmental Variables**: Tests automatically check for required environment variables and will skip tests that require API keys if they're not available. This allows core functionality to be tested without credentials.

3. **Test Server**: Integration tests use a test server fixture that creates an isolated HTTP server instance with the MCP handler configured for testing.

4. **RetryService**: The retry mechanism is extensively tested to ensure proper handling of transient errors with exponential backoff, jitter, and configurable retry parameters.

5. **Image Generation**: Tests specifically address the complex interactions with the Gemini API for image generation, supporting both Gemini models and the dedicated Imagen 3.1 model.

### Test Environment Setup

For running tests that require API access, create a `.env.test` file in the project root with the following variables:

```env
# Required for basic API tests
GOOGLE_GEMINI_API_KEY=your_api_key_here

# Required for router tests
GOOGLE_GEMINI_MODEL=gemini-1.5-flash

# Required for audio transcription tests
GEMINI_SAFE_AUDIO_BASE_DIR=/path/to/allowed/audio/files
```

The test suite will automatically detect available environment variables and skip tests that require missing configuration.

## Contributing

We welcome contributions to improve the MCP Gemini Server! This section provides guidelines for contributing to the project.

### Development Environment Setup

1. **Fork and Clone the Repository**
   ```bash
   git clone https://github.com/yourusername/mcp-gemini-server.git
   cd mcp-gemini-server
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Set Up Environment Variables**
   Create a `.env` file in the project root with the necessary variables as described in the Environment Variables section.

4. **Build and Run**
   ```bash
   npm run build
   npm run dev
   ```

### Development Process

1. **Create a Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Your Changes**
   Implement your feature or fix, following the code style guidelines.

3. **Write Tests**
   Add tests for your changes to ensure functionality and prevent regressions.

4. **Run Tests and Linting**
   ```bash
   npm run test
   npm run lint
   npm run format
   ```

5. **Commit Your Changes**
   Use clear, descriptive commit messages that explain the purpose of your changes.

### Testing Guidelines

- Write unit tests for all new functionality
- Update existing tests when modifying functionality
- Ensure all tests pass before submitting a pull request
- Include both positive and negative test cases
- Mock external dependencies to ensure tests can run without external services

### Pull Request Process

1. **Update Documentation**
   Update the README.md and other documentation to reflect your changes.

2. **Submit a Pull Request**
   - Provide a clear description of the changes
   - Link to any related issues
   - Explain how to test the changes
   - Ensure all CI checks pass

3. **Code Review**
   - Address any feedback from reviewers
   - Make requested changes and update the PR

### Coding Standards

- Follow the existing code style (PascalCase for classes/interfaces/types, camelCase for functions/variables)
- Use strong typing with TypeScript interfaces
- Document public APIs with JSDoc comments
- Handle errors properly by extending base error classes
- Follow the service-based architecture with dependency injection
- Use Zod for schema validation
- Format code according to the project's ESLint and Prettier configuration

## Code Review Tools

The MCP Gemini Server provides powerful code review capabilities leveraging Gemini's models to analyze git diffs and GitHub repositories. These tools help identify potential issues, suggest improvements, and provide comprehensive feedback on code changes.

### Local Git Diff Review

Review local git changes directly from your command line:

```bash
# Using the included CLI script
./scripts/gemini-review.sh

# Options
./scripts/gemini-review.sh --focus=security --reasoning=high
```

The CLI script supports various options:
- `--focus=FOCUS`: Focus of the review (security, performance, architecture, bugs, general)
- `--model=MODEL`: Model to use (defaults to gemini-flash-2.0 for cost efficiency)
- `--reasoning=LEVEL`: Reasoning effort (none, low, medium, high)
- `--exclude=PATTERN`: Files to exclude using glob patterns

### GitHub Repository Review

Review GitHub repositories, branches, and pull requests using the following tools:

- **GitHub PR Review Tool**: Analyzes pull requests for issues and improvements
- **GitHub Repository Review Tool**: Analyzes entire repositories or branches

### Cost Optimization

By default, code review tools use the more cost-efficient `gemini-flash-2.0` model, which offers a good balance between cost and capability for most code review tasks. For particularly complex code bases or when higher reasoning depth is needed, you can specify more powerful models:

```bash
# Using a more powerful model for complex code
./scripts/gemini-review.sh --model=gemini-1.5-pro --reasoning=high
```

### Running Tests

Tests for the GitHub code review functionality can also use the cheaper model:

```bash
# Run tests with the default gemini-flash-2.0 model
npm run test:unit
```

## Server Features

### Health Check Endpoint

The server provides a built-in health check HTTP endpoint that can be used for monitoring and status checks. This is separate from the MCP server transport and runs as a lightweight HTTP server.

When enabled, you can access the health check at:
```
http://localhost:3000/health
```

The health check endpoint returns a JSON response with the following information:
```json
{
  "status": "running",
  "uptime": 1234,  // Seconds since the server started
  "transport": "StdioServerTransport",  // Current transport type
  "version": "0.1.0"  // Server version
}
```

You can check the health endpoint using curl:
```bash
curl http://localhost:3000/health
```

You can configure the health check using these environment variables:
- `ENABLE_HEALTH_CHECK`: Set to "false" to disable the health check server (default: "true")
- `HEALTH_CHECK_PORT`: Port number for the health check server (default: 3000)

### Session Persistence

The server supports persistent session storage for HTTP/SSE transports, allowing sessions to survive server restarts and enabling horizontal scaling.

#### Storage Backends

1. **In-Memory Store (Default)**
   - Sessions stored in server memory
   - Fast performance for development
   - Sessions lost on server restart
   - No external dependencies

2. **SQLite Store**
   - Sessions persisted to local SQLite database
   - Survives server restarts
   - Automatic cleanup of expired sessions
   - Good for single-instance production deployments

#### Configuration

Enable SQLite session persistence:
```bash
export SESSION_STORE_TYPE=sqlite
export SQLITE_DB_PATH=./data/sessions.db  # Optional, this is the default
```

The SQLite database file and directory will be created automatically on first use. The database includes:
- Automatic indexing for performance
- Built-in cleanup of expired sessions
- ACID compliance for data integrity

#### Session Lifecycle

- Sessions are created when clients connect via HTTP/SSE transport
- Each session has a configurable timeout (default: 1 hour)
- Session expiration is extended on each activity
- Expired sessions are automatically cleaned up every minute

### Graceful Shutdown

The server implements graceful shutdown handling for SIGTERM and SIGINT signals. When the server receives a shutdown signal:

1. It attempts to properly disconnect the MCP server transport
2. It closes the health check server if running
3. It logs the shutdown status
4. It exits with the appropriate exit code (0 for successful shutdown, 1 if errors occurred)

This ensures clean termination when the server is run in containerized environments or when stopped manually.

## Known Issues

* **Pagination Issues:** `gemini_listCaches` may not reliably return `nextPageToken` due to limitations in iterating the SDK's Pager object. A workaround is implemented but has limited reliability.
* **Path Requirements:** Audio transcription operations require absolute paths when run from the server environment. Relative paths are not supported.
* **File Size Limitations:** Audio files for transcription are limited to 20MB (original file size, before base64 encoding). The server reads the file and converts it to base64 internally. Larger files will be rejected with an error message.
* **API Compatibility:** Caching API is **not supported with Vertex AI credentials**, only Google AI Studio API keys.
* **Model Support:** This server is primarily tested and optimized for the latest Gemini 1.5 and 2.5 models. While other models should work, these models are the primary focus for testing and feature compatibility.
* **TypeScript Build Issues:** The TypeScript build may show errors primarily in test files. These are type compatibility issues that don't affect the runtime functionality. The server itself will function properly despite these build warnings.
* **Resource Usage:** 
  * Image processing requires significant resource usage, especially for large resolution images. Consider using smaller resolutions (512x512) for faster responses.
  * Generating multiple images simultaneously increases resource usage proportionally.
  * Audio transcription is limited to files under 20MB (original file size). The server reads files from disk and handles base64 conversion internally. Processing may take significant time and resources depending on file size and audio complexity.
* **Content Handling:** 
  * Base64-encoded images are streamed in chunks to handle large file sizes efficiently.
  * Visual content understanding may perform differently across various types of visual content (charts vs. diagrams vs. documents).
  * Audio transcription accuracy depends on audio quality, number of speakers, and background noise.
* **URL Context Features:**
  * URL context is disabled by default and must be explicitly enabled via `GOOGLE_GEMINI_ENABLE_URL_CONTEXT=true`
  * JavaScript-rendered content is not supported - only static HTML content is processed
  * Some websites may block automated access or require authentication that is not currently supported
  * Content extraction quality may vary depending on website structure and formatting
  * Rate limiting per domain (10 requests/minute by default) may affect bulk processing scenarios
