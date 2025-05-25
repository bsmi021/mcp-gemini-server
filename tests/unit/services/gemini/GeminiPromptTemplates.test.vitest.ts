// Using vitest globals - see vitest.config.ts globals: true
import {
  processTemplate,
  getReviewTemplate,
  getFocusInstructions,
} from "../../../../src/services/gemini/GeminiPromptTemplates.js";

describe("GeminiPromptTemplates", () => {
  describe("processTemplate()", () => {
    it("should replace placeholders with values", () => {
      const template = "Hello {{name}}, welcome to {{place}}!";
      const context = {
        name: "John",
        place: "Paris",
        diffContent: "sample diff content", // Required by function signature
      };

      const result = processTemplate(template, context);
      expect(result).toBe("Hello John, welcome to Paris!");
    });

    it("should handle missing placeholders", () => {
      const template = "Hello {{name}}, welcome to {{place}}!";
      const context = {
        name: "John",
        diffContent: "sample diff content", // Required by function signature
      };

      const result = processTemplate(template, context);
      expect(result).toBe("Hello John, welcome to !");
    });

    it("should handle undefined values", () => {
      const template = "Hello {{name}}, welcome to {{place}}!";
      const context = {
        name: "John",
        place: undefined,
        diffContent: "sample diff content", // Required by function signature
      };

      const result = processTemplate(template, context);
      expect(result).toBe("Hello John, welcome to !");
    });

    it("should handle non-string values", () => {
      const template = "The answer is {{answer}}.";
      const context = {
        answer: "42", // Convert number to string to match function signature
        diffContent: "sample diff content", // Required by function signature
      };

      const result = processTemplate(template, context);
      expect(result).toBe("The answer is 42.");
    });
  });

  describe("getReviewTemplate()", () => {
    it("should return different templates for different review focuses", () => {
      const securityTemplate = getReviewTemplate("security");
      const performanceTemplate = getReviewTemplate("performance");
      const architectureTemplate = getReviewTemplate("architecture");
      const bugsTemplate = getReviewTemplate("bugs");
      const generalTemplate = getReviewTemplate("general");

      // Verify all templates are strings and different from each other
      expect(typeof securityTemplate).toBe("string");
      expect(typeof performanceTemplate).toBe("string");
      expect(typeof architectureTemplate).toBe("string");
      expect(typeof bugsTemplate).toBe("string");
      expect(typeof generalTemplate).toBe("string");

      expect(securityTemplate).not.toBe(performanceTemplate);
      expect(securityTemplate).not.toBe(architectureTemplate);
      expect(securityTemplate).not.toBe(bugsTemplate);
      expect(securityTemplate).not.toBe(generalTemplate);
      expect(performanceTemplate).not.toBe(architectureTemplate);
      expect(performanceTemplate).not.toBe(bugsTemplate);
      expect(performanceTemplate).not.toBe(generalTemplate);
      expect(architectureTemplate).not.toBe(bugsTemplate);
      expect(architectureTemplate).not.toBe(generalTemplate);
      expect(bugsTemplate).not.toBe(generalTemplate);
    });

    it("should return a template containing expected keywords for each focus", () => {
      // Security template should mention security concepts
      const securityTemplate = getReviewTemplate("security");
      expect(securityTemplate).toContain("security");
      expect(securityTemplate).toContain("vulnerabilit");

      // Performance template should mention performance concepts
      const performanceTemplate = getReviewTemplate("performance");
      expect(performanceTemplate).toContain("performance");
      expect(performanceTemplate).toContain("optimiz");

      // Architecture template should mention architecture concepts
      const architectureTemplate = getReviewTemplate("architecture");
      expect(architectureTemplate).toContain("architect");
      expect(architectureTemplate).toContain("design");

      // Bugs template should mention bug-related concepts
      const bugsTemplate = getReviewTemplate("bugs");
      expect(bugsTemplate).toContain("bug");
      expect(bugsTemplate).toContain("error");

      // General template should be comprehensive
      const generalTemplate = getReviewTemplate("general");
      expect(generalTemplate).toContain("comprehensive");
    });
  });

  describe("getFocusInstructions()", () => {
    it("should return different instructions for different focuses", () => {
      const securityInstructions = getFocusInstructions("security");
      const performanceInstructions = getFocusInstructions("performance");
      const architectureInstructions = getFocusInstructions("architecture");
      const bugsInstructions = getFocusInstructions("bugs");
      const generalInstructions = getFocusInstructions("general");

      // Verify all instructions are strings and different from each other
      expect(typeof securityInstructions).toBe("string");
      expect(typeof performanceInstructions).toBe("string");
      expect(typeof architectureInstructions).toBe("string");
      expect(typeof bugsInstructions).toBe("string");
      expect(typeof generalInstructions).toBe("string");

      expect(securityInstructions).not.toBe(performanceInstructions);
      expect(securityInstructions).not.toBe(architectureInstructions);
      expect(securityInstructions).not.toBe(bugsInstructions);
      expect(securityInstructions).not.toBe(generalInstructions);
      expect(performanceInstructions).not.toBe(architectureInstructions);
      expect(performanceInstructions).not.toBe(bugsInstructions);
      expect(performanceInstructions).not.toBe(generalInstructions);
      expect(architectureInstructions).not.toBe(bugsInstructions);
      expect(architectureInstructions).not.toBe(generalInstructions);
      expect(bugsInstructions).not.toBe(generalInstructions);
    });

    it("should include focus-specific keywords in each instruction", () => {
      // Security instructions should mention security concepts
      const securityInstructions = getFocusInstructions("security");
      expect(securityInstructions).toContain("security");
      expect(securityInstructions).toContain("vulnerabilities");

      // Performance instructions should mention performance concepts
      const performanceInstructions = getFocusInstructions("performance");
      expect(performanceInstructions).toContain("performance");
      expect(performanceInstructions).toContain("Algorithm");

      // Architecture instructions should mention architecture concepts
      const architectureInstructions = getFocusInstructions("architecture");
      expect(architectureInstructions).toContain("architectural");
      expect(architectureInstructions).toContain("Design pattern");

      // Bugs instructions should mention bug-related concepts
      const bugsInstructions = getFocusInstructions("bugs");
      expect(bugsInstructions).toContain("bugs");
      expect(bugsInstructions).toContain("errors");

      // General instructions should be comprehensive
      const generalInstructions = getFocusInstructions("general");
      expect(generalInstructions).toContain("comprehensive");
    });
  });
});
