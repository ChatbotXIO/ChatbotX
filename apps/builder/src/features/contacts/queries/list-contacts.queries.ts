import { db, relationsFilterToSQL } from "@chatbotx.io/database/client"
import { contactModel } from "@chatbotx.io/database/schema"
import {
  getPaginationWithDefaults,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListContactsRequest,
  ListContactsResponse,
} from "../schemas/query"

export async function listContacts(
  input: ListContactsRequest & { workspaceId: string },
): Promise<ListContactsResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

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
            // inbox: true,
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
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  if (!input.keyword) {
    return getTotalContactsFromStats(input.workspaceId)
  }

  const where = generateWhere(input)

  const total = await db.$count(
    contactModel,
    relationsFilterToSQL(contactModel, where),
  )
  return { total }
}

async function getTotalContactsFromStats(
  workspaceId: string,
): Promise<{ total: number }> {
  try {
    const inboxes = await db.query.inboxModel.findMany({
      where: { workspaceId },
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

const generateWhere = (input: ListContactsRequest) => {
  const where = {
    workspaceId: input.workspaceId,
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
