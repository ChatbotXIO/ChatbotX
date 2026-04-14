import {
  BaseEventType,
  type FlowNodeStatsType,
} from "@chatbotx.io/clickhouse/schemas"
import { toClickHouseDateTime } from "@chatbotx.io/clickhouse/utils"
import { db } from "@chatbotx.io/database/client"
import { channelTypes } from "@chatbotx.io/database/partials"
import type {
  ClickedPayload,
  FlowClickedPayload,
  MessageDeliveredPayload,
  MessageFailedPayload,
  MessagePayload,
  MessageSeenPayload,
  MessageSentPayload,
} from "@chatbotx.io/flow-config"
import { flowStatsRepository } from "../repositories"
import type {
  FlowContactStatsRequest,
  FlowNodeContactData,
  FlowNodeStatFailedItem,
  FlowNodeStatItem,
  FlowNodeStatSeenItem,
  FlowNodeStatsResponse,
  FlowStatsRequest,
  ListFlowNodeContactsResponse,
} from "../schemas/flow-stats"

type ExtractedPayload<T extends MessagePayload> = {
  analyticsMap: Map<string, string>
  flowPayloads: T[]
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
    options?: {
      excludeChannel?: string
      include?: { buttonId?: boolean }
      all?: boolean
    },
  ): Promise<ExtractedPayload<T>> {
    const flowPayloads: T[] = []
    const flowIds = new Set<string>()

    for (const payload of payloads) {
      if (!options?.all) {
        if (!(payload.nodeId && payload.action?.flowId)) {
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
      }

      flowPayloads.push(payload)

      if (payload.action.flowId) {
        flowIds.add(payload.action.flowId)
      }
    }

    const analyticsMap = await fetchAnalyticsMap(flowIds)
    return { analyticsMap, flowPayloads }
  }

  async onMessageSent(payloads: MessageSentPayload[]) {
    const { analyticsMap, flowPayloads } = await this.extractPayload(payloads, {
      excludeChannel: channelTypes.enum.whatsapp,
    })

    if (analyticsMap.size === 0) {
      return
    }

    const items: FlowNodeStatItem[] = flowPayloads
      .map((p) => {
        const analyticsId = analyticsMap.get(p.action?.flowId ?? "")
        if (!analyticsId) {
          return null
        }
        return {
          workspaceId: p.context.workspaceId,
          flowId: p.action?.flowId ?? "",
          analyticsId,
          nodeId: p.nodeId ?? "",
          contactId: p.context.contactId,
          contactInboxId: p.context.contactInboxId ?? "",
          eventType: BaseEventType.enum["message:delivered"],
          occurredAt: p.occurredAt,
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)

    await flowStatsRepository.insertPgNodeStats(items)

    const nodeStatsData: FlowNodeStatsType[] = flowPayloads
      .map((payload) => {
        const occurredAt = toClickHouseDateTime(
          payload ? new Date(payload.occurredAt) : new Date(),
        )

        return {
          workspace_id: payload.context.workspaceId,
          flow_id: payload.action?.flowId as string,
          analytics_id: analyticsMap.get(
            payload.action?.flowId ?? "",
          ) as string,
          node_id: payload.nodeId as string,
          button_id: "",
          contact_inbox_id: payload.context.contactInboxId as string,
          event_type: BaseEventType.enum["message:delivered"],
          occurred_at: occurredAt,
          inserted_at: toClickHouseDateTime(new Date()),
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)

    await flowStatsRepository.insertClickhouseNodeStats(nodeStatsData)
  }

  async onMessageDelivered(payloads: MessageDeliveredPayload[]) {
    const { analyticsMap, flowPayloads } = await this.extractPayload(payloads)

    if (analyticsMap.size === 0) {
      return
    }

    const items: FlowNodeStatItem[] = flowPayloads
      .map((p) => {
        const analyticsId = analyticsMap.get(p.action?.flowId ?? "")
        if (!analyticsId) {
          return null
        }
        return {
          workspaceId: p.context.workspaceId,
          flowId: p.action?.flowId ?? "",
          analyticsId,
          nodeId: p.nodeId ?? "",
          contactId: p.context.contactId,
          contactInboxId: p.context.contactInboxId ?? "",
          eventType: BaseEventType.enum["message:delivered"],
          occurredAt: new Date(p.occurredAt),
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)

    await flowStatsRepository.insertPgNodeStats(items)

    const nodeStatsData: FlowNodeStatsType[] = flowPayloads
      .map((payload) => {
        const occurredAt = toClickHouseDateTime(
          payload ? new Date(payload.occurredAt) : new Date(),
        )

        return {
          workspace_id: payload.context.workspaceId,
          flow_id: payload.action?.flowId as string,
          analytics_id: analyticsMap.get(
            payload.action?.flowId ?? "",
          ) as string,
          node_id: payload.nodeId as string,
          button_id: "",
          contact_inbox_id: payload.context.contactInboxId as string,
          event_type: BaseEventType.enum["message:delivered"],
          occurred_at: occurredAt,
          inserted_at: toClickHouseDateTime(new Date()),
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)

    await flowStatsRepository.insertClickhouseNodeStats(nodeStatsData)
  }

  async onMessageFailed(payloads: MessageFailedPayload[]) {
    const { analyticsMap, flowPayloads } = await this.extractPayload(payloads)

    if (analyticsMap.size === 0) {
      return
    }

    const items: FlowNodeStatFailedItem[] = flowPayloads
      .map((p) => {
        const analyticsId = analyticsMap.get(p.action?.flowId ?? "")
        if (!analyticsId) {
          return null
        }
        return {
          workspaceId: p.context.workspaceId,
          flowId: p.action?.flowId ?? "",
          analyticsId,
          nodeId: p.nodeId ?? "",
          contactId: p.context.contactId,
          contactInboxId: p.context.contactInboxId ?? "",
          errorContent: (p.errorData ?? "") as string,
          eventType: BaseEventType.enum["message:failed"],
          occurredAt: p.occurredAt,
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)

    await flowStatsRepository.insertPgNodeStats(items)

    const nodeStatsData: FlowNodeStatsType[] = flowPayloads
      .map((payload) => {
        const occurredAt = toClickHouseDateTime(
          payload ? new Date(payload.occurredAt) : new Date(),
        )

        return {
          workspace_id: payload.context.workspaceId,
          flow_id: payload.action?.flowId as string,
          analytics_id: analyticsMap.get(
            payload.action?.flowId ?? "",
          ) as string,
          node_id: payload.nodeId as string,
          button_id: "",
          contact_inbox_id: payload.context.contactInboxId as string,
          event_type: BaseEventType.enum["message:failed"],
          occurred_at: occurredAt,
          inserted_at: toClickHouseDateTime(new Date()),
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)

    await flowStatsRepository.insertClickhouseNodeStats(nodeStatsData)
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
          eventType: { eq: BaseEventType.enum["message:delivered"] },
          contactInboxId: { in: contactInboxIds },
          seenAt: { isNull: true as const },
        },
      })

      if (unseenRecords.length === 0) {
        continue
      }

      const payloadMap = new Map<string, MessageSeenPayload>(
        wsPayloads.map((p) => [
          p.context.contactInboxId as string,
          p as MessageSeenPayload,
        ]),
      )

      const updateItems: FlowNodeStatSeenItem[] = unseenRecords
        .map((r) => {
          const p = payloadMap.get(r.contactInboxId as string)
          if (!p) {
            return null
          }
          return {
            id: r.id as string,
            seenAt: p.occurredAt,
          }
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)

      await flowStatsRepository.updateSeenAt(updateItems)

      const nodeStatsData: FlowNodeStatsType[] = unseenRecords
        .map((record) => {
          const payload = payloadMap.get(record.contactInboxId as string)
          if (!payload) {
            return null
          }
          const occurredAt = toClickHouseDateTime(
            payload.occurredAt ? new Date(payload.occurredAt) : new Date(),
          )

          return {
            workspace_id: workspaceId,
            flow_id: record.flowId as string,
            analytics_id: record.analyticsId as string,
            node_id: record.nodeId as string,
            button_id: record.buttonId as string,
            contact_inbox_id: record.contactInboxId as string,
            event_type: BaseEventType.enum["message:seen"],
            occurred_at: occurredAt,
            inserted_at: toClickHouseDateTime(new Date()),
          }
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)

      await flowStatsRepository.insertClickhouseNodeStats(nodeStatsData)
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

    const items: FlowNodeStatItem[] = flowPayloads
      .map((p) => {
        const analyticsId = analyticsMap.get(p.action?.flowId ?? "")
        if (!analyticsId) {
          return null
        }

        return {
          workspaceId: p.context.workspaceId,
          flowId: p.action.flowId,
          analyticsId,
          nodeId: p.nodeId ?? "",
          contactId: p.context.contactId,
          contactInboxId: p.context.contactInboxId ?? "",
          buttonId: p.action.buttonId ?? "",
          occurredAt: p.occurredAt,
          eventType: BaseEventType.enum["flow:clicked"],
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)

    await flowStatsRepository.insertPgNodeStats(items)

    const nodeStatsData: FlowNodeStatsType[] = flowPayloads
      .map((payload) => {
        const occurredAt = toClickHouseDateTime(
          payload ? new Date(payload.occurredAt) : new Date(),
        )

        // get last event delivered
        // if

        return {
          workspace_id: payload.context.workspaceId,
          flow_id: payload.action?.flowId as string,
          analytics_id: analyticsMap.get(
            payload.action?.flowId ?? "",
          ) as string,
          node_id: payload.nodeId as string,
          button_id: payload.action?.buttonId ?? "",
          contact_inbox_id: payload.context.contactInboxId as string,
          event_type: BaseEventType.enum["flow:clicked"],
          occurred_at: occurredAt,
          inserted_at: toClickHouseDateTime(new Date()),
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)

    await flowStatsRepository.insertClickhouseNodeStats(nodeStatsData)
  }

  resetStatsSession(input: FlowStatsRequest): Promise<void> {
    return flowStatsRepository.resetStatsSession(input)
  }

  getFlowStats(input: FlowStatsRequest): Promise<FlowNodeStatsResponse> {
    return flowStatsRepository.getFlowStats(input)
  }

  async getContactStats(
    input: FlowContactStatsRequest,
  ): Promise<ListFlowNodeContactsResponse> {
    const { workspaceId, flowId, eventType, nodeId } = input

    if (!(eventType && nodeId)) {
      return { data: [], total: 0, page: 1, pageCount: 0 }
    }

    const analyticsSession = await db.query.flowAnalyticsSessionModel.findFirst(
      {
        where: {
          workspaceId,
          flowId,
          deletedAt: { isNull: true },
        },
        columns: { id: true },
      },
    )

    if (!analyticsSession) {
      return { data: [], total: 0, page: 1, pageCount: 0 }
    }

    const analyticsId = analyticsSession.id

    // Get contacts for the specific node and event type
    const { contactInboxIds, contactEventMap } =
      await flowStatsRepository.getContacts({
        workspaceId,
        flowId,
        analyticsId,
        nodeId,
        eventType,
        page: 1,
        perPage: 1000,
      })

    if (contactInboxIds.length === 0) {
      return { data: [], total: 0, page: 1, pageCount: 0 }
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
      page: 1,
      pageCount: 1,
    }
  }
}

export const flowAnalyticsService = new FlowAnalyticsService()
