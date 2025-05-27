import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  GEMINI_ROUTE_MESSAGE_TOOL_NAME,
  GEMINI_ROUTE_MESSAGE_TOOL_DESCRIPTION,
  GEMINI_ROUTE_MESSAGE_PARAMS,
  GeminiRouteMessageArgs, // Import the type helper
} from "./geminiRouteMessageParams.js";
import { GeminiService } from "../services/index.js";
import { logger } from "../utils/index.js";
import { mapAnyErrorToMcpError } from "../utils/errors.js";
// Import SDK types used in parameters/response handling
import { BlockedReason, FinishReason } from "@google/genai"; // Import enums as values
import type { GenerationConfig, SafetySetting } from "@google/genai";

/**
 * Registers the gemini_routeMessage tool with the MCP server.
 *
 * @param server - The McpServer instance.
 * @param serviceInstance - An instance of the GeminiService.
 */
export const geminiRouteMessageTool = (
  server: McpServer,
  serviceInstance: GeminiService
): void => {
  /**
   * Processes the request for the gemini_routeMessage tool.
   * @param args - The arguments object matching GEMINI_ROUTE_MESSAGE_PARAMS.
   * @returns The result containing the model's response and the chosen model name.
   */
  const processRequest = async (args: unknown): Promise<CallToolResult> => {
    const typedArgs = args as GeminiRouteMessageArgs;
    logger.debug(
      `Received ${GEMINI_ROUTE_MESSAGE_TOOL_NAME} request with message: "${typedArgs.message.substring(0, 50)}${typedArgs.message.length > 50 ? "..." : ""}"`
    );
    try {
      // Destructure all arguments
      const {
        message,
        models,
        routingPrompt,
        defaultModel,
        generationConfig,
        safetySettings,
        systemInstruction,
      } = typedArgs;

      // Call the service to route the message
      const { response, chosenModel } = await serviceInstance.routeMessage({
        message,
        models,
        routingPrompt,
        defaultModel,
        generationConfig: generationConfig as GenerationConfig | undefined,
        safetySettings: safetySettings as SafetySetting[] | undefined,
        systemInstruction,
      });

      // --- Process the SDK Response into MCP Format ---

      // Check for prompt safety blocks first
      if (response.promptFeedback?.blockReason === BlockedReason.SAFETY) {
        logger.warn(`Gemini prompt blocked due to SAFETY during routing.`);
        // Return an error-like response via MCP content
        return {
          content: [
            {
              type: "text",
              text: `Error: Prompt blocked due to safety settings. Reason: ${response.promptFeedback.blockReason}`,
            },
          ],
          isError: true, // Indicate an error occurred
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
          logger.warn(`Gemini response stopped due to SAFETY during routing.`);
          return {
            content: [
              {
                type: "text",
                text: `Error: Response generation stopped due to safety settings. FinishReason: ${firstCandidate.finishReason}`,
              },
            ],
            isError: true,
          };
        }
        // Handle other potentially problematic finish reasons
        logger.warn(
          `Gemini response finished with reason ${firstCandidate.finishReason} during routing.`
        );
      }

      let responseText: string | undefined;

      // Extract text from the response parts
      if (firstCandidate?.content?.parts) {
        // Concatenate text parts
        responseText = firstCandidate.content.parts
          .filter((part) => typeof part.text === "string")
          .map((part) => part.text)
          .join("");
      }

      // Format the MCP response content
      if (responseText !== undefined) {
        // Return both the routed response and the chosen model
        logger.debug(`Returning routed response from model ${chosenModel}`);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                text: responseText,
                chosenModel: chosenModel,
              }),
            },
          ],
        };
      } else {
        // Handle cases where there's no candidate or no parts, but no explicit error/block
        logger.warn(
          `No text found in Gemini response for routing, finishReason: ${firstCandidate?.finishReason}. Returning empty content.`
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                text: "",
                chosenModel: chosenModel,
              }),
            },
          ],
        };
      }
    } catch (error: unknown) {
      logger.error(
        `Error processing ${GEMINI_ROUTE_MESSAGE_TOOL_NAME}:`,
        error
      );

      // Use the centralized error mapping utility to ensure consistent error handling
      throw mapAnyErrorToMcpError(error, GEMINI_ROUTE_MESSAGE_TOOL_NAME);
    }
  };

  // Register the tool
  server.tool(
    GEMINI_ROUTE_MESSAGE_TOOL_NAME,
    GEMINI_ROUTE_MESSAGE_TOOL_DESCRIPTION,
    GEMINI_ROUTE_MESSAGE_PARAMS,
    processRequest
  );

  logger.info(`Tool registered: ${GEMINI_ROUTE_MESSAGE_TOOL_NAME}`);
};
