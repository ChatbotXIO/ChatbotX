// Re-export from schemas to ensure builder and validation use the same schema
export {
  DeepseekModel,
  deepseekGenerateTextDefaultFn,
  deepseekGenerateTextSchema,
  deepseekSchema,
  type DeepseekGenerateTextSchema,
} from "../../../schemas/steps/ai-actions/deepseek/generate-text"

