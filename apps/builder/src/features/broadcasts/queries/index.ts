import { notFoundException } from "@chatbotx.io/business/errors"
import { broadcastRepository } from "@chatbotx.io/database/repositories"
import { getPaginationWithDefaults } from "@chatbotx.io/database/utils"
import type { PaginatedResponse } from "@/features/common/schema/pagination"
import type { GetBroadcastsSchema } from "../schema/query"
import type { BroadcastResourceWithRelations } from "../schema/resource"

export async function listBroadcasts(
  input: GetBroadcastsSchema,
): Promise<PaginatedResponse<BroadcastResourceWithRelations>> {
  const pagination = getPaginationWithDefaults(input)

  const [data, total] = await Promise.all([
    broadcastRepository.listWithRelations(input),
    broadcastRepository.count(input),
  ])

  const pageCount = Math.ceil(total / pagination.limit)

  return { data, pageCount }
}

export async function listBroadcastAudience(input: {
  broadcastId: string
  workspaceId: string
  page?: number | null
  perPage?: number | null
}) {
  const { limit, offset } = getPaginationWithDefaults(input)

  // Gate behind a non-deleted broadcast owned by this workspace — mirrors
  // findByIdForResponse/listExistingIds so a soft-deleted (or foreign)
  // broadcast never leaks its audience, even if a future caller skips the
  // publicGetBroadcast lookup the current API handler happens to run first.
  const broadcast = await broadcastRepository.findIdIfActive({
    id: input.broadcastId,
    workspaceId: input.workspaceId,
  })

  if (!broadcast) {
    throw notFoundException("Broadcast not found")
  }

  const [rows, total] = await Promise.all([
    broadcastRepository.listAudience({
      broadcastId: input.broadcastId,
      limit,
      offset,
    }),
    broadcastRepository.countAudience(input.broadcastId),
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
  const broadcast = await broadcastRepository.findByIdOrName({
    workspaceId,
    idOrName,
  })

  if (!broadcast) {
    throw notFoundException("Broadcast not found")
  }

  return broadcast
}
