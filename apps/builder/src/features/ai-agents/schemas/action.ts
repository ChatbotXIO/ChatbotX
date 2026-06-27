import {
  aiProviders,
  claudeModels,
  deepseekModels,
  geminiModels,
  openaiModels,
  openrouterModels,
} from "@chatbotx.io/ai"
import { aiMessageRoles } from "@chatbotx.io/database/partials"
import { z } from "zod"
import { MAX_WEB_SEARCH_AUTHORIZED_DOMAINS } from "../lib/web-search-tool"

const webSearchAuthorizedDomainsSchema = z
  .array(
    z.object({
      value: z.string().trim().pipe(z.hostname()),
    }),
  )
  .max(MAX_WEB_SEARCH_AUTHORIZED_DOMAINS)

export const createAIAgentRequest = z.object({
  name: z.string().trim().min(1).max(255),
  prompt: z.string().trim().min(1).max(10_000),
  messages: z.array(
    z.object({
      role: aiMessageRoles,
      content: z.string().trim().min(1).max(255),
    }),
  ),
  models: z.array(
    z.discriminatedUnion("provider", [
      z.object({
        provider: z.literal(aiProviders.enum.gemini),
        model: geminiModels,
      }),
      z.object({
        provider: z.literal(aiProviders.enum.openai),
        model: openaiModels,
      }),
      z.object({
        provider: z.literal(aiProviders.enum.claude),
        model: claudeModels,
      }),
      z.object({
        provider: z.literal(aiProviders.enum.deepseek),
        model: deepseekModels,
      }),
      z.object({
        provider: z.literal(aiProviders.enum.openrouter),
        model: openrouterModels,
      }),
    ]),
  ),
  temperature: z.number().min(0).max(2),
  maxOutputTokens: z.number().min(1).max(32_768),
  tools: z.array(z.string()),
  webSearchAuthorizedDomains: webSearchAuthorizedDomainsSchema.default([]),
  isDefault: z.boolean(),
  isRichResponse: z.boolean().default(false),
})
export type CreateAIAgentRequest = z.infer<typeof createAIAgentRequest>

export const updateAIAgentRequest = createAIAgentRequest
  .extend({
    webSearchAuthorizedDomains: webSearchAuthorizedDomainsSchema,
    isRichResponse: z.boolean(),
  })
  .partial()
export type UpdateAIAgentRequest = z.infer<typeof updateAIAgentRequest>
