import { db, relationsFilterToSQL } from "@chatbotx.io/database/client"
import type { ChannelType } from "@chatbotx.io/database/partials"
import { contactModel } from "@chatbotx.io/database/schema"
import {
  getPaginationWithDefaults,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ContactFilters,
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
        contactInboxes: true,
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

  const filters = await parseContactFilters(
    input.workspaceId,
    input.contactFilter,
  )

  if (!input.keyword) {
    return getTotalContactsFromStats(input.workspaceId, filters)
  }

  const where = generateWhere(input, filters)

  const total = await db.$count(
    contactModel,
    relationsFilterToSQL(contactModel, where),
  )
  return { total }
}

async function getTotalContactsFromStats(
  workspaceId: string,
  filters: ContactFilters,
): Promise<{ total: number }> {
  try {
    const inboxes = await db.query.inboxModel.findMany({
      where: {
        workspaceId,
        ...(filters.inboxIds ? { id: { in: filters.inboxIds } } : {}),
      },
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

async function parseContactFilters(
  workspaceId: string,
  contactFilter?: ListContactsRequest["contactFilter"],
): Promise<ContactFilters> {
  const filters: ContactFilters = {}

  if (!contactFilter?.length) {
    return filters
  }

  const channelConditions = contactFilter
    .flatMap((filter) => filter.conditions)
    .filter((condition) => condition.field === "channel")

  if (channelConditions.length > 0) {
    const channels = channelConditions.flatMap((c) =>
      Array.isArray(c.value) ? c.value : [c.value],
    ) as ChannelType[]

    const inboxes = await db.query.inboxModel.findMany({
      where: {
        workspaceId,
        channel: { in: channels },
      },
      columns: { id: true },
    })

    filters.inboxIds = inboxes.map((inbox) => inbox.id)
  }

  return filters
}

const generateWhere = (
  input: ListContactsRequest,
  filters?: ContactFilters,
) => {
  const where = {
    workspaceId: input.workspaceId,
    ...(filters?.inboxIds?.length
      ? {
          contactInboxes: {
            inboxId: { in: filters.inboxIds },
          },
        }
      : {}),
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
