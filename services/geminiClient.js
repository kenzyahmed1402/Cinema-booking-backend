import { GoogleGenAI } from "@google/genai";

// The models behind the assistant: Gemini, through Google's SDK. A message
// uses GEMINI_MODEL, or GEMINI_FALLBACK_MODEL when the first is busy.
export const DEFAULT_MODEL = "gemini-3.5-flash";
export const DEFAULT_FALLBACK_MODEL = "gemini-3.8-flash";

export const modelNames = () => [
  ...new Set([process.env.GEMINI_MODEL || DEFAULT_MODEL, process.env.GEMINI_FALLBACK_MODEL || DEFAULT_FALLBACK_MODEL]),
];

// One model call: the conversation so far and the tools it may ask for.
// Returns the model's turn as it should be stored (`content`), the tool calls
// it asks for and its text.
// Gemini 3 models think before answering, by default at length. Choosing
// tools and answering briefly needs little of it, and it makes each call much
// faster. timeoutMs is also Google's own deadline for the call.
const createGeminiClient = (apiKey) => {
  const ai = new GoogleGenAI({ apiKey });
  return {
    generate: async ({ model, systemInstruction, contents, functionDeclarations, timeoutMs }) => {
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
