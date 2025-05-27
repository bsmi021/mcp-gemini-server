// Using vitest globals - see vitest.config.ts globals: true
import {
  geminiCodeReviewTool,
  geminiCodeReviewStreamTool,
} from "../../../src/tools/geminiCodeReviewTool.js";
import { GeminiService } from "../../../src/services/index.js";

// Mock dependencies
vi.mock("../../../src/services/index.js");

type MockGeminiService = {
  reviewGitDiff: ReturnType<typeof vi.fn>;
  reviewGitDiffStream: ReturnType<typeof vi.fn>;
  reviewGitHubRepository: ReturnType<typeof vi.fn>;
  reviewGitHubPullRequest: ReturnType<typeof vi.fn>;
};

describe("geminiCodeReviewTool", () => {
  let mockGeminiService: MockGeminiService;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock GeminiService
    mockGeminiService = {
      reviewGitDiff: vi.fn(),
      reviewGitDiffStream: vi.fn(),
      reviewGitHubRepository: vi.fn(),
      reviewGitHubPullRequest: vi.fn(),
    };

    vi.mocked(GeminiService).mockImplementation(() => mockGeminiService as any);
  });

  describe("Tool Configuration", () => {
    it("should have correct name and description", () => {
      expect(geminiCodeReviewTool.name).toBe("gemini_code_review");
      expect(geminiCodeReviewTool.description).toContain(
        "Performs comprehensive code reviews"
      );
    });

    it("should have valid input schema", () => {
      expect(geminiCodeReviewTool.inputSchema).toBeDefined();
      expect((geminiCodeReviewTool.inputSchema as any)._def.discriminator).toBe(
        "source"
      );
    });
  });

  describe("Local Diff Review", () => {
    it("should handle local diff review", async () => {
      const mockReview =
        "Code Review:\n- Good use of types\n- Consider error handling";
      mockGeminiService.reviewGitDiff.mockResolvedValue(mockReview);

      const args = {
        source: "local_diff" as const,
        diffContent: "diff --git a/file.ts b/file.ts\n+const x = 1;",
        model: "gemini-2.5-pro-preview-05-06",
        reviewFocus: "security" as const,
        customPrompt: "Focus on TypeScript best practices",
      };

      const result = await geminiCodeReviewTool.execute(
        args,
        mockGeminiService as any
      );

      expect(mockGeminiService.reviewGitDiff).toHaveBeenCalledWith({
        diffContent: args.diffContent,
        modelName: args.model,
        reviewFocus: "security", // Should take first value from array
        customPrompt: args.customPrompt,
        diffOptions: {
          maxFilesToInclude: undefined,
          excludePatterns: undefined,
          prioritizeFiles: undefined,
        },
        reasoningEffort: undefined,
        repositoryContext: undefined,
      });

      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toBe(mockReview);
    });

    it("should handle local diff with repository context", async () => {
      const mockReview = "Review complete";
      mockGeminiService.reviewGitDiff.mockResolvedValue(mockReview);

      const args = {
        source: "local_diff" as const,
        diffContent: "diff content",
        repositoryContext: {
          name: "my-project",
          description: "A TypeScript project",
          languages: ["TypeScript", "JavaScript"],
          frameworks: ["React", "Node.js"],
        },
        maxFilesToInclude: 50,
        excludePatterns: ["*.test.ts", "dist/**"],
        prioritizeFiles: ["src/**/*.ts"],
      };

      const result = await geminiCodeReviewTool.execute(
        args,
        mockGeminiService as any
      );
      expect(result).toBeDefined();
      expect(result.content[0].text).toBe(mockReview);

      expect(mockGeminiService.reviewGitDiff).toHaveBeenCalledWith(
        expect.objectContaining({
          repositoryContext: JSON.stringify(args.repositoryContext),
          diffOptions: {
            maxFilesToInclude: 50,
            excludePatterns: ["*.test.ts", "dist/**"],
            prioritizeFiles: ["src/**/*.ts"],
          },
        })
      );
    });
  });

  describe("GitHub Repository Review", () => {
    it("should handle GitHub repository review", async () => {
      const mockReview = "Repository Review:\n- Well-structured codebase";
      mockGeminiService.reviewGitHubRepository.mockResolvedValue(mockReview);

      const args = {
        source: "github_repo" as const,
        repoUrl: "https://github.com/owner/repo",
        branch: "main",
        maxFiles: 50,
        reasoningEffort: "high" as const,
        reviewFocus: "architecture" as const,
      };

      const result = await geminiCodeReviewTool.execute(
        args,
        mockGeminiService as any
      );

      expect(mockGeminiService.reviewGitHubRepository).toHaveBeenCalledWith({
        owner: "owner",
        repo: "repo",
        branch: args.branch,
        maxFilesToInclude: args.maxFiles,
        modelName: undefined,
        reasoningEffort: args.reasoningEffort,
        reviewFocus: "architecture", // Should take first value from array
        excludePatterns: undefined,
        prioritizeFiles: undefined,
        customPrompt: undefined,
      });

      expect(result.content[0].text).toBe(mockReview);
    });
  });

  describe("GitHub Pull Request Review", () => {
    it("should handle GitHub PR review", async () => {
      const mockReview =
        "PR Review:\n- Changes look good\n- Tests are comprehensive";
      mockGeminiService.reviewGitHubPullRequest.mockResolvedValue(mockReview);

      const args = {
        source: "github_pr" as const,
        prUrl: "https://github.com/owner/repo/pull/123",
        model: "gemini-2.5-flash-preview-05-20",
        filesOnly: true,
        excludePatterns: ["*.generated.ts"],
      };

      const result = await geminiCodeReviewTool.execute(
        args,
        mockGeminiService as any
      );

      expect(mockGeminiService.reviewGitHubPullRequest).toHaveBeenCalledWith({
        owner: "owner",
        repo: "repo",
        prNumber: 123,
        modelName: args.model,
        reasoningEffort: undefined,
        reviewFocus: undefined,
        excludePatterns: args.excludePatterns,
        customPrompt: undefined,
      });

      expect(result.content[0].text).toBe(mockReview);
    });
    it("should handle GitHub PR review with all optional parameters", async () => {
      const mockReview =
        "Comprehensive PR Review:\n- Code quality is excellent\n- Security considerations addressed";
      mockGeminiService.reviewGitHubPullRequest.mockResolvedValue(mockReview);

      const args = {
        source: "github_pr" as const,
        prUrl: "https://github.com/owner/repo/pull/456",
        model: "gemini-2.5-pro-preview-05-06",
        reasoningEffort: "high" as const,
        reviewFocus: "security" as const,
        excludePatterns: ["*.test.ts", "*.spec.ts", "dist/**"],
        customPrompt:
          "Focus on security vulnerabilities and performance optimizations",
        filesOnly: false,
      };

      const result = await geminiCodeReviewTool.execute(
        args,
        mockGeminiService as any
      );

      expect(mockGeminiService.reviewGitHubPullRequest).toHaveBeenCalledWith({
        owner: "owner",
        repo: "repo",
        prNumber: 456,
        modelName: args.model,
        reasoningEffort: args.reasoningEffort,
        reviewFocus: "security", // Should take first value from array
        excludePatterns: args.excludePatterns,
        customPrompt: args.customPrompt,
      });

      expect(result.content[0].text).toBe(mockReview);
    });

    it("should handle GitHub PR review with deprecated filesOnly parameter", async () => {
      const mockReview = "Files-only PR Review";
      mockGeminiService.reviewGitHubPullRequest.mockResolvedValue(mockReview);

      const args = {
        source: "github_pr" as const,
        prUrl: "https://github.com/owner/repo/pull/789",
        filesOnly: true,
      };

      const result = await geminiCodeReviewTool.execute(
        args,
        mockGeminiService as any
      );

      expect(mockGeminiService.reviewGitHubPullRequest).toHaveBeenCalledWith({
        owner: "owner",
        repo: "repo",
        prNumber: 789,
        modelName: undefined,
        reasoningEffort: undefined,
        reviewFocus: undefined,
        excludePatterns: undefined,
        customPrompt: undefined,
      });

      expect(result.content[0].text).toBe(mockReview);
    });

    it("should handle GitHub PR review with minimal parameters", async () => {
      const mockReview = "Basic PR Review";
      mockGeminiService.reviewGitHubPullRequest.mockResolvedValue(mockReview);

      const args = {
        source: "github_pr" as const,
        prUrl: "https://github.com/owner/repo/pull/101",
      };

      const result = await geminiCodeReviewTool.execute(
        args,
        mockGeminiService as any
      );

      expect(mockGeminiService.reviewGitHubPullRequest).toHaveBeenCalledWith({
        owner: "owner",
        repo: "repo",
        prNumber: 101,
        modelName: undefined,
        reasoningEffort: undefined,
        reviewFocus: undefined,
        excludePatterns: undefined,
        customPrompt: undefined,
      });

      expect(result.content[0].text).toBe(mockReview);
    });
  });

  describe("URL Parsing and Validation", () => {
    it("should handle invalid GitHub repository URL", async () => {
      const args = {
        source: "github_repo" as const,
        repoUrl: "https://invalid-url.com/not-github",
        maxFiles: 100,
      };

      await expect(
        geminiCodeReviewTool.execute(args, mockGeminiService as any)
      ).rejects.toThrow("Invalid GitHub repository URL format");
    });

    it("should handle invalid GitHub PR URL", async () => {
      const args = {
        source: "github_pr" as const,
        prUrl: "https://github.com/owner/repo/issues/123", // issues instead of pull
      };

      await expect(
        geminiCodeReviewTool.execute(args, mockGeminiService as any)
      ).rejects.toThrow("Invalid GitHub pull request URL format");
    });

    it("should handle malformed GitHub PR URL", async () => {
      const args = {
        source: "github_pr" as const,
        prUrl: "https://github.com/owner/repo/pull/invalid-number",
      };

      await expect(
        geminiCodeReviewTool.execute(args, mockGeminiService as any)
      ).rejects.toThrow("Invalid GitHub pull request URL format");
    });

    it("should correctly parse GitHub repository URL", async () => {
      const mockReview = "Repository parsed correctly";
      mockGeminiService.reviewGitHubRepository.mockResolvedValue(mockReview);

      const args = {
        source: "github_repo" as const,
        repoUrl: "https://github.com/microsoft/typescript",
        branch: "main",
        maxFiles: 100,
      };

      await geminiCodeReviewTool.execute(args, mockGeminiService as any);

      expect(mockGeminiService.reviewGitHubRepository).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: "microsoft",
          repo: "typescript",
          branch: "main",
        })
      );
    });

    it("should correctly parse GitHub PR URL and extract PR number", async () => {
      const mockReview = "PR parsed correctly";
      mockGeminiService.reviewGitHubPullRequest.mockResolvedValue(mockReview);

      const args = {
        source: "github_pr" as const,
        prUrl: "https://github.com/facebook/react/pull/12345",
      };

      await geminiCodeReviewTool.execute(args, mockGeminiService as any);

      expect(mockGeminiService.reviewGitHubPullRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: "facebook",
          repo: "react",
          prNumber: 12345,
        })
      );
    });
  });

  describe("Review Focus Array Handling", () => {
    it("should handle multiple review focus areas for local diff", async () => {
      const mockReview = "Multi-focus review";
      mockGeminiService.reviewGitDiff.mockResolvedValue(mockReview);

      const args = {
        source: "local_diff" as const,
        diffContent: "diff content",
        reviewFocus: "security" as const,
      };

      await geminiCodeReviewTool.execute(args, mockGeminiService as any);

      expect(mockGeminiService.reviewGitDiff).toHaveBeenCalledWith(
        expect.objectContaining({
          reviewFocus: "security", // Should take first value
        })
      );
    });

    it("should handle empty review focus array", async () => {
      const mockReview = "Default focus review";
      mockGeminiService.reviewGitDiff.mockResolvedValue(mockReview);

      const args = {
        source: "local_diff" as const,
        diffContent: "diff content",
        // No reviewFocus to test undefined behavior
      };

      await geminiCodeReviewTool.execute(args, mockGeminiService as any);

      expect(mockGeminiService.reviewGitDiff).toHaveBeenCalledWith(
        expect.objectContaining({
          reviewFocus: undefined, // Should be undefined for empty array
        })
      );
    });

    it("should handle single review focus area", async () => {
      const mockReview = "Single focus review";
      mockGeminiService.reviewGitDiff.mockResolvedValue(mockReview);

      const args = {
        source: "local_diff" as const,
        diffContent: "diff content",
        reviewFocus: "architecture" as const,
      };

      await geminiCodeReviewTool.execute(args, mockGeminiService as any);

      expect(mockGeminiService.reviewGitDiff).toHaveBeenCalledWith(
        expect.objectContaining({
          reviewFocus: "architecture",
        })
      );
    });
  });

  describe("Error Handling", () => {
    it("should handle GitHub API service errors for PR review", async () => {
      mockGeminiService.reviewGitHubPullRequest.mockRejectedValue(
        new Error("GitHub API rate limit exceeded")
      );

      const args = {
        source: "github_pr" as const,
        prUrl: "https://github.com/owner/repo/pull/123",
      };

      await expect(
        geminiCodeReviewTool.execute(args, mockGeminiService as any)
      ).rejects.toThrow();
    });

    it("should handle GitHub API service errors for repo review", async () => {
      mockGeminiService.reviewGitHubRepository.mockRejectedValue(
        new Error("Repository not found")
      );

      const args = {
        source: "github_repo" as const,
        repoUrl: "https://github.com/owner/nonexistent-repo",
        maxFiles: 100,
      };

      await expect(
        geminiCodeReviewTool.execute(args, mockGeminiService as any)
      ).rejects.toThrow();
    });
  });

  describe("Error Handling", () => {
    it("should handle service errors", async () => {
      mockGeminiService.reviewGitDiff.mockRejectedValue(new Error("API error"));

      const args = {
        source: "local_diff" as const,
        diffContent: "diff content",
      };

      await expect(
        geminiCodeReviewTool.execute(args, mockGeminiService as any)
      ).rejects.toThrow();
    });

    it("should handle unknown source type", async () => {
      const args = {
        source: "unknown" as unknown as
          | "local_diff"
          | "github_pr"
          | "github_repo",
        diffContent: "diff",
      };

      await expect(
        geminiCodeReviewTool.execute(args as any, mockGeminiService as any)
      ).rejects.toThrow("Unknown review source");
    });
  });
});

describe("geminiCodeReviewStreamTool", () => {
  let mockGeminiService: Pick<MockGeminiService, "reviewGitDiffStream">;

  beforeEach(() => {
    vi.clearAllMocks();

    mockGeminiService = {
      reviewGitDiffStream: vi.fn(),
    };

    vi.mocked(GeminiService).mockImplementation(() => mockGeminiService as any);
  });

  it("should stream local diff review", async () => {
    const mockChunks = ["Review chunk 1", "Review chunk 2", "Review chunk 3"];

    // Create an async generator mock
    mockGeminiService.reviewGitDiffStream.mockImplementation(
      async function* () {
        for (const chunk of mockChunks) {
          yield chunk;
        }
      }
    );

    const args = {
      source: "local_diff" as const,
      diffContent: "diff content",
      model: "gemini-2.5-pro-preview-05-06",
    };

    const results: Array<any> = [];
    const generator = await geminiCodeReviewStreamTool.execute(
      args,
      mockGeminiService as any
    );
    for await (const chunk of generator) {
      results.push(chunk);
    }

    expect(results).toHaveLength(3);
    expect(results[0].content[0].text).toBe("Review chunk 1");
    expect(results[1].content[0].text).toBe("Review chunk 2");
    expect(results[2].content[0].text).toBe("Review chunk 3");
  });

  it("should reject non-local_diff sources", async () => {
    const args = {
      source: "github_repo" as const,
      repoUrl: "https://github.com/owner/repo",
      maxFiles: 100,
    };

    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const generator = await geminiCodeReviewStreamTool.execute(
        args,
        mockGeminiService as any
      );
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _chunk of generator) {
        // Should not reach here - this line should never execute
        break;
      }
    }).rejects.toThrow("Streaming is only supported for local_diff source");
  });
});
