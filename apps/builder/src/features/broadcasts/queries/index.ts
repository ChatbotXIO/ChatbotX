import { notFoundException } from "@chatbotx.io/business/errors"
import { db, eq, relationsFilterToSQL } from "@chatbotx.io/database/client"
import {
  broadcastModel,
  contactsOnBroadcastsModel,
} from "@chatbotx.io/database/schema"
import {
  getPaginationWithDefaults,
  likeContains,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import type { PaginatedResponse } from "@/features/common/schemas/pagination"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { GetBroadcastsSchema } from "../schemas/query"
import type { BroadcastResourceWithRelations } from "../schemas/resource"

export async function listBroadcasts(
  input: GetBroadcastsSchema,
): Promise<PaginatedResponse<BroadcastResourceWithRelations>> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const where = {
    workspaceId: input.workspaceId,
    name: input.name ? { ilike: likeContains(input.name) } : undefined,
  }

  const pagination = getPaginationWithDefaults(input)
  const orderBy = parseOrderByAsObject(broadcastModel, input)

  const [data, total] = await Promise.all([
    db.query.broadcastModel.findMany({
      where,
      with: {
        flow: {
          columns: {
            id: true,
            name: true,
          },
        },
        integrationWhatsapp: {
          columns: {
            id: true,
            name: true,
          },
        },
        integrationMessenger: {
          columns: {
            id: true,
            name: true,
          },
        },
      },
      ...pagination,
      orderBy,
    }),
    db.$count(broadcastModel, relationsFilterToSQL(broadcastModel, where)),
  ])

  const pageCount = Math.ceil(total / pagination.limit)

  return { data, pageCount }
}

const NUMERIC_RE = /^\d+$/

export async function listBroadcastAudience(input: {
  broadcastId: string
  workspaceId: string
  page?: number | null
  perPage?: number | null
}) {
  const { limit, offset } = getPaginationWithDefaults(input)

  const [rows, total] = await Promise.all([
    db.query.contactsOnBroadcastsModel.findMany({
      where: { broadcastId: input.broadcastId },
      with: { contact: true },
      limit,
      offset,
    }),
    db.$count(
      contactsOnBroadcastsModel,
      eq(contactsOnBroadcastsModel.broadcastId, input.broadcastId),
    ),
  ])

  return {
    data: rows.map((row) => ({
      contactId: row.contactId,
      contact: {
        id: row.contact.id,
        firstName: row.contact.firstName,
        lastName: row.contact.lastName,
        fullName: row.contact.fullName,
        email: row.contact.email,
        phoneNumber: row.contact.phoneNumber,
        avatar: row.contact.avatar,
        gender: row.contact.gender,
      },
      sent: row.sent,
    })),
    pageCount: Math.ceil(total / limit),
  }
}

export async function publicGetBroadcast(
  workspaceId: string,
  idOrName: string,
) {
  const where = NUMERIC_RE.test(idOrName)
    ? { id: idOrName, workspaceId }
    : { name: idOrName, workspaceId }

  const broadcast = await db.query.broadcastModel.findFirst({ where })

  if (!broadcast) {
    throw notFoundException("Broadcast not found")
  }

  return broadcast
}
