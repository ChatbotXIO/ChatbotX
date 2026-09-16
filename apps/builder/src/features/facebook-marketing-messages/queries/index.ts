import "server-only"

import { facebookMarketingMessagesService } from "@chatbotx.io/business"
import type { FacebookMarketingMessageModel } from "@chatbotx.io/database/types"

export function listMarketingMessages(
  workspaceId: string,
): Promise<FacebookMarketingMessageModel[]> {
  return facebookMarketingMessagesService.list(workspaceId)
}
