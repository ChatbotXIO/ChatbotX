import { broadcastService } from "@chatbotx.io/business"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ContactPermissionScope } from "../permissions"
import type {
  ListContactInboxesAudiencePreviewRequest,
  ListContactsRequest,
} from "../schemas/query"

export async function countContactInboxes(
  input: ListContactsRequest,
  accessScope?: ContactPermissionScope,
): Promise<{ total: number }> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const total = await broadcastService.countAudience({
    workspaceId: input.workspaceId,
    channels: input.channels,
    integrationWhatsappId: input.integrationWhatsappId,
    integrationMessengerId: input.integrationMessengerId,
    contactFilter: input.contactFilter,
    canViewEmailAndPhone: accessScope?.canViewEmailAndPhone,
    subaction: input.subaction,
    restrictToAssignedUserId: accessScope?.restrictToAssignedUserId,
  })

  return { total }
}

export async function listAudienceInboxesPreview(
  input: ListContactInboxesAudiencePreviewRequest,
  accessScope?: ContactPermissionScope,
) {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const data = await broadcastService.listAudiencePreview({
    workspaceId: input.workspaceId,
    channels: input.channels,
    integrationWhatsappId: input.integrationWhatsappId,
    integrationMessengerId: input.integrationMessengerId,
    contactFilter: input.contactFilter,
    canViewEmailAndPhone: accessScope?.canViewEmailAndPhone,
    subaction: input.subaction,
    page: input.page ?? 1,
    perPage: input.perPage ?? 20,
    restrictToAssignedUserId: accessScope?.restrictToAssignedUserId,
  })

  return {
    data: data.map(({ createdAt, ...row }) => ({
      ...row,
      occurredAt: createdAt.toISOString(),
    })),
  }
}
