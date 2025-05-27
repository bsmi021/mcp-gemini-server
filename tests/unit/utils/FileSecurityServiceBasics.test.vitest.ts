// Using vitest globals - see vitest.config.ts globals: true
import * as path from "node:path";
import * as fs from "node:fs/promises";

// Import the code to test
import { FileSecurityService } from "../../../src/utils/FileSecurityService.js";
import { logger } from "../../../src/utils/logger.js";

describe("FileSecurityService Basic Operations", () => {
  // Define test constants for all tests
  const TEST_CONTENT = "Test file content";

  // Test directories for our tests
  const testDir = path.resolve("./test-temp-dir");
  const outsideDir = path.resolve("./outside-dir");
  const ALLOWED_DIR = path.join(testDir, "allowed");

  // Setup and teardown for tests
  beforeEach(async () => {
    // Setup test directories
    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(ALLOWED_DIR, { recursive: true });
    await fs.mkdir(outsideDir, { recursive: true });

    // Mock logger to prevent console spam
    vi.spyOn(logger, "info").mockImplementation(vi.fn());
    vi.spyOn(logger, "error").mockImplementation(vi.fn());
    vi.spyOn(logger, "warn").mockImplementation(vi.fn());
  });

  afterEach(async () => {
    // Clean up test directories
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.rm(outsideDir, { recursive: true, force: true });

    // Restore mocks
    vi.restoreAllMocks();
  });

  describe("Basic File Security Operations", () => {
    it("should write to a file directly within allowed absolute directory", async () => {
      // Arrange
      const filePath = path.join(ALLOWED_DIR, "file.txt");
      const allowedPaths = [ALLOWED_DIR];
      const fileSecurityService = new FileSecurityService(allowedPaths);

      // Act
      await fileSecurityService.secureWriteFile(filePath, TEST_CONTENT);

      // Assert
      const fileContent = await fs.readFile(filePath, "utf8");
      expect(fileContent).toBe(TEST_CONTENT);
    });

    it("should write to a file in a nested subdirectory of allowed directory", async () => {
      // Arrange
      const nestedDir = path.join(ALLOWED_DIR, "subdir");
      const filePath = path.join(nestedDir, "file.txt");
      const allowedPaths = [ALLOWED_DIR];
      const fileSecurityService = new FileSecurityService(allowedPaths);

      // Act
      await fileSecurityService.secureWriteFile(filePath, TEST_CONTENT);

      // Assert
      const fileContent = await fs.readFile(filePath, "utf8");
      expect(fileContent).toBe(TEST_CONTENT);
    });

    it("should allow writing when filePath is an exact match to allowed absolute file path", async () => {
      // Arrange
      const exactFilePath = path.join(ALLOWED_DIR, "exact-file.txt");
      const allowedPaths = [exactFilePath]; // Allowing the exact file path
      const fileSecurityService = new FileSecurityService(allowedPaths);

      // Act
      await fileSecurityService.secureWriteFile(exactFilePath, TEST_CONTENT);

      // Assert
      const fileContent = await fs.readFile(exactFilePath, "utf8");
      expect(fileContent).toBe(TEST_CONTENT);
    });

    it("should throw error when filePath resolves outside allowed paths", async () => {
      // Arrange
      const unsafePath = path.join(outsideDir, "unsafe-file.txt");
      const allowedPaths = [ALLOWED_DIR];
      const fileSecurityService = new FileSecurityService(allowedPaths);

      // Act & Assert
      await expect(
        fileSecurityService.secureWriteFile(unsafePath, TEST_CONTENT)
      ).rejects.toThrow(
        /Access denied: The file path must be within the allowed directories/
      );

      // Additional check that logger.warn was called (FileSecurityService uses warn, not error)
      expect(logger.warn).toHaveBeenCalled();

      // Verify file was not written
      await expect(fs.access(unsafePath)).rejects.toThrow();
    });

    it("should throw error when filePath uses directory traversal to escape allowed path", async () => {
      // Arrange
      const traversalPath = path.join(
        ALLOWED_DIR,
        "subdir",
        "..",
        "..",
        "outside",
        "file.txt"
      );
      const allowedPaths = [ALLOWED_DIR];
      const fileSecurityService = new FileSecurityService(allowedPaths);

      // Act & Assert
      await expect(
        fileSecurityService.secureWriteFile(traversalPath, TEST_CONTENT)
      ).rejects.toThrow(
        /Access denied: The file path must be within the allowed directories/
      );
    });

    it("should use default path when no allowed paths are provided", async () => {
      // Arrange
      const filePath = path.join(process.cwd(), "test-file.txt");
      const fileSecurityService = new FileSecurityService(); // No paths provided uses CWD as default

      try {
        // Act
        await fileSecurityService.secureWriteFile(filePath, TEST_CONTENT);

        // Assert
        const fileContent = await fs.readFile(filePath, "utf8");
        expect(fileContent).toBe(TEST_CONTENT);
      } finally {
        // Cleanup the file created in CWD
        try {
          await fs.unlink(filePath);
        } catch (err) {
          // Ignore error if file doesn't exist
        }
      }
    });

    it("should correctly handle path normalization and resolution", async () => {
      // Arrange
      const complexPath = path.join(
        ALLOWED_DIR,
        ".",
        "subdir",
        "..",
        "normalized-file.txt"
      );
      const allowedPaths = [ALLOWED_DIR];
      const fileSecurityService = new FileSecurityService(allowedPaths);

      // Act
      await fileSecurityService.secureWriteFile(complexPath, TEST_CONTENT);

      // Assert - check the file exists at the normalized location
      const expectedPath = path.join(ALLOWED_DIR, "normalized-file.txt");
      const fileContent = await fs.readFile(expectedPath, "utf8");
      expect(fileContent).toBe(TEST_CONTENT);
    });

    it("should handle multiple allowed paths", async () => {
      // Arrange
      const filePath = path.join(outsideDir, "allowed-outside-file.txt");
      const content = "multi-allowed content";
      const fileSecurityService = new FileSecurityService([
        ALLOWED_DIR,
        outsideDir,
      ]);

      // Act
      await fileSecurityService.secureWriteFile(filePath, content);

      // Assert
      const fileContent = await fs.readFile(filePath, "utf8");
      expect(fileContent).toBe(content);
    });
  });
});
