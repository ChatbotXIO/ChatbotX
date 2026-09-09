import type { MagicLinkStatModel } from "@chatbotx.io/database/types"
import {
  type ClickedPayload,
  clickTypeSchema,
  type FlowClickedPayload,
  type MessagePayload,
} from "@chatbotx.io/flow-config"
import { startOfSecond } from "date-fns"
import { toDate } from "../lib/date"
import {
  magicLinkStatsRepository,
  verifyMagicLinkExists,
} from "../repositories/postgres/magic-link-stats.repository"
import type { ListFlowNodeContactsResponse } from "../schemas/flow-stats"
import type {
  MagicLinkContactStatsInput,
  MagicLinkStatsInput,
} from "../schemas/magic-link"
import { listLinkContactStats } from "./link-contact-stats"

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
      occurredAt: startOfSecond(toDate(p.occurredAt)),
      createdAt: new Date(),
    }))

    await magicLinkStatsRepository.insertStats(items)
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

  getMagicLinkContactStats(
    input: MagicLinkContactStatsInput,
  ): Promise<ListFlowNodeContactsResponse> {
    return listLinkContactStats({
      params: input,
      repository: magicLinkStatsRepository,
      verifyLink: verifyMagicLinkExists,
    })
  }
}

export const magicLinkAnalyticsService = new MagicLinkAnalyticsService()
