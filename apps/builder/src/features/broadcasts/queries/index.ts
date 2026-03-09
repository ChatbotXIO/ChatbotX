import { db, eq, relationsFilterToSQL } from "@aha.chat/database/client"
import {
  broadcastModel,
  contactsOnBroadcastsModel,
} from "@aha.chat/database/schema"
import {
  getPaginationWithDefaults,
  parseOrderByAsObject,
} from "@aha.chat/database/utils"
import type { PaginatedResponse } from "@/features/common/schemas/pagination"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { GetBroadcastsSchema } from "../schemas/query"
import type { BroadcastResource } from "../schemas/resource"

export async function listBroadcasts(
  input: GetBroadcastsSchema,
): Promise<PaginatedResponse<BroadcastResource>> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const where = {
    chatbotId: input.chatbotId,
    name: input.name ? { ilike: `%${input.name.toLowerCase()}%` } : undefined,
  }

  const pagination = getPaginationWithDefaults(input)
  const orderBy = parseOrderByAsObject(broadcastModel, input)

  // Support filter by contacts count
  // const contactsCountSort = input.sort?.find(
  //   (sort) => sort.id === "contactsCount",
  // )
  // if (contactsCountSort) {
  //   orderBy.contactsCount = contactsCountSort.desc ? "desc" : "asc"
  // }

  const [data, total] = await Promise.all([
    db.query.broadcastModel.findMany({
      where,
      ...pagination,
      orderBy,
      extras: {
        contactsCount: (table) =>
          db.$count(
            contactsOnBroadcastsModel,
            eq(contactsOnBroadcastsModel.broadcastId, table.id),
          ),
      },
    }),
    db.$count(broadcastModel, relationsFilterToSQL(broadcastModel, where)),
  ])

  const pageCount = Math.ceil(total / pagination.limit)

  return { data, pageCount }
}
