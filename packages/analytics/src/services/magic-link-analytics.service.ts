import { db } from "@chatbotx.io/database/client"
import {
  magicLinkContactStatModel,
  magicLinkStatModel,
} from "@chatbotx.io/database/schema"
import type {
  MagicLinkContactStatModel,
  MagicLinkStatModel,
} from "@chatbotx.io/database/types"
import {
  type ClickedPayload,
  clickTypeSchema,
  type FlowClickedPayload,
  type MessagePayload,
} from "@chatbotx.io/flow-config"
import { startOfSecond } from "date-fns"
import { magicLinkStatsRepository } from "../repositories/magic-link-stats.repository"
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

    const items: MagicLinkStatModel[] = clickedPayloads.map((p) => {
      return {
        workspaceId: p.context.workspaceId,
        linkId: p.action.magicLinkId ?? "",
        contactId: p.context.contactId,
        contactInboxId: p.context.contactInboxId ?? "",
        occurredAt: startOfSecond(new Date(p.occurredAt)),
        createdAt: new Date(),
      }
    })

    const contactItems: MagicLinkContactStatModel[] = clickedPayloads.map(
      (p) => {
        return {
          workspaceId: p.context.workspaceId,
          linkId: p.action.magicLinkId ?? "",
          contactId: p.context.contactId,
          contactInboxId: p.context.contactInboxId ?? "",
          occurredAt: p.occurredAt,
          createdAt: new Date(),
        }
      },
    )

    await Promise.all([
      db.insert(magicLinkStatModel).values(items).onConflictDoNothing(),
      db
        .insert(magicLinkContactStatModel)
        .values(contactItems)
        .onConflictDoNothing(),
    ])
  }

  async getMagicLinkStatsByDateRange(input: MagicLinkStatsInput) {
    const rows = await magicLinkStatsRepository.getMagicLinkStatsByDateRange({
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

    const { contactInboxIds, contactEventMap } =
      await magicLinkStatsRepository.getMagicLinkContactStats({
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

    const data: FlowNodeContactData[] = contactInboxes.map((ci) => {
      const eventData = contactEventMap.get(ci.id)
      return {
        contactId: ci.contact?.id ?? "",
        contactInboxId: ci.id,
        firstName: ci.contact?.firstName ?? null,
        lastName: ci.contact?.lastName ?? null,
        sourceId: ci.sourceId ?? null,
        avatar: ci.contact?.avatar ?? null,
        channel: ci.channel ?? null,
        conversationId: ci.conversation?.id ?? "",
        occurredAt: eventData?.occurredAt ?? new Date().toISOString(),
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
