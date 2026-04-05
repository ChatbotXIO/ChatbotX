import { db, relationsFilterToSQL } from "@chatbotx.io/database/client"
import { inboxStatuses } from "@chatbotx.io/database/partials"
import { inboxModel } from "@chatbotx.io/database/schema"
import { getPaginationWithDefaults } from "@chatbotx.io/database/utils"
import type { PaginatedResponse } from "@/features/common/schemas/pagination"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListInboxesRequest } from "../schema/action"
import type { InboxResource } from "../schema/resource"

export async function listInboxes(
  input: ListInboxesRequest,
): Promise<PaginatedResponse<InboxResource>> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const where = {
    workspaceId: input.workspaceId,
    status: inboxStatuses.enum.connected,
  }

  const pagination = getPaginationWithDefaults(input)
  const [data, totalRows] = await Promise.all([
    db.query.inboxModel.findMany({
      ...pagination,
      where,
      with: input.includes?.includes("integration")
        ? {
            integrationWhatsapp: true,
            integrationWebchat: true,
            integrationMessenger: true,
            integrationZalo: true,
          }
        : undefined,
    }),
    db.$count(inboxModel, relationsFilterToSQL(inboxModel, where)),
  ])

  const pageCount = Math.ceil(totalRows / pagination.limit)

  return { data, pageCount }
}
