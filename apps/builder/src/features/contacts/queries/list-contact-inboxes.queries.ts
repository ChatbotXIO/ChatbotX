import { broadcastService } from "@chatbotx.io/business"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListContactsRequest } from "../schemas/query"

export async function countContactInboxes(
  input: ListContactsRequest,
): Promise<{ total: number }> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const total = await broadcastService.countAudience({
    workspaceId: input.workspaceId,
    channels: input.channels,
    integrationWhatsappId: input.integrationWhatsappId,
    integrationMessengerId: input.integrationMessengerId,
    contactFilter: input.contactFilter,
    subaction: input.subaction,
  })

  return { total }
}
