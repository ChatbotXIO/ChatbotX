import { db, relationsFilterToSQL } from "@aha.chat/database/client"
import { contactModel } from "@aha.chat/database/schema"
import type { PaginatedResponse } from "@/features/common/schemas/pagination"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import {
  getPaginationWithDefaults,
  parseOrderByAsObject,
} from "@/lib/pagination"
import type { ListContactsRequest } from "../schemas/query"
import type { ContactResource } from "../schemas/resource"

export async function listContacts(
  input: ListContactsRequest,
): Promise<PaginatedResponse<ContactResource>> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const where = generateWhere(input)

  const pagination = getPaginationWithDefaults(input)
  const orderBy = parseOrderByAsObject(contactModel, input)

  const [data, totalRows] = await Promise.all([
    db.query.contactModel.findMany({
      where,
      ...pagination,
      orderBy,
      with: {
        conversation: {
          with: {
            assignedUser: true,
            assignedInboxTeam: true,
            inbox: true,
          },
        },
      },
    }),
    db.$count(contactModel, relationsFilterToSQL(contactModel, where)),
  ])

  const pageCount = Math.ceil(totalRows / pagination.limit)

  return { data, pageCount }
}

export async function countContacts(
  input: ListContactsRequest,
): Promise<{ total: number }> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const where = generateWhere(input)

  const total = await db.$count(
    contactModel,
    relationsFilterToSQL(contactModel, where),
  )
  return { total }
}

const generateWhere = (input: ListContactsRequest) => {
  const where = {
    chatbotId: input.chatbotId,
    ...(input.keyword
      ? {
          OR: [
            {
              firstName: { ilike: `%${input.keyword.toLowerCase()}%` },
            },
            {
              lastName: { ilike: `%${input.keyword.toLowerCase()}%` },
            },
            {
              email: { ilike: `%${input.keyword.toLowerCase()}%` },
            },
            {
              phoneNumber: { ilike: `%${input.keyword.toLowerCase()}%` },
            },
          ],
        }
      : {}),
  }

  return where
}
