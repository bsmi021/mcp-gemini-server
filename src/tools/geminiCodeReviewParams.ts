import { z } from "zod";
import { ModelNameSchema } from "./schemas/CommonSchemas.js";

export const TOOL_NAME_CODE_REVIEW = "gemini_code_review";

// Tool Description
export const TOOL_DESCRIPTION_CODE_REVIEW = `
Performs comprehensive code reviews using Gemini models. Supports reviewing local git diffs,
GitHub repositories, and GitHub pull requests. The source parameter determines which type
of review to perform and which additional parameters are required.
`;

// Review source enum
export const reviewSourceSchema = z
  .enum(["local_diff", "github_repo", "github_pr"])
  .describe("The source of code to review");

// Common review focus areas schema
export const ReviewFocusSchema = z
  .enum(["security", "performance", "architecture", "bugs", "general"])
  .optional()
  .describe(
    "The primary focus area for the review. If not specified, a general comprehensive review will be performed."
  );

// Common reasoning effort schema
export const ReasoningEffortSchema = z
  .enum(["low", "medium", "high"])
  .describe(
    "The amount of reasoning effort to apply. Higher effort may produce more detailed analysis."
  );

// Base parameters common to all review types
const baseParams = {
  source: reviewSourceSchema,
  model: ModelNameSchema.optional().describe(
    "Optional. The Gemini model to use for review. Defaults based on source type."
  ),
  reasoningEffort: ReasoningEffortSchema.optional(),
  reviewFocus: ReviewFocusSchema,
  excludePatterns: z
    .array(z.string())
    .optional()
    .describe(
      "File patterns to exclude from the review (e.g., ['*.test.ts', 'dist/**'])"
    ),
  customPrompt: z
    .string()
    .optional()
    .describe(
      "Additional instructions or context to include in the review prompt"
    ),
};

// Local diff specific parameters
const localDiffParams = z.object({
  ...baseParams,
  source: z.literal("local_diff"),
  diffContent: z
    .string()
    .describe(
      "Required. The git diff content to review (output of 'git diff' or similar)"
    ),
  repositoryContext: z
    .object({
      name: z.string().optional(),
      description: z.string().optional(),
      languages: z.array(z.string()).optional(),
      frameworks: z.array(z.string()).optional(),
    })
    .optional()
    .describe(
      "Optional context about the repository to improve review quality"
    ),
  maxFilesToInclude: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Maximum number of files to include in the review. Helps manage large diffs."
    ),
  prioritizeFiles: z
    .array(z.string())
    .optional()
    .describe(
      "File patterns to prioritize in the review (e.g., ['src/**/*.ts'])"
    ),
});

// GitHub repository specific parameters
const githubRepoParams = z.object({
  ...baseParams,
  source: z.literal("github_repo"),
  repoUrl: z
    .string()
    .url()
    .describe(
      "Required. The GitHub repository URL (e.g., 'https://github.com/owner/repo')"
    ),
  branch: z
    .string()
    .optional()
    .describe(
      "The branch to review. Defaults to the repository's default branch."
    ),
  maxFiles: z
    .number()
    .int()
    .positive()
    .default(100)
    .describe("Maximum number of files to review. Defaults to 100."),
  prioritizeFiles: z
    .array(z.string())
    .optional()
    .describe(
      "File patterns to prioritize in the review (e.g., ['src/**/*.ts'])"
    ),
});

// GitHub PR specific parameters
const githubPrParams = z.object({
  ...baseParams,
  source: z.literal("github_pr"),
  prUrl: z
    .string()
    .url()
    .describe(
      "Required. The GitHub pull request URL (e.g., 'https://github.com/owner/repo/pull/123')"
    ),
  filesOnly: z
    .boolean()
    .optional()
    .describe(
      "Deprecated. Review only the changed files without considering PR context. Use for backwards compatibility."
    ),
});

// Combined schema using discriminated union
export const GEMINI_CODE_REVIEW_PARAMS = z.discriminatedUnion("source", [
  localDiffParams,
  githubRepoParams,
  githubPrParams,
]);

// Type for parameter object using zod inference
export type GeminiCodeReviewArgs = z.infer<typeof GEMINI_CODE_REVIEW_PARAMS>;

// Export for use in other modules
export const GeminiCodeReviewParamsModule = {
  TOOL_NAME_CODE_REVIEW,
  TOOL_DESCRIPTION_CODE_REVIEW,
  GEMINI_CODE_REVIEW_PARAMS,
};
