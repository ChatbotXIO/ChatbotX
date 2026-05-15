import { db } from "@chatbotx.io/database/client"
import { magicLinkStatModel } from "@chatbotx.io/database/schema"
import type { MagicLinkStatModel } from "@chatbotx.io/database/types"
import {
  type ClickedPayload,
  clickTypeSchema,
  type FlowClickedPayload,
  type MessagePayload,
} from "@chatbotx.io/flow-config"
import { startOfSecond } from "date-fns"
import { magicLinkStatsRepository } from "../repositories/postgres/magic-link-stats.repository"
import type {
  FlowNodeContactData,
  ListFlowNodeContactsResponse,
} from "../schemas/flow-stats"
import type {
  MagicLinkContactStatsInput,
  MagicLinkStatsInput,
} from "../schemas/magic-link"

type ExtractedPayload<T extends MessagePayload> = {
  clickedPayloads: T[]
}

export class MagicLinkAnalyticsService {
  private extractPayload<T extends ClickedPayload>(
    payloads: T[],
  ): ExtractedPayload<T> {
    const clickedPayloads: T[] = []

    for (const payload of payloads) {
      if (
        !(
          payload.action.magicLinkId &&
          payload.action?.clickType === clickTypeSchema.enum.magic_link
        )
      ) {
        continue
      }

      clickedPayloads.push(payload)
    }

    return { clickedPayloads }
  }

  async onClicked(payloads: FlowClickedPayload[]) {
    const { clickedPayloads } = this.extractPayload(payloads)

    if (clickedPayloads.length === 0) {
      return
    }

    const items: MagicLinkStatModel[] = clickedPayloads.map((p) => ({
      workspaceId: p.context.workspaceId,
      linkId: p.action.magicLinkId ?? "",
      contactId: p.context.contactId,
      contactInboxId: p.context.contactInboxId ?? "",
      occurredAt: startOfSecond(new Date(p.occurredAt)),
      createdAt: new Date(),
    }))

    await Promise.all([
      db.insert(magicLinkStatModel).values(items).onConflictDoNothing(),
    ])
  }

  async getMagicLinkStatsByDateRange(input: MagicLinkStatsInput) {
    const rows = await magicLinkStatsRepository.getStatsByDateRange({
      workspaceId: input.workspaceId,
      startDate: input.startDate,
      endDate: input.endDate,
      linkId: input.linkId,
      timezone: input.timezone,
    })

    return rows.sort((a, b) => a.dateReport.localeCompare(b.dateReport))
  }

  async getMagicLinkContactStats(
    input: MagicLinkContactStatsInput,
  ): Promise<ListFlowNodeContactsResponse> {
    const { workspaceId, linkId, page, perPage } = input

    if (!linkId) {
      return { data: [], total: 0, page: 1, pageCount: 0 }
    }

    const row = await db.query.magicLinkModel.findFirst({
      where: {
        workspaceId,
        id: linkId,
      },
    })

    if (!row) {
      return { data: [], total: 0, page: 1, pageCount: 0 }
    }

    const { contactInboxIds, rows } =
      await magicLinkStatsRepository.getContactStats({
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

export const magicLinkAnalyticsService = new MagicLinkAnalyticsService()
