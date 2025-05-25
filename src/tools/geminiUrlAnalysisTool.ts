import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GeminiService } from "../services/index.js";
import { logger } from "../utils/index.js";
import { mapAnyErrorToMcpError } from "../utils/errors.js";

// Tool Name and Description
export const GEMINI_URL_ANALYSIS_TOOL_NAME = "gemini_url_analysis";
export const GEMINI_URL_ANALYSIS_TOOL_DESCRIPTION = `
Advanced URL analysis tool that fetches content from web pages and performs specialized analysis tasks.
Supports various analysis types including summarization, comparison, information extraction, and Q&A.
Automatically handles URL fetching, content processing, and intelligent model selection for optimal results.
`;

// Analysis types enum
const analysisTypeSchema = z
  .enum([
    "summary",
    "comparison",
    "extraction",
    "qa",
    "sentiment",
    "fact-check",
    "content-classification",
    "readability",
    "seo-analysis",
  ])
  .describe("Type of analysis to perform on the URL content");

// Extraction schema for structured data extraction
const extractionSchemaSchema = z
  .record(z.unknown())
  .optional()
  .describe(
    "JSON schema or structure definition for extracting specific information from content"
  );

// Parameters for the URL analysis tool
export const GEMINI_URL_ANALYSIS_PARAMS = {
  urls: z
    .array(z.string().url())
    .min(1)
    .max(20)
    .describe("URLs to analyze (1-20 URLs supported)"),

  analysisType: analysisTypeSchema,

  query: z
    .string()
    .min(1)
    .optional()
    .describe("Specific query or instruction for the analysis"),

  extractionSchema: extractionSchemaSchema,

  questions: z
    .array(z.string())
    .optional()
    .describe("List of specific questions to answer (for Q&A analysis)"),

  compareBy: z
    .array(z.string())
    .optional()
    .describe("Specific aspects to compare when using comparison analysis"),

  outputFormat: z
    .enum(["text", "json", "markdown", "structured"])
    .default("text")
    .optional()
    .describe("Desired output format for the analysis results"),

  includeMetadata: z
    .boolean()
    .default(true)
    .optional()
    .describe(
      "Include URL metadata (title, description, etc.) in the analysis"
    ),

  fetchOptions: z
    .object({
      maxContentKb: z
        .number()
        .min(1)
        .max(1000)
        .default(100)
        .optional()
        .describe("Maximum content size per URL in KB"),
      timeoutMs: z
        .number()
        .min(1000)
        .max(30000)
        .default(10000)
        .optional()
        .describe("Fetch timeout per URL in milliseconds"),
      allowedDomains: z
        .array(z.string())
        .optional()
        .describe("Specific domains to allow for this request"),
      userAgent: z
        .string()
        .optional()
        .describe("Custom User-Agent header for URL requests"),
    })
    .optional()
    .describe("Advanced options for URL fetching"),

  modelName: z
    .string()
    .optional()
    .describe("Specific Gemini model to use (auto-selected if not specified)"),
};

/**
 * Registers the gemini_url_analysis tool with the MCP server.
 * Provides specialized URL analysis capabilities with intelligent content processing.
 */
export const geminiUrlAnalysisTool = (
  server: McpServer,
  serviceInstance: GeminiService
): void => {
  const processRequest = async (args: unknown) => {
    // Parse and validate the arguments
    const parsedArgs = z.object(GEMINI_URL_ANALYSIS_PARAMS).parse(args);

    logger.debug(`Received ${GEMINI_URL_ANALYSIS_TOOL_NAME} request:`, {
      urls: parsedArgs.urls,
      analysisType: parsedArgs.analysisType,
      urlCount: parsedArgs.urls.length,
    });

    try {
      const {
        urls,
        analysisType,
        query,
        extractionSchema,
        questions,
        compareBy,
        outputFormat,
        includeMetadata,
        fetchOptions,
        modelName,
      } = parsedArgs;

      // Build the analysis prompt based on the analysis type
      const prompt = buildAnalysisPrompt({
        analysisType,
        query,
        extractionSchema,
        questions,
        compareBy,
        outputFormat,
        urlCount: urls.length,
      });

      // Prepare URL context for content generation
      const urlContext = {
        urls,
        fetchOptions: {
          ...fetchOptions,
          includeMetadata: includeMetadata ?? true,
          convertToMarkdown: true, // Always convert to markdown for better analysis
        },
      };

      // Calculate URL context metrics for optimal model selection
      const urlCount = urls.length;
      const maxContentKb = fetchOptions?.maxContentKb || 100;
      const estimatedUrlContentSize = urlCount * maxContentKb * 1024;

      // Select task type based on analysis type
      const taskType = getTaskTypeForAnalysis(analysisType);

      // Generate analysis using the service
      const analysisResult = await serviceInstance.generateContent({
        prompt,
        modelName,
        urlContext,
        taskType: taskType as
          | "text-generation"
          | "image-generation"
          | "video-generation"
          | "code-review"
          | "multimodal"
          | "reasoning",
        preferQuality: true, // Prefer quality for analysis tasks
        complexityHint: urlCount > 5 ? "complex" : "medium",
        urlCount,
        estimatedUrlContentSize,
        systemInstruction: getSystemInstructionForAnalysis(
          analysisType,
          outputFormat
        ),
      });

      // Format the result based on output format
      const formattedResult = formatAnalysisResult(
        analysisResult,
        outputFormat
      );

      return {
        content: [
          {
            type: "text" as const,
            text: formattedResult,
          },
        ],
      };
    } catch (error: unknown) {
      logger.error(`Error processing ${GEMINI_URL_ANALYSIS_TOOL_NAME}:`, error);
      throw mapAnyErrorToMcpError(error, GEMINI_URL_ANALYSIS_TOOL_NAME);
    }
  };

  // Register the tool with the server
  server.tool(
    GEMINI_URL_ANALYSIS_TOOL_NAME,
    GEMINI_URL_ANALYSIS_TOOL_DESCRIPTION,
    GEMINI_URL_ANALYSIS_PARAMS,
    processRequest
  );

  logger.info(`Tool registered: ${GEMINI_URL_ANALYSIS_TOOL_NAME}`);
};

/**
 * Builds the analysis prompt based on the requested analysis type and parameters
 */
function buildAnalysisPrompt(params: {
  analysisType: string;
  query?: string;
  extractionSchema?: Record<string, unknown>;
  questions?: string[];
  compareBy?: string[];
  outputFormat?: string;
  urlCount: number;
}): string {
  const {
    analysisType,
    query,
    extractionSchema,
    questions,
    compareBy,
    outputFormat,
    urlCount,
  } = params;

  let prompt = `Perform a ${analysisType} analysis on the provided URL content${urlCount > 1 ? "s" : ""}.\n\n`;

  switch (analysisType) {
    case "summary":
      prompt += `Provide a comprehensive summary of the main points, key information, and important insights from the content. `;
      if (query) {
        prompt += `Focus particularly on: ${query}. `;
      }
      break;

    case "comparison":
      if (urlCount < 2) {
        prompt += `Since only one URL is provided, analyze the different aspects or sections within the content. `;
      } else {
        prompt += `Compare and contrast the content from the different URLs, highlighting similarities, differences, and unique aspects. `;
      }
      if (compareBy && compareBy.length > 0) {
        prompt += `Focus your comparison on these specific aspects: ${compareBy.join(", ")}. `;
      }
      break;

    case "extraction":
      prompt += `Extract specific information from the content. `;
      if (extractionSchema) {
        prompt += `Structure the extracted information according to this schema: ${JSON.stringify(extractionSchema, null, 2)}. `;
      }
      if (query) {
        prompt += `Focus on extracting: ${query}. `;
      }
      break;

    case "qa":
      prompt += `Answer the following questions based on the content:\n`;
      if (questions && questions.length > 0) {
        questions.forEach((question, index) => {
          prompt += `${index + 1}. ${question}\n`;
        });
      } else if (query) {
        prompt += `Question: ${query}\n`;
      } else {
        prompt += `Provide comprehensive answers to common questions that would arise from this content.\n`;
      }
      break;

    case "sentiment":
      prompt += `Analyze the sentiment and emotional tone of the content. Identify the overall sentiment (positive, negative, neutral) and specific emotional indicators. `;
      if (query) {
        prompt += `Pay special attention to sentiment regarding: ${query}. `;
      }
      break;

    case "fact-check":
      prompt += `Evaluate the factual accuracy and credibility of claims made in the content. Identify verifiable facts, questionable claims, and potential misinformation. `;
      if (query) {
        prompt += `Focus particularly on claims about: ${query}. `;
      }
      break;

    case "content-classification":
      prompt += `Classify and categorize the content by topic, type, audience, and other relevant dimensions. `;
      if (query) {
        prompt += `Use this classification framework: ${query}. `;
      }
      break;

    case "readability":
      prompt += `Analyze the readability, writing quality, and accessibility of the content. Evaluate complexity, clarity, structure, and target audience. `;
      break;

    case "seo-analysis":
      prompt += `Perform an SEO analysis of the content, evaluating keyword usage, content structure, meta information, and optimization opportunities. `;
      break;

    default:
      if (query) {
        prompt += `Based on the following instruction: ${query}. `;
      }
  }

  // Add output format instructions
  if (outputFormat && outputFormat !== "text") {
    switch (outputFormat) {
      case "json":
        prompt += `\n\nFormat your response as valid JSON with appropriate structure and fields.`;
        break;
      case "markdown":
        prompt += `\n\nFormat your response in well-structured Markdown with appropriate headers, lists, and formatting.`;
        break;
      case "structured":
        prompt += `\n\nOrganize your response in a clear, structured format with distinct sections and subsections.`;
        break;
    }
  }

  prompt += `\n\nBe thorough, accurate, and insightful in your analysis.`;

  return prompt;
}

/**
 * Maps analysis types to task types for model selection
 */
function getTaskTypeForAnalysis(analysisType: string): string {
  switch (analysisType) {
    case "comparison":
    case "fact-check":
    case "seo-analysis":
      return "reasoning";
    case "extraction":
    case "content-classification":
      return "text-generation";
    default:
      return "text-generation";
  }
}

/**
 * Generates system instructions based on analysis type and output format
 */
function getSystemInstructionForAnalysis(
  analysisType: string,
  outputFormat?: string
): string {
  let instruction = `You are an expert content analyst specializing in ${analysisType} analysis. `;

  switch (analysisType) {
    case "summary":
      instruction += `Provide concise yet comprehensive summaries that capture the essence and key insights of the content.`;
      break;
    case "comparison":
      instruction += `Excel at identifying similarities, differences, and patterns across different content sources.`;
      break;
    case "extraction":
      instruction += `Focus on accurately identifying and extracting specific information while maintaining context and relevance.`;
      break;
    case "qa":
      instruction += `Provide clear, accurate, and well-supported answers based on the available content.`;
      break;
    case "sentiment":
      instruction += `Accurately identify emotional tone, sentiment indicators, and subjective language patterns.`;
      break;
    case "fact-check":
      instruction += `Evaluate claims critically, distinguish between facts and opinions, and identify potential misinformation.`;
      break;
    case "content-classification":
      instruction += `Categorize content accurately using relevant taxonomies and classification frameworks.`;
      break;
    case "readability":
      instruction += `Assess content accessibility, complexity, and effectiveness for target audiences.`;
      break;
    case "seo-analysis":
      instruction += `Evaluate content from an SEO perspective, focusing on optimization opportunities and best practices.`;
      break;
  }

  if (outputFormat === "json") {
    instruction += ` Always respond with valid, well-structured JSON.`;
  } else if (outputFormat === "markdown") {
    instruction += ` Use proper Markdown formatting with clear headers and structure.`;
  }

  instruction += ` Base your analysis strictly on the provided content and clearly distinguish between what is explicitly stated and what is inferred.`;

  return instruction;
}

/**
 * Formats the analysis result based on the requested output format
 */
function formatAnalysisResult(result: string, outputFormat?: string): string {
  if (!outputFormat || outputFormat === "text") {
    return result;
  }

  // For other formats, the formatting should have been handled by the model
  // based on the prompt instructions, so we return the result as-is
  return result;
}
