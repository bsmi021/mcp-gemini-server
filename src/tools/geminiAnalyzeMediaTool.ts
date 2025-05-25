import { GeminiService } from "../services/index.js";
import { logger } from "../utils/index.js";
import {
  TOOL_NAME_ANALYZE_MEDIA,
  TOOL_DESCRIPTION_ANALYZE_MEDIA,
  GEMINI_ANALYZE_MEDIA_PARAMS,
  GeminiAnalyzeMediaArgs,
} from "./geminiAnalyzeMediaParams.js";
import { mapAnyErrorToMcpError } from "../utils/errors.js";
import { validateAndResolvePath } from "../utils/filePathSecurity.js";
import { Part } from "@google/genai";
import { ImagePart, SafetySetting } from "../services/gemini/GeminiTypes.js";
import fs from "fs/promises";
import path from "path";

// Utility function to efficiently handle large base64 strings
async function* streamBase64Data(
  base64String: string,
  chunkSize = 1024 * 1024
) {
  // First validate base64 format quickly (already validated in convertImageToPart)
  const [, content] = base64String.split(",");

  // Calculate total chunks needed
  const totalChunks = Math.ceil(content.length / chunkSize);
  let processedChunks = 0;

  // Stream the data in chunks
  for (let i = 0; i < content.length; i += chunkSize) {
    const chunk = content.slice(i, i + chunkSize);
    processedChunks++;

    // Log progress for large files
    if (processedChunks % 10 === 0 || processedChunks === totalChunks) {
      logger.debug(
        `Processing base64 data: ${processedChunks}/${totalChunks} chunks`
      );
    }

    yield chunk;
  }
}

// Helper function to convert image input to Part object
async function convertImageToPart(image: {
  base64: string;
  url?: string;
  mimeType: string;
}): Promise<Part> {
  // Schema validation ensures base64 is always present and url is rejected
  // First validate base64 format
  if (!/^data:.*?;base64,/.test(image.base64)) {
    throw new Error("Invalid base64 data URL format");
  }

  // Split data header and content
  const [, content] = image.base64.split(",");

  // Handle base64 type with streaming for large files
  const sizeInBytes = Math.round((image.base64.length * 3) / 4);
  const isLargeFile = sizeInBytes > 5 * 1024 * 1024; // 5MB threshold

  if (isLargeFile) {
    // Process large base64 files in chunks
    logger.debug("Processing large base64 image in chunks");
    let processedData = "";
    for await (const chunk of streamBase64Data(image.base64)) {
      processedData += chunk;
    }
    return {
      inlineData: {
        data: processedData,
        mimeType: image.mimeType,
      },
    };
  } else {
    // Small files can be processed directly
    return {
      inlineData: {
        data: content, // Use the extracted content without the data URL prefix
        mimeType: image.mimeType,
      },
    };
  }
}

// Helper function to detect MIME type from file extension
function detectMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".wav": "audio/wav",
    ".mp3": "audio/mp3",
    ".aiff": "audio/aiff",
    ".aac": "audio/aac",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
  };
  return mimeTypes[ext] || "audio/wav";
}

/**
 * Handles Gemini media analysis operations including object detection, content understanding, and audio transcription.
 * The operation is determined by the analysisType parameter.
 */
export const geminiAnalyzeMediaTool = {
  name: TOOL_NAME_ANALYZE_MEDIA,
  description: TOOL_DESCRIPTION_ANALYZE_MEDIA,
  inputSchema: GEMINI_ANALYZE_MEDIA_PARAMS,
  execute: async (args: GeminiAnalyzeMediaArgs) => {
    logger.debug(`Received ${TOOL_NAME_ANALYZE_MEDIA} request:`, {
      analysisType: args.analysisType,
      modelName: args.modelName,
    });

    const serviceInstance = new GeminiService();

    try {
      switch (args.analysisType) {
        case "object_detection": {
          // Convert image input to Part object
          const imagePart = await convertImageToPart(args.image);

          // Call the service
          const result = await serviceInstance.detectObjects(
            imagePart as ImagePart,
            args.promptAddition,
            args.modelName,
            args.safetySettings as SafetySetting[]
          );

          // Return in the format expected by MCP
          if (args.outputFormat === "text" && result.rawText) {
            return {
              content: [
                {
                  type: "text",
                  text: result.rawText,
                },
              ],
            };
          } else {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }
        }

        case "content_understanding": {
          // Convert image input to Part object
          const imagePart = await convertImageToPart(args.image);

          // Call the service
          const result = await serviceInstance.analyzeContent(
            imagePart as ImagePart,
            args.prompt,
            args.structuredOutput,
            args.modelName,
            args.safetySettings as SafetySetting[]
          );

          // Return in the format expected by MCP
          if (args.structuredOutput && result.analysis.data) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result.analysis.data, null, 2),
                },
              ],
            };
          } else if (result.analysis.text) {
            return {
              content: [
                {
                  type: "text",
                  text: result.analysis.text,
                },
              ],
            };
          } else {
            throw new Error("No content understanding result available");
          }
        }

        case "audio_transcription": {
          // Validate file path
          const safeFilePath = validateAndResolvePath(args.filePath, {
            mustExist: true,
          });

          // Detect MIME type if not provided
          const mimeType = args.mimeType || detectMimeType(safeFilePath);

          // Check file size
          const fileStats = await fs.stat(safeFilePath);
          const fileSizeMB = fileStats.size / (1024 * 1024);
          const SIZE_LIMIT_MB = 20;

          let transcriptionResult;

          if (fileSizeMB > SIZE_LIMIT_MB) {
            throw new Error(
              `Audio file size (${fileSizeMB.toFixed(2)}MB) exceeds the ${SIZE_LIMIT_MB}MB limit for inline data. ` +
                "Please use smaller audio files or consider splitting the audio into smaller segments."
            );
          } else {
            logger.info(
              `Audio file size: ${fileSizeMB.toFixed(2)}MB. Processing directly with inline base64 data.`
            );

            // Read file and convert to base64
            const audioData = await fs.readFile(safeFilePath);
            const audioBase64 = Buffer.from(audioData).toString("base64");

            // Build prompt
            const promptParts = ["Transcribe this audio file accurately"];
            if (args.includeTimestamps) {
              promptParts.push(
                "include timestamps for each paragraph or speaker change"
              );
            }
            if (args.language) {
              promptParts.push(`the language is ${args.language}`);
            }
            if (args.prompt) {
              promptParts.push(args.prompt);
            }
            const prompt = promptParts.join(". ");

            // Call generateContent with inline data
            transcriptionResult = await serviceInstance.generateContent({
              prompt,
              modelName: args.modelName,
              fileReferenceOrInlineData: audioBase64,
              inlineDataMimeType: mimeType,
            });
          }

          // Extract transcription text
          const transcription = transcriptionResult || "";

          return {
            content: [
              {
                type: "text",
                text: transcription,
              },
            ],
          };
        }

        default:
          // This should never happen due to discriminated union
          throw new Error(
            `Unknown analysis type: ${(args as { analysisType: string }).analysisType}`
          );
      }
    } catch (error: unknown) {
      logger.error(`Error processing ${TOOL_NAME_ANALYZE_MEDIA}:`, error);
      throw mapAnyErrorToMcpError(error, TOOL_NAME_ANALYZE_MEDIA);
    }
  },
};
