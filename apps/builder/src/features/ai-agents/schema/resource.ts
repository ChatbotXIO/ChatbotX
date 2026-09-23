import { aiAgentModel, createSelectSchema } from "@chatbotx.io/database/schema"
import { z } from "zod"

export const aiAgentResourceSchema = createSelectSchema(aiAgentModel, {
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const publicAIAgentResourceSchema = aiAgentResourceSchema.omit({
  actionPrompt: true,
  actionRules: true,
})

export function toPublicAIAgentResource<T extends Record<string, unknown>>(
  agent: T,
): Omit<T, "actionPrompt" | "actionRules"> {
  const {
    actionPrompt: _actionPrompt,
    actionRules: _actionRules,
    ...publicAgent
  } = agent
  return publicAgent
}
