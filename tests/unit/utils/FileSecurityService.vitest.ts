// Using vitest globals - see vitest.config.ts globals: true
import * as path from "path";
import * as fs from "fs/promises";
import * as fsSync from "fs";

// Import the code to test
import { FileSecurityService } from "../../../src/utils/FileSecurityService.js";
import { ValidationError } from "../../../src/utils/errors.js";
import { logger } from "../../../src/utils/logger.js";

describe("FileSecurityService", () => {
  // Mock logger
  const loggerMock = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  // Define test constants for all tests
  const TEST_CONTENT = "Test file content";
  const TEST_DIR = path.resolve("./test-security-dir");
  const OUTSIDE_DIR = path.resolve("./outside-security-dir");

  // Setup before each test
  beforeEach(() => {
    // Reset mocks and create test directories
    vi.clearAllMocks();

    // Replace logger with mock
    vi.spyOn(logger, "info").mockImplementation(loggerMock.info);
    vi.spyOn(logger, "warn").mockImplementation(loggerMock.warn);
    vi.spyOn(logger, "error").mockImplementation(loggerMock.error);
    vi.spyOn(logger, "debug").mockImplementation(loggerMock.debug);

    // Create test directories
    fsSync.mkdirSync(TEST_DIR, { recursive: true });
    fsSync.mkdirSync(OUTSIDE_DIR, { recursive: true });
  });

  // Cleanup after each test
  afterEach(() => {
    // Restore original logger
    vi.restoreAllMocks();

    // Clean up test directories
    try {
      fsSync.rmSync(TEST_DIR, { recursive: true, force: true });
      fsSync.rmSync(OUTSIDE_DIR, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  describe("Constructor and Configuration", () => {
    it("should initialize with default allowed directories", () => {
      const service = new FileSecurityService();
      const allowedDirs = service.getAllowedDirectories();

      expect(allowedDirs.length).toBeGreaterThan(0);
      expect(allowedDirs).toContain(path.resolve(process.cwd()));
    });

    it("should initialize with custom allowed directories", () => {
      const customDirs = [TEST_DIR, OUTSIDE_DIR];
      const service = new FileSecurityService(customDirs);
      const allowedDirs = service.getAllowedDirectories();

      expect(allowedDirs.length).toBe(2);
      expect(allowedDirs).toContain(path.resolve(TEST_DIR));
      expect(allowedDirs).toContain(path.resolve(OUTSIDE_DIR));
    });

    it("should initialize with a secure base path", () => {
      const service = new FileSecurityService([], TEST_DIR);
      const basePath = service.getSecureBasePath();

      expect(basePath).toBe(path.normalize(TEST_DIR));

      // Verify allowed directories includes the base path
      const allowedDirs = service.getAllowedDirectories();
      expect(allowedDirs).toContain(path.normalize(TEST_DIR));
    });

    it("should set allowed directories", () => {
      const service = new FileSecurityService();
      const newDirs = [TEST_DIR, OUTSIDE_DIR];

      service.setAllowedDirectories(newDirs);
      const allowedDirs = service.getAllowedDirectories();

      expect(allowedDirs.length).toBe(2);
      expect(allowedDirs).toContain(path.normalize(TEST_DIR));
      expect(allowedDirs).toContain(path.normalize(OUTSIDE_DIR));
    });

    it("should throw error when setting empty allowed directories", () => {
      const service = new FileSecurityService();

      expect(() => service.setAllowedDirectories([])).toThrow(ValidationError);
      expect(() => service.setAllowedDirectories([])).toThrow(
        /At least one allowed directory/
      );
    });

    it("should throw error when setting non-absolute allowed directories", () => {
      const service = new FileSecurityService();

      expect(() => service.setAllowedDirectories(["./relative/path"])).toThrow(
        ValidationError
      );
      expect(() => service.setAllowedDirectories(["./relative/path"])).toThrow(
        /Directory path must be absolute/
      );
    });

    it("should set and get secure base path", () => {
      const service = new FileSecurityService();
      service.setSecureBasePath(TEST_DIR);

      const basePath = service.getSecureBasePath();
      expect(basePath).toBe(path.normalize(TEST_DIR));
    });

    it("should throw error when setting non-absolute secure base path", () => {
      const service = new FileSecurityService();

      expect(() => service.setSecureBasePath("./relative/path")).toThrow(
        ValidationError
      );
      expect(() => service.setSecureBasePath("./relative/path")).toThrow(
        /Base path must be absolute/
      );
    });

    it("should configure from environment", () => {
      // Save original env var
      const originalEnvVar = process.env.GEMINI_SAFE_FILE_BASE_DIR;

      // Set env var for test
      process.env.GEMINI_SAFE_FILE_BASE_DIR = TEST_DIR;

      const service = FileSecurityService.configureFromEnvironment();
      const allowedDirs = service.getAllowedDirectories();

      expect(allowedDirs).toContain(path.normalize(TEST_DIR));

      // Restore original env var
      if (originalEnvVar) {
        process.env.GEMINI_SAFE_FILE_BASE_DIR = originalEnvVar;
      } else {
        delete process.env.GEMINI_SAFE_FILE_BASE_DIR;
      }
    });
  });

  describe("Path Validation", () => {
    let service: FileSecurityService;

    beforeEach(() => {
      service = new FileSecurityService([TEST_DIR]);
    });

    it("should validate path within allowed directory", () => {
      const testFilePath = path.join(TEST_DIR, "test-file.txt");
      const validatedPath = service.validateAndResolvePath(testFilePath);

      expect(validatedPath).toBe(path.normalize(testFilePath));
    });

    it("should validate paths with relative components", () => {
      const complexPath = path.join(
        TEST_DIR,
        ".",
        "subdir",
        "..",
        "test-file.txt"
      );
      const validatedPath = service.validateAndResolvePath(complexPath);

      // Should normalize to TEST_DIR/test-file.txt
      const expectedPath = path.normalize(path.join(TEST_DIR, "test-file.txt"));
      expect(validatedPath).toBe(expectedPath);
    });

    it("should reject paths outside allowed directories", () => {
      const outsidePath = path.join(OUTSIDE_DIR, "test-file.txt");

      expect(() => service.validateAndResolvePath(outsidePath)).toThrow(
        ValidationError
      );
      expect(() => service.validateAndResolvePath(outsidePath)).toThrow(
        /Access denied/
      );
    });

    it("should reject paths with directory traversal", () => {
      const traversalPath = path.join(
        TEST_DIR,
        "..",
        "outside",
        "test-file.txt"
      );

      expect(() => service.validateAndResolvePath(traversalPath)).toThrow(
        ValidationError
      );
      expect(() => service.validateAndResolvePath(traversalPath)).toThrow(
        /Access denied/
      );
    });

    it("should check file existence with mustExist option", () => {
      const nonExistentPath = path.join(TEST_DIR, "non-existent.txt");

      expect(() =>
        service.validateAndResolvePath(nonExistentPath, { mustExist: true })
      ).toThrow(ValidationError);
      expect(() =>
        service.validateAndResolvePath(nonExistentPath, { mustExist: true })
      ).toThrow(/File not found/);
    });

    it("should use custom allowed directories when provided", () => {
      // Path is outside the service's configured directory but inside custom allowed dir
      const customAllowedPath = path.join(OUTSIDE_DIR, "custom-allowed.txt");

      const validatedPath = service.validateAndResolvePath(customAllowedPath, {
        allowedDirs: [OUTSIDE_DIR],
      });

      expect(validatedPath).toBe(path.normalize(customAllowedPath));
    });
  });

  describe("isPathWithinAllowedDirs", () => {
    let service: FileSecurityService;

    beforeEach(() => {
      service = new FileSecurityService([TEST_DIR]);
    });

    it("should return true for paths within allowed directories", () => {
      const insidePath = path.join(TEST_DIR, "test-file.txt");
      const result = service.isPathWithinAllowedDirs(insidePath);

      expect(result).toBe(true);
    });

    it("should return true for exact match with allowed directory", () => {
      const result = service.isPathWithinAllowedDirs(TEST_DIR);

      expect(result).toBe(true);
    });

    it("should return false for paths outside allowed directories", () => {
      const outsidePath = path.join(OUTSIDE_DIR, "test-file.txt");
      const result = service.isPathWithinAllowedDirs(outsidePath);

      expect(result).toBe(false);
    });

    it("should return false for paths with directory traversal", () => {
      const traversalPath = path.join(
        TEST_DIR,
        "..",
        "outside",
        "test-file.txt"
      );
      const result = service.isPathWithinAllowedDirs(traversalPath);

      expect(result).toBe(false);
    });

    it("should use custom allowed directories when provided", () => {
      const outsidePath = path.join(OUTSIDE_DIR, "test-file.txt");

      // Should be false with default allowed dirs
      expect(service.isPathWithinAllowedDirs(outsidePath)).toBe(false);

      // Should be true with custom allowed dirs
      expect(service.isPathWithinAllowedDirs(outsidePath, [OUTSIDE_DIR])).toBe(
        true
      );
    });

    it("should return false when no allowed directories exist", () => {
      const result = service.isPathWithinAllowedDirs(TEST_DIR, []);

      expect(result).toBe(false);
    });
  });

  describe("fullyResolvePath", () => {
    let service: FileSecurityService;

    beforeEach(() => {
      service = new FileSecurityService([TEST_DIR, OUTSIDE_DIR]);
    });

    it("should resolve a normal file path", async () => {
      const testPath = path.join(TEST_DIR, "test-file.txt");
      const resolvedPath = await service.fullyResolvePath(testPath);

      expect(resolvedPath).toBe(path.normalize(testPath));
    });

    it("should handle non-existent paths", async () => {
      const nonExistentPath = path.join(
        TEST_DIR,
        "non-existent",
        "test-file.txt"
      );
      const resolvedPath = await service.fullyResolvePath(nonExistentPath);

      expect(resolvedPath).toBe(path.normalize(nonExistentPath));
    });

    it("should resolve and validate a symlink to a file", async () => {
      // Create target file
      const targetPath = path.join(TEST_DIR, "target.txt");
      await fs.writeFile(targetPath, TEST_CONTENT, "utf8");

      // Create symlink
      const symlinkPath = path.join(TEST_DIR, "symlink.txt");
      await fs.symlink(targetPath, symlinkPath);

      // Resolve the symlink
      const resolvedPath = await service.fullyResolvePath(symlinkPath);

      // Should resolve to the target path
      expect(resolvedPath).toBe(path.normalize(targetPath));
    });

    it("should reject symlinks pointing outside allowed directories", async () => {
      // Create target file in outside (non-allowed) directory
      const targetPath = path.join(OUTSIDE_DIR, "target.txt");
      await fs.writeFile(targetPath, TEST_CONTENT, "utf8");

      // Create symlink in test (allowed) directory pointing to outside
      const symlinkPath = path.join(TEST_DIR, "bad-symlink.txt");

      // Setup service with only TEST_DIR allowed (not OUTSIDE_DIR)
      const restrictedService = new FileSecurityService([TEST_DIR]);

      await fs.symlink(targetPath, symlinkPath);

      // Try to resolve the symlink
      await expect(
        restrictedService.fullyResolvePath(symlinkPath)
      ).rejects.toThrow(ValidationError);
      await expect(
        restrictedService.fullyResolvePath(symlinkPath)
      ).rejects.toThrow(/Security error/);
      await expect(
        restrictedService.fullyResolvePath(symlinkPath)
      ).rejects.toThrow(/outside allowed directories/);
    });

    it("should detect and validate symlinked parent directories", async () => {
      // Create target directory in allowed location
      const targetDir = path.join(TEST_DIR, "target-dir");
      await fs.mkdir(targetDir, { recursive: true });

      // Create symlink to directory
      const symlinkDir = path.join(TEST_DIR, "symlink-dir");
      await fs.symlink(targetDir, symlinkDir);

      // Create a file path inside the symlinked directory
      const filePath = path.join(symlinkDir, "test-file.txt");

      // Resolve the path
      const resolvedPath = await service.fullyResolvePath(filePath);

      // Should resolve to actual path in target directory
      const expectedPath = path.join(targetDir, "test-file.txt");
      expect(resolvedPath).toBe(path.normalize(expectedPath));
    });

    it("should reject symlinked parent directories pointing outside allowed directories", async () => {
      // Create target directory in outside (not allowed) directory
      const targetDir = path.join(OUTSIDE_DIR, "target-dir");
      await fs.mkdir(targetDir, { recursive: true });

      // Create symlink in test directory pointing to outside directory
      const symlinkDir = path.join(TEST_DIR, "bad-symlink-dir");
      await fs.symlink(targetDir, symlinkDir);

      // Create a file path inside the symlinked directory
      const filePath = path.join(symlinkDir, "test-file.txt");

      // Setup service with only TEST_DIR allowed
      const restrictedService = new FileSecurityService([TEST_DIR]);

      // Try to resolve the path
      await expect(
        restrictedService.fullyResolvePath(filePath)
      ).rejects.toThrow(ValidationError);
      await expect(
        restrictedService.fullyResolvePath(filePath)
      ).rejects.toThrow(/Security error/);
    });
  });

  describe("secureWriteFile", () => {
    let service: FileSecurityService;

    beforeEach(() => {
      service = new FileSecurityService([TEST_DIR]);
    });

    it("should write file to an allowed directory", async () => {
      const filePath = path.join(TEST_DIR, "test-file.txt");

      await service.secureWriteFile(filePath, TEST_CONTENT);

      // Verify file was written
      const content = await fs.readFile(filePath, "utf8");
      expect(content).toBe(TEST_CONTENT);
    });

    it("should create directories if they don't exist", async () => {
      const nestedFilePath = path.join(
        TEST_DIR,
        "nested",
        "deep",
        "test-file.txt"
      );

      await service.secureWriteFile(nestedFilePath, TEST_CONTENT);

      // Verify directories were created and file exists
      const content = await fs.readFile(nestedFilePath, "utf8");
      expect(content).toBe(TEST_CONTENT);
    });

    it("should reject writing outside allowed directories", async () => {
      const outsidePath = path.join(OUTSIDE_DIR, "test-file.txt");

      await expect(
        service.secureWriteFile(outsidePath, TEST_CONTENT)
      ).rejects.toThrow(ValidationError);
      await expect(
        service.secureWriteFile(outsidePath, TEST_CONTENT)
      ).rejects.toThrow(/Access denied/);

      // Verify file was not created
      await expect(fs.access(outsidePath)).rejects.toThrow();
    });

    it("should reject overwriting existing files by default", async () => {
      const filePath = path.join(TEST_DIR, "existing-file.txt");

      // Create the file first
      await fs.writeFile(filePath, "Original content", "utf8");

      // Try to overwrite without setting overwrite flag
      await expect(
        service.secureWriteFile(filePath, TEST_CONTENT)
      ).rejects.toThrow(ValidationError);
      await expect(
        service.secureWriteFile(filePath, TEST_CONTENT)
      ).rejects.toThrow(/File already exists/);

      // Verify file wasn't changed
      const content = await fs.readFile(filePath, "utf8");
      expect(content).toBe("Original content");
    });

    it("should allow overwriting existing files with overwrite flag", async () => {
      const filePath = path.join(TEST_DIR, "existing-file.txt");

      // Create the file first
      await fs.writeFile(filePath, "Original content", "utf8");

      // Overwrite with overwrite flag
      await service.secureWriteFile(filePath, TEST_CONTENT, {
        overwrite: true,
      });

      // Verify file was overwritten
      const content = await fs.readFile(filePath, "utf8");
      expect(content).toBe(TEST_CONTENT);
    });

    it("should support custom allowed directories", async () => {
      // Path is outside the service's configured directories
      const customAllowedPath = path.join(OUTSIDE_DIR, "custom-allowed.txt");

      // Use explicit allowedDirs
      await service.secureWriteFile(customAllowedPath, TEST_CONTENT, {
        allowedDirs: [OUTSIDE_DIR],
      });

      // Verify file was written
      const content = await fs.readFile(customAllowedPath, "utf8");
      expect(content).toBe(TEST_CONTENT);
    });
  });
});
