import { z } from "zod";
import {
  FunctionParameterTypeSchema,
  FunctionParameterSchema,
  FunctionParameterPropertiesSchema,
  FunctionDeclarationSchema,
  ToolConfigSchema,
  FunctionParameter,
} from "./schemas/CommonSchemas.js";
import { ToolSchema } from "./schemas/ToolSchemas.js";

// Re-export centralized schemas for backward compatibility
export const functionParameterTypeSchema = FunctionParameterTypeSchema;
export const functionParameterSchema = FunctionParameterSchema;
export const functionParameterPropertiesSchema =
  FunctionParameterPropertiesSchema;
export const functionDeclarationSchema = FunctionDeclarationSchema;
export const toolConfigSchema = ToolConfigSchema;
export { ToolSchema };

// Type exports for better type inference
export type FunctionParameterType = z.infer<typeof FunctionParameterTypeSchema>;
export type { FunctionParameter };
export type FunctionParameterProperties = z.infer<
  typeof FunctionParameterPropertiesSchema
>;
export type FunctionDeclaration = z.infer<typeof FunctionDeclarationSchema>;
export type Tool = z.infer<typeof ToolSchema>;
export type ToolConfig = z.infer<typeof ToolConfigSchema>;
