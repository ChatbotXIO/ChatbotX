import { db } from "@chatbotx.io/database/client"
import { refLinkStatModel } from "@chatbotx.io/database/schema"
import type { RefLinkStatModel } from "@chatbotx.io/database/types"
import type { RefLinkPayload } from "@chatbotx.io/flow-config"
import { startOfSecond } from "date-fns"
import { refLinkStatsRepository } from "../repositories/postgres/ref-link-stats.repository"
import type {
  FlowNodeContactData,
  ListFlowNodeContactsResponse,
} from "../schemas/flow-stats"
import type {
  MagicLinkContactStatsInput,
  MagicLinkStatsInput,
} from "../schemas/magic-link"

type ExtractedPayload<T extends RefLinkPayload> = {
  refLinkPayloads: T[]
}

export class RefLinkAnalyticsService {
  private extractPayload<T extends RefLinkPayload>(
    payloads: T[],
  ): ExtractedPayload<T> {
    const refLinkPayloads: T[] = []

    for (const payload of payloads) {
      if (!payload.action.refId) {
        continue
      }

      refLinkPayloads.push(payload)
    }

    return { refLinkPayloads }
  }

  async handler(payloads: RefLinkPayload[]) {
    const { refLinkPayloads } = this.extractPayload(payloads)

    if (refLinkPayloads.length === 0) {
      return
    }

    const items: RefLinkStatModel[] = refLinkPayloads.map((p) => ({
      workspaceId: p.context.workspaceId,
      linkId: p.action.refId,
      contactId: p.context.contactId,
      contactInboxId: p.context.contactInboxId ?? "",
      occurredAt: startOfSecond(new Date(p.occurredAt)),
      createdAt: new Date(),
    }))

    await Promise.all([
      db.insert(refLinkStatModel).values(items).onConflictDoNothing(),
    ])
  }

  async getRefLinkStatsByDateRange(input: MagicLinkStatsInput) {
    const rows = await refLinkStatsRepository.getStatsByDateRange({
      workspaceId: input.workspaceId,
      startDate: input.startDate,
      endDate: input.endDate,
      linkId: input.linkId,
      timezone: input.timezone,
    })

    return rows.sort((a, b) => a.dateReport.localeCompare(b.dateReport))
  }

  async getRefLinkContactStats(
    input: MagicLinkContactStatsInput,
  ): Promise<ListFlowNodeContactsResponse> {
    const { workspaceId, linkId, page, perPage } = input

    if (!linkId) {
      return { data: [], total: 0, page: 1, pageCount: 0 }
    }

    const row = await db.query.reflinkModel.findFirst({
      where: {
        workspaceId,
        id: linkId,
      },
    })

    if (!row) {
      return { data: [], total: 0, page: 1, pageCount: 0 }
    }

    const { contactInboxIds, rows } =
      await refLinkStatsRepository.getContactStats({
        workspaceId,
        linkId,
        page,
        perPage,
      })

    if (contactInboxIds.length === 0) {
      return { data: [], total: 0, page, pageCount: 0 }
    }

    // Fetch contact details
    const contactInboxes = await db.query.contactInboxModel.findMany({
      where: { id: { in: contactInboxIds } },
      with: {
        contact: {
          columns: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        conversation: {
          columns: { id: true },
        },
      },
      columns: {
        id: true,
        sourceId: true,
        channel: true,
      },
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
        occurredAt: row.occurredAt.toISOString(),
      }
    })

    return {
      data,
      total: data.length,
      page,
      pageCount: data.length === 0 ? 0 : 1,
    }
  }
}

export const refLinkAnalyticsService = new RefLinkAnalyticsService()
