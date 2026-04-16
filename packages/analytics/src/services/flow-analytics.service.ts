import type {
  FlowNodeContactStateType,
  FlowStatEventType,
} from "@chatbotx.io/clickhouse/schemas"
import { toClickHouseDateTime } from "@chatbotx.io/clickhouse/utils"
import { db } from "@chatbotx.io/database/client"
import { channelTypes } from "@chatbotx.io/database/partials"
import {
  type ClickedPayload,
  type FlowClickedPayload,
  FlowEventType,
  type MessageDeliveredPayload,
  MessageEventType,
  type MessageFailedPayload,
  type MessagePayload,
  type MessageSeenPayload,
  type MessageSentPayload,
  type MetadataPayload,
} from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { flowStatsRepository } from "../repositories/flow-stats.repository"
import type { ContactEventData } from "../schemas/common"
import type {
  FlowNodeEventType,
  FlowNodeStats,
  FlowNodeStatUpdateItem,
} from "../schemas/flow-stats"

type ExtractedPayload<T extends MessagePayload> = {
  analyticsMap: Map<string, string>
  flowPayloads: T[]
}

type EventBuildParams = {
  workspaceId: string
  contactId: string
  contactInboxId: string
  sourceId: string
  flowId: string
  analyticsId: string
  nodeId: string
  occurredAt: string
}

type EventType =
  | (typeof MessageEventType)[keyof typeof MessageEventType]
  | (typeof FlowEventType)[keyof typeof FlowEventType]

function buildEventData(
  params: EventBuildParams,
  eventType: EventType,
  extra?: { buttonId?: string; content?: string },
): FlowStatEventType {
  return {
    event_id: createId(),
    workspace_id: params.workspaceId,
    contact_id: params.contactId,
    contact_inbox_id: params.contactInboxId,
    source_id: params.sourceId,
    event_type: eventType as FlowStatEventType["event_type"],
    flow_id: params.flowId,
    analytics_id: params.analyticsId,
    node_id: params.nodeId,
    button_id: extra?.buttonId ?? "",
    ref_id: "",
    ref_type: "",
    content: extra?.content,
    occurred_at: params.occurredAt,
    inserted_at: toClickHouseDateTime(new Date()),
  }
}

function buildStateData(
  params: EventBuildParams,
  timestamps: {
    sentAt?: string | null
    deliveredAt?: string | null
    seenAt?: string | null
    clickedAt?: string | null
  },
  buttonId = "",
): FlowNodeContactStateType {
  return {
    workspace_id: params.workspaceId,
    flow_id: params.flowId,
    analytics_id: params.analyticsId,
    node_id: params.nodeId,
    button_id: buttonId,
    contact_id: params.contactId,
    contact_inbox_id: params.contactInboxId,
    sent_at: timestamps.sentAt ?? null,
    delivered_at: timestamps.deliveredAt ?? null,
    seen_at: timestamps.seenAt ?? null,
    clicked_at: timestamps.clickedAt ?? null,
    version: Date.now(),
    updated_at: toClickHouseDateTime(new Date()),
  }
}

async function fetchAnalyticsMap(
  flowIds: Set<string>,
): Promise<Map<string, string>> {
  if (flowIds.size === 0) {
    return new Map()
  }

  const analytics = await db.query.flowAnalyticsSessionModel.findMany({
    where: { flowId: { in: Array.from(flowIds) }, deletedAt: { isNull: true } },
  })

  return new Map(analytics.map((a) => [a.flowId, a.id]))
}

export class FlowAnalyticsService {
  private async extractPayload<T extends MessagePayload | ClickedPayload>(
    payloads: T[],
    options?: { excludeChannel?: string; include?: { buttonId?: boolean } },
  ): Promise<ExtractedPayload<T>> {
    const flowPayloads: T[] = []
    const flowIds = new Set<string>()

    for (const payload of payloads) {
      if (!(payload.stepId && payload.action?.flowId)) {
        continue
      }
      if (
        options?.excludeChannel &&
        options.excludeChannel === payload.context.channel
      ) {
        continue
      }

      if (
        options?.include?.buttonId &&
        !(payload as ClickedPayload).action?.buttonId
      ) {
        continue
      }

      flowPayloads.push(payload)
      flowIds.add(payload.action.flowId)
    }

    const analyticsMap = await fetchAnalyticsMap(flowIds)
    return { analyticsMap, flowPayloads }
  }

  private buildParams(
    payload: MessagePayload,
    analyticsMap: Map<string, string>,
  ): EventBuildParams {
    const metadata = payload.metadata as MetadataPayload | undefined
    const flowId = payload.action?.flowId ?? ""
    return {
      workspaceId: payload.context.workspaceId,
      contactId: payload.context.contactId,
      contactInboxId:
        metadata?.contactInboxId || payload.context.contactInboxId || "",
      sourceId: payload.action?.sourceId ?? "",
      flowId,
      analyticsId: analyticsMap.get(flowId) ?? "",
      nodeId: payload.stepId ?? "",
      occurredAt: toClickHouseDateTime(new Date(payload.occurredAt)),
    }
  }

  async onMessageSent(payloads: MessageSentPayload[]) {
    const { analyticsMap, flowPayloads } = await this.extractPayload(payloads, {
      excludeChannel: channelTypes.enum.whatsapp,
    })

    if (analyticsMap.size === 0) {
      return
    }

    const updateItems: FlowNodeStatUpdateItem[] = flowPayloads
      .map((p) => {
        const analyticsId = analyticsMap.get(p.action?.flowId ?? "")
        if (!(analyticsId && p.stepId)) {
          return null
        }
        return {
          workspaceId: p.context.workspaceId,
          flowId: p.action?.flowId ?? "",
          analyticsId,
          nodeId: p.stepId,
          contactId: p.context.contactId,
          contactInboxId: p.context.contactInboxId ?? "",
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)

    await flowStatsRepository.updateTimestamp("deliveredAt", updateItems)

    const eventData: FlowStatEventType[] = []
    const stateData: FlowNodeContactStateType[] = []

    for (const payload of flowPayloads) {
      const params = this.buildParams(payload, analyticsMap)

      eventData.push(
        buildEventData(params, MessageEventType["message:delivered"]),
      )
      stateData.push(buildStateData(params, { deliveredAt: params.occurredAt }))
    }

    await Promise.all([
      flowStatsRepository.insertEvents(eventData),
      flowStatsRepository.insertState(stateData),
    ])
  }

  async onMessageDelivered(payloads: MessageDeliveredPayload[]) {
    const { analyticsMap, flowPayloads } = await this.extractPayload(payloads)

    if (analyticsMap.size === 0) {
      return
    }

    const updateItems: FlowNodeStatUpdateItem[] = flowPayloads
      .map((p) => {
        const analyticsId = analyticsMap.get(p.action?.flowId ?? "")
        if (!(analyticsId && p.stepId)) {
          return null
        }
        return {
          workspaceId: p.context.workspaceId,
          flowId: p.action?.flowId ?? "",
          analyticsId,
          nodeId: p.stepId,
          contactId: p.context.contactId,
          contactInboxId: p.context.contactInboxId ?? "",
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)

    await flowStatsRepository.updateTimestamp("deliveredAt", updateItems)

    const eventData: FlowStatEventType[] = []
    const stateData: FlowNodeContactStateType[] = []

    for (const payload of flowPayloads) {
      const params = this.buildParams(payload, analyticsMap)

      eventData.push(
        buildEventData(params, MessageEventType["message:delivered"]),
      )
      stateData.push(buildStateData(params, { deliveredAt: params.occurredAt }))
    }

    await Promise.all([
      flowStatsRepository.insertEvents(eventData),
      flowStatsRepository.insertState(stateData),
    ])
  }

  async onMessageFailed(payloads: MessageFailedPayload[]) {
    const { analyticsMap, flowPayloads } = await this.extractPayload(payloads)

    if (analyticsMap.size === 0) {
      return
    }

    const updateItems: FlowNodeStatUpdateItem[] = flowPayloads
      .map((p) => {
        const analyticsId = analyticsMap.get(p.action?.flowId ?? "")
        if (!(analyticsId && p.stepId)) {
          return null
        }
        return {
          workspaceId: p.context.workspaceId,
          flowId: p.action?.flowId ?? "",
          analyticsId,
          nodeId: p.stepId,
          contactId: p.context.contactId,
          contactInboxId: p.context.contactInboxId ?? "",
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)

    await flowStatsRepository.updateTimestamp("failedAt", updateItems)

    const eventData: FlowStatEventType[] = []

    for (const payload of flowPayloads) {
      const params = this.buildParams(payload, analyticsMap)
      const errorContent = JSON.stringify({
        error: (payload as { errorData?: unknown }).errorData,
      })

      eventData.push(
        buildEventData(params, MessageEventType["message:failed"], {
          content: errorContent,
        }),
      )
    }

    await flowStatsRepository.insertEvents(eventData)
  }

  async onMessageSeen(payloads: MessageSeenPayload[]) {
    const grouped = new Map<string, MessageSeenPayload[]>()
    for (const payload of payloads) {
      const wsId = payload.context.workspaceId
      if (!grouped.has(wsId)) {
        grouped.set(wsId, [])
      }
      grouped.get(wsId)?.push(payload)
    }

    for (const [workspaceId, wsPayloads] of grouped) {
      const contactInboxIds = [
        ...new Set(
          wsPayloads
            .map((p) => p.context.contactInboxId)
            .filter(Boolean) as string[],
        ),
      ]

      if (contactInboxIds.length === 0) {
        continue
      }

      const unseenRecords = await db.query.flowNodeStatModel.findMany({
        where: {
          workspaceId: { eq: workspaceId },
          contactInboxId: { in: contactInboxIds },
          seenAt: { isNull: true as const },
        },
        columns: {
          id: true,
          flowId: true,
          analyticsId: true,
          nodeId: true,
          contactId: true,
          contactInboxId: true,
        },
      })

      if (unseenRecords.length === 0) {
        continue
      }

      const payloadMap = new Map(
        wsPayloads.map((p) => [p.context.contactInboxId, p]),
      )

      const updateItems = unseenRecords
        .map((r) => {
          const p = payloadMap.get(r.contactInboxId)
          if (!p) {
            return null
          }
          return {
            contactInboxId: r.contactInboxId,
            occurredAt: p.occurredAt,
          }
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)

      const seenItems = updateItems.map((item) => ({
        contactInboxId: item.contactInboxId,
        occurredAt: new Date(item.occurredAt),
      }))
      await flowStatsRepository.updateSeenAt(seenItems)

      const eventData: FlowStatEventType[] = []
      const stateData: FlowNodeContactStateType[] = []

      for (const record of unseenRecords) {
        const payload = payloadMap.get(record.contactInboxId)
        const occurredAt = toClickHouseDateTime(
          payload ? new Date(payload.occurredAt) : new Date(),
        )

        const params: EventBuildParams = {
          workspaceId,
          contactId: record.contactId,
          contactInboxId: record.contactInboxId,
          sourceId: "",
          flowId: record.flowId,
          analyticsId: record.analyticsId,
          nodeId: record.nodeId,
          occurredAt,
        }

        eventData.push(buildEventData(params, MessageEventType["message:seen"]))
        stateData.push(buildStateData(params, { seenAt: occurredAt }))
      }

      await Promise.all([
        flowStatsRepository.insertEvents(eventData),
        flowStatsRepository.insertState(stateData),
      ])
    }
  }

  async onClicked(payloads: FlowClickedPayload[]) {
    const { analyticsMap, flowPayloads } = await this.extractPayload(payloads, {
      include: {
        buttonId: true,
      },
    })

    if (analyticsMap.size === 0) {
      return
    }

    const clickedItems = flowPayloads
      .map((p) => {
        const analyticsId = analyticsMap.get(p.action.flowId)
        if (!(analyticsId && p.stepId)) {
          return null
        }
        return {
          workspaceId: p.context.workspaceId,
          flowId: p.action.flowId,
          analyticsId,
          nodeId: p.stepId,
          contactId: p.context.contactId,
          contactInboxId: p.context.contactInboxId ?? "",
          buttonId: p.action.buttonId ?? "",
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)

    await flowStatsRepository.updateClicked(clickedItems)

    const eventData: FlowStatEventType[] = []
    const stateData: FlowNodeContactStateType[] = []

    for (const payload of flowPayloads) {
      const analyticsId = analyticsMap.get(payload.action.flowId)
      if (!(analyticsId && payload.stepId)) {
        continue
      }

      const occurredAt = toClickHouseDateTime(new Date(payload.occurredAt))

      const params: EventBuildParams = {
        workspaceId: payload.context.workspaceId,
        contactId: payload.context.contactId,
        contactInboxId: payload.context.contactInboxId ?? "",
        sourceId: "",
        flowId: payload.action.flowId,
        analyticsId,
        nodeId: payload.stepId,
        occurredAt,
      }

      eventData.push(
        buildEventData(params, FlowEventType["flow:clicked"], {
          buttonId: payload.action.buttonId,
          content: JSON.stringify({ clickType: payload.action.clickType }),
        }),
      )
      stateData.push(
        buildStateData(
          params,
          { clickedAt: occurredAt },
          payload.action.buttonId,
        ),
      )
    }

    await Promise.all([
      flowStatsRepository.insertEvents(eventData),
      flowStatsRepository.insertState(stateData),
    ])
  }

  getNodeStats(input: {
    workspaceId: string
    flowId: string
    analyticsId: string
    stepId: string
  }): Promise<FlowNodeStats> {
    return flowStatsRepository.getNodeStats(input)
  }

  getButtonStats(input: {
    workspaceId: string
    flowId: string
    analyticsId: string
    stepId: string
  }): Promise<Array<{ buttonId: string; clicks: number }>> {
    return flowStatsRepository.getButtonStats(input)
  }

  getContactsFromClickHouse(input: {
    workspaceId: string
    flowId: string
    analyticsId: string
    stepId: string
    eventType: FlowNodeEventType
    buttonId?: string
    page: number
    perPage: number
  }): Promise<{
    contactInboxIds: string[]
    contactEventMap: Map<string, ContactEventData>
  }> {
    return flowStatsRepository.getContactsFromClickHouse(input)
  }
}

export const flowAnalyticsService = new FlowAnalyticsService()
