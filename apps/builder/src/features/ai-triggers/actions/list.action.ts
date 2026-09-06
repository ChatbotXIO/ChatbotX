import { aiTriggerService } from "@chatbotx.io/business"
import type {
  AITriggerCollection,
  ListAITriggersRequest,
} from "@/features/ai-triggers/schema/query"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"

export const listAITriggers = async (
  input: ListAITriggersRequest,
): Promise<AITriggerCollection> => {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  return await aiTriggerService.list(input)
}
