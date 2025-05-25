import { GeminiService } from "../services/index.js";
import { logger } from "../utils/index.js";
import {
  TOOL_NAME_CODE_REVIEW,
  TOOL_DESCRIPTION_CODE_REVIEW,
  GEMINI_CODE_REVIEW_PARAMS,
  GeminiCodeReviewArgs,
} from "./geminiCodeReviewParams.js";
import { mapAnyErrorToMcpError } from "../utils/errors.js";
import { GitDiffReviewParams } from "../services/gemini/GeminiGitDiffService.js";
import type { NewGeminiServiceToolObject } from "./registration/ToolAdapter.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Handles Gemini code review operations including local diffs, GitHub repos, and pull requests.
 * The operation is determined by the source parameter.
 */
export const geminiCodeReviewTool: NewGeminiServiceToolObject<
  GeminiCodeReviewArgs,
  CallToolResult
> = {
  name: TOOL_NAME_CODE_REVIEW,
  description: TOOL_DESCRIPTION_CODE_REVIEW,
  inputSchema: GEMINI_CODE_REVIEW_PARAMS,
  execute: async (args: GeminiCodeReviewArgs, service: GeminiService) => {
    logger.debug(`Received ${TOOL_NAME_CODE_REVIEW} request:`, {
      source: args.source,
      modelName: args.model,
    });

    try {
      switch (args.source) {
        case "local_diff": {
          // Convert repository context object to string
          const repositoryContextString = args.repositoryContext
            ? JSON.stringify(args.repositoryContext)
            : undefined;

          // Prepare parameters for local diff review
          const reviewParams: GitDiffReviewParams = {
            diffContent: args.diffContent,
            modelName: args.model,
            reasoningEffort: args.reasoningEffort,
            reviewFocus: args.reviewFocus,
            repositoryContext: repositoryContextString,
            diffOptions: {
              maxFilesToInclude: args.maxFilesToInclude,
              excludePatterns: args.excludePatterns,
              prioritizeFiles: args.prioritizeFiles,
            },
            customPrompt: args.customPrompt,
          };

          // Call the service
          const reviewText = await service.reviewGitDiff(reviewParams);

          return {
            content: [
              {
                type: "text",
                text: reviewText,
              },
            ],
          };
        }

        case "github_repo": {
          // Parse GitHub URL to extract owner and repo
          const urlMatch = args.repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
          if (!urlMatch) {
            throw new Error("Invalid GitHub repository URL format");
          }
          const [, owner, repo] = urlMatch;

          // Call the service for GitHub repository review
          const reviewText = await service.reviewGitHubRepository({
            owner,
            repo,
            branch: args.branch,
            modelName: args.model,
            reasoningEffort: args.reasoningEffort,
            reviewFocus: args.reviewFocus,
            maxFilesToInclude: args.maxFiles,
            excludePatterns: args.excludePatterns,
            prioritizeFiles: args.prioritizeFiles,
            customPrompt: args.customPrompt,
          });

          return {
            content: [
              {
                type: "text",
                text: reviewText,
              },
            ],
          };
        }

        case "github_pr": {
          // Parse GitHub PR URL to extract owner, repo, and PR number
          const urlMatch = args.prUrl.match(
            /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/
          );
          if (!urlMatch) {
            throw new Error("Invalid GitHub pull request URL format");
          }
          const [, owner, repo, prNumberStr] = urlMatch;
          const prNumber = parseInt(prNumberStr, 10);

          // Call the service for GitHub PR review
          const reviewText = await service.reviewGitHubPullRequest({
            owner,
            repo,
            prNumber,
            modelName: args.model,
            reasoningEffort: args.reasoningEffort,
            reviewFocus: args.reviewFocus,
            excludePatterns: args.excludePatterns,
            customPrompt: args.customPrompt,
          });

          return {
            content: [
              {
                type: "text",
                text: reviewText,
              },
            ],
          };
        }

        default: {
          // This should never happen due to discriminated union
          throw new Error(`Unknown review source: ${JSON.stringify(args)}`);
        }
      }
    } catch (error: unknown) {
      logger.error(`Error processing ${TOOL_NAME_CODE_REVIEW}:`, error);
      throw mapAnyErrorToMcpError(error, TOOL_NAME_CODE_REVIEW);
    }
  },
};

// Also export a streaming version for local diffs
export const geminiCodeReviewStreamTool: NewGeminiServiceToolObject<
  GeminiCodeReviewArgs,
  AsyncGenerator<CallToolResult, void, unknown>
> = {
  name: "gemini_code_review_stream",
  description:
    "Stream code review results for local git diffs using Gemini models",
  inputSchema: GEMINI_CODE_REVIEW_PARAMS,
  execute: async (
    args: GeminiCodeReviewArgs,
    service: GeminiService
  ): Promise<AsyncGenerator<CallToolResult, void, unknown>> => {
    async function* streamResults() {
      if (args.source !== "local_diff") {
        throw new Error("Streaming is only supported for local_diff source");
      }

      logger.debug(`Received gemini_code_review_stream request:`, {
        source: args.source,
        modelName: args.model,
      });

      try {
        // Convert repository context object to string
        const repositoryContextString = args.repositoryContext
          ? JSON.stringify(args.repositoryContext)
          : undefined;

        // Prepare parameters for local diff review
        const reviewParams: GitDiffReviewParams = {
          diffContent: args.diffContent,
          modelName: args.model,
          reasoningEffort: args.reasoningEffort,
          reviewFocus: args.reviewFocus,
          repositoryContext: repositoryContextString,
          diffOptions: {
            maxFilesToInclude: args.maxFilesToInclude,
            excludePatterns: args.excludePatterns,
            prioritizeFiles: args.prioritizeFiles,
          },
          customPrompt: args.customPrompt,
        };

        // Stream the review results
        for await (const chunk of service.reviewGitDiffStream(reviewParams)) {
          yield {
            content: [
              {
                type: "text" as const,
                text: chunk,
              },
            ],
          };
        }
      } catch (error: unknown) {
        logger.error(`Error processing gemini_code_review_stream:`, error);
        throw mapAnyErrorToMcpError(error, "gemini_code_review_stream");
      }
    }

    return streamResults();
  },
};
