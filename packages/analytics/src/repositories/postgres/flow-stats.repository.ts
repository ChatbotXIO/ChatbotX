import { and, count, db, eq, inArray, sql } from "@chatbotx.io/database/client"
import {
  conversationModel,
  flowAnalyticsSessionModel,
  flowNodeStatModel,
} from "@chatbotx.io/database/schema"
import {
  type FlowNode,
  messageEventTypeSchema,
  nodeTypeSchema,
  type SendMessageNodeSchema,
} from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import type { ContactEventData } from "../../schemas/common"
import type {
  FlowNodeEventType,
  FlowNodeStatItem,
  FlowNodeStatsResponse,
  FlowStatsRequest,
  RemoveFlowStatsRequest,
} from "../../schemas/flow-stats"
import { BaseRepository } from "./base.repository"

export class FlowStatsRepository extends BaseRepository {
  async findAnalyticsSessionsByFlowIds(
    flowIds: string[],
  ): Promise<{ flowId: string; id: string }[]> {
    return await db.query.flowAnalyticsSessionModel.findMany({
      where: {
        flowId: { in: flowIds },
        deletedAt: { isNull: true },
      },
      columns: { flowId: true, id: true },
    })
  }

  async findActiveAnalyticsSession(input: {
    workspaceId: string
    flowId: string
  }): Promise<{ id: string } | undefined> {
    return await db.query.flowAnalyticsSessionModel.findFirst({
      where: {
        workspaceId: input.workspaceId,
        flowId: input.flowId,
        deletedAt: { isNull: true },
      },
      columns: { id: true },
    })
  }

  /**
   * Aggregate per-node counts (delivered / failed / clicked) for every node in
   * one grouped query instead of per-node round-trips.
   */
  private async getNodeEventCounts(input: {
    workspaceId: string
    analyticsId: string
    nodeIds: string[]
  }): Promise<{
    deliveredByNode: Map<string, number>
    failedByNode: Map<string, number>
    clickedByNode: Map<string, number>
  }> {
    const { workspaceId, analyticsId, nodeIds } = input
    const t = flowNodeStatModel

    const rows = await db
      .select({ nodeId: t.nodeId, eventType: t.eventType, total: count() })
      .from(t)
      .where(
        and(
          eq(t.workspaceId, workspaceId),
          eq(t.analyticsId, analyticsId),
          inArray(t.nodeId, nodeIds),
          sql`${t.eventType} IN ('message:delivered', 'message:failed', 'flow:clicked')`,
        ),
      )
      .groupBy(t.nodeId, t.eventType)

    const deliveredByNode = new Map<string, number>()
    const failedByNode = new Map<string, number>()
    const clickedByNode = new Map<string, number>()

    for (const row of rows) {
      const total = Number(row.total)
      switch (row.eventType) {
        case "message:delivered":
          deliveredByNode.set(row.nodeId, total)
          break
        case "message:failed":
          failedByNode.set(row.nodeId, total)
          break
        case "flow:clicked":
          clickedByNode.set(row.nodeId, total)
          break
        default:
          break
      }
    }

    return { deliveredByNode, failedByNode, clickedByNode }
  }

  /**
   * Per-node "seen" counts (delivered messages whose contact read the
   * conversation afterwards) for every node in one grouped query.
   */
  private async getNodeSeenCounts(input: {
    workspaceId: string
    analyticsId: string
    nodeIds: string[]
  }): Promise<Map<string, number>> {
    const { workspaceId, analyticsId, nodeIds } = input
    const t = flowNodeStatModel

    const rows = await db
      .select({ nodeId: t.nodeId, seen: count() })
      .from(t)
      .innerJoin(
        conversationModel,
        eq(conversationModel.contactId, t.contactId),
      )
      .where(
        and(
          eq(t.workspaceId, workspaceId),
          eq(t.analyticsId, analyticsId),
          inArray(t.nodeId, nodeIds),
          eq(t.eventType, messageEventTypeSchema.enum["message:delivered"]),
          sql`${conversationModel.contactLastReadAt} >= ${t.occurredAt}`,
        ),
      )
      .groupBy(t.nodeId)

    const seenByNode = new Map<string, number>()
    for (const row of rows) {
      seenByNode.set(row.nodeId, Number(row.seen))
    }
    return seenByNode
  }

  async insertNodeStats(data: FlowNodeStatItem[]): Promise<void> {
    if (data.length === 0) {
      return
    }
    await db.insert(flowNodeStatModel).values(data).onConflictDoNothing()
  }

  async getFlowStats(input: FlowStatsRequest): Promise<FlowNodeStatsResponse> {
    const analyticsSession = await db.query.flowAnalyticsSessionModel.findFirst(
      {
        where: {
          workspaceId: input.workspaceId,
          flowId: input.flowId,
          deletedAt: { isNull: true },
        },
        columns: { id: true },
      },
    )

    if (!analyticsSession) {
      return {}
    }

    const flow = await db.query.flowModel.findFirst({
      where: { id: input.flowId, workspaceId: input.workspaceId },
      with: {
        flowVersion: {
          columns: {
            id: true,
            nodes: true,
            flowId: true,
          },
        },
      },
      columns: { id: true, currentVersionId: true },
    })

    if (!flow?.flowVersion) {
      return {}
    }

    const nodes = flow.flowVersion.nodes as unknown as FlowNode[]
    const sendMessageNodes = nodes.filter(
      (n): n is FlowNode & { data: SendMessageNodeSchema["data"] } =>
        n.type === nodeTypeSchema.enum.sendMessage,
    )

    if (sendMessageNodes.length === 0) {
      return {}
    }

    const analyticsId = analyticsSession.id

    const nodeIds: string[] = []
    const stepButtonMap = new Map<string, string[]>()

    for (const node of sendMessageNodes) {
      const steps = node.data?.details?.steps ?? []
      const quickReplies = node.data?.details?.quickReplies ?? []
      nodeIds.push(node.id)

      for (const step of steps) {
        const buttons = "buttons" in step ? (step.buttons ?? []) : []
        const buttonIds = [...quickReplies, ...buttons].map((b) => b.id)
        if (buttonIds.length > 0) {
          stepButtonMap.set(node.id, buttonIds)
        }
      }
    }

    if (nodeIds.length === 0) {
      return {}
    }

    const [{ deliveredByNode, failedByNode, clickedByNode }, seenByNode] =
      await Promise.all([
        this.getNodeEventCounts({
          workspaceId: input.workspaceId,
          analyticsId,
          nodeIds,
        }),
        this.getNodeSeenCounts({
          workspaceId: input.workspaceId,
          analyticsId,
          nodeIds,
        }),
      ])

    const result: FlowNodeStatsResponse = {}

    for (const nodeId of nodeIds) {
      const delivered = deliveredByNode.get(nodeId) ?? 0
      const failed = failedByNode.get(nodeId) ?? 0
      const clicked = clickedByNode.get(nodeId) ?? 0
      const seen = seenByNode.get(nodeId) ?? 0
      const buttonIds = stepButtonMap.get(nodeId) || []

      result[nodeId] = {
        node: {
          "message:sent": delivered + failed,
          "message:seen": seen,
          "message:delivered": delivered, // TODO: need to implement delivered logic
          "flow:clicked": {
            clicked,
            totalUsers: delivered,
          },
          "message:failed": failed,
        },
        buttons: Object.fromEntries(
          buttonIds.map((buttonId) => [buttonId, { buttonId, clicks: 0 }]),
        ),
      }
    }

    const t = flowNodeStatModel
    const buttonStatsRows = await db
      .select({
        nodeId: t.nodeId,
        buttonId: t.buttonId,
        uniqueClicks: sql<number>`COUNT(DISTINCT ${t.contactInboxId})`,
      })
      .from(t)
      .where(
        and(
          eq(t.workspaceId, input.workspaceId),
          eq(t.flowId, input.flowId),
          eq(t.analyticsId, analyticsId),
          sql`${t.nodeId} IN (${sql.join(
            nodeIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
          eq(t.eventType, "flow:clicked"),
          sql`${t.buttonId} IS NOT NULL`,
        ),
      )
      .groupBy(t.nodeId, t.buttonId)

    for (const row of buttonStatsRows) {
      const nodeStats = result[row.nodeId]
      if (!nodeStats) {
        continue
      }

      if (!row.buttonId) {
        continue
      }

      nodeStats.buttons[row.buttonId] = {
        buttonId: row.buttonId,
        clicks: Number(row.uniqueClicks),
      }
    }

    return result
  }

  async getContacts(input: {
    workspaceId: string
    flowId: string
    analyticsId: string
    nodeId: string
    eventType: FlowNodeEventType
    buttonId?: string
    page: number
    perPage: number
  }): Promise<{
    contactInboxIds: string[]
    contactEventMap: Map<string, ContactEventData>
  }> {
    const {
      workspaceId,
      analyticsId,
      nodeId,
      eventType,
      buttonId,
      page,
      perPage,
    } = input
    const offset = (page - 1) * perPage
    const t = flowNodeStatModel

    if (eventType === "message:seen") {
      const rows = await db
        .select({
          contactInboxId: t.contactInboxId,
          contactId: t.contactId,
          occurredAt: t.occurredAt,
          errorContent: t.errorContent,
        })
        .from(t)
        .innerJoin(
          conversationModel,
          eq(conversationModel.contactId, t.contactId),
        )
        .where(
          and(
            eq(t.workspaceId, workspaceId),
            eq(t.analyticsId, analyticsId),
            eq(t.nodeId, nodeId),
            eq(t.eventType, messageEventTypeSchema.enum["message:delivered"]),
            sql`${conversationModel.contactLastReadAt} >= ${t.occurredAt}`,
          ),
        )
        .orderBy(sql`${t.occurredAt} DESC NULLS LAST`)
        .limit(perPage)
        .offset(offset)

      const contactInboxIds = rows.map((r) => r.contactInboxId as string)
      const contactEventMap = new Map<string, ContactEventData>()

      for (const row of rows) {
        contactEventMap.set(row.contactInboxId, {
          contactId: row.contactId,
          contactInboxId: row.contactInboxId,
          occurredAt: (row.occurredAt ?? new Date()).toISOString(),
          errorContent: row.errorContent ?? undefined,
        })
      }

      return { contactInboxIds, contactEventMap }
    }

    const { eventCondition, orderColumn } = this.buildEventFilter(eventType)

    const baseCondition = sql`${t.workspaceId} = ${workspaceId} AND ${t.analyticsId} = ${analyticsId} AND ${t.nodeId} = ${nodeId} AND ${eventCondition}`
    const fullCondition = buttonId
      ? sql`${baseCondition} AND ${t.buttonId} = ${buttonId}`
      : baseCondition

    const rows = await db
      .select({
        contactInboxId: t.contactInboxId,
        contactId: t.contactId,
        occurredAt: t.occurredAt,
        errorContent: t.errorContent,
      })
      .from(t)
      .where(fullCondition)
      .orderBy(sql`${orderColumn} DESC NULLS LAST`)
      .limit(perPage)
      .offset(offset)

    const contactInboxIds = rows.map((r) => r.contactInboxId as string)
    const contactEventMap = new Map<string, ContactEventData>()

    for (const row of rows) {
      contactEventMap.set(row.contactInboxId, {
        contactId: row.contactId,
        contactInboxId: row.contactInboxId,
        occurredAt: (row.occurredAt ?? new Date()).toISOString(),
        errorContent: row.errorContent ?? undefined,
      })
    }

    return { contactInboxIds, contactEventMap }
  }

  async resetStatsSession(input: RemoveFlowStatsRequest): Promise<void> {
    const flow = await db.query.flowModel.findFirst({
      where: { id: input.flowId, workspaceId: input.workspaceId },
      columns: { id: true },
    })

    if (!flow) {
      return
    }

    await db.transaction(async (tx) => {
      await tx
        .update(flowAnalyticsSessionModel)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(flowAnalyticsSessionModel.workspaceId, input.workspaceId),
            eq(flowAnalyticsSessionModel.flowId, input.flowId),
          ),
        )

      await tx.insert(flowAnalyticsSessionModel).values({
        id: createId(),
        workspaceId: input.workspaceId,
        flowId: input.flowId,
      })
    })
  }

  private buildEventFilter(eventType: FlowNodeEventType) {
    const t = flowNodeStatModel
    switch (eventType) {
      case "message:sent":
        return {
          eventCondition: sql`${t.eventType} IN ('message:delivered', 'message:failed')`,
          orderColumn: t.occurredAt,
        }
      case "message:delivered":
        return {
          eventCondition: sql`${t.eventType} = 'message:delivered'`,
          orderColumn: t.occurredAt,
        }
      case "message:failed":
        return {
          eventCondition: sql`${t.eventType} = 'message:failed'`,
          orderColumn: t.occurredAt,
        }
      case "flow:clicked":
        return {
          eventCondition: sql`${t.eventType} = 'flow:clicked'`,
          orderColumn: t.occurredAt,
        }
      default:
        return {
          eventCondition: sql`${t.eventType} = 'message:delivered'`,
          orderColumn: t.occurredAt,
        }
    }
  }
}

export const flowStatsRepository = new FlowStatsRepository()
