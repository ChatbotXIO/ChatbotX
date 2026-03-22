import { db, relationsFilterToSQL } from "@aha.chat/database/client"
import { contactModel } from "@aha.chat/database/schema"
import {
  getPaginationWithDefaults,
  parseOrderByAsObject,
} from "@aha.chat/database/utils"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListContactsRequest,
  ListContactsResponse,
} from "../schemas/query"

export async function listContacts(
  input: ListContactsRequest & { chatbotId: string },
): Promise<ListContactsResponse> {
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
  input: ListContactsRequest & { chatbotId: string },
): Promise<{ total: number }> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  if (!input.keyword) {
    return getTotalContactsFromStats(input.chatbotId)
  }

  const where = generateWhere(input)

  const total = await db.$count(
    contactModel,
    relationsFilterToSQL(contactModel, where),
  )
  return { total }
}

async function getTotalContactsFromStats(
  chatbotId: string,
): Promise<{ total: number }> {
  try {
    const inboxes = await db.query.inboxModel.findMany({
      where: { chatbotId },
      with: {
        contactStats: true,
      },
    })

    const total = inboxes.reduce(
      (sum, inbox) => sum + (inbox.contactStats?.totalContacts ?? 0),
      0,
    )

    return { total }
  } catch (error) {
    console.error("Error getting total contacts from stats:", error)
    return { total: 0 }
  }
}

const generateWhere = (input: ListContactsRequest & { chatbotId: string }) => {
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
