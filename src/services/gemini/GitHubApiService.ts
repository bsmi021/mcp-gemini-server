import { Octokit } from "@octokit/rest";
import { graphql } from "@octokit/graphql";
import { RequestError } from "@octokit/request-error";
import { logger } from "../../utils/logger.js";
import { ConfigurationManager } from "../../config/ConfigurationManager.js";
import { GeminiValidationError } from "../../utils/geminiErrors.js";
import { GitHubUrlParser } from "./GitHubUrlParser.js";
import KeyV from "keyv";

/**
 * Interface for repository content
 */
export interface RepoContent {
  name: string;
  path: string;
  content: string;
  type: "file" | "dir" | "symlink";
  size: number;
  sha: string;
  url: string;
  html_url: string;
}

/**
 * Interface for a pull request
 */
export interface PullRequest {
  number: number;
  title: string;
  body: string;
  state: string;
  head: {
    ref: string;
    sha: string;
    repo: {
      full_name: string;
    };
  };
  base: {
    ref: string;
    sha: string;
    repo: {
      full_name: string;
    };
  };
  user: {
    login: string;
  };
  html_url: string;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  mergeable: boolean | null;
  mergeable_state: string;
  changed_files: number;
  additions: number;
  deletions: number;
}

/**
 * Interface for a PR file
 */
export interface PrFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  contents_url: string;
}

/**
 * Interface for cache configuration
 */
interface CacheConfig {
  enabled: boolean;
  ttl: number; // Time-to-live in seconds
}

/**
 * Service for interacting with the GitHub API
 * Provides methods for fetching repository content, PR information, and diffs
 */
export class GitHubApiService {
  private octokit: Octokit;
  private graphqlWithAuth: typeof graphql;
  private cache: KeyV;
  private cacheConfig: CacheConfig;
  private rateLimitRemaining: number = 5000; // Default for authenticated users
  private rateLimitResetTime: Date = new Date();
  private requestCount: number = 0;

  /**
   * Creates a new instance of GitHubApiService
   * @param apiToken Optional GitHub API token, will use token from ConfigurationManager if not provided
   * @param cacheEnabled Whether to enable caching (default: true)
   * @param cacheTtl Time-to-live for cache entries in seconds (default: 3600 = 1 hour)
   */
  constructor(
    apiToken?: string,
    cacheEnabled: boolean = true,
    cacheTtl: number = 3600
  ) {
    // Get token from ConfigurationManager if not provided
    if (!apiToken) {
      const configManager = ConfigurationManager.getInstance();
      apiToken = configManager.getGitHubApiToken();

      if (!apiToken) {
        logger.warn(
          "GitHub API token not provided. Some operations may be rate-limited or fail for private repositories."
        );
      }
    }

    // Initialize Octokit
    this.octokit = new Octokit({
      auth: apiToken,
    });

    // Initialize GraphQL with auth
    this.graphqlWithAuth = graphql.defaults({
      headers: {
        authorization: `token ${apiToken}`,
      },
    });

    // Configure caching
    this.cacheConfig = {
      enabled: cacheEnabled,
      ttl: cacheTtl,
    };

    // Initialize cache
    this.cache = new KeyV({
      namespace: "github-api-cache",
      ttl: cacheTtl * 1000, // Convert to milliseconds
    });

    // Check the rate limit initially
    this.checkRateLimit().catch((error) => {
      logger.warn("Failed to check initial rate limit", { error });
    });
  }

  /**
   * Check the current rate limit status
   * @returns Promise resolving to the rate limit info
   */
  public async checkRateLimit(): Promise<{
    limit: number;
    remaining: number;
    resetDate: Date;
  }> {
    try {
      const response = await this.octokit.rateLimit.get();
      const { limit, remaining, reset } = response.data.resources.core;

      this.rateLimitRemaining = remaining;
      this.rateLimitResetTime = new Date(reset * 1000);

      // Log warning if rate limit is getting low
      if (remaining < limit * 0.2) {
        logger.warn(
          `GitHub API rate limit is getting low: ${remaining}/${limit} remaining, resets at ${this.rateLimitResetTime.toISOString()}`
        );
      }

      return {
        limit,
        remaining,
        resetDate: this.rateLimitResetTime,
      };
    } catch (error: unknown) {
      logger.error("Failed to check rate limit", { error });
      throw new Error("Failed to check GitHub API rate limit");
    }
  }

  /**
   * Check if we can make a request, considering rate limits
   * @throws Error if rate limit is exceeded
   */
  private async checkBeforeRequest(): Promise<void> {
    this.requestCount++;

    // Periodically check the rate limit (every 20 requests)
    if (this.requestCount % 20 === 0) {
      await this.checkRateLimit();
    }

    // Check if we're close to the rate limit
    if (this.rateLimitRemaining < 10) {
      const now = new Date();
      const minutesUntilReset = Math.ceil(
        (this.rateLimitResetTime.getTime() - now.getTime()) / (60 * 1000)
      );

      throw new Error(
        `GitHub API rate limit nearly exceeded. ${this.rateLimitRemaining} requests remaining. Resets in ${minutesUntilReset} minutes.`
      );
    }
  }

  /**
   * Get the cached value or fetch it if not in cache
   * @param cacheKey The cache key
   * @param fetchFn Function to fetch the value if not in cache
   * @returns The cached or freshly fetched value
   */
  private async getCachedOrFetch<T>(
    cacheKey: string,
    fetchFn: () => Promise<T>
  ): Promise<T> {
    if (this.cacheConfig.enabled) {
      // Try to get from cache
      const cachedValue = await this.cache.get(cacheKey);
      if (cachedValue !== undefined) {
        logger.debug(`Cache hit for ${cacheKey}`);
        return cachedValue as T;
      }
    }

    // Not in cache or caching disabled, fetch fresh data
    logger.debug(`Cache miss for ${cacheKey}, fetching fresh data`);
    const freshValue = await fetchFn();

    // Store in cache if enabled
    if (this.cacheConfig.enabled) {
      await this.cache.set(cacheKey, freshValue);
    }

    return freshValue;
  }

  /**
   * Get the contents of a file in a repository
   * @param owner Repository owner
   * @param repo Repository name
   * @param path Path to the file
   * @param ref Optional reference (branch, tag, or commit SHA)
   * @returns Promise resolving to the file content
   */
  public async getFileContent(
    owner: string,
    repo: string,
    path: string,
    ref?: string
  ): Promise<string> {
    const cacheKey = `file:${owner}/${repo}/${path}${ref ? `@${ref}` : ""}`;

    return this.getCachedOrFetch(cacheKey, async () => {
      await this.checkBeforeRequest();

      try {
        const response = await this.octokit.repos.getContent({
          owner,
          repo,
          path,
          ref,
        });

        // Handle directory case
        if (Array.isArray(response.data)) {
          throw new Error(`Path ${path} is a directory, not a file`);
        }

        // Handle file case
        const fileData = response.data as {
          type: string;
          content?: string;
          encoding?: string;
        };

        if (fileData.type !== "file" || !fileData.content) {
          throw new Error(`Path ${path} is not a file or has no content`);
        }

        // Decode content (usually base64)
        if (fileData.encoding === "base64") {
          return Buffer.from(fileData.content, "base64").toString("utf-8");
        }

        return fileData.content;
      } catch (error: unknown) {
        if (error instanceof RequestError && error.status === 404) {
          throw new GeminiValidationError(
            `File not found: ${path} in ${owner}/${repo}`,
            "path"
          );
        }
        logger.error("Error fetching file content", { error });
        throw new Error(
          `Failed to fetch file content for ${path} in ${owner}/${repo}`
        );
      }
    });
  }

  /**
   * List files in a repository directory
   * @param owner Repository owner
   * @param repo Repository name
   * @param path Path to the directory
   * @param ref Optional reference (branch, tag, or commit SHA)
   * @returns Promise resolving to an array of repository content items
   */
  public async listDirectory(
    owner: string,
    repo: string,
    path: string = "",
    ref?: string
  ): Promise<RepoContent[]> {
    const cacheKey = `dir:${owner}/${repo}/${path}${ref ? `@${ref}` : ""}`;

    return this.getCachedOrFetch(cacheKey, async () => {
      await this.checkBeforeRequest();

      try {
        const response = await this.octokit.repos.getContent({
          owner,
          repo,
          path,
          ref,
        });

        // Handle file case (should be a directory)
        if (!Array.isArray(response.data)) {
          throw new Error(`Path ${path} is a file, not a directory`);
        }

        // Map to standardized structure and ensure html_url is never null
        return response.data.map((item) => ({
          name: item.name,
          path: item.path,
          content: "",
          type: item.type as "file" | "dir" | "symlink",
          size: item.size,
          sha: item.sha,
          url: item.url,
          html_url: item.html_url || "", // Convert null to empty string
        }));
      } catch (error: unknown) {
        if (error instanceof RequestError && error.status === 404) {
          throw new GeminiValidationError(
            `Directory not found: ${path} in ${owner}/${repo}`,
            "path"
          );
        }
        logger.error("Error listing directory", { error });
        throw new Error(
          `Failed to list directory for ${path} in ${owner}/${repo}`
        );
      }
    });
  }

  /**
   * Get Pull Request details
   * @param owner Repository owner
   * @param repo Repository name
   * @param prNumber Pull request number
   * @returns Promise resolving to pull request details
   */
  public async getPullRequest(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<PullRequest> {
    const cacheKey = `pr:${owner}/${repo}/${prNumber}`;

    return this.getCachedOrFetch(cacheKey, async () => {
      await this.checkBeforeRequest();

      try {
        const response = await this.octokit.pulls.get({
          owner,
          repo,
          pull_number: prNumber,
        });

        return response.data as PullRequest;
      } catch (error: unknown) {
        if (error instanceof RequestError && error.status === 404) {
          throw new GeminiValidationError(
            `Pull request not found: #${prNumber} in ${owner}/${repo}`,
            "prNumber"
          );
        }
        logger.error("Error fetching pull request", { error });
        throw new Error(
          `Failed to fetch pull request #${prNumber} from ${owner}/${repo}`
        );
      }
    });
  }

  /**
   * Get files changed in a Pull Request
   * @param owner Repository owner
   * @param repo Repository name
   * @param prNumber Pull request number
   * @returns Promise resolving to an array of changed files
   */
  public async getPullRequestFiles(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<PrFile[]> {
    const cacheKey = `pr-files:${owner}/${repo}/${prNumber}`;

    return this.getCachedOrFetch(cacheKey, async () => {
      await this.checkBeforeRequest();

      try {
        const response = await this.octokit.pulls.listFiles({
          owner,
          repo,
          pull_number: prNumber,
          per_page: 100, // Get up to 100 files per page
        });

        return response.data as PrFile[];
      } catch (error: unknown) {
        if (error instanceof RequestError && error.status === 404) {
          throw new GeminiValidationError(
            `Pull request not found: #${prNumber} in ${owner}/${repo}`,
            "prNumber"
          );
        }
        logger.error("Error fetching pull request files", { error });
        throw new Error(
          `Failed to fetch files for PR #${prNumber} from ${owner}/${repo}`
        );
      }
    });
  }

  /**
   * Get the git diff for a Pull Request
   * @param owner Repository owner
   * @param repo Repository name
   * @param prNumber Pull request number
   * @returns Promise resolving to the PR diff as a string
   */
  public async getPullRequestDiff(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<string> {
    const cacheKey = `pr-diff:${owner}/${repo}/${prNumber}`;

    return this.getCachedOrFetch(cacheKey, async () => {
      await this.checkBeforeRequest();

      try {
        // Get the diff directly using the GitHub API's raw format
        const response = await this.octokit.request(
          `GET /repos/{owner}/{repo}/pulls/{pull_number}`,
          {
            owner,
            repo,
            pull_number: prNumber,
            headers: {
              accept: "application/vnd.github.v3.diff",
            },
          }
        );

        // The API returns a diff as text when using the diff content type
        return String(response.data);
      } catch (error: unknown) {
        if (error instanceof RequestError && error.status === 404) {
          throw new GeminiValidationError(
            `Pull request not found: #${prNumber} in ${owner}/${repo}`,
            "prNumber"
          );
        }
        logger.error("Error fetching pull request diff", { error });
        throw new Error(
          `Failed to fetch diff for PR #${prNumber} from ${owner}/${repo}`
        );
      }
    });
  }

  /**
   * Get information about the default branch
   * @param owner Repository owner
   * @param repo Repository name
   * @returns Promise resolving to the default branch name
   */
  public async getDefaultBranch(owner: string, repo: string): Promise<string> {
    const cacheKey = `default-branch:${owner}/${repo}`;

    return this.getCachedOrFetch(cacheKey, async () => {
      await this.checkBeforeRequest();

      try {
        const response = await this.octokit.repos.get({
          owner,
          repo,
        });

        return response.data.default_branch;
      } catch (error: unknown) {
        if (error instanceof RequestError && error.status === 404) {
          throw new GeminiValidationError(
            `Repository not found: ${owner}/${repo}`,
            "repo"
          );
        }
        logger.error("Error fetching repository info", { error });
        throw new Error(
          `Failed to fetch repository information for ${owner}/${repo}`
        );
      }
    });
  }

  /**
   * Get repository contents using a GitHub URL
   * @param githubUrl GitHub URL (repo, branch, PR, etc.)
   * @returns Promise resolving to repository information and contents
   */
  public async getRepositoryInfoFromUrl(githubUrl: string): Promise<{
    owner: string;
    repo: string;
    type: string;
    branch?: string;
    prNumber?: number;
    issueNumber?: number;
  }> {
    // Parse the GitHub URL
    const parsedUrl = GitHubUrlParser.parse(githubUrl);
    if (!parsedUrl) {
      throw new GeminiValidationError(
        `Invalid GitHub URL: ${githubUrl}`,
        "githubUrl"
      );
    }

    const { owner, repo, type } = parsedUrl;
    const result: {
      owner: string;
      repo: string;
      type: string;
      branch?: string;
      prNumber?: number;
      issueNumber?: number;
    } = { owner, repo, type };

    // Add type-specific information
    if (parsedUrl.branch) {
      result.branch = parsedUrl.branch;
    } else if (parsedUrl.prNumber) {
      result.prNumber = parseInt(parsedUrl.prNumber, 10);
    } else if (parsedUrl.issueNumber) {
      result.issueNumber = parseInt(parsedUrl.issueNumber, 10);
    }

    return result;
  }

  /**
   * Processing repository data using GraphQL for more efficient querying
   * @param owner Repository owner
   * @param repo Repository name
   * @returns Promise resolving to repository information
   */
  public async getRepositoryOverview(
    owner: string,
    repo: string
  ): Promise<{
    name: string;
    description: string;
    defaultBranch: string;
    language: string;
    languages: Array<{ name: string; percentage: number }>;
    stars: number;
    forks: number;
    openIssues: number;
    openPRs: number;
    lastUpdated: string;
  }> {
    const cacheKey = `repo-overview:${owner}/${repo}`;

    return this.getCachedOrFetch(cacheKey, async () => {
      await this.checkBeforeRequest();

      try {
        // Define the expected type of the GraphQL result
        interface GraphQLRepoResult {
          repository: {
            name: string;
            description: string | null;
            defaultBranchRef: {
              name: string;
            };
            primaryLanguage: {
              name: string;
            } | null;
            languages: {
              edges: Array<{
                node: {
                  name: string;
                };
                size: number;
              }>;
              totalSize: number;
            };
            stargazerCount: number;
            forkCount: number;
            issues: {
              totalCount: number;
            };
            pullRequests: {
              totalCount: number;
            };
            updatedAt: string;
          };
        }

        const result = await this.graphqlWithAuth<GraphQLRepoResult>(
          `
          query getRepoOverview($owner: String!, $repo: String!) {
            repository(owner: $owner, name: $repo) {
              name
              description
              defaultBranchRef {
                name
              }
              primaryLanguage {
                name
              }
              languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
                edges {
                  node {
                    name
                  }
                  size
                }
                totalSize
              }
              stargazerCount
              forkCount
              issues(states: OPEN) {
                totalCount
              }
              pullRequests(states: OPEN) {
                totalCount
              }
              updatedAt
            }
          }
        `,
          {
            owner,
            repo,
          }
        );

        // Process languages data
        const totalSize = result.repository.languages.totalSize;
        const languages = result.repository.languages.edges.map((edge) => ({
          name: edge.node.name,
          percentage: Math.round((edge.size / totalSize) * 100),
        }));

        return {
          name: result.repository.name,
          description: result.repository.description || "",
          defaultBranch: result.repository.defaultBranchRef.name,
          language: result.repository.primaryLanguage?.name || "Unknown",
          languages,
          stars: result.repository.stargazerCount,
          forks: result.repository.forkCount,
          openIssues: result.repository.issues.totalCount,
          openPRs: result.repository.pullRequests.totalCount,
          lastUpdated: result.repository.updatedAt,
        };
      } catch (error: unknown) {
        if (error instanceof RequestError && error.status === 404) {
          throw new GeminiValidationError(
            `Repository not found: ${owner}/${repo}`,
            "repo"
          );
        }
        logger.error("Error fetching repository overview", { error });
        throw new Error(
          `Failed to fetch repository overview for ${owner}/${repo}`
        );
      }
    });
  }

  /**
   * Get a combined diff from comparing two branches
   * @param owner Repository owner
   * @param repo Repository name
   * @param baseBranch Base branch name
   * @param headBranch Head branch name
   * @returns Promise resolving to the diff as a string
   */
  public async getComparisonDiff(
    owner: string,
    repo: string,
    baseBranch: string,
    headBranch: string
  ): Promise<string> {
    const cacheKey = `comparison-diff:${owner}/${repo}/${baseBranch}...${headBranch}`;

    return this.getCachedOrFetch(cacheKey, async () => {
      await this.checkBeforeRequest();

      try {
        // Get the diff using the comparison API with diff format
        const response = await this.octokit.request(
          `GET /repos/{owner}/{repo}/compare/{basehead}`,
          {
            owner,
            repo,
            basehead: `${baseBranch}...${headBranch}`,
            headers: {
              accept: "application/vnd.github.v3.diff",
            },
          }
        );

        // The API returns a diff as text when using the diff content type
        return String(response.data);
      } catch (error: unknown) {
        if (error instanceof RequestError) {
          if (error.status === 404) {
            throw new GeminiValidationError(
              `Repository or branches not found: ${owner}/${repo} ${baseBranch}...${headBranch}`,
              "branches"
            );
          }
          // Handle 422 error for when the branches don't have common history
          if (error.status === 422) {
            throw new GeminiValidationError(
              `Cannot compare branches: ${baseBranch} and ${headBranch} don't have common history`,
              "branches"
            );
          }
        }
        logger.error("Error fetching comparison diff", { error });
        throw new Error(
          `Failed to fetch comparison diff for ${baseBranch}...${headBranch} in ${owner}/${repo}`
        );
      }
    });
  }

  /**
   * Invalidate a cache entry manually
   * @param cacheKey The key to invalidate
   */
  public async invalidateCache(cacheKey: string): Promise<void> {
    if (this.cacheConfig.enabled) {
      await this.cache.delete(cacheKey);
      logger.debug(`Invalidated cache for ${cacheKey}`);
    }
  }

  /**
   * Clear the entire cache
   */
  public async clearCache(): Promise<void> {
    if (this.cacheConfig.enabled) {
      await this.cache.clear();
      logger.info("Cleared GitHub API cache");
    }
  }
}
