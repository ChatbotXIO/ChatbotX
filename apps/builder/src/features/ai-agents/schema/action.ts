import {
  aiProviders,
  claudeModels,
  deepseekModels,
  geminiModels,
  openaiModels,
  openrouterModels,
} from "@chatbotx.io/ai"
import {
  aiAgentActionRulesSchema,
  aiMessageRoles,
} from "@chatbotx.io/database/partials"
import { z } from "zod"
import { MAX_WEB_SEARCH_AUTHORIZED_DOMAINS } from "../lib/web-search-tool"

const webSearchAuthorizedDomainsSchema = z
  .array(
    z.object({
      value: z.string().trim().pipe(z.hostname()),
    }),
  )
  .max(MAX_WEB_SEARCH_AUTHORIZED_DOMAINS)

const actionPromptSchema = z
  .string()
  .trim()
  .max(10_000)
  .transform((value) => value || null)
  .nullable()

export const createAIAgentRequest = z.object({
  name: z.string().trim().min(1).max(255).describe("AI agent name."),
  prompt: z
    .string()
    .trim()
    .min(1)
    .max(10_000)
    .describe("System prompt that defines the agent's behavior."),
  messages: z
    .array(
      z.object({
        role: aiMessageRoles,
        content: z.string().trim().min(1).max(255),
      }),
    )
    .describe(
      "Seed conversation history (role/content pairs) shown to the model before user input.",
    ),
  models: z
    .array(
      z.union([
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
        z.object({
          kind: z.literal("openaiCompatible"),
          integrationId: z.string().trim().min(1),
          model: z.string().trim().min(1),
        }),
      ]),
    )
    .describe(
      "Ordered fallback list of provider/model pairs to try. The first entry is preferred; later ones are used if it fails.",
    ),
  temperature: z.number().min(0).max(2).describe("Sampling temperature, 0-2."),
  maxOutputTokens: z
    .number()
    .min(1)
    .max(32_768)
    .describe("Maximum tokens the model may generate in one reply."),
  tools: z
    .array(z.string())
    .describe("Tool names this agent is allowed to call."),
  webSearchAuthorizedDomains: webSearchAuthorizedDomainsSchema
    .default([])
    .describe(
      `Domains the agent's web-search tool is restricted to, up to ${MAX_WEB_SEARCH_AUTHORIZED_DOMAINS}. Empty means unrestricted.`,
    ),
  isDefault: z
    .boolean()
    .describe("Whether this is the workspace's default AI agent."),
  isRichResponse: z
    .boolean()
    .default(false)
    .describe(
      "Whether the agent may return rich (card/button) responses instead of plain text.",
    ),
  actionPrompt: actionPromptSchema
    .default(null)
    .describe("Optional private instructions used while matching AI actions."),
  actionRules: aiAgentActionRulesSchema
    .default([])
    .describe("Private AI action rules for inbound direct messages."),
})
export type CreateAIAgentRequest = z.infer<typeof createAIAgentRequest>

export const updateAIAgentRequest = createAIAgentRequest
  .extend({
    webSearchAuthorizedDomains: webSearchAuthorizedDomainsSchema.describe(
      `Domains the agent's web-search tool is restricted to, up to ${MAX_WEB_SEARCH_AUTHORIZED_DOMAINS}. Empty means unrestricted.`,
    ),
    isRichResponse: z
      .boolean()
      .describe(
        "Whether the agent may return rich (card/button) responses instead of plain text.",
      ),
  })
  .partial()
  // Defaults are appropriate for a create, but must not silently erase a
  // configured action prompt or rule list during a partial update.
  .extend({
    actionPrompt: actionPromptSchema.optional(),
    actionRules: aiAgentActionRulesSchema.optional(),
  })
export type UpdateAIAgentRequest = z.infer<typeof updateAIAgentRequest>
