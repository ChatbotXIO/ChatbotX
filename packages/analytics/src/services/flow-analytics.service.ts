import { db } from "@chatbotx.io/database/client"
import { channelTypes } from "@chatbotx.io/database/partials"
import {
  type ClickedPayload,
  type FlowClickedPayload,
  flowEventTypeSchema,
  type MessageDeliveredPayload,
  type MessageFailedPayload,
  type MessagePayload,
  type MessageSentPayload,
  messageEventTypeSchema,
} from "@chatbotx.io/flow-config"
import { flowStatsRepository } from "../repositories"
import type {
  FlowContactStatsRequest,
  FlowNodeContactData,
  FlowNodeStatFailedItem,
  FlowNodeStatItem,
  FlowNodeStatsResponse,
  FlowStatsRequest,
  ListFlowNodeContactsResponse,
} from "../schemas/flow-stats"

type ExtractedPayload<T extends MessagePayload> = {
  analyticsMap: Map<string, string>
  flowPayloads: T[]
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

    const analyticsMap = await this.fetchAnalyticsMap(flowIds)
    return { analyticsMap, flowPayloads }
  }

  private async fetchAnalyticsMap(
    flowIds: Set<string>,
  ): Promise<Map<string, string>> {
    if (flowIds.size === 0) {
      return new Map()
    }

    const analytics = await db.query.flowAnalyticsSessionModel.findMany({
      where: {
        flowId: { in: Array.from(flowIds) },
        deletedAt: { isNull: true },
      },
    })

    return new Map(analytics.map((a) => [a.flowId, a.id]))
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
          eventType: messageEventTypeSchema.enum["message:delivered"],
          occurredAt: p.occurredAt,
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)

    await flowStatsRepository.insertNodeStats(items)
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
          eventType: messageEventTypeSchema.enum["message:delivered"],
          occurredAt: new Date(p.occurredAt),
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)

    await flowStatsRepository.insertNodeStats(items)
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
          eventType: messageEventTypeSchema.enum["message:failed"],
          occurredAt: p.occurredAt,
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)

    await flowStatsRepository.insertNodeStats(items)
  }

  async onClicked(payloads: FlowClickedPayload[]) {
    const { analyticsMap, flowPayloads } = await this.extractPayload(payloads, {
      include: { buttonId: true },
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
          eventType: flowEventTypeSchema.enum["flow:clicked"],
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)

    await flowStatsRepository.insertNodeStats(items)
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

    return { data, total: data.length, page: 1, pageCount: 1 }
  }
}

export const flowAnalyticsService = new FlowAnalyticsService()
