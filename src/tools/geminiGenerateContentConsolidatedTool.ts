import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  GEMINI_GENERATE_CONTENT_TOOL_NAME,
  GEMINI_GENERATE_CONTENT_TOOL_DESCRIPTION,
  GEMINI_GENERATE_CONTENT_PARAMS,
} from "./geminiGenerateContentConsolidatedParams.js";
import { GeminiService } from "../services/index.js";
import { logger } from "../utils/index.js";
import { mapAnyErrorToMcpError } from "../utils/errors.js";
// Import SDK types used in parameters for type safety if needed, although Zod infer should handle it
import type { HarmCategory, HarmBlockThreshold } from "@google/genai";
import type { GenerateContentParams } from "../services/GeminiService.js";

// Define the type for the arguments object based on the Zod schema
// This provides type safety within the processRequest function.
type GeminiGenerateContentArgs = z.infer<
  z.ZodObject<typeof GEMINI_GENERATE_CONTENT_PARAMS>
>;

// Define interface for function call response
interface FunctionCallResponse {
  functionCall?: {
    name: string;
    args?: Record<string, unknown>;
  };
  text?: string;
}

/**
 * Registers the gemini_generate_content tool with the MCP server.
 * This consolidated tool handles standard content generation, streaming generation,
 * and function calling based on the provided parameters.
 *
 * @param server - The McpServer instance.
 * @param serviceInstance - An instance of the GeminiService.
 */
export const geminiGenerateContentConsolidatedTool = (
  server: McpServer,
  serviceInstance: GeminiService
): void => {
  // Service instance is now passed in, no need to create it here.

  /**
   * Processes the request for the gemini_generate_content tool.
   * @param args - The arguments object matching GEMINI_GENERATE_CONTENT_PARAMS.
   * @returns The result content for MCP.
   */
  const processRequest = async (args: unknown) => {
    const typedArgs = args as GeminiGenerateContentArgs;
    logger.debug(`Received ${GEMINI_GENERATE_CONTENT_TOOL_NAME} request:`, {
      model: typedArgs.modelName,
      stream: typedArgs.stream,
      hasFunctionDeclarations: !!typedArgs.functionDeclarations,
    }); // Avoid logging full prompt potentially

    try {
      // Extract arguments - Zod parsing happens automatically via server.tool
      const {
        modelName,
        prompt,
        stream,
        functionDeclarations,
        toolConfig,
        generationConfig,
        safetySettings,
        systemInstruction,
        cachedContentName,
        urlContext,
        modelPreferences,
      } = typedArgs;

      // Calculate URL context metrics for model selection
      let urlCount = 0;
      let estimatedUrlContentSize = 0;

      if (urlContext?.urls) {
        urlCount = urlContext.urls.length;
        // Estimate content size based on configured limits
        const maxContentKb = urlContext.fetchOptions?.maxContentKb || 100;
        estimatedUrlContentSize = urlCount * maxContentKb * 1024; // Convert to bytes
      }

      // Prepare parameters object
      const contentParams: GenerateContentParams & {
        functionDeclarations?: unknown;
        toolConfig?: unknown;
      } = {
        prompt,
        modelName,
        generationConfig,
        safetySettings: safetySettings?.map((setting) => ({
          category: setting.category as HarmCategory,
          threshold: setting.threshold as HarmBlockThreshold,
        })),
        systemInstruction,
        cachedContentName,
        urlContext: urlContext?.urls
          ? {
              urls: urlContext.urls,
              fetchOptions: urlContext.fetchOptions,
            }
          : undefined,
        preferQuality: modelPreferences?.preferQuality,
        preferSpeed: modelPreferences?.preferSpeed,
        preferCost: modelPreferences?.preferCost,
        complexityHint: modelPreferences?.complexityHint,
        taskType: modelPreferences?.taskType,
        urlCount,
        estimatedUrlContentSize,
      };

      // Add function-related parameters if provided
      if (functionDeclarations) {
        contentParams.functionDeclarations = functionDeclarations;
      }
      if (toolConfig) {
        contentParams.toolConfig = toolConfig;
      }

      // Handle streaming vs non-streaming generation
      if (stream) {
        // Use streaming generation
        logger.debug(
          `Using streaming generation for ${GEMINI_GENERATE_CONTENT_TOOL_NAME}`
        );
        let fullText = ""; // Accumulator for chunks

        // Call the service's streaming method
        const sdkStream = serviceInstance.generateContentStream(contentParams);

        // Iterate over the async generator from the service and collect chunks
        // The StreamableHTTPServerTransport will handle the actual streaming for HTTP transport
        for await (const chunkText of sdkStream) {
          fullText += chunkText; // Append chunk to the accumulator
        }

        logger.debug(
          `Stream collected successfully for ${GEMINI_GENERATE_CONTENT_TOOL_NAME}`
        );

        // Return the complete text in the standard MCP format
        return {
          content: [
            {
              type: "text" as const,
              text: fullText,
            },
          ],
        };
      } else {
        // Use standard non-streaming generation
        logger.debug(
          `Using standard generation for ${GEMINI_GENERATE_CONTENT_TOOL_NAME}`
        );
        const result = await serviceInstance.generateContent(contentParams);

        // Handle function call responses if function declarations were provided
        if (
          functionDeclarations &&
          typeof result === "object" &&
          result !== null
        ) {
          // It's an object response, could be a function call
          const resultObj = result as FunctionCallResponse;

          if (
            resultObj.functionCall &&
            typeof resultObj.functionCall === "object"
          ) {
            // It's a function call request
            logger.debug(
              `Function call requested by model: ${resultObj.functionCall.name}`
            );
            // Serialize the function call details into a JSON string
            const functionCallJson = JSON.stringify(resultObj.functionCall);
            return {
              content: [
                {
                  type: "text" as const, // Return as text type
                  text: functionCallJson, // Embed JSON string in text field
                },
              ],
            };
          } else if (resultObj.text && typeof resultObj.text === "string") {
            // It's a regular text response
            return {
              content: [
                {
                  type: "text" as const,
                  text: resultObj.text,
                },
              ],
            };
          }
        }

        // Standard text response
        if (typeof result === "string") {
          return {
            content: [
              {
                type: "text" as const,
                text: result,
              },
            ],
          };
        } else {
          // Unexpected response structure from the service
          logger.error(
            `Unexpected response structure from generateContent:`,
            result
          );
          throw new Error(
            "Invalid response structure received from Gemini service."
          );
        }
      }
    } catch (error: unknown) {
      logger.error(
        `Error processing ${GEMINI_GENERATE_CONTENT_TOOL_NAME}:`,
        error
      );

      // Use the central error mapping utility
      throw mapAnyErrorToMcpError(error, GEMINI_GENERATE_CONTENT_TOOL_NAME);
    }
  };

  // Register the tool with the server
  server.tool(
    GEMINI_GENERATE_CONTENT_TOOL_NAME,
    GEMINI_GENERATE_CONTENT_TOOL_DESCRIPTION,
    GEMINI_GENERATE_CONTENT_PARAMS, // Pass the Zod schema object directly
    processRequest
  );

  logger.info(`Tool registered: ${GEMINI_GENERATE_CONTENT_TOOL_NAME}`);
};
