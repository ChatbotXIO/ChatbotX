// Re-export from schemas to ensure builder and validation use the same schema
export {
  GeminiModel,
  geminiGenerateTextDefaultFn,
  geminiGenerateTextSchema,
  geminiSchema,
  type GeminiGenerateTextSchema,
} from "../../../schemas/steps/ai-actions/gemini/generate-text"

