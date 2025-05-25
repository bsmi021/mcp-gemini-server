/**
 * Base Tool Schema Pattern
 *
 * This file establishes the standardized pattern for defining tool parameter schemas.
 * All tool parameter definitions should follow this pattern for consistency.
 */
import { z } from "zod";

/**
 * Interface that defines the standard exports for all tool parameter files
 */
export interface ToolSchemaDefinition<T extends z.ZodRawShape> {
  /**
   * The tool name used for registration
   */
  TOOL_NAME: string;

  /**
   * The tool description
   */
  TOOL_DESCRIPTION: string;

  /**
   * The tool parameters as a Zod schema object for direct use with MCP server.tool()
   */
  TOOL_PARAMS: T;

  /**
   * Complete Zod schema for validation (z.object(TOOL_PARAMS))
   */
  toolSchema: z.ZodObject<T>;

  /**
   * TypeScript type for parameters derived from the schema
   */
  ToolParams: z.infer<z.ZodObject<T>>;
}

/**
 * Helper function to create a standardized tool schema definition
 * @param name The tool name
 * @param description The tool description
 * @param params The Zod schema parameters
 * @returns A standardized tool schema definition
 */
export function createToolSchema<T extends z.ZodRawShape>(
  name: string,
  description: string,
  params: T
): ToolSchemaDefinition<T> {
  const toolSchema = z.object(params);

  return {
    TOOL_NAME: name,
    TOOL_DESCRIPTION: description,
    TOOL_PARAMS: params,
    toolSchema,
    // This is a type-level property, not a runtime value
    ToolParams: {} as z.infer<typeof toolSchema>,
  };
}
