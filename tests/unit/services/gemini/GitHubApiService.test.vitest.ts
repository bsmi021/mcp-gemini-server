// Using vitest globals - see vitest.config.ts globals: true

// Mock Octokit and related modules using vi.doMock to avoid hoisting issues
const mockOctokit = {
  rest: {
    repos: {
      getContent: vi.fn(),
      get: vi.fn(),
    },
    pulls: {
      get: vi.fn(),
      listFiles: vi.fn(),
    },
  },
};

const mockGraphql = vi.fn() as any;
mockGraphql.defaults = vi.fn().mockReturnValue(mockGraphql);

vi.doMock("@octokit/rest", () => ({
  Octokit: vi.fn().mockImplementation(() => mockOctokit),
}));

vi.doMock("@octokit/graphql", () => ({
  graphql: mockGraphql,
}));

vi.doMock("@octokit/request-error", () => ({
  RequestError: class MockRequestError extends Error {
    status: number;
    response: any;
    constructor(message: string, status: number, response?: any) {
      super(message);
      this.status = status;
      this.response = response;
    }
  },
}));

vi.doMock("keyv", () => ({
  default: vi.fn().mockImplementation(() => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
  })),
}));

describe("GitHubApiService", () => {
  let GitHubApiService: any;
  let logger: any;
  let service: any;

  beforeAll(async () => {
    // Dynamic imports after mocks are set up
    const githubApiModule = await import(
      "../../../../src/services/gemini/GitHubApiService.js"
    );
    GitHubApiService = githubApiModule.GitHubApiService;

    const loggerModule = await import("../../../../src/utils/logger.js");
    logger = loggerModule.logger;
  });

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock logger
    vi.spyOn(logger, "info").mockImplementation(vi.fn());
    vi.spyOn(logger, "warn").mockImplementation(vi.fn());
    vi.spyOn(logger, "error").mockImplementation(vi.fn());
    vi.spyOn(logger, "debug").mockImplementation(vi.fn());

    service = new GitHubApiService();
  });

  describe("Constructor", () => {
    it("should initialize GitHubApiService", () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(GitHubApiService);
    });
  });

  describe("Basic functionality", () => {
    it("should have required methods", () => {
      expect(typeof service.getFileContent).toBe("function");
      expect(typeof service.getRepositoryInfoFromUrl).toBe("function");
      expect(typeof service.getPullRequest).toBe("function");
      expect(typeof service.getPullRequestFiles).toBe("function");
      expect(typeof service.checkRateLimit).toBe("function");
      expect(typeof service.listDirectory).toBe("function");
      expect(typeof service.getDefaultBranch).toBe("function");
    });
  });
});
