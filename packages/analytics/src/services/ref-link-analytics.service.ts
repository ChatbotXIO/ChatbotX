import type { RefLinkStatModel } from "@chatbotx.io/database/types"
import type { RefLinkPayload } from "@chatbotx.io/flow-config"
import { startOfSecond } from "date-fns"
import { toDate } from "../lib/date"
import {
  refLinkStatsRepository,
  verifyRefLinkExists,
} from "../repositories/postgres/ref-link-stats.repository"
import type { ListFlowNodeContactsResponse } from "../schemas/flow-stats"
import type {
  MagicLinkContactStatsInput,
  MagicLinkStatsInput,
} from "../schemas/magic-link"
import { listLinkContactStats } from "./link-contact-stats"

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
      occurredAt: startOfSecond(toDate(p.occurredAt)),
      createdAt: new Date(),
    }))

    await refLinkStatsRepository.insertStats(items)
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

  getRefLinkContactStats(
    input: MagicLinkContactStatsInput,
  ): Promise<ListFlowNodeContactsResponse> {
    return listLinkContactStats({
      params: input,
      repository: refLinkStatsRepository,
      verifyLink: verifyRefLinkExists,
    })
  }
}

export const refLinkAnalyticsService = new RefLinkAnalyticsService()
