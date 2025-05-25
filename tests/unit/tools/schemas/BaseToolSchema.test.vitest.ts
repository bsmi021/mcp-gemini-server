// Using vitest globals - see vitest.config.ts globals: true
import { z } from "zod";
import { createToolSchema } from "../../../../src/tools/schemas/BaseToolSchema.js";

/**
 * Tests for the BaseToolSchema module, focusing on the createToolSchema factory
 * function and ensuring it produces correctly structured tool schema definitions.
 */
describe("BaseToolSchema", () => {
  describe("createToolSchema", () => {
    it("should create a valid tool schema definition", () => {
      const testParams = {
        name: z.string().min(1),
        count: z.number().int().positive(),
        isEnabled: z.boolean().optional(),
      };

      const result = createToolSchema(
        "testTool",
        "A tool for testing",
        testParams
      );

      expect(result).toHaveProperty("TOOL_NAME", "testTool");
      expect(result).toHaveProperty("TOOL_DESCRIPTION", "A tool for testing");
      expect(result).toHaveProperty("TOOL_PARAMS");
      expect(result).toHaveProperty("toolSchema");
    });

    it("should create a schema that validates correctly", () => {
      const testParams = {
        name: z.string().min(1),
        count: z.number().int().positive(),
      };

      const { toolSchema } = createToolSchema(
        "testTool",
        "A tool for testing",
        testParams
      );

      // Valid data
      const validData = { name: "test", count: 42 };
      expect(toolSchema.safeParse(validData).success).toBe(true);

      // Invalid data - missing required field
      const missingField = { name: "test" };
      expect(toolSchema.safeParse(missingField).success).toBe(false);

      // Invalid data - wrong type
      const wrongType = { name: "test", count: "42" };
      expect(toolSchema.safeParse(wrongType).success).toBe(false);
    });
  });
});
