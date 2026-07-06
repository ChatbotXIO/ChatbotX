import { inboxService } from "@chatbotx.io/business"
import { db, relationsFilterToSQL } from "@chatbotx.io/database/client"
import { buildContactInboxContactFilterSQL } from "@chatbotx.io/database/queries"
import { contactInboxModel } from "@chatbotx.io/database/schema"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListContactsRequest } from "../schemas/query"

export async function countContactInboxes(
  input: ListContactsRequest,
): Promise<{ total: number }> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const inboxIds = await inboxService.resolveBroadcastInboxIds({
    workspaceId: input.workspaceId,
    channels: input.channels,
    integrationWhatsappId: input.integrationWhatsappId,
  })
  const where = generateWhere({
    ...input,
    inboxIds: inboxIds.length ? inboxIds : ["0"],
  })

  const total = await db.$count(
    contactInboxModel,
    relationsFilterToSQL(contactInboxModel, where),
  )

  return { total }
}

const generateWhere = (input: ListContactsRequest) => {
  const { contactFilter } = input

  const where = {
    inboxId: { in: input.inboxIds },
    ...(contactFilter && {
      RAW: () =>
        buildContactInboxContactFilterSQL({
          contactIdColumn: contactInboxModel.contactId,
          workspaceId: input.workspaceId,
          contactFilter,
        }),
    }),
  }

  return where
}
