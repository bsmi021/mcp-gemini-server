import * as fs from "fs";
import * as path from "path";
import { logger } from "./logger.js";
import { ValidationError } from "./errors.js";

/**
 * Validates that a file path is secure and resolves it to an absolute path
 *
 * Security checks:
 * 1. Ensures the path exists
 * 2. Ensures the path is within the allowed base directory
 * 3. Prevents path traversal attacks
 *
 * @param filePath - The file path to validate
 * @param options - Optional configuration
 * @returns The validated absolute file path
 * @throws ValidationError if the path is invalid or insecure
 */
export function validateAndResolvePath(
  filePath: string,
  options: {
    mustExist?: boolean;
  } = {}
): string {
  const { mustExist = true } = options;

  // Get the safe base directory from environment variable
  const safeBaseDir = process.env.GEMINI_SAFE_FILE_BASE_DIR
    ? path.normalize(process.env.GEMINI_SAFE_FILE_BASE_DIR)
    : path.resolve(process.cwd());

  logger.debug(`Validating file path: ${filePath}`);
  logger.debug(`Safe base directory: ${safeBaseDir}`);

  // Resolve the absolute path
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(safeBaseDir, filePath);

  // Check if the file exists (if required)
  if (mustExist && !fs.existsSync(absolutePath)) {
    logger.warn(`File not found: ${absolutePath}`);
    throw new ValidationError(`File not found: ${absolutePath}`);
  }

  // Check if the path is within the safe base directory
  const normalizedPath = path.normalize(absolutePath);
  const relativePath = path.relative(safeBaseDir, normalizedPath);

  // Path traversal check - if the relative path starts with '..' or is absolute,
  // it's attempting to access files outside the safe directory
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    logger.warn(`Attempted path traversal: ${filePath}`);
    throw new ValidationError(
      `Access denied: The file path must be within the allowed directory`
    );
  }

  logger.debug(`Validated path: ${normalizedPath}`);
  return normalizedPath;
}

/**
 * Environment variable configuration for file path security
 */
export function configureFilePathSecurity(): void {
  // Add the environment variable to the required vars if using custom base dir
  const customBaseDir = process.env.GEMINI_SAFE_FILE_BASE_DIR;

  if (customBaseDir) {
    // Validate that the custom base directory exists
    if (!fs.existsSync(customBaseDir)) {
      logger.warn(
        `Configured GEMINI_SAFE_FILE_BASE_DIR does not exist: ${customBaseDir}`
      );
      logger.warn(`Falling back to default directory: ${process.cwd()}`);
    } else {
      logger.info(`File operations restricted to: ${customBaseDir}`);
    }
  } else {
    logger.info(
      `File operations restricted to current working directory: ${process.cwd()}`
    );
    logger.info(
      `Set GEMINI_SAFE_FILE_BASE_DIR environment variable to customize this.`
    );
  }
}
