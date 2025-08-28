import { z } from "zod"
import { GEMINI_MODELS } from "@/features/gemini/models"
import { OPENAI_MODELS } from "@/features/openai/models"

export const createAIAgentRequest = z.object({
  name: z.string().trim().min(1).max(255),
  prompt: z.string().trim().min(1).max(255),
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().trim().min(1).max(255),
    }),
  ),
  models: z.array(
    z.discriminatedUnion("provider", [
      z.object({
        provider: z.literal("gemini"),
        model: z.enum(Object.keys(GEMINI_MODELS) as [string, ...string[]]),
      }),
      z.object({
        provider: z.literal("openAI"),
        model: z.enum(Object.keys(OPENAI_MODELS) as [string, ...string[]]),
      }),
    ]),
  ),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().min(1).max(32_768),
  tools: z.array(z.string()),
  isDefault: z.boolean(),
})
export type CreateAIAgentRequest = z.infer<typeof createAIAgentRequest>
