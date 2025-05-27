import { GoogleGenAI } from "@google/genai";
import { logger } from "../../utils/logger.js";
import {
  GeminiModelError,
  GeminiValidationError,
  mapGeminiError,
} from "../../utils/geminiErrors.js";
import {
  Content,
  GenerationConfig,
  SafetySetting,
  Tool,
} from "./GeminiTypes.js";
import gitdiffParser from "gitdiff-parser";
import micromatch from "micromatch";
import {
  getReviewTemplate,
  processTemplate,
  getFocusInstructions,
} from "./GeminiPromptTemplates.js";

// Define interface for gitdiff-parser return type
interface GitDiffParserFile {
  oldPath: string;
  newPath: string;
  oldRevision: string;
  newRevision: string;
  hunks: Array<{
    content: string;
    oldStart: number;
    newStart: number;
    oldLines: number;
    newLines: number;
    changes: Array<{
      content: string;
      type: "insert" | "delete" | "normal";
      lineNumber?: number;
      oldLineNumber?: number;
      newLineNumber?: number;
    }>;
  }>;
  isBinary?: boolean;
  oldEndingNewLine?: boolean;
  newEndingNewLine?: boolean;
  oldMode?: string;
  newMode?: string;
  similarity?: number;
}

// Define our interface matching the original GoogleGenAI interface
interface GenerativeModel {
  generateContent(options: { contents: Content[] }): Promise<{
    response: {
      text(): string;
    };
  }>;
  generateContentStream(options: { contents: Content[] }): Promise<{
    stream: AsyncGenerator<{
      text(): string;
    }>;
  }>;
  startChat(options?: {
    history?: Content[];
    generationConfig?: GenerationConfig;
    safetySettings?: SafetySetting[];
    tools?: Tool[];
    systemInstruction?: Content;
    cachedContent?: string;
  }): {
    sendMessage(text: string): Promise<{ response: { text(): string } }>;
    sendMessageStream(
      text: string
    ): Promise<{ stream: AsyncGenerator<{ text(): string }> }>;
    getHistory(): Content[];
  };
  generateImages(params: {
    prompt: string;
    safetySettings?: SafetySetting[];
    [key: string]: unknown;
  }): Promise<{
    images?: Array<{ data?: string; mimeType?: string }>;
    promptSafetyMetadata?: {
      blocked?: boolean;
      safetyRatings?: Array<{ category: string; probability: string }>;
    };
  }>;
}

// Define interface for GoogleGenAI with getGenerativeModel method
interface ExtendedGoogleGenAI extends GoogleGenAI {
  getGenerativeModel(options: {
    model: string;
    generationConfig?: GenerationConfig;
    safetySettings?: SafetySetting[];
  }): GenerativeModel;
}

/**
 * Interface for parsed git diff files
 */
interface ParsedDiffFile {
  oldPath: string;
  newPath: string;
  oldRevision: string;
  newRevision: string;
  hunks: Array<{
    content: string;
    oldStart: number;
    newStart: number;
    oldLines: number;
    newLines: number;
    changes: Array<{
      content: string;
      type: "insert" | "delete" | "normal";
      lineNumber?: number;
      oldLineNumber?: number;
      newLineNumber?: number;
    }>;
  }>;
  isBinary?: boolean;
  type: "add" | "delete" | "modify" | "rename";
  oldEndingNewLine?: boolean;
  newEndingNewLine?: boolean;
  oldMode?: string;
  newMode?: string;
  similarity?: number;
}

/**
 * Options for processing git diffs
 */
interface DiffProcessingOptions {
  maxFilesToInclude?: number;
  excludePatterns?: string[];
  prioritizeFiles?: string[];
  includeContextLines?: number;
  maxDiffSize?: number;
}

/**
 * Parameters for reviewing git diffs
 */
export interface GitDiffReviewParams {
  diffContent: string;
  modelName?: string;
  reviewFocus?:
    | "security"
    | "performance"
    | "architecture"
    | "bugs"
    | "general";
  repositoryContext?: string;
  diffOptions?: DiffProcessingOptions;
  generationConfig?: GenerationConfig;
  safetySettings?: SafetySetting[];
  systemInstruction?: Content | string;
  reasoningEffort?: "none" | "low" | "medium" | "high";
  customPrompt?: string;
}

/**
 * Service for processing and analyzing git diffs using Gemini models
 */
export class GeminiGitDiffService {
  private genAI: ExtendedGoogleGenAI;
  private defaultModelName?: string;
  private maxDiffSizeBytes: number;
  private defaultExcludePatterns: string[];

  /**
   * Creates a new instance of GeminiGitDiffService
   *
   * @param genAI The GoogleGenAI instance
   * @param defaultModelName Optional default model name
   * @param maxDiffSizeBytes Maximum allowed size for diff content in bytes
   * @param defaultExcludePatterns Default patterns to exclude from diff analysis
   * @param defaultThinkingBudget Optional default thinking budget in tokens (0-24576)
   */
  constructor(
    genAI: ExtendedGoogleGenAI,
    defaultModelName?: string,
    maxDiffSizeBytes: number = 1024 * 1024, // 1MB default
    defaultExcludePatterns: string[] = [
      "package-lock.json",
      "yarn.lock",
      "*.min.js",
      "*.min.css",
      "node_modules/**",
      "dist/**",
      "build/**",
      "*.lock",
      "**/*.map",
    ],
    private defaultThinkingBudget?: number
  ) {
    this.genAI = genAI;
    this.defaultModelName = defaultModelName;
    this.maxDiffSizeBytes = maxDiffSizeBytes;
    this.defaultExcludePatterns = defaultExcludePatterns;
  }

  /**
   * Parse raw git diff content into a structured format using gitdiff-parser
   *
   * @param diffContent Raw git diff content as string
   * @returns Array of parsed diff files with additional type information
   * @throws GeminiValidationError if diff parsing fails
   */
  private async parseGitDiff(diffContent: string): Promise<ParsedDiffFile[]> {
    try {
      // Check diff size limits
      if (diffContent.length > this.maxDiffSizeBytes) {
        throw new GeminiValidationError(
          `Diff content exceeds maximum size (${this.maxDiffSizeBytes} bytes)`,
          "diffContent"
        );
      }

      // Parse using gitdiff-parser
      // The gitdiff-parser module doesn't export types properly, but we know its structure
      const parsedFiles = (
        gitdiffParser as { parse: (diffStr: string) => GitDiffParserFile[] }
      ).parse(diffContent);

      // Extend with additional type information
      return parsedFiles.map((file) => {
        // Determine file type based on paths and changes
        let type: "add" | "delete" | "modify" | "rename" = "modify";

        if (file.oldPath === "/dev/null") {
          type = "add";
        } else if (file.newPath === "/dev/null") {
          type = "delete";
        } else if (file.oldPath !== file.newPath) {
          type = "rename";
        } else {
          type = "modify";
        }

        return {
          ...file,
          type,
        };
      });
    } catch (error: unknown) {
      if (error instanceof GeminiValidationError) {
        throw error;
      }

      logger.error("Failed to parse git diff:", error);
      throw new GeminiValidationError(
        "Failed to parse git diff content. Ensure it's valid output from git diff.",
        "diffContent"
      );
    }
  }

  /**
   * Prioritize and filter diff content based on importance using micromatch
   *
   * @param parsedDiff Array of parsed diff files
   * @param options Options for prioritization and filtering
   * @returns Filtered and prioritized diff files
   */
  private filterAndPrioritizeDiff(
    parsedDiff: ParsedDiffFile[],
    options: DiffProcessingOptions = {}
  ): ParsedDiffFile[] {
    let result = [...parsedDiff];

    // Apply exclude patterns
    const excludePatterns = [...this.defaultExcludePatterns];
    if (options.excludePatterns && options.excludePatterns.length > 0) {
      excludePatterns.push(...options.excludePatterns);
    }

    if (excludePatterns.length > 0) {
      // Use micromatch for glob pattern matching
      result = result.filter((file) => {
        // For each file path, check if it matches any exclude pattern
        return !micromatch.isMatch(file.newPath, excludePatterns);
      });
    }

    // Apply priority patterns if specified
    if (options.prioritizeFiles && options.prioritizeFiles.length > 0) {
      // Score files based on prioritization patterns
      const scoredFiles = result.map((file) => {
        // Calculate a priority score based on matching patterns
        // Higher score = higher priority
        const priorityScore = options.prioritizeFiles!.reduce(
          (score, pattern) => {
            // If file path matches the pattern, increase its score
            if (micromatch.isMatch(file.newPath, pattern)) {
              return score + 1;
            }
            return score;
          },
          0
        );

        return { file, priorityScore };
      });

      // Sort by priority score (descending)
      scoredFiles.sort((a, b) => b.priorityScore - a.priorityScore);

      // Extract the sorted files
      result = scoredFiles.map((item) => item.file);
    }

    // Filter to max files if specified
    if (
      options.maxFilesToInclude &&
      options.maxFilesToInclude > 0 &&
      result.length > options.maxFilesToInclude
    ) {
      // Take only the specified number of files (already sorted by priority if applicable)
      result = result.slice(0, options.maxFilesToInclude);
    }

    return result;
  }

  /**
   * Generate a review prompt for the Gemini model based on the processed diff
   *
   * @param parsedDiff Processed diff files
   * @param repositoryContext Optional context about the repository
   * @param reviewFocus Optional focus area for the review
   * @returns Formatted prompt string
   */
  private generateReviewPrompt(
    parsedDiff: ParsedDiffFile[],
    repositoryContext?: string,
    reviewFocus:
      | "security"
      | "performance"
      | "architecture"
      | "bugs"
      | "general" = "general"
  ): string {
    // Create file summary
    const fileSummary = parsedDiff
      .map((file) => {
        const hunksCount = file.hunks.length;
        const addedLines = file.hunks.reduce((count, hunk) => {
          return (
            count +
            hunk.changes.filter((change) => change.type === "insert").length
          );
        }, 0);
        const removedLines = file.hunks.reduce((count, hunk) => {
          return (
            count +
            hunk.changes.filter((change) => change.type === "delete").length
          );
        }, 0);

        return `- ${file.newPath}: ${hunksCount} chunk(s), +${addedLines} -${removedLines} lines`;
      })
      .join("\n");

    // Generate diff content with context
    let diffContent = "";
    for (const file of parsedDiff) {
      diffContent += `\n\nFile: ${file.newPath}\n`;

      for (const hunk of file.hunks) {
        diffContent += `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n`;
        diffContent += hunk.changes
          .map((change) => {
            if (change.type === "insert") {
              return `+${change.content}`;
            } else if (change.type === "delete") {
              return `-${change.content}`;
            } else {
              return ` ${change.content}`;
            }
          })
          .join("\n");
      }
    }

    // Format repository context if provided
    const formattedContext = repositoryContext
      ? `Repository context:\n${repositoryContext}`
      : "";

    // Include file summary in repository context
    const fullContext = formattedContext
      ? `${formattedContext}\n\nSummary of changes:\n${fileSummary}`
      : `Summary of changes:\n${fileSummary}`;

    // Get the appropriate template based on review focus
    const template = getReviewTemplate(reviewFocus);

    // Process the template with the context and diff content
    return processTemplate(template, {
      repositoryContext: fullContext,
      diffContent,
      focusInstructions: getFocusInstructions(reviewFocus),
    });
  }

  /**
   * Review a git diff and generate analysis using Gemini models
   *
   * @param params Parameters for the review operation
   * @returns Promise resolving to review text
   */
  public async reviewDiff(params: GitDiffReviewParams): Promise<string> {
    try {
      const {
        diffContent,
        modelName,
        reviewFocus = "general",
        repositoryContext,
        diffOptions = {},
        generationConfig = {},
        safetySettings,
        systemInstruction,
        reasoningEffort = "medium",
        customPrompt,
      } = params;

      // Validate input
      if (!diffContent || diffContent.trim().length === 0) {
        throw new GeminiValidationError(
          "Diff content is required",
          "diffContent"
        );
      }

      // Parse the diff
      const parsedDiff = await this.parseGitDiff(diffContent);

      // Filter and prioritize diff content
      const processedDiff = this.filterAndPrioritizeDiff(
        parsedDiff,
        diffOptions
      );

      if (processedDiff.length === 0) {
        return "No files to review after applying filters.";
      }

      // Generate the review prompt
      let prompt: string;
      if (customPrompt) {
        // Use custom prompt if provided
        prompt = customPrompt;
        // Add the diff content to the custom prompt
        prompt += `\n\nAnalyze the following git diff:\n\`\`\`diff\n`;

        // Format diff content for the prompt
        for (const file of processedDiff) {
          prompt += `\n\nFile: ${file.newPath}\n`;

          for (const hunk of file.hunks) {
            prompt += `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n`;
            prompt += hunk.changes
              .map((change) => {
                if (change.type === "insert") {
                  return `+${change.content}`;
                } else if (change.type === "delete") {
                  return `-${change.content}`;
                } else {
                  return ` ${change.content}`;
                }
              })
              .join("\n");
          }
        }

        prompt += `\n\`\`\``;
      } else {
        // Use the standard prompt generator
        prompt = this.generateReviewPrompt(
          processedDiff,
          repositoryContext,
          reviewFocus
        );
      }

      // Select the model to use
      const effectiveModelName =
        modelName || this.defaultModelName || "gemini-flash-2.0"; // Using cheaper Gemini Flash 2.0 as default

      // Map reasoning effort to thinking budget
      let thinkingBudget: number | undefined;
      switch (reasoningEffort) {
        case "none":
          thinkingBudget = 0;
          break;
        case "low":
          thinkingBudget = 2048;
          break;
        case "medium":
          thinkingBudget = 4096;
          break;
        case "high":
          thinkingBudget = 8192;
          break;
        default:
          thinkingBudget = this.defaultThinkingBudget;
      }

      // Update generation config with thinking budget if specified
      const updatedGenerationConfig = {
        ...generationConfig,
      };

      if (thinkingBudget !== undefined) {
        updatedGenerationConfig.thinkingBudget = thinkingBudget;
      }

      // Get model instance
      const model = this.genAI.getGenerativeModel({
        model: effectiveModelName,
        generationConfig: updatedGenerationConfig,
        safetySettings,
      });

      // Create the content parts with system instructions if provided
      const contentParts: Content[] = [];

      if (systemInstruction) {
        if (typeof systemInstruction === "string") {
          contentParts.push({
            role: "system",
            parts: [{ text: systemInstruction }],
          });
        } else {
          contentParts.push(systemInstruction);
        }
      }

      contentParts.push({
        role: "user",
        parts: [{ text: prompt }],
      });

      // Generate content
      const result = await model.generateContent({
        contents: contentParts,
      });

      // Extract text from response
      if (!result.response.text()) {
        throw new GeminiModelError(
          "Model returned empty response",
          effectiveModelName
        );
      }

      return result.response.text();
    } catch (error: unknown) {
      logger.error("Error reviewing git diff:", error);
      throw mapGeminiError(error, "reviewGitDiff");
    }
  }

  /**
   * Stream review content for a git diff
   *
   * @param params Parameters for the review operation
   * @returns AsyncGenerator yielding review content chunks
   */
  public async *reviewDiffStream(
    params: GitDiffReviewParams
  ): AsyncGenerator<string> {
    try {
      const {
        diffContent,
        modelName,
        reviewFocus = "general",
        repositoryContext,
        diffOptions = {},
        generationConfig = {},
        safetySettings,
        systemInstruction,
        reasoningEffort = "medium",
        customPrompt,
      } = params;

      // Validate input
      if (!diffContent || diffContent.trim().length === 0) {
        throw new GeminiValidationError(
          "Diff content is required",
          "diffContent"
        );
      }

      // Parse the diff
      const parsedDiff = await this.parseGitDiff(diffContent);

      // Filter and prioritize diff content
      const processedDiff = this.filterAndPrioritizeDiff(
        parsedDiff,
        diffOptions
      );

      if (processedDiff.length === 0) {
        yield "No files to review after applying filters.";
        return;
      }

      // Generate the review prompt
      let prompt: string;
      if (customPrompt) {
        // Use custom prompt if provided
        prompt = customPrompt;
        // Add the diff content to the custom prompt
        prompt += `\n\nAnalyze the following git diff:\n\`\`\`diff\n`;

        // Format diff content for the prompt
        for (const file of processedDiff) {
          prompt += `\n\nFile: ${file.newPath}\n`;

          for (const hunk of file.hunks) {
            prompt += `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n`;
            prompt += hunk.changes
              .map((change) => {
                if (change.type === "insert") {
                  return `+${change.content}`;
                } else if (change.type === "delete") {
                  return `-${change.content}`;
                } else {
                  return ` ${change.content}`;
                }
              })
              .join("\n");
          }
        }

        prompt += `\n\`\`\``;
      } else {
        // Use the standard prompt generator
        prompt = this.generateReviewPrompt(
          processedDiff,
          repositoryContext,
          reviewFocus
        );
      }

      // Select the model to use
      const effectiveModelName =
        modelName || this.defaultModelName || "gemini-flash-2.0"; // Using cheaper Gemini Flash 2.0 as default

      // Map reasoning effort to thinking budget
      let thinkingBudget: number | undefined;
      switch (reasoningEffort) {
        case "none":
          thinkingBudget = 0;
          break;
        case "low":
          thinkingBudget = 2048;
          break;
        case "medium":
          thinkingBudget = 4096;
          break;
        case "high":
          thinkingBudget = 8192;
          break;
        default:
          thinkingBudget = this.defaultThinkingBudget;
      }

      // Update generation config with thinking budget if specified
      const updatedGenerationConfig = {
        ...generationConfig,
      };

      if (thinkingBudget !== undefined) {
        updatedGenerationConfig.thinkingBudget = thinkingBudget;
      }

      // Get model instance
      const model = this.genAI.getGenerativeModel({
        model: effectiveModelName,
        generationConfig: updatedGenerationConfig,
        safetySettings,
      });

      // Create the content parts with system instructions if provided
      const contentParts: Content[] = [];

      if (systemInstruction) {
        if (typeof systemInstruction === "string") {
          contentParts.push({
            role: "system",
            parts: [{ text: systemInstruction }],
          });
        } else {
          contentParts.push(systemInstruction);
        }
      }

      contentParts.push({
        role: "user",
        parts: [{ text: prompt }],
      });

      // Generate content with streaming
      const result = await model.generateContentStream({
        contents: contentParts,
      });

      // Stream chunks
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        if (chunkText) {
          yield chunkText;
        }
      }
    } catch (error: unknown) {
      logger.error("Error streaming git diff review:", error);
      throw mapGeminiError(error, "reviewGitDiffStream");
    }
  }
}
