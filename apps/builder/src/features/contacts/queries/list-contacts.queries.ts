import { db, relationsFilterToSQL } from "@chatbotx.io/database/client"
import { contactModel } from "@chatbotx.io/database/schema"
import {
  getPaginationWithDefaults,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { logger } from "@/lib/log"
import { applyContactFilter } from "../apply-contact-filter"
import type {
  ListContactsRequest,
  ListContactsResponse,
} from "../schemas/query"

export async function listContacts(
  input: ListContactsRequest,
): Promise<ListContactsResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)
  return queryContacts(input)
}

export function listContactsForAPI(
  input: ListContactsRequest,
): Promise<ListContactsResponse> {
  return queryContacts(input)
}

async function queryContacts(
  input: ListContactsRequest,
): Promise<ListContactsResponse> {
  const where = generateWhere(input)

  const pagination = getPaginationWithDefaults(input)
  const orderBy = parseOrderByAsObject(contactModel, input)

  const [data, totalRows] = await Promise.all([
    db.query.contactModel.findMany({
      where,
      ...pagination,
      orderBy,
      with: {
        tags: true,
        contactCustomFields: true,
        contactInboxes: {
          with: {
            inbox: true,
          },
        },
        conversation: {
          with: {
            assignedUser: true,
            assignedInboxTeam: true,
          },
        },
      },
    }),
    // biome-ignore lint/suspicious/noExplicitAny: relationsFilterToSQL requires typed Drizzle filter
    db.$count(contactModel, relationsFilterToSQL(contactModel, where as any)),
  ])

  const pageCount = Math.ceil(totalRows / pagination.limit)

  return { data, pageCount }
}

export async function listContactsRSC(
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
        contactInboxes: {
          with: {
            inbox: true,
          },
        },
        conversation: {
          with: {
            assignedUser: true,
            assignedInboxTeam: true,
            // inbox: true,
          },
        },
      },
    }),
    // biome-ignore lint/suspicious/noExplicitAny: relationsFilterToSQL requires typed Drizzle filter
    db.$count(contactModel, relationsFilterToSQL(contactModel, where as any)),
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
    // biome-ignore lint/suspicious/noExplicitAny: relationsFilterToSQL requires typed Drizzle filter
    relationsFilterToSQL(contactModel, where as any),
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
    logger.error({ err: error }, "Error getting total contacts from stats")
    return { total: 0 }
  }
}

const generateWhere = (input: ListContactsRequest) => {
  const keyword = input.keyword?.toLowerCase()
  const where: Record<string, unknown> = {
    workspaceId: input.workspaceId,
    ...(keyword
      ? {
          OR: [
            { firstName: { ilike: `%${keyword}%` } },
            { lastName: { ilike: `%${keyword}%` } },
            { email: { ilike: `%${keyword}%` } },
            { phoneNumber: { ilike: `%${keyword}%` } },
          ],
        }
      : {}),
  }

  if (input.contactFilter) {
    Object.assign(where, applyContactFilter(input.contactFilter))
  }

  return where
}
