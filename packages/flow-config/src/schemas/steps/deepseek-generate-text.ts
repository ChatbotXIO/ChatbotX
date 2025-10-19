import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const DeepseekModel = {
  DeepSeekV25: "deepseek-chat",
  DeepSeekV2: "deepseek-chat-v2",
  DeepSeekCoder: "deepseek-coder",
  DeepSeekCoderV2: "deepseek-coder-v2",
} as const

export const deepseekSchema = z.object({
  id: z.cuid2(),
  model: z.enum(DeepseekModel),
})

export const deepseekGenerateTextSchema = deepseekSchema.extend({
  stepType: z.literal(StepType.DEEPSEEK_GENERATE_TEXT),
  prompt: z.string().optional(),
  userMessage: z.string().optional(),
  resultCustomFieldId: z.union([z.cuid2(), z.literal("")]).optional(),
  tools: z.array(z.string()).optional(),
  rememberConversation: z.boolean(),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(250).max(4096),
})

export type DeepseekGenerateTextSchema = z.infer<
  typeof deepseekGenerateTextSchema
>

export const deepseekGenerateTextDefaultFn =
  (): DeepseekGenerateTextSchema => ({
    id: createId(),
    stepType: StepType.DEEPSEEK_GENERATE_TEXT,
    model: DeepseekModel.DeepSeekV25,
    prompt: "",
    userMessage: "",
    resultCustomFieldId: undefined,
    tools: [],
    rememberConversation: true,
    temperature: 1.0,
    maxTokens: 250,
  })
