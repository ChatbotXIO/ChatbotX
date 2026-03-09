import { db, relationsFilterToSQL } from "@aha.chat/database/client"
import { InboxStatus } from "@aha.chat/database/enums"
import { inboxModel } from "@aha.chat/database/schema"
import { getPaginationWithDefaults } from "@aha.chat/database/utils"
import type { PaginatedResponse } from "@/features/common/schemas/pagination"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListInboxesRequest } from "../schemas/query"
import type { InboxResource } from "../schemas/resource"

export async function listInboxes(
  input: ListInboxesRequest,
): Promise<PaginatedResponse<InboxResource>> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const where = {
    chatbotId: input.chatbotId,
    status: InboxStatus.connected,
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
