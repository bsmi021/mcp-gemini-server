import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  GEMINI_CHAT_TOOL_NAME,
  GEMINI_CHAT_TOOL_DESCRIPTION,
  GEMINI_CHAT_PARAMS,
} from "./geminiChatParams.js";
import { GeminiService } from "../services/index.js";
import { logger } from "../utils/index.js";
import { mapAnyErrorToMcpError } from "../utils/errors.js";
import { BlockedReason, FinishReason } from "@google/genai";
import type {
  Content,
  GenerationConfig,
  SafetySetting,
  Tool,
  ToolConfig,
  GenerateContentResponse,
} from "@google/genai";

// Define the type for the arguments object based on the Zod schema
type GeminiChatArgs = z.infer<z.ZodObject<typeof GEMINI_CHAT_PARAMS>>;

/**
 * Registers the gemini_chat tool with the MCP server.
 * This consolidated tool handles chat session management including starting sessions,
 * sending messages, and sending function results.
 *
 * @param server - The McpServer instance.
 * @param serviceInstance - An instance of the GeminiService.
 */
export const geminiChatTool = (
  server: McpServer,
  serviceInstance: GeminiService
): void => {
  /**
   * Processes the request for the gemini_chat tool.
   * @param args - The arguments object matching GEMINI_CHAT_PARAMS.
   * @returns The result content for MCP.
   */
  const processRequest = async (args: unknown): Promise<CallToolResult> => {
    const typedArgs = args as GeminiChatArgs;
    logger.debug(`Received ${GEMINI_CHAT_TOOL_NAME} request:`, {
      operation: typedArgs.operation,
      sessionId: typedArgs.sessionId,
      modelName: typedArgs.modelName,
    });

    try {
      // Validate required fields based on operation
      if (
        typedArgs.operation === "send_message" ||
        typedArgs.operation === "send_function_result"
      ) {
        if (!typedArgs.sessionId) {
          throw new Error(
            `sessionId is required for operation '${typedArgs.operation}'`
          );
        }
      }

      if (typedArgs.operation === "send_message" && !typedArgs.message) {
        throw new Error("message is required for operation 'send_message'");
      }

      if (
        typedArgs.operation === "send_function_result" &&
        !typedArgs.functionResponses
      ) {
        throw new Error(
          "functionResponses is required for operation 'send_function_result'"
        );
      }

      // Handle different operations
      switch (typedArgs.operation) {
        case "start": {
          // Start a new chat session
          const sessionId = serviceInstance.startChatSession({
            modelName: typedArgs.modelName,
            history: typedArgs.history as Content[] | undefined,
            generationConfig: typedArgs.generationConfig as
              | GenerationConfig
              | undefined,
            safetySettings: typedArgs.safetySettings as
              | SafetySetting[]
              | undefined,
            tools: typedArgs.tools as Tool[] | undefined,
            systemInstruction: typedArgs.systemInstruction,
            cachedContentName: typedArgs.cachedContentName,
          });

          logger.info(
            `Successfully started chat session ${sessionId} for model ${typedArgs.modelName || "default"}`
          );

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ sessionId }),
              },
            ],
          };
        }

        case "send_message": {
          // Send a message to an existing chat session
          const response: GenerateContentResponse =
            await serviceInstance.sendMessageToSession({
              sessionId: typedArgs.sessionId!,
              message: typedArgs.message!,
              generationConfig: typedArgs.generationConfig as
                | GenerationConfig
                | undefined,
              safetySettings: typedArgs.safetySettings as
                | SafetySetting[]
                | undefined,
              tools: typedArgs.tools as Tool[] | undefined,
              toolConfig: typedArgs.toolConfig as ToolConfig | undefined,
              cachedContentName: typedArgs.cachedContentName,
            });

          // Process the response
          return processGenerateContentResponse(response, typedArgs.sessionId!);
        }

        case "send_function_result": {
          // Send function results to an existing chat session
          // Note: The service expects a string, so we stringify the array of function responses
          const response: GenerateContentResponse =
            await serviceInstance.sendFunctionResultToSession({
              sessionId: typedArgs.sessionId!,
              functionResponse: JSON.stringify(typedArgs.functionResponses),
              functionCall: undefined, // Could be enhanced to pass original function call
            });

          // Process the response
          return processGenerateContentResponse(
            response,
            typedArgs.sessionId!,
            true
          );
        }

        default:
          throw new Error(`Invalid operation: ${typedArgs.operation}`);
      }
    } catch (error: unknown) {
      logger.error(`Error processing ${GEMINI_CHAT_TOOL_NAME}:`, error);
      throw mapAnyErrorToMcpError(error, GEMINI_CHAT_TOOL_NAME);
    }
  };

  /**
   * Helper function to process GenerateContentResponse into MCP format
   */
  function processGenerateContentResponse(
    response: GenerateContentResponse,
    sessionId: string,
    isFunctionResult: boolean = false
  ): CallToolResult {
    const context = isFunctionResult ? "after function result" : "";

    // Check for prompt safety blocks
    if (response.promptFeedback?.blockReason === BlockedReason.SAFETY) {
      logger.warn(
        `Gemini prompt blocked due to SAFETY for session ${sessionId} ${context}.`
      );
      return {
        content: [
          {
            type: "text",
            text: `Error: Prompt blocked due to safety settings ${context}. Reason: ${response.promptFeedback.blockReason}`,
          },
        ],
        isError: true,
      };
    }

    const firstCandidate = response?.candidates?.[0];

    // Check for candidate safety blocks or other non-STOP finish reasons
    if (
      firstCandidate?.finishReason &&
      firstCandidate.finishReason !== FinishReason.STOP &&
      firstCandidate.finishReason !== FinishReason.MAX_TOKENS
    ) {
      if (firstCandidate.finishReason === FinishReason.SAFETY) {
        logger.warn(
          `Gemini response stopped due to SAFETY for session ${sessionId} ${context}.`
        );
        return {
          content: [
            {
              type: "text",
              text: `Error: Response generation stopped due to safety settings ${context}. FinishReason: ${firstCandidate.finishReason}`,
            },
          ],
          isError: true,
        };
      }
      logger.warn(
        `Gemini response finished with reason ${firstCandidate.finishReason} for session ${sessionId} ${context}.`
      );
    }

    if (!firstCandidate) {
      logger.error(
        `No candidates returned by Gemini for session ${sessionId} ${context}.`
      );
      return {
        content: [
          {
            type: "text",
            text: `Error: No response candidates returned by the model ${context}.`,
          },
        ],
        isError: true,
      };
    }

    // Extract the content from the first candidate
    const content = firstCandidate.content;
    if (!content || !content.parts || content.parts.length === 0) {
      logger.error(
        `Empty content returned by Gemini for session ${sessionId} ${context}.`
      );
      return {
        content: [
          {
            type: "text",
            text: `Error: Empty response from the model ${context}.`,
          },
        ],
        isError: true,
      };
    }

    // Initialize result object
    let resultText = "";
    let functionCall = null;

    // Process each part in the response
    for (const part of content.parts) {
      if (part.text && typeof part.text === "string") {
        resultText += part.text;
      } else if (part.functionCall) {
        // Capture function call if present
        functionCall = part.functionCall;
        logger.debug(
          `Function call requested by model in session ${sessionId}: ${functionCall.name}`
        );
      }
    }

    // Handle function call responses
    if (functionCall) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ functionCall }),
          },
        ],
      };
    }

    // Return text response
    if (resultText) {
      return {
        content: [
          {
            type: "text",
            text: resultText,
          },
        ],
      };
    }

    // Fallback error
    logger.error(
      `Unexpected response structure from Gemini for session ${sessionId} ${context}.`
    );
    return {
      content: [
        {
          type: "text",
          text: `Error: Unexpected response structure from the model ${context}.`,
        },
      ],
      isError: true,
    };
  }

  // Register the tool with the server
  server.tool(
    GEMINI_CHAT_TOOL_NAME,
    GEMINI_CHAT_TOOL_DESCRIPTION,
    GEMINI_CHAT_PARAMS,
    processRequest
  );

  logger.info(`Tool registered: ${GEMINI_CHAT_TOOL_NAME}`);
};
