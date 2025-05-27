// Using vitest globals - see vitest.config.ts globals: true
import { GoogleGenAI } from "@google/genai";
import { GeminiChatService } from "../src/services/gemini/GeminiChatService.js";
import { RouteMessageParams } from "../src/services/GeminiService.js";
import { config } from "dotenv";

// Load environment variables
config();

// Simple test to check the router functionality
describe("Basic Router Test", () => {
  it("should route messages correctly", async () => {
    // Get API key from environment
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;

    // Skip if no API key
    if (!apiKey) {
      console.log("Skipping test, no API key");
      return;
    }

    // Initialize Google GenAI
    const genAI = new GoogleGenAI({ apiKey });

    // Create chat service
    const chatService = new GeminiChatService(genAI, "gemini-1.5-pro");

    // Create router params
    const params: RouteMessageParams = {
      message: "What is the capital of France?",
      models: ["gemini-1.5-pro", "gemini-1.5-flash"],
      defaultModel: "gemini-1.5-pro",
    };

    try {
      // Call route message
      const result = await chatService.routeMessage(params);

      // Check that we got a response
      expect(result.response).toBeTruthy();
      expect(result.chosenModel).toBeTruthy();

      // Should be one of our models
      expect(
        ["gemini-1.5-pro", "gemini-1.5-flash"].includes(result.chosenModel)
      ).toBeTruthy();

      console.log(`Chosen model: ${result.chosenModel}`);
      console.log(
        `Response text: ${result.response.text?.substring(0, 50)}...`
      );
    } catch (error) {
      console.error("Router test failed:", error);
      throw error;
    }
  });
});
