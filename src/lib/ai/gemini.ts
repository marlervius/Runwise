import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export const geminiFlash = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",
  generationConfig: {
    temperature: 0.7,
    maxOutputTokens: 4096,
  },
});

export async function generateJSON<T>(prompt: string): Promise<T> {
  const result = await geminiFlash.generateContent(prompt);
  const text = result.response.text();

  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
  const jsonStr = (jsonMatch[1] || text).trim();

  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    console.error("[Gemini] Failed to parse JSON response:", text.substring(0, 500));
    throw new Error("AI returned invalid JSON");
  }
}

export async function generateText(prompt: string): Promise<string> {
  const result = await geminiFlash.generateContent(prompt);
  return result.response.text();
}
