import { db } from "@chatbotx.io/database/client"
import { toDate } from "../lib/date"
import type { LinkStatsRepository } from "../repositories/postgres/link-stats.repository"
import type {
  FlowNodeContactData,
  ListFlowNodeContactsResponse,
} from "../schemas/flow-stats"
import type { MagicLinkContactStatsInput } from "../schemas/magic-link"

/**
 * Shared paginated contact-list builder for link-stat tables.
 * `verifyLink` checks the link exists in its owning table (Reflink / MagicLink)
 * before any stat queries run.
 */
export async function listLinkContactStats(input: {
  params: MagicLinkContactStatsInput
  repository: LinkStatsRepository
  verifyLink: (params: {
    workspaceId: string
    linkId: string
  }) => Promise<boolean>
}): Promise<ListFlowNodeContactsResponse> {
  const { params, repository, verifyLink } = input
  const { workspaceId, linkId, page, perPage, startDate, endDate } = params

  if (!linkId) {
    return { data: [], total: 0, page: 1, pageCount: 0 }
  }

  const exists = await verifyLink({ workspaceId, linkId })
  if (!exists) {
    return { data: [], total: 0, page: 1, pageCount: 0 }
  }

  const [{ contactInboxIds, rows }, total] = await Promise.all([
    repository.getContactStats({
      workspaceId,
      linkId,
      page,
      perPage,
      startDate,
      endDate,
    }),
    repository.getContactCount({ workspaceId, linkId, startDate, endDate }),
  ])

  if (contactInboxIds.length === 0) {
    return { data: [], total, page, pageCount: Math.ceil(total / perPage) }
  }

  const contactInboxes = await db.query.contactInboxModel.findMany({
    where: { id: { in: contactInboxIds } },
    with: {
      contact: {
        columns: { id: true, firstName: true, lastName: true, avatar: true },
      },
      conversation: { columns: { id: true } },
    },
    columns: { id: true, sourceId: true, channel: true },
  })

  const contactInboxesMap = new Map<string, (typeof contactInboxes)[0]>()
  for (const ci of contactInboxes) {
    contactInboxesMap.set(ci.id, ci)
  }

  const data: FlowNodeContactData[] = rows.map((row) => {
    const ci = contactInboxesMap.get(row.contactInboxId)
    return {
      contactId: ci?.contact?.id ?? "",
      contactInboxId: ci?.id ?? "",
      firstName: ci?.contact?.firstName ?? null,
      lastName: ci?.contact?.lastName ?? null,
      sourceId: ci?.sourceId ?? null,
      avatar: ci?.contact?.avatar ?? null,
      channel: ci?.channel ?? null,
      conversationId: ci?.conversation?.id ?? "",
      occurredAt: toDate(row.occurredAt).toISOString(),
    }
  })

  return {
    data,
    total,
    page,
    pageCount: Math.ceil(total / perPage),
  }
}
