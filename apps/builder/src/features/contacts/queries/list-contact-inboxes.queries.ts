import { db, relationsFilterToSQL } from "@chatbotx.io/database/client"
import { contactInboxModel } from "@chatbotx.io/database/schema"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListContactsRequest } from "../schemas/query"

export async function countContactInboxes(
  input: ListContactsRequest,
): Promise<{ total: number }> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const filters = await parseContactFilters(input)
  const where = generateWhere(filters)

  const total = await db.$count(
    contactInboxModel,
    relationsFilterToSQL(contactInboxModel, where),
  )

  return { total }
}

async function parseContactFilters(
  input: ListContactsRequest,
): Promise<ListContactsRequest> {
  if (!input.channels?.length) {
    throw new Error("Channels are required")
  }

  const isOmnichannel = input.channels.includes("omnichannel")

  const inboxes = await db.query.inboxModel.findMany({
    where: {
      workspaceId: input.workspaceId,
      ...(isOmnichannel ? {} : { channel: { in: input.channels } }),
    },
    columns: { id: true },
  })
  input.inboxIds = inboxes.length ? inboxes.map((inbox) => inbox.id) : ["0"]

  return input
}

const generateWhere = (input: ListContactsRequest) => {
  const where = {
    inboxId: { in: input.inboxIds },
  }

  return where
}
