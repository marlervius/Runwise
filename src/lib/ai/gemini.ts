import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export const geminiFlash = genAI.getGenerativeModel({
  model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
  generationConfig: {
    temperature: 0.7,
    maxOutputTokens: 4096,
  },
});

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const isRateLimit =
        error instanceof Error &&
        (error.message.includes("429") ||
          error.message.includes("Too Many Requests") ||
          error.message.includes("RESOURCE_EXHAUSTED") ||
          error.message.includes("Quota exceeded"));

      const isLastAttempt = attempt === MAX_RETRIES;

      if (!isRateLimit || isLastAttempt) {
        throw error;
      }

      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
      console.warn(
        `[Gemini] Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Unreachable, but TypeScript needs it
  throw new Error("Retry logic exhausted");
}

export class GeminiQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiQuotaError";
  }
}

export async function generateJSON<T>(prompt: string): Promise<T> {
  try {
    return await withRetry(async () => {
      const result = await geminiFlash.generateContent(prompt);
      const text = result.response.text();

      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [
        null,
        text,
      ];
      const jsonStr = (jsonMatch[1] || text).trim();

      try {
        return JSON.parse(jsonStr) as T;
      } catch {
        console.error(
          "[Gemini] Failed to parse JSON response:",
          text.substring(0, 500)
        );
        throw new Error("AI returned invalid JSON");
      }
    });
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error.message.includes("429") ||
        error.message.includes("Quota exceeded") ||
        error.message.includes("RESOURCE_EXHAUSTED"))
    ) {
      throw new GeminiQuotaError(
        "Gemini API-kvoten er brukt opp. Bruker lokal plangenerering."
      );
    }
    throw error;
  }
}

export async function generateText(prompt: string): Promise<string> {
  try {
    return await withRetry(async () => {
      const result = await geminiFlash.generateContent(prompt);
      return result.response.text();
    });
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error.message.includes("429") ||
        error.message.includes("Quota exceeded") ||
        error.message.includes("RESOURCE_EXHAUSTED"))
    ) {
      throw new GeminiQuotaError(
        "Gemini API-kvoten er brukt opp."
      );
    }
    throw error;
  }
}
