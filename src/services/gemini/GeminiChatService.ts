import {
  GoogleGenAI,
  GenerateContentResponse,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/genai";
import { v4 as uuidv4 } from "uuid";
import {
  GeminiApiError,
  ValidationError as GeminiValidationError,
} from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import {
  Content,
  GenerationConfig,
  SafetySetting,
  Tool,
  ToolConfig,
  FunctionCall,
  ChatSession,
  ThinkingConfig,
} from "./GeminiTypes.js";
import { RouteMessageParams } from "../GeminiService.js";
import { validateRouteMessageParams } from "./GeminiValidationSchemas.js";
import { ZodError } from "zod";

/**
 * Maps reasoningEffort string values to token budgets
 */
const REASONING_EFFORT_MAP: Record<string, number> = {
  none: 0,
  low: 1024, // 1K tokens
  medium: 8192, // 8K tokens
  high: 24576, // 24K tokens
};

/**
 * Helper function to process thinkingConfig, mapping reasoningEffort to thinkingBudget if needed
 * @param thinkingConfig The thinking configuration object to process
 * @returns Processed thinking configuration
 */
function processThinkingConfig(
  thinkingConfig?: ThinkingConfig
): ThinkingConfig | undefined {
  if (!thinkingConfig) return undefined;

  const processedConfig = { ...thinkingConfig };

  // Map reasoningEffort to thinkingBudget if provided
  if (
    processedConfig.reasoningEffort &&
    REASONING_EFFORT_MAP[processedConfig.reasoningEffort] !== undefined
  ) {
    processedConfig.thinkingBudget =
      REASONING_EFFORT_MAP[processedConfig.reasoningEffort];
    logger.debug(
      `Mapped reasoning effort '${processedConfig.reasoningEffort}' to thinking budget: ${processedConfig.thinkingBudget} tokens`
    );
  }

  return processedConfig;
}

/**
 * Helper function to transform validated safety settings to use actual enum values
 * @param safetySettings The validated safety settings from Zod
 * @returns Safety settings with actual enum values
 */
function transformSafetySettings(
  safetySettings?: Array<{ category: string; threshold: string }>
): SafetySetting[] | undefined {
  if (!safetySettings) return undefined;

  return safetySettings.map((setting) => ({
    category: HarmCategory[setting.category as keyof typeof HarmCategory],
    threshold:
      HarmBlockThreshold[setting.threshold as keyof typeof HarmBlockThreshold],
  }));
}

/**
 * Interface for the parameters of the startChatSession method
 */
export interface StartChatParams {
  modelName?: string;
  history?: Content[];
  generationConfig?: GenerationConfig;
  safetySettings?: SafetySetting[];
  tools?: Tool[];
  systemInstruction?: Content | string;
  cachedContentName?: string;
}

/**
 * Interface for the parameters of the sendMessageToSession method
 */
export interface SendMessageParams {
  sessionId: string;
  message: string;
  generationConfig?: GenerationConfig;
  safetySettings?: SafetySetting[];
  tools?: Tool[];
  toolConfig?: ToolConfig;
  cachedContentName?: string;
}

/**
 * Interface for the parameters of the sendFunctionResultToSession method
 */
export interface SendFunctionResultParams {
  sessionId: string;
  functionResponse: string;
  functionCall?: FunctionCall;
}

/**
 * Service for handling chat session related operations for the Gemini service.
 * Manages chat sessions, sending messages, and handling function responses.
 */
export class GeminiChatService {
  private genAI: GoogleGenAI;
  private defaultModelName?: string;
  private chatSessions: Map<string, ChatSession> = new Map();

  /**
   * Creates a new instance of the GeminiChatService.
   * @param genAI The GoogleGenAI instance to use for API calls
   * @param defaultModelName Optional default model name to use if not specified in method calls
   */
  constructor(genAI: GoogleGenAI, defaultModelName?: string) {
    this.genAI = genAI;
    this.defaultModelName = defaultModelName;
  }

  /**
   * Starts a new stateful chat session with the Gemini model.
   *
   * @param params Parameters for starting a chat session
   * @returns A unique session ID to identify this chat session
   */
  public startChatSession(params: StartChatParams = {}): string {
    const {
      modelName,
      history,
      generationConfig,
      safetySettings,
      tools,
      systemInstruction,
      cachedContentName,
    } = params;

    const effectiveModelName = modelName ?? this.defaultModelName;
    if (!effectiveModelName) {
      throw new GeminiApiError(
        "Model name must be provided either as a parameter or via the GOOGLE_GEMINI_MODEL environment variable."
      );
    }

    // Process systemInstruction if it's a string
    let formattedSystemInstruction: Content | undefined;
    if (systemInstruction) {
      if (typeof systemInstruction === "string") {
        formattedSystemInstruction = {
          parts: [{ text: systemInstruction }],
        };
      } else {
        formattedSystemInstruction = systemInstruction;
      }
    }

    try {
      // Create the chat session using the models API
      logger.debug(`Creating chat session with model: ${effectiveModelName}`);

      // Create chat configuration for v0.10.0
      const chatConfig: {
        history?: Content[];
        generationConfig?: GenerationConfig;
        safetySettings?: SafetySetting[];
        tools?: Tool[];
        systemInstruction?: Content;
        cachedContent?: string;
        thinkingConfig?: ThinkingConfig;
      } = {};

      // Add optional parameters if provided
      if (history && Array.isArray(history)) {
        chatConfig.history = history;
      }
      if (generationConfig) {
        chatConfig.generationConfig = generationConfig;

        // Extract thinking config if it exists within generation config
        if (generationConfig.thinkingConfig) {
          chatConfig.thinkingConfig = processThinkingConfig(
            generationConfig.thinkingConfig
          );
        }
      }
      if (safetySettings && Array.isArray(safetySettings)) {
        chatConfig.safetySettings = safetySettings;
      }
      if (tools && Array.isArray(tools)) {
        chatConfig.tools = tools;
      }
      if (formattedSystemInstruction) {
        chatConfig.systemInstruction = formattedSystemInstruction;
      }
      if (cachedContentName) {
        chatConfig.cachedContent = cachedContentName;
      }

      // Generate a unique session ID
      const sessionId = uuidv4();

      // Create a mock chat session for storing configuration
      // In v0.10.0, we don't have direct chat session objects,
      // but we'll store the configuration to use for future messages
      this.chatSessions.set(sessionId, {
        model: effectiveModelName,
        config: chatConfig,
        history: history || [],
      });

      logger.info(
        `Chat session created: ${sessionId} using model ${effectiveModelName}`
      );

      return sessionId;
    } catch (error: unknown) {
      logger.error("Error creating chat session:", error);
      throw new GeminiApiError(
        `Failed to create chat session: ${(error as Error).message}`,
        error
      );
    }
  }

  /**
   * Sends a message to an existing chat session.
   * Uses the generated content API directly since we're managing chat state ourselves.
   *
   * @param params Parameters for sending a message
   * @returns Promise resolving to the chat response
   */
  public async sendMessageToSession(
    params: SendMessageParams
  ): Promise<GenerateContentResponse> {
    const {
      sessionId,
      message,
      generationConfig,
      safetySettings,
      tools,
      toolConfig,
      cachedContentName,
    } = params;

    // Get the chat session
    const session = this.chatSessions.get(sessionId);
    if (!session) {
      throw new GeminiApiError(`Chat session not found: ${sessionId}`);
    }

    // Create user content from the message
    const userContent: Content = {
      role: "user",
      parts: [{ text: message }],
    };

    // Add the user message to the session history
    session.history.push(userContent);

    try {
      // Prepare the request configuration
      const requestConfig: {
        model: string;
        contents: Content[];
        generationConfig?: GenerationConfig;
        safetySettings?: SafetySetting[];
        tools?: Tool[];
        toolConfig?: ToolConfig;
        systemInstruction?: Content;
        cachedContent?: string;
        thinkingConfig?: ThinkingConfig;
      } = {
        model: session.model,
        contents: session.history,
      };

      // Add configuration from the original session configuration
      if (session.config.systemInstruction) {
        requestConfig.systemInstruction = session.config.systemInstruction;
      }

      // Override with any per-message configuration options
      if (generationConfig) {
        requestConfig.generationConfig = generationConfig;

        // Extract thinking config if it exists within generation config
        if (generationConfig.thinkingConfig) {
          requestConfig.thinkingConfig = processThinkingConfig(
            generationConfig.thinkingConfig
          );
        }
      } else if (session.config.generationConfig) {
        requestConfig.generationConfig = session.config.generationConfig;

        // Use thinking config from session if available
        if (session.config.thinkingConfig) {
          requestConfig.thinkingConfig = processThinkingConfig(
            session.config.thinkingConfig
          );
        }
      }

      if (safetySettings) {
        requestConfig.safetySettings = safetySettings;
      } else if (session.config.safetySettings) {
        requestConfig.safetySettings = session.config.safetySettings;
      }

      if (tools) {
        requestConfig.tools = tools;
      } else if (session.config.tools) {
        requestConfig.tools = session.config.tools;
      }

      if (toolConfig) {
        requestConfig.toolConfig = toolConfig;
      }

      if (cachedContentName) {
        requestConfig.cachedContent = cachedContentName;
      } else if (session.config.cachedContent) {
        requestConfig.cachedContent = session.config.cachedContent;
      }

      logger.debug(
        `Sending message to session ${sessionId} using model ${session.model}`
      );

      // Call the generateContent API
      const response = await this.genAI.models.generateContent(requestConfig);

      // Process the response
      if (response.candidates && response.candidates.length > 0) {
        const assistantMessage = response.candidates[0].content;
        if (assistantMessage) {
          // Add the assistant response to the session history
          session.history.push(assistantMessage);
        }
      }

      return response;
    } catch (error: unknown) {
      logger.error(`Error sending message to session ${sessionId}:`, error);
      throw new GeminiApiError(
        `Failed to send message to session ${sessionId}: ${(error as Error).message}`,
        error
      );
    }
  }

  /**
   * Sends the result of a function call back to the chat session.
   *
   * @param params Parameters for sending a function result
   * @returns Promise resolving to the chat response
   */
  public async sendFunctionResultToSession(
    params: SendFunctionResultParams
  ): Promise<GenerateContentResponse> {
    const { sessionId, functionResponse, functionCall } = params;

    // Get the chat session
    const session = this.chatSessions.get(sessionId);
    if (!session) {
      throw new GeminiApiError(`Chat session not found: ${sessionId}`);
    }

    // Create function response message
    const responseContent: Content = {
      role: "function",
      parts: [
        {
          functionResponse: {
            name: functionCall?.name || "function",
            response: { content: functionResponse },
          },
        },
      ],
    };

    // Add the function response to the session history
    session.history.push(responseContent);

    try {
      // Prepare the request configuration
      const requestConfig: {
        model: string;
        contents: Content[];
        generationConfig?: GenerationConfig;
        safetySettings?: SafetySetting[];
        tools?: Tool[];
        toolConfig?: ToolConfig;
        systemInstruction?: Content;
        cachedContent?: string;
        thinkingConfig?: ThinkingConfig;
      } = {
        model: session.model,
        contents: session.history,
      };

      // Add configuration from the session
      if (session.config.systemInstruction) {
        requestConfig.systemInstruction = session.config.systemInstruction;
      }

      if (session.config.generationConfig) {
        requestConfig.generationConfig = session.config.generationConfig;

        // Use thinking config from session if available
        if (session.config.thinkingConfig) {
          requestConfig.thinkingConfig = processThinkingConfig(
            session.config.thinkingConfig
          );
        }
      }

      if (session.config.safetySettings) {
        requestConfig.safetySettings = session.config.safetySettings;
      }

      if (session.config.tools) {
        requestConfig.tools = session.config.tools;
      }

      if (session.config.cachedContent) {
        requestConfig.cachedContent = session.config.cachedContent;
      }

      logger.debug(
        `Sending function result to session ${sessionId} using model ${session.model}`
      );

      // Call the generateContent API directly
      const response = await this.genAI.models.generateContent(requestConfig);

      // Process the response
      if (response.candidates && response.candidates.length > 0) {
        const assistantMessage = response.candidates[0].content;
        if (assistantMessage) {
          // Add the assistant response to the session history
          session.history.push(assistantMessage);
        }
      }

      return response;
    } catch (error: unknown) {
      logger.error(
        `Error sending function result to session ${sessionId}:`,
        error
      );
      throw new GeminiApiError(
        `Failed to send function result to session ${sessionId}: ${(error as Error).message}`,
        error
      );
    }
  }

  /**
   * Routes a message to the most appropriate model based on a routing prompt.
   * Uses a two-step process:
   * 1. First asks a routing model to determine which model to use
   * 2. Then sends the original message to the chosen model
   *
   * @param params Parameters for routing a message
   * @returns Promise resolving to the chat response from the chosen model
   * @throws {GeminiApiError} If routing fails or all models are unavailable
   */
  public async routeMessage(
    params: RouteMessageParams
  ): Promise<{ response: GenerateContentResponse; chosenModel: string }> {
    let validatedParams;

    try {
      // Validate all parameters using Zod schema
      validatedParams = validateRouteMessageParams(params);
    } catch (validationError) {
      if (validationError instanceof ZodError) {
        const fieldErrors = validationError.errors
          .map((err) => `${err.path.join(".")}: ${err.message}`)
          .join(", ");
        throw new GeminiValidationError(
          `Invalid parameters for message routing: ${fieldErrors}`,
          validationError.errors[0]?.path.join(".")
        );
      }
      throw validationError;
    }

    const {
      message,
      models,
      routingPrompt,
      defaultModel,
      generationConfig,
      safetySettings,
      systemInstruction,
    } = validatedParams;

    try {
      // Use either a specific routing prompt or a default one
      const effectiveRoutingPrompt =
        routingPrompt ||
        `You are a sophisticated model router. Your task is to analyze the following message and determine which AI model would be best suited to handle it. Choose exactly one model from this list: ${models.join(", ")}. Respond with ONLY the name of the chosen model, nothing else.`;

      // Step 1: Determine the appropriate model using routing prompt
      // For routing decisions, we'll use a low temperature to ensure deterministic routing
      const routingConfig = {
        model: models[0], // Use the first model as the router by default
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `${effectiveRoutingPrompt}\n\nUser message: "${message}"`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 20, // Keep it short, we just need the model name
          ...generationConfig,
        },
        safetySettings: transformSafetySettings(safetySettings),
      };

      // If system instruction is provided, add it to the routing request
      if (systemInstruction) {
        if (typeof systemInstruction === "string") {
          routingConfig.contents.unshift({
            role: "system" as const,
            parts: [{ text: systemInstruction }],
          });
        } else {
          const formattedInstruction = {
            ...systemInstruction,
            role: systemInstruction.role || ("system" as const),
          };
          routingConfig.contents.unshift(
            formattedInstruction as { role: string; parts: { text: string }[] }
          );
        }
      }

      logger.debug(`Routing message using model ${routingConfig.model}`);

      // Send the routing request
      const routingResponse =
        await this.genAI.models.generateContent(routingConfig);

      if (!routingResponse?.text) {
        throw new GeminiApiError("Routing model did not return any text");
      }

      // Extract the chosen model from the routing response
      // Normalize text by removing whitespace and checking for exact matches
      const routingResponseText = routingResponse.text.trim();
      const chosenModel =
        models.find((model) => routingResponseText.includes(model)) ||
        defaultModel;

      if (!chosenModel) {
        throw new GeminiApiError(
          `Routing failed: couldn't identify a valid model from response "${routingResponseText}"`
        );
      }

      logger.info(
        `Routing complete. Selected model: ${chosenModel} for message`
      );

      // Step 2: Send the original message to the chosen model
      const requestConfig: {
        model: string;
        contents: Content[];
        generationConfig?: GenerationConfig;
        safetySettings?: SafetySetting[];
        thinkingConfig?: ThinkingConfig;
      } = {
        model: chosenModel,
        contents: [
          {
            role: "user",
            parts: [{ text: message }],
          },
        ],
        generationConfig: generationConfig,
        safetySettings: transformSafetySettings(safetySettings),
      };

      // Extract thinking config if it exists within generation config
      if (generationConfig?.thinkingConfig) {
        requestConfig.thinkingConfig = processThinkingConfig(
          generationConfig.thinkingConfig
        );
      }

      // If system instruction is provided, add it to the final request
      if (systemInstruction) {
        if (typeof systemInstruction === "string") {
          requestConfig.contents.unshift({
            role: "system" as const,
            parts: [{ text: systemInstruction }],
          });
        } else {
          const formattedInstruction = {
            ...systemInstruction,
            role: systemInstruction.role || ("system" as const),
          };
          requestConfig.contents.unshift(
            formattedInstruction as { role: string; parts: { text: string }[] }
          );
        }
      }

      logger.debug(`Sending routed message to model ${chosenModel}`);

      // Call the generateContent API with the chosen model
      const response = await this.genAI.models.generateContent(requestConfig);

      return {
        response,
        chosenModel,
      };
    } catch (error: unknown) {
      logger.error(`Error routing message: ${(error as Error).message}`, error);
      throw new GeminiApiError(
        `Failed to route message: ${(error as Error).message}`,
        error
      );
    }
  }
}
