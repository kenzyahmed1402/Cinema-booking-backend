import { GoogleGenAI } from "@google/genai";

// The model behind the assistant: Gemini, through Google's SDK. Set
// GEMINI_MODEL to use another Gemini model.
export const DEFAULT_MODEL = "gemini-3.8-flash";

// One model call: the conversation so far and the tools it may ask for.
// Returns the model's turn as it should be stored (`content`), the tool calls
// it asks for and its text.
// Gemini 3 models think before answering, by default at length. Choosing
// tools and answering briefly needs little of it, and it makes each call much
// faster. timeoutMs is also Google's own deadline for the call.
const createGeminiClient = (apiKey) => {
  const ai = new GoogleGenAI({ apiKey });
  return {
    generate: async ({ systemInstruction, contents, functionDeclarations, timeoutMs }) => {
      const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction,
          tools: [{ functionDeclarations }],
          ...(model.startsWith("gemini-3") && { thinkingConfig: { thinkingLevel: "low" } }),
          httpOptions: { timeout: timeoutMs },
        },
      });
      const functionCalls = response.functionCalls ?? [];
      return {
        content: response.candidates?.[0]?.content,
        functionCalls,
        // Read only without tool calls: the SDK warns when text is read
        // from a turn that also has tool calls
        text: functionCalls.length === 0 ? response.text : undefined,
      };
    },
  };
};

let defaultClient;

// The client for GEMINI_API_KEY, created on first use, or null without a key
export const getModelClient = () => {
  if (!defaultClient && process.env.GEMINI_API_KEY) {
    defaultClient = createGeminiClient(process.env.GEMINI_API_KEY);
  }
  return defaultClient ?? null;
};

// Replaces the client, so tests can use a fake model. Not reachable from any
// request.
export const setModelClient = (client) => {
  defaultClient = client;
};
