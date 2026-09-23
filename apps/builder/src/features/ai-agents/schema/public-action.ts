import { createAIAgentRequest, updateAIAgentRequest } from "./action"

/** Public API deliberately cannot configure or inspect private AI actions. */
export const createPublicAIAgentRequest = createAIAgentRequest
  .omit({ actionPrompt: true, actionRules: true })
  .strict()

export const updatePublicAIAgentRequest = updateAIAgentRequest
  .omit({ actionPrompt: true, actionRules: true })
  .strict()
