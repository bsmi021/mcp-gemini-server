import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import { logger } from "./logger.js";
import { ValidationError } from "./errors.js";

/**
 * Type guard to check if an error is an ENOENT (file not found) error
 * @param err - The error to check
 * @returns True if the error is an ENOENT error
 */
function isENOENTError(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === "object" &&
    "code" in err &&
    err.code === "ENOENT"
  );
}

/**
 * Type guard to check if an error has a message property
 * @param err - The error to check
 * @returns True if the error has a message property
 */
function hasErrorMessage(err: unknown): err is { message: string } {
  return (
    err !== null &&
    typeof err === "object" &&
    "message" in err &&
    typeof err.message === "string"
  );
}

/**
 * Centralized service for handling file-related security operations
 * Provides comprehensive validation, resolution, and secure file operations
 */
export class FileSecurityService {
  private allowedDirectories: string[] = [];
  private secureBasePath?: string;

  // Default safe base directory - using the project root as the default
  private readonly DEFAULT_SAFE_BASE_DIR: string =
    process.env.GEMINI_SAFE_FILE_BASE_DIR || path.resolve(process.cwd());

  /**
   * Creates a new instance of the FileSecurityService
   * @param allowedDirectories Optional array of allowed directories for file operations
   * @param secureBasePath Optional single secure base path (takes precedence over env vars)
   */
  constructor(allowedDirectories?: string[], secureBasePath?: string) {
    // Initialize with environment variable if set
    this.secureBasePath =
      process.env.GEMINI_SAFE_FILE_BASE_DIR ||
      (secureBasePath ? path.normalize(secureBasePath) : undefined);

    // Initialize allowed directories
    if (allowedDirectories && allowedDirectories.length > 0) {
      this.setAllowedDirectories(allowedDirectories);
    } else if (this.secureBasePath) {
      this.allowedDirectories = [this.secureBasePath];
    } else {
      this.allowedDirectories = [path.resolve(process.cwd())];
    }

    logger.info(
      `File operations restricted to: ${this.allowedDirectories.join(", ")}`
    );
  }

  /**
   * Sets the secure base directory for file operations.
   * @param basePath The absolute path to restrict file operations to
   */
  public setSecureBasePath(basePath: string): void {
    if (!path.isAbsolute(basePath)) {
      throw new ValidationError("Base path must be absolute");
    }

    // Store the base path in a private field
    this.secureBasePath = path.normalize(basePath);

    // Update allowed directories to include this path
    if (!this.allowedDirectories.includes(this.secureBasePath)) {
      this.allowedDirectories.push(this.secureBasePath);
    }

    logger.debug(`Secure base path set to: ${this.secureBasePath}`);
  }

  /**
   * Gets the current secure base directory if set
   */
  public getSecureBasePath(): string | undefined {
    return this.secureBasePath;
  }

  /**
   * Sets the allowed directories for file operations
   * @param directories Array of absolute paths allowed for file operations
   */
  public setAllowedDirectories(directories: string[]): void {
    if (!directories || directories.length === 0) {
      throw new ValidationError(
        "At least one allowed directory must be provided"
      );
    }

    // Validate all directories are absolute paths
    for (const dir of directories) {
      if (!path.isAbsolute(dir)) {
        throw new ValidationError(`Directory path must be absolute: ${dir}`);
      }
    }

    // Store normalized paths
    this.allowedDirectories = directories.map((dir) => path.normalize(dir));
    logger.debug(
      `Allowed directories set to: ${this.allowedDirectories.join(", ")}`
    );
  }

  /**
   * Gets the current allowed directories
   */
  public getAllowedDirectories(): string[] {
    return [...this.allowedDirectories];
  }

  /**
   * Validates that a file path is secure and resolves it to an absolute path
   * Can work with either a base directory or multiple allowed directories
   *
   * @param filePath The file path to validate
   * @param options Optional configuration
   * @returns The validated absolute file path
   * @throws ValidationError if the path is invalid or insecure
   */
  public validateAndResolvePath(
    filePath: string,
    options: {
      mustExist?: boolean;
      allowedDirs?: string[];
      basePath?: string;
    } = {}
  ): string {
    const { mustExist = false, allowedDirs, basePath } = options;

    // Determine which allowed directories to use
    const effectiveAllowedDirs =
      allowedDirs ||
      (basePath ? [path.normalize(basePath)] : this.allowedDirectories);

    logger.debug(`Validating file path: ${filePath}`);
    logger.debug(
      `Using allowed directories: ${effectiveAllowedDirs.join(", ")}`
    );

    // Resolve the absolute path
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(this.secureBasePath || process.cwd(), filePath);

    // Normalize path to handle . and .. segments
    const normalizedPath = path.normalize(absolutePath);

    // Check if the path is within any allowed directory
    if (!this.isPathWithinAllowedDirs(normalizedPath, effectiveAllowedDirs)) {
      logger.warn(
        `Access denied: Path not in allowed directories: ${filePath}`
      );
      throw new ValidationError(
        `Access denied: The file path must be within the allowed directories`
      );
    }

    // Check if the file exists (if required)
    if (mustExist) {
      try {
        fsSync.accessSync(normalizedPath, fsSync.constants.F_OK);
      } catch (error) {
        logger.warn(`File not found: ${normalizedPath}`);
        throw new ValidationError(`File not found: ${normalizedPath}`);
      }
    }

    logger.debug(`Validated path: ${normalizedPath}`);
    return normalizedPath;
  }

  /**
   * Checks if a given file path is within any of the allowed directories.
   *
   * @param filePath The relative or absolute path to check.
   * @param allowedDirs Optional array of allowed directory paths (defaults to instance's allowed directories)
   * @returns True if the file path is within any of the allowed directories, false otherwise.
   */
  public isPathWithinAllowedDirs(
    filePath: string,
    allowedDirs?: string[]
  ): boolean {
    // Use instance's allowed directories if none provided
    const effectiveAllowedDirs = allowedDirs || this.allowedDirectories;

    // Return false if effectiveAllowedDirs is empty
    if (!effectiveAllowedDirs || effectiveAllowedDirs.length === 0) {
      return false;
    }

    // Canonicalize the file path to an absolute path
    const resolvedFilePath = path.resolve(filePath);

    // Normalize the path to handle sequences like '..'
    const normalizedFilePath = path.normalize(resolvedFilePath);

    // Check if the file path is within any of the allowed directories
    for (const allowedDir of effectiveAllowedDirs) {
      // Normalize the allowed directory path
      const normalizedAllowedDir = path.normalize(path.resolve(allowedDir));

      // Check if it's an allowed directory containing the file, or an exact match
      if (
        normalizedFilePath.startsWith(normalizedAllowedDir + path.sep) ||
        normalizedFilePath === normalizedAllowedDir
      ) {
        // Additional check: ensure no upward traversal after matching the prefix
        const relativePath = path.relative(
          normalizedAllowedDir,
          normalizedFilePath
        );

        if (!relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Fully resolves a file path, handling symlinks and security checks
   *
   * @param filePath The file path to resolve
   * @returns The fully resolved file path
   * @throws ValidationError if the path contains insecure symlinks
   */
  public async fullyResolvePath(filePath: string): Promise<string> {
    const normalizedPath = path.normalize(path.resolve(filePath));

    try {
      // Check if the target file exists and is a symlink
      try {
        const stats = await fs.lstat(normalizedPath);
        if (stats.isSymbolicLink()) {
          logger.warn(`Path is a symlink: ${normalizedPath}`);
          const target = await fs.readlink(normalizedPath);
          const resolvedPath = path.resolve(
            path.dirname(normalizedPath),
            target
          );

          // Ensure the symlink target is within allowed directories
          if (!this.isPathWithinAllowedDirs(resolvedPath)) {
            throw new ValidationError(
              `Security error: Symlink target is outside allowed directories: ${resolvedPath}`
            );
          }

          return resolvedPath;
        }
      } catch (err) {
        // If file doesn't exist (ENOENT), that's fine in many cases
        if (!isENOENTError(err)) {
          throw err;
        }
      }

      // Also check parent directories to ensure we're not inside a symlinked directory
      let currentPath = path.dirname(normalizedPath);
      const root = path.parse(currentPath).root;

      // Track resolved parent paths
      const resolvedPaths = new Map<string, string>();

      while (currentPath !== root) {
        try {
          const dirStats = await fs.lstat(currentPath);
          if (dirStats.isSymbolicLink()) {
            // Resolve the symlink
            const linkTarget = await fs.readlink(currentPath);
            const resolvedPath = path.resolve(
              path.dirname(currentPath),
              linkTarget
            );

            logger.warn(
              `Parent directory is a symlink: ${currentPath} -> ${resolvedPath}`
            );
            resolvedPaths.set(currentPath, resolvedPath);

            // If this is the immediate parent, update the final path
            if (currentPath === path.dirname(normalizedPath)) {
              const updatedPath = path.join(
                resolvedPath,
                path.basename(normalizedPath)
              );

              // Ensure resolved path is still secure
              if (!this.isPathWithinAllowedDirs(updatedPath)) {
                throw new ValidationError(
                  `Security error: Resolved symlink path is outside allowed directories: ${updatedPath}`
                );
              }

              return updatedPath;
            }
          }
        } catch (err) {
          if (!isENOENTError(err)) {
            throw err;
          }
        }

        currentPath = path.dirname(currentPath);
      }

      // If we found symlinks in parent directories, perform a final security check
      if (resolvedPaths.size > 0) {
        try {
          // Get fully resolved path including all symlinks
          const finalResolvedPath = await fs.realpath(normalizedPath);

          // Final security check with the fully resolved path
          if (!this.isPathWithinAllowedDirs(finalResolvedPath)) {
            throw new ValidationError(
              `Security error: Resolved path is outside allowed directories: ${finalResolvedPath}`
            );
          }

          return finalResolvedPath;
        } catch (err) {
          // Handle case where path doesn't exist yet
          if (isENOENTError(err)) {
            // Try to resolve just the directory part
            const resolvedDir = await fs
              .realpath(path.dirname(normalizedPath))
              .catch((dirErr) => {
                if (isENOENTError(dirErr)) {
                  return path.dirname(normalizedPath);
                }
                throw dirErr;
              });

            const finalPath = path.join(
              resolvedDir,
              path.basename(normalizedPath)
            );

            // Final security check
            if (!this.isPathWithinAllowedDirs(finalPath)) {
              throw new ValidationError(
                `Security error: Resolved path is outside allowed directories: ${finalPath}`
              );
            }

            return finalPath;
          }
          throw err;
        }
      }

      // No symlinks found, return the normalized path
      return normalizedPath;
    } catch (err) {
      if (hasErrorMessage(err) && err.message.includes("Security error:")) {
        // Re-throw security errors
        throw err;
      }
      // For other errors, provide a clearer message
      const errorMsg = hasErrorMessage(err) ? err.message : String(err);
      logger.error(`Error resolving path: ${errorMsg}`, err);
      throw new ValidationError(`Error validating path security: ${errorMsg}`);
    }
  }

  /**
   * Securely writes content to a file, ensuring the path is within allowed directories.
   *
   * @param filePath The relative or absolute path to the file.
   * @param content The string content to write to the file.
   * @param options Optional configuration
   * @returns A promise that resolves when the file is written
   * @throws ValidationError if the path is invalid, outside allowed directories,
   *         if the file exists and overwrite is false, or for any other security/file system error
   */
  public async secureWriteFile(
    filePath: string,
    content: string,
    options: {
      overwrite?: boolean;
      allowedDirs?: string[];
    } = {}
  ): Promise<void> {
    const { overwrite = false, allowedDirs } = options;

    // Use instance's allowed directories if none provided
    const effectiveAllowedDirs = allowedDirs || this.allowedDirectories;

    // 1. Initial validation against allowed directories
    const validatedPath = this.validateAndResolvePath(filePath, {
      allowedDirs: effectiveAllowedDirs,
    });

    // 2. Fully resolve the path handling symlinks and do final security check
    const finalFilePath = await this.fullyResolvePath(validatedPath);

    // 3. Check if file exists and overwrite flag is false
    if (!overwrite) {
      try {
        await fs.access(finalFilePath);
        // If we get here, the file exists
        logger.error(
          `File already exists and overwrite is false: ${finalFilePath}`
        );
        throw new ValidationError(
          `File already exists: ${filePath}. Set overwrite flag to true to replace it.`
        );
      } catch (err) {
        // File doesn't exist or other access error - this is expected for new files
        if (!isENOENTError(err)) {
          // If error is not "file doesn't exist", it's another access error
          logger.error(`Error checking file existence: ${finalFilePath}`, err);
          const errorMsg = hasErrorMessage(err) ? err.message : String(err);
          throw new ValidationError(`Error checking file access: ${errorMsg}`);
        }
        // If err.code === 'ENOENT', the file doesn't exist, which is fine for new files
      }
    }

    // 4. Create parent directories if they don't exist
    const dirPath = path.dirname(finalFilePath);
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (err) {
      logger.error(`Error creating directory ${dirPath}:`, err);
      const errorMsg = hasErrorMessage(err) ? err.message : String(err);
      throw new ValidationError(
        `Failed to create directory structure: ${errorMsg}`
      );
    }

    // 5. Write the file
    try {
      await fs.writeFile(finalFilePath, content, "utf8");
      logger.info(`Successfully wrote file to ${finalFilePath}`);
    } catch (err) {
      logger.error(`Error writing file ${finalFilePath}:`, err);
      const errorMsg = hasErrorMessage(err) ? err.message : String(err);
      throw new ValidationError(`Failed to write file: ${errorMsg}`);
    }
  }

  /**
   * Initializes file path security from environment variables
   * Call this during application startup
   */
  public static configureFromEnvironment(): FileSecurityService {
    const customBaseDir = process.env.GEMINI_SAFE_FILE_BASE_DIR;
    const service = new FileSecurityService();

    if (customBaseDir) {
      // Validate that the custom base directory exists
      try {
        fsSync.accessSync(customBaseDir, fsSync.constants.F_OK);
        logger.info(`File operations restricted to: ${customBaseDir}`);
        service.setAllowedDirectories([customBaseDir]);
      } catch (error) {
        logger.warn(
          `Configured GEMINI_SAFE_FILE_BASE_DIR does not exist: ${customBaseDir}`
        );
        logger.warn(`Falling back to default directory: ${process.cwd()}`);
        service.setAllowedDirectories([process.cwd()]);
      }
    } else {
      logger.info(
        `File operations restricted to current working directory: ${process.cwd()}`
      );
      service.setAllowedDirectories([process.cwd()]);
    }

    return service;
  }
}
