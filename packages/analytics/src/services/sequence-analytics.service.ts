import { db, sql } from "@chatbotx.io/database/client"
import { channelTypes } from "@chatbotx.io/database/partials"
import {
  type MessageDeliveredPayload,
  type MessageFailedPayload,
  type MessageSeenPayload,
  type MessageSentPayload,
  SEQUENCE_SCHEDULE_PAYLOAD_TYPE,
} from "@chatbotx.io/flow-config"
import { logger } from "../lib/logger"
import { sequenceStatsRepository } from "../repositories/postgres"
import type { ContactEventData } from "../schemas/common"
import type {
  SequenceSchemaPayload,
  SequenceStepEventType,
  SequenceStepStats,
} from "../schemas/sequence-stats"

type SequenceUpdateItem = {
  workspaceId: string
  sequenceId: string
  stepId: string
  contactInboxId: string
  occurredAt: Date
}

async function processSequenceEvents(
  items: SequenceUpdateItem[],
  updateField: "deliveredAt" | "seenAt" | "clickedAt",
): Promise<void> {
  if (items.length === 0) {
    return
  }

  const sequenceIds = [...new Set(items.map((i) => i.sequenceId))]
  const stepIds = [...new Set(items.map((i) => i.stepId))]
  const contactInboxIds = [...new Set(items.map((i) => i.contactInboxId))]

  const dispatches = await db.query.sequenceDispatchModel.findMany({
    where: {
      sequenceId: { in: sequenceIds },
      stepId: { in: stepIds },
      contactInboxId: { in: contactInboxIds },
    },
    columns: { id: true, sequenceId: true, stepId: true, contactInboxId: true },
  })

  if (dispatches.length === 0) {
    return
  }

  const updateItems = dispatches
    .map((d) => {
      const item = items.find(
        (i) =>
          i.sequenceId === d.sequenceId &&
          i.stepId === d.stepId &&
          i.contactInboxId === d.contactInboxId,
      )
      if (!item) {
        return null
      }
      return { id: d.id, timestamp: item.occurredAt }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)

  if (updateItems.length === 0) {
    return
  }

  const cases = updateItems
    .map(
      (item) =>
        `WHEN "id" = '${item.id}' THEN '${item.timestamp.toISOString()}'`,
    )
    .join(" ")

  const ids = updateItems.map((i) => sql`${i.id}`)

  await db.execute(sql`
    UPDATE "SequenceDispatch"
    SET "${sql.raw(updateField)}" = CASE ${sql.raw(cases)} ELSE "${sql.raw(updateField)}" END
    WHERE "id" IN (${sql.join(ids, sql`, `)})
  `)
}

export class SequenceAnalyticsService {
  getStepStats(input: {
    workspaceId: string
    sequenceId: string
    stepId: string
  }): Promise<SequenceStepStats> {
    return sequenceStatsRepository.getStepStats(input)
  }

  getContacts(input: {
    workspaceId: string
    sequenceId: string
    stepId: string
    eventType: SequenceStepEventType
    page: number
    perPage: number
  }): Promise<{
    contactInboxIds: string[]
    contactEventMap: Map<string, ContactEventData>
  }> {
    return sequenceStatsRepository.getContacts(input)
  }

  async onMessageSent(payloads: MessageSentPayload[]) {
    const sequencePayloads = payloads.filter(
      (p) =>
        p.metadata?.type === SEQUENCE_SCHEDULE_PAYLOAD_TYPE &&
        p.context.channel !== channelTypes.enum.whatsapp,
    )
    if (sequencePayloads.length === 0) {
      return
    }

    const updateItems: SequenceUpdateItem[] = sequencePayloads.map((p) => ({
      workspaceId: p.context.workspaceId,
      sequenceId: (p.metadata as { sequenceId: string }).sequenceId,
      stepId: (p.metadata as { sequenceStepId: string }).sequenceStepId,
      contactInboxId: (p.metadata as { contactInboxId: string }).contactInboxId,
      occurredAt: new Date(p.occurredAt),
    }))

    await processSequenceEvents(updateItems, "deliveredAt")
  }

  async onFailed(payloads: MessageFailedPayload[]) {
    const sequencePayloads = payloads.filter(
      (p) => p.metadata?.type === SEQUENCE_SCHEDULE_PAYLOAD_TYPE,
    )
    if (sequencePayloads.length === 0) {
      return
    }

    const updateItems = sequencePayloads.map((p) => ({
      sequenceId: (p.metadata as { sequenceId: string }).sequenceId,
      stepId: (p.metadata as { sequenceStepId: string }).sequenceStepId,
      contactInboxId: (p.metadata as { contactInboxId: string }).contactInboxId,
      occurredAt: new Date(p.occurredAt),
      errorContent: JSON.stringify(p.errorData),
    }))

    await sequenceStatsRepository.updateFailedBulk(updateItems)
  }

  async onDelivered(payloads: MessageDeliveredPayload[]) {
    const sequencePayloads = payloads.filter(
      (p) => p.metadata?.type === SEQUENCE_SCHEDULE_PAYLOAD_TYPE,
    )
    if (sequencePayloads.length === 0) {
      return
    }

    const updateItems: SequenceUpdateItem[] = sequencePayloads.map((p) => ({
      workspaceId: p.context.workspaceId,
      sequenceId: (p.metadata as { sequenceId: string }).sequenceId,
      stepId: (p.metadata as { sequenceStepId: string }).sequenceStepId,
      contactInboxId: (p.metadata as { contactInboxId: string }).contactInboxId,
      occurredAt: new Date(p.occurredAt),
    }))

    await processSequenceEvents(updateItems, "deliveredAt")
  }

  async onSeen(payloads: MessageSeenPayload[]) {
    const grouped = new Map<string, MessageSeenPayload[]>()
    for (const p of payloads) {
      const ws = p.context.workspaceId
      if (!grouped.has(ws)) {
        grouped.set(ws, [])
      }
      grouped.get(ws)?.push(p)
    }

    for (const [workspaceId, wsPayloads] of grouped) {
      const contactInboxIds = [
        ...new Set(
          wsPayloads
            .map((p) => p.context.contactInboxId)
            .filter(Boolean) as string[],
        ),
      ]
      const payloadMap = new Map(
        wsPayloads.map((p) => [p.context.contactInboxId, p]),
      )

      const dispatches = await db.query.sequenceDispatchModel.findMany({
        where: {
          workspaceId,
          contactInboxId: { in: contactInboxIds },
          status: { in: ["completed"] },
          seenAt: { isNull: true },
        },
      })

      if (dispatches.length === 0) {
        continue
      }

      const updateItems: SequenceUpdateItem[] = dispatches
        .map((s) => {
          const payload = payloadMap.get(s.contactInboxId)
          if (!payload) {
            return null
          }
          return {
            workspaceId,
            sequenceId: s.sequenceId,
            stepId: s.stepId,
            contactInboxId: s.contactInboxId,
            occurredAt: new Date(payload.occurredAt),
          }
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)

      await processSequenceEvents(updateItems, "seenAt")
    }
  }

  async onClicked(payloads: SequenceSchemaPayload[]) {
    try {
      const sequenceClicks = payloads.filter((p) => p.action?.sequenceStepId)
      if (sequenceClicks.length === 0) {
        return
      }

      const sequenceStepIds = [
        ...new Set<string>(
          sequenceClicks
            .map((p) => p.action.sequenceStepId)
            .filter((id): id is string => id !== undefined),
        ),
      ]

      const sequenceSteps = await db.query.sequenceStepModel.findMany({
        where: { id: { in: Array.from(sequenceStepIds) } },
        columns: { id: true, sequenceId: true },
      })
      const sequenceStepsMap = new Map<string, string>(
        sequenceSteps.map((s) => [s.id, s.sequenceId]),
      )

      const updateItems: SequenceUpdateItem[] = sequenceClicks.map((p) => ({
        workspaceId: p.context.workspaceId,
        sequenceId: sequenceStepsMap.get(p.action.sequenceStepId ?? "") ?? "",
        stepId: p.action.sequenceStepId || "",
        contactInboxId: p.context.contactInboxId ?? "",
        occurredAt: new Date(p.occurredAt),
      }))

      await processSequenceEvents(updateItems, "clickedAt")
    } catch (error) {
      logger.error(error, "Failed to save clicked events")
    }
  }
}

export const sequenceAnalyticsService = new SequenceAnalyticsService()
